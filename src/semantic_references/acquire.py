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


def _resolve_offline_repo(
    source: CatalogSource, project_root: Path, cache_dir: Path, track: str
) -> tuple[Path, str]:
    if cache_dir.exists():
        try:
            gitutil.resolve_commit(cache_dir, track)
        except AcquisitionError:
            pass
        else:
            return cache_dir, "local-object-cache"
    return resolve_local_sibling(source, project_root), "local-sibling"


def _resolve_ref_offline(
    repo_dir: Path, acquisition: str, track: str, existing_entry: LockEntry | None
) -> str:
    if acquisition == "local-sibling":
        # A local sibling is a real, queryable repository (no network needed):
        # ask it directly what a symbolic selector like HEAD concretely names.
        return gitutil.resolve_track_ref(str(repo_dir), track)
    # A bare object cache has no meaningful HEAD of its own, and asking the
    # declared origin would require network access, which offline mode must
    # never do. Best effort: keep whatever a prior resolution already found.
    if existing_entry is not None and existing_entry.track == track:
        return existing_entry.resolved_ref
    return track


def _lock_remote(
    source: CatalogSource, track: str, cache_dir: Path
) -> tuple[str, str, dict[str, LicenseObservation], str, str]:
    """Fetch, fully validate in an isolated temp dir, and only then install the cache.

    A failure at any point (fetch, hashing, license validation) leaves
    ``cache_dir`` exactly as it was — a prior valid cache is never replaced
    with a fetch that hasn't yet proven itself correct.
    """
    cache_dir.parent.mkdir(parents=True, exist_ok=True)
    tmp_dir = Path(tempfile.mkdtemp(prefix=".lock-fetch-", dir=cache_dir.parent))
    try:
        gitutil.init_repo(tmp_dir)
        gitutil.fetch_shallow_blobless(tmp_dir, source.origin, track)
        commit = gitutil.resolve_commit(tmp_dir, "FETCH_HEAD")
        tree = gitutil.tree_of_commit(tmp_dir, commit)
        licenses = _hash_licenses(tmp_dir, source, commit)
        fmt = gitutil.object_format(tmp_dir)
        resolved_ref = gitutil.resolve_track_ref(source.origin, track)

        # Only now, with everything validated, install the new cache.
        if cache_dir.exists():
            shutil.rmtree(cache_dir)
        tmp_dir.replace(cache_dir)
    except BaseException:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
    return commit, tree, licenses, fmt, resolved_ref


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
        repo_dir, acquisition = _resolve_offline_repo(source, project_root, cache_dir, track)
        commit = gitutil.resolve_commit(repo_dir, track)
        resolved_ref = _resolve_ref_offline(repo_dir, acquisition, track, existing_entry)
        origin_verified = False
        tree = gitutil.tree_of_commit(repo_dir, commit)
        licenses = _hash_licenses(repo_dir, source, commit)
        fmt = gitutil.object_format(repo_dir)
    else:
        commit, tree, licenses, fmt, resolved_ref = _lock_remote(source, track, cache_dir)
        acquisition = "remote"
        origin_verified = True

    candidate = LockEntry(
        origin=source.origin,
        track=track,
        resolved_ref=resolved_ref,
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
