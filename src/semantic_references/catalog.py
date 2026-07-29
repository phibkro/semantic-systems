"""Parsing and structural validation of ``references/sources.toml``.

The catalog is human-authored research intent (design spec 0004, "Catalog
boundary"). Parsing here never touches Git or the network: everything
checkable from the TOML text alone is checked here, and only here.
"""

from __future__ import annotations

import hashlib
import json
import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import cast

from semantic_references.errors import CatalogError

_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$")
_CONTROL_CHAR_MAX = 0x1F
_DEL_CHAR = 0x7F


def is_git_safe_value(value: str) -> bool:
    """Reject values that could be misread as a CLI option or carry control bytes.

    Applied to every catalog/lock field that is ever passed as a bare
    positional argument to ``git`` (origin URLs, refs, aliases): a leading
    ``-`` risks being parsed as an option, and control characters (including
    ANSI escapes) have no legitimate place in a Git ref or URL.
    """
    if not value:
        return False
    if value.startswith("-"):
        return False
    return not any(ord(ch) <= _CONTROL_CHAR_MAX or ord(ch) == _DEL_CHAR for ch in value)


@dataclass(frozen=True, slots=True)
class CatalogSource:
    """One ``[[source]]`` record from ``references/sources.toml``."""

    id: str
    kind: str
    origin: str
    local_hint: str | None
    origin_aliases: tuple[str, ...]
    track: str | None
    license_paths: tuple[str, ...]
    classes: tuple[str, ...]
    questions: tuple[str, ...]
    raw: dict[str, object] = field(repr=False)

    @property
    def lockable(self) -> bool:
        """A source is lockable once both custody fields are declared."""
        return self.track is not None and len(self.license_paths) > 0

    def canonical_digest(self) -> str:
        """SHA-256 of the complete canonical catalog record.

        Canonical form is the raw TOML record re-serialized as JSON with
        recursively sorted object keys and compact separators, so the digest
        is stable across whitespace/comment/key-order changes but sensitive
        to any field or value change (design spec 0004, ``reference-lock-v1``).
        """
        canonical = json.dumps(self.raw, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class Catalog:
    """The full, validated set of catalog sources, keyed by ID."""

    sources: dict[str, CatalogSource]

    def get(self, source_id: str) -> CatalogSource | None:
        return self.sources.get(source_id)


def _require_str(record: dict[str, object], key: str, source_id: str) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value:
        raise CatalogError(f"source {source_id!r}: field {key!r} must be a non-empty string")
    return value


def _optional_str(record: dict[str, object], key: str, source_id: str) -> str | None:
    if key not in record:
        return None
    value = record[key]
    if not isinstance(value, str) or not value:
        raise CatalogError(f"source {source_id!r}: field {key!r} must be a non-empty string")
    return value


def _optional_str_list(record: dict[str, object], key: str, source_id: str) -> tuple[str, ...]:
    if key not in record:
        return ()
    value = record[key]
    if not isinstance(value, list):
        raise CatalogError(f"source {source_id!r}: field {key!r} must be a list of strings")
    raw_items = cast("list[object]", value)
    if not all(isinstance(item, str) for item in raw_items):
        raise CatalogError(f"source {source_id!r}: field {key!r} must be a list of strings")
    items = [item for item in raw_items if isinstance(item, str)]
    if not items:
        raise CatalogError(f"source {source_id!r}: field {key!r} must not be an empty list")
    return tuple(items)


def validate_source_id(source_id: str) -> None:
    if not _ID_PATTERN.match(source_id):
        raise CatalogError(
            f"source id {source_id!r} is not a path-safe dotted identifier "
            "(expected lowercase alphanumeric/hyphen segments joined by single dots)"
        )


def validate_license_path(source_id: str, raw_path: str) -> str:
    """Normalize and validate one declared license artifact path.

    Must be relative, use forward slashes, contain no ``.``/``..`` segments,
    and carry no leading/trailing slash.
    """
    if not raw_path or raw_path != raw_path.strip():
        raise CatalogError(f"source {source_id!r}: license path {raw_path!r} is not normalized")
    if "\\" in raw_path:
        raise CatalogError(f"source {source_id!r}: license path {raw_path!r} must use '/'")
    if raw_path.startswith("/") or raw_path.endswith("/"):
        raise CatalogError(
            f"source {source_id!r}: license path {raw_path!r} must be relative and not "
            "trail a slash"
        )
    pure = PurePosixPath(raw_path)
    parts = pure.parts
    if not parts or any(part in ("", ".", "..") for part in parts):
        raise CatalogError(
            f"source {source_id!r}: license path {raw_path!r} must be a normalized relative path"
        )
    if str(pure) != raw_path:
        raise CatalogError(f"source {source_id!r}: license path {raw_path!r} is not normalized")
    return raw_path


def _validate_source(record: dict[str, object]) -> CatalogSource:
    raw_id = record.get("id")
    if not isinstance(raw_id, str) or not raw_id:
        raise CatalogError("source record is missing a non-empty string 'id'")
    source_id = raw_id
    validate_source_id(source_id)

    kind = _require_str(record, "kind", source_id)
    origin = _require_str(record, "origin", source_id)
    if not is_git_safe_value(origin):
        raise CatalogError(
            f"source {source_id!r}: 'origin' is not safe (option-like or has control characters)"
        )
    local_hint = _optional_str(record, "local_hint", source_id)
    origin_aliases = _optional_str_list(record, "origin_aliases", source_id)
    for alias in origin_aliases:
        if not is_git_safe_value(alias):
            raise CatalogError(
                f"source {source_id!r}: origin_aliases entry {alias!r} is not safe "
                "(option-like or has control characters)"
            )
    track = _optional_str(record, "track", source_id)
    if track is not None and not is_git_safe_value(track):
        raise CatalogError(
            f"source {source_id!r}: 'track' is not safe (option-like or has control characters)"
        )
    license_paths_raw = _optional_str_list(record, "license_paths", source_id)
    classes = _optional_str_list(record, "classes", source_id)
    questions = _optional_str_list(record, "questions", source_id)

    license_paths = tuple(validate_license_path(source_id, path) for path in license_paths_raw)
    if len(set(license_paths)) != len(license_paths):
        raise CatalogError(f"source {source_id!r}: license_paths contains duplicates")

    if (track is None) != (len(license_paths) == 0):
        raise CatalogError(
            f"source {source_id!r}: 'track' and 'license_paths' must be declared together "
            "(a source is either fully lockable or fully unlocked)"
        )

    return CatalogSource(
        id=source_id,
        kind=kind,
        origin=origin,
        local_hint=local_hint,
        origin_aliases=origin_aliases,
        track=track,
        license_paths=license_paths,
        classes=classes,
        questions=questions,
        raw=record,
    )


def parse_catalog_text(text: str) -> Catalog:
    try:
        document: dict[str, object] = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise CatalogError(f"catalog is not valid TOML: {exc}") from exc

    schema = document.get("schema")
    if schema != 1:
        raise CatalogError(f"catalog schema {schema!r} is not the supported value (1)")

    records_field = document.get("source", [])
    if not isinstance(records_field, list):
        raise CatalogError("catalog field 'source' must be an array of tables")
    records = cast("list[object]", records_field)

    sources: dict[str, CatalogSource] = {}
    for record in records:
        if not isinstance(record, dict):
            raise CatalogError("each [[source]] entry must be a table")
        typed_record = cast("dict[str, object]", record)
        source = _validate_source(typed_record)
        if source.id in sources:
            raise CatalogError(f"duplicate source id {source.id!r}")
        sources[source.id] = source

    return Catalog(sources=sources)


def load_catalog(path: Path) -> Catalog:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise CatalogError(f"cannot read catalog at {path}: {exc}") from exc
    return parse_catalog_text(text)
