"""Safe acquisition for ``lock``: resolve a catalog source and hash its bytes.

This module never checks out a working tree — it only reads Git objects
(commit, tree, and declared license blobs) to build a :class:`LockEntry`.
See :mod:`semantic_references.materialize` for the checkout path used by
``materialize``.
"""

from __future__ import annotations

import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from semantic_references import gitutil
from semantic_references.catalog import CatalogSource
from semantic_references.errors import AcquisitionError, NotLockableError
from semantic_references.lockfile import LicenseObservation, LockEntry

_OBJECT_CACHE_DIRNAME = ".git-cache"


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def object_cache_dir(references_root: Path, source_id: str) -> Path:
    return references_root / source_id / _OBJECT_CACHE_DIRNAME


def resolve_local_sibling(source: CatalogSource, project_root: Path) -> Path:
    if source.local_hint is None:
        raise AcquisitionError(
            f"source {source.id!r}: offline lock needs a declared 'local_hint' sibling "
            "or an existing local object cache"
        )
    sibling = (project_root / source.local_hint).resolve()
    sibling_git_dir = sibling / ".git"
    if not sibling_git_dir.exists():
        raise AcquisitionError(f"source {source.id!r}: local_hint {sibling} has no .git directory")

    accepted = {source.origin, *source.origin_aliases}
    observed = gitutil.remote_url(sibling)
    if observed is None or observed not in accepted:
        raise AcquisitionError(
            f"source {source.id!r}: local sibling remote {observed!r} does not match "
            f"declared origin or an origin_aliases entry {sorted(accepted)!r}"
        )
    return sibling


def _hash_licenses(
    repo_dir: Path, source: CatalogSource, commit: str
) -> dict[str, LicenseObservation]:
    licenses: dict[str, LicenseObservation] = {}
    for path in source.license_paths:
        entry = gitutil.ls_tree_entry(repo_dir, commit, path)
        if entry is None:
            raise AcquisitionError(f"source {source.id!r}: license path {path!r} not in commit")
        if entry.object_type != "blob":
            raise AcquisitionError(
                f"source {source.id!r}: license path {path!r} is a {entry.object_type}, "
                "not a blob (submodule gitlinks cannot stand in for a license)"
            )
        if entry.mode == "120000":
            raise AcquisitionError(f"source {source.id!r}: license path {path!r} is a symlink")
        digest = gitutil.blob_sha256(repo_dir, entry.oid)
        licenses[path] = LicenseObservation(mode=entry.mode, size=entry.size, sha256=digest)
    return licenses


def lock_source(
    source: CatalogSource,
    *,
    project_root: Path,
    references_root: Path,
    generator: str,
    offline: bool,
    existing_entry: LockEntry | None,
) -> LockEntry:
    if not source.lockable or source.track is None:
        raise NotLockableError(
            f"source {source.id!r} has no 'track'/'license_paths' declared and cannot be locked"
        )
    track = source.track

    cache_dir = object_cache_dir(references_root, source.id)

    if offline:
        if cache_dir.exists():
            repo_dir = cache_dir
            try:
                commit = gitutil.resolve_commit(repo_dir, track)
            except AcquisitionError:
                repo_dir = resolve_local_sibling(source, project_root)
                commit = gitutil.resolve_commit(repo_dir, track)
                acquisition = "local-sibling"
            else:
                acquisition = "local-object-cache"
        else:
            repo_dir = resolve_local_sibling(source, project_root)
            commit = gitutil.resolve_commit(repo_dir, track)
            acquisition = "local-sibling"
        origin_verified = False
    else:
        cache_dir.parent.mkdir(parents=True, exist_ok=True)
        tmp_dir = Path(tempfile.mkdtemp(prefix=".lock-fetch-", dir=cache_dir.parent))
        try:
            gitutil.init_repo(tmp_dir)
            gitutil.fetch_shallow_blobless(tmp_dir, source.origin, track)
            commit = gitutil.resolve_commit(tmp_dir, "FETCH_HEAD")
            if cache_dir.exists():
                shutil.rmtree(cache_dir)
            tmp_dir.replace(cache_dir)
        except BaseException:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            raise
        repo_dir = cache_dir
        acquisition = "remote"
        origin_verified = True

    tree = gitutil.tree_of_commit(repo_dir, commit)
    licenses = _hash_licenses(repo_dir, source, commit)
    fmt = gitutil.object_format(repo_dir)

    candidate = LockEntry(
        origin=source.origin,
        track=track,
        # This implementation always fetches the declared selector by name, so the
        # concrete ref resolved this time is that same selector.
        resolved_ref=track,
        object_format=fmt,
        commit=commit,
        tree=tree,
        catalog_digest=source.canonical_digest(),
        retrieved_at=_now_iso(),
        acquisition=acquisition,
        origin_verified=origin_verified,
        licenses=licenses,
    )

    if existing_entry is not None and existing_entry.content_equal(candidate):
        return existing_entry

    return candidate
