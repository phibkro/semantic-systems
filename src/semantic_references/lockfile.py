"""``reference-lock-v1``: the generated, checked-in custody observation.

Frozen shape (design spec 0004, section ``reference-lock-v1``):

- schema version, generator identity, entries keyed by source ID;
- each entry: declared origin, tracked ref, resolved ref, full commit and
  tree object IDs plus Git object format, a SHA-256 digest of the complete
  canonical catalog record, retrieval timestamp, acquisition kind, whether
  the origin commit was remotely verified, and per-license-artifact Git
  mode / byte length / raw-blob SHA-256.

The lock is mutated only through :func:`write_lock`, via a temporary file and
atomic replace. Loading is strict: duplicate keys, abbreviated object IDs,
missing fields, unsafe paths, and unknown schema versions are all rejected.
"""

from __future__ import annotations

import contextlib
import json
import os
import re
import tempfile
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, cast

from semantic_references.errors import LockFileError

SCHEMA_NAME = "reference-lock-v1"
_OBJECT_FORMAT_HEX_LENGTH = {"sha1": 40, "sha256": 64}
_HEX_RE = {
    "sha1": re.compile(r"^[0-9a-f]{40}$"),
    "sha256": re.compile(r"^[0-9a-f]{64}$"),
}
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_MODE_RE = re.compile(r"^[0-7]{6}$")
_ACQUISITION_KINDS = frozenset({"remote", "local-sibling", "local-object-cache"})


def _no_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise LockFileError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


_ENTRY_FIELDS = frozenset(
    {
        "origin",
        "track",
        "resolved_ref",
        "object_format",
        "commit",
        "tree",
        "catalog_digest",
        "retrieved_at",
        "acquisition",
        "origin_verified",
        "licenses",
    }
)


def _check_entry_field_set(source_id: str, data: dict[str, object]) -> None:
    missing = _ENTRY_FIELDS - set(data)
    if missing:
        raise LockFileError(f"lock entry {source_id!r} is missing fields: {sorted(missing)}")
    extra = set(data) - _ENTRY_FIELDS
    if extra:
        raise LockFileError(f"lock entry {source_id!r} has unexpected fields: {sorted(extra)}")


def _check_entry_strings(source_id: str, data: dict[str, object]) -> tuple[str, str, str]:
    values: dict[str, str] = {}
    for name in ("origin", "track", "resolved_ref"):
        value = data[name]
        if not isinstance(value, str) or not value:
            raise LockFileError(f"lock entry {source_id!r}: {name!r} must be a non-empty string")
        values[name] = value
    return values["origin"], values["track"], values["resolved_ref"]


def _check_entry_object_ids(source_id: str, data: dict[str, object]) -> tuple[str, str, str]:
    object_format = data["object_format"]
    if not isinstance(object_format, str) or object_format not in _OBJECT_FORMAT_HEX_LENGTH:
        raise LockFileError(
            f"lock entry {source_id!r}: unsupported object_format {object_format!r}"
        )
    hex_re = _HEX_RE[object_format]
    commit = data["commit"]
    if not isinstance(commit, str) or not hex_re.match(commit):
        raise LockFileError(
            f"lock entry {source_id!r}: 'commit' must be a full {object_format} object id"
        )
    tree = data["tree"]
    if not isinstance(tree, str) or not hex_re.match(tree):
        raise LockFileError(
            f"lock entry {source_id!r}: 'tree' must be a full {object_format} object id"
        )
    return object_format, commit, tree


def _check_catalog_digest(source_id: str, catalog_digest: object) -> str:
    if not isinstance(catalog_digest, str) or not _SHA256_RE.match(catalog_digest):
        raise LockFileError(
            f"lock entry {source_id!r}: 'catalog_digest' must be a full sha256 digest"
        )
    return catalog_digest


def _check_retrieved_at(source_id: str, retrieved_at: object) -> str:
    if not isinstance(retrieved_at, str) or not _TIMESTAMP_RE.match(retrieved_at):
        raise LockFileError(
            f"lock entry {source_id!r}: 'retrieved_at' must be an ISO-8601 UTC timestamp"
        )
    return retrieved_at


def _check_acquisition(source_id: str, acquisition: object) -> str:
    if not isinstance(acquisition, str) or acquisition not in _ACQUISITION_KINDS:
        raise LockFileError(
            f"lock entry {source_id!r}: unsupported acquisition kind {acquisition!r}"
        )
    return acquisition


def _check_licenses_field(source_id: str, licenses_raw: object) -> dict[str, LicenseObservation]:
    if not isinstance(licenses_raw, dict) or not licenses_raw:
        raise LockFileError(f"lock entry {source_id!r}: 'licenses' must be a non-empty table")
    typed_raw = cast(dict[str, object], licenses_raw)
    return {path: LicenseObservation.from_json(path, value) for path, value in typed_raw.items()}


@dataclass(frozen=True, slots=True)
class LicenseObservation:
    """A single license artifact's committed-blob measurement."""

    mode: str
    size: int
    sha256: str

    def to_json(self) -> dict[str, object]:
        return {"mode": self.mode, "size": self.size, "sha256": self.sha256}

    @staticmethod
    def from_json(path: str, data: object) -> LicenseObservation:
        if not isinstance(data, dict):
            raise LockFileError(f"license entry {path!r} must be a table")
        typed_data = cast(dict[str, object], data)
        mode = typed_data.get("mode")
        size = typed_data.get("size")
        sha256 = typed_data.get("sha256")
        if not isinstance(mode, str) or not _MODE_RE.match(mode):
            raise LockFileError(f"license entry {path!r}: 'mode' must be a 6-digit octal string")
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise LockFileError(f"license entry {path!r}: 'size' must be a non-negative integer")
        if not isinstance(sha256, str) or not _SHA256_RE.match(sha256):
            raise LockFileError(f"license entry {path!r}: 'sha256' must be a full 64-hex digest")
        if set(typed_data) != {"mode", "size", "sha256"}:
            raise LockFileError(f"license entry {path!r} has unexpected fields")
        return LicenseObservation(mode=mode, size=size, sha256=sha256)


@dataclass(frozen=True, slots=True)
class LockEntry:
    """One source's recorded custody observation."""

    origin: str
    track: str
    resolved_ref: str
    object_format: str
    commit: str
    tree: str
    catalog_digest: str
    retrieved_at: str
    acquisition: str
    origin_verified: bool
    licenses: dict[str, LicenseObservation]

    def to_json(self) -> dict[str, object]:
        return {
            "origin": self.origin,
            "track": self.track,
            "resolved_ref": self.resolved_ref,
            "object_format": self.object_format,
            "commit": self.commit,
            "tree": self.tree,
            "catalog_digest": self.catalog_digest,
            "retrieved_at": self.retrieved_at,
            "acquisition": self.acquisition,
            "origin_verified": self.origin_verified,
            "licenses": {path: obs.to_json() for path, obs in self.licenses.items()},
        }

    def with_retrieved_at(self, retrieved_at: str) -> LockEntry:
        return replace(self, retrieved_at=retrieved_at)

    def content_equal(self, other: LockEntry) -> bool:
        """Equality ignoring ``retrieved_at`` (used to detect a no-op re-lock)."""
        return self.with_retrieved_at("") == other.with_retrieved_at("")

    @staticmethod
    def from_json(source_id: str, data: object) -> LockEntry:
        if not isinstance(data, dict):
            raise LockFileError(f"lock entry {source_id!r} must be a table")
        typed_data = cast(dict[str, object], data)
        _check_entry_field_set(source_id, typed_data)

        origin, track, resolved_ref = _check_entry_strings(source_id, typed_data)
        object_format, commit, tree = _check_entry_object_ids(source_id, typed_data)
        catalog_digest = _check_catalog_digest(source_id, typed_data["catalog_digest"])
        retrieved_at = _check_retrieved_at(source_id, typed_data["retrieved_at"])
        acquisition = _check_acquisition(source_id, typed_data["acquisition"])
        origin_verified = typed_data["origin_verified"]
        if not isinstance(origin_verified, bool):
            raise LockFileError(f"lock entry {source_id!r}: 'origin_verified' must be a boolean")
        licenses = _check_licenses_field(source_id, typed_data["licenses"])

        return LockEntry(
            origin=origin,
            track=track,
            resolved_ref=resolved_ref,
            object_format=object_format,
            commit=commit,
            tree=tree,
            catalog_digest=catalog_digest,
            retrieved_at=retrieved_at,
            acquisition=acquisition,
            origin_verified=origin_verified,
            licenses=licenses,
        )


@dataclass(frozen=True, slots=True)
class Lock:
    """The full parsed lock file."""

    generator: str
    sources: dict[str, LockEntry]

    def to_json(self) -> dict[str, object]:
        return {
            "schema": SCHEMA_NAME,
            "generator": self.generator,
            "sources": {
                source_id: entry.to_json() for source_id, entry in sorted(self.sources.items())
            },
        }


def serialize_lock(lock: Lock) -> bytes:
    text = json.dumps(lock.to_json(), indent=2, sort_keys=True, ensure_ascii=True)
    return (text + "\n").encode("utf-8")


def parse_lock_text(text: str) -> Lock:
    try:
        parsed: object = json.loads(text, object_pairs_hook=_no_duplicate_keys)
    except json.JSONDecodeError as exc:
        raise LockFileError(f"lock file is not valid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise LockFileError("lock file must be a JSON object")
    document = cast(dict[str, object], parsed)

    expected_top = {"schema", "generator", "sources"}
    missing = expected_top - set(document)
    if missing:
        raise LockFileError(f"lock file is missing top-level fields: {sorted(missing)}")
    extra = set(document) - expected_top
    if extra:
        raise LockFileError(f"lock file has unexpected top-level fields: {sorted(extra)}")

    schema = document["schema"]
    if schema != SCHEMA_NAME:
        raise LockFileError(f"unknown lock schema {schema!r} (expected {SCHEMA_NAME!r})")

    generator = document["generator"]
    if not isinstance(generator, str) or not generator:
        raise LockFileError("lock file 'generator' must be a non-empty string")

    sources_field = document["sources"]
    if not isinstance(sources_field, dict):
        raise LockFileError("lock file 'sources' must be a JSON object")
    sources_raw = cast(dict[str, object], sources_field)

    sources: dict[str, LockEntry] = {}
    for source_id, entry_data in sources_raw.items():
        sources[source_id] = LockEntry.from_json(source_id, entry_data)

    return Lock(generator=generator, sources=sources)


def load_lock(path: Path) -> Lock:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return Lock(generator="", sources={})
    except OSError as exc:
        raise LockFileError(f"cannot read lock file at {path}: {exc}") from exc
    return parse_lock_text(text)


def write_lock(path: Path, lock: Lock) -> None:
    """Atomically replace the lock file with ``lock``'s canonical bytes."""
    new_bytes = serialize_lock(lock)
    try:
        existing_bytes = path.read_bytes()
    except FileNotFoundError:
        existing_bytes = None
    if existing_bytes == new_bytes:
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".sources.lock.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(new_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp_name)
        raise
