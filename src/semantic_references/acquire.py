"""Safe acquisition for ``lock``: resolve a catalog source and hash its bytes.

This module never checks out a working tree — it only reads Git objects
(commit, tree, and declared license blobs) to build a :class:`LockEntry`.
See :mod:`semantic_references.materialize` for the checkout path used by
``materialize``.

Two structural properties live here:

- **transactional publication.** A remote lock validates everything in an
  isolated temporary repository and hands it to a :class:`CachePublication`,
  which publishes *every* staged cache and the lock together or publishes
  nothing. A later source failing therefore cannot leave an earlier source's
  cache advanced past the commit its lock entry still names.
- **coherent selector observation.** ``resolved_ref`` is always a concrete
  ref that was observed, twice, to resolve to exactly the commit recorded in
  the same entry; a selector that is ambiguous, unresolvable, or moving is
  refused rather than recorded as-is.
"""

from __future__ import annotations

import contextlib
import shutil
import tempfile
from collections.abc import Generator
from datetime import UTC, datetime
from pathlib import Path

from semantic_references import gitutil
from semantic_references.catalog import CatalogSource
from semantic_references.errors import AcquisitionError, NotLockableError
from semantic_references.lockfile import LicenseObservation, LockEntry

_OBJECT_CACHE_DIRNAME = ".git-cache"
_BACKUP_SUFFIX = ".backup-swap"


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
    repo_dir: Path, source: CatalogSource, commit: str, *, allow_transport: bool
) -> dict[str, LicenseObservation]:
    licenses: dict[str, LicenseObservation] = {}
    for path in source.license_paths:
        entry = gitutil.ls_tree_entry(repo_dir, commit, path, allow_transport=allow_transport)
        if entry is None:
            raise AcquisitionError(f"source {source.id!r}: license path {path!r} not in commit")
        if entry.object_type != "blob":
            raise AcquisitionError(
                f"source {source.id!r}: license path {path!r} is a {entry.object_type}, "
                "not a blob (submodule gitlinks cannot stand in for a license)"
            )
        if entry.mode == "120000":
            raise AcquisitionError(f"source {source.id!r}: license path {path!r} is a symlink")
        if entry.mode not in gitutil.REGULAR_BLOB_MODES:
            raise AcquisitionError(
                f"source {source.id!r}: license path {path!r} has mode {entry.mode}, "
                "which is not a regular committed blob"
            )
        digest = gitutil.blob_sha256(repo_dir, entry.oid, allow_transport=allow_transport)
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


def _rename_into_place(tmp_dir: Path, cache_dir: Path) -> None:
    """The single atomic rename that installs a validated fetch as the cache.

    Broken out so tests can inject a failure at exactly this point — after a
    prior cache has been staged aside, before the new one has taken its place.
    """
    tmp_dir.replace(cache_dir)


class CachePublication:
    """Stage validated object caches and publish them all or none.

    ``lock`` may touch several sources; publishing each cache as it is
    validated makes a partial failure observable on disk, because an early
    source's cache advances while its lock entry does not. Staging defers
    every rename to :meth:`publish`, which installs the whole set, runs the
    caller's lock write inside the same transaction, and rolls every install
    back — restoring each prior cache from its backup — if anything raises.

    This is transactional with respect to failures raised inside the
    transaction; it does not additionally claim safety across a process
    crash between two renames.
    """

    def __init__(self) -> None:
        self._staged: list[tuple[Path, Path]] = []

    def stage(self, tmp_dir: Path, cache_dir: Path) -> None:
        self._staged.append((tmp_dir, cache_dir))

    def abort(self) -> None:
        """Discard every staged, unpublished cache."""
        for tmp_dir, _ in self._staged:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        self._staged.clear()

    @contextlib.contextmanager
    def publish(self) -> Generator[None]:
        installed: list[tuple[Path, Path | None]] = []
        try:
            for tmp_dir, cache_dir in self._staged:
                # Record the displacement before attempting the rename: a
                # rename that fails must still restore the cache it displaced.
                backup_dir = self._displace(cache_dir)
                installed.append((cache_dir, backup_dir))
                _rename_into_place(tmp_dir, cache_dir)
            yield
        except BaseException:
            for cache_dir, backup_dir in reversed(installed):
                if cache_dir.exists():
                    shutil.rmtree(cache_dir, ignore_errors=True)
                if backup_dir is not None:
                    backup_dir.replace(cache_dir)
            self.abort()
            raise
        else:
            for _, backup_dir in installed:
                if backup_dir is not None:
                    shutil.rmtree(backup_dir, ignore_errors=True)
            self._staged.clear()

    @staticmethod
    def _displace(cache_dir: Path) -> Path | None:
        """Move a prior cache aside (same parent, so the rename is atomic)."""
        if not cache_dir.exists():
            return None
        backup_dir = cache_dir.with_name(cache_dir.name + _BACKUP_SUFFIX)
        if backup_dir.exists():
            shutil.rmtree(backup_dir)
        cache_dir.replace(backup_dir)
        return backup_dir


def _lock_remote(
    source: CatalogSource, track: str, cache_dir: Path, publication: CachePublication
) -> tuple[str, str, dict[str, LicenseObservation], str, str]:
    """Fetch, fully validate in an isolated temp dir, then stage the cache.

    A failure at any point (fetch, hashing, license validation, or selector
    observation) leaves ``cache_dir`` exactly as it was, because nothing is
    renamed until the whole ``lock`` transaction publishes.
    """
    cache_dir.parent.mkdir(parents=True, exist_ok=True)
    tmp_dir = Path(tempfile.mkdtemp(prefix=".lock-fetch-", dir=cache_dir.parent))
    try:
        gitutil.init_repo(tmp_dir)
        gitutil.fetch_shallow_blobless(tmp_dir, source.origin, track)
        commit = gitutil.resolve_commit(tmp_dir, "FETCH_HEAD")
        tree = gitutil.tree_of_commit(tmp_dir, commit)
        # The fetch was blob-filtered, so hashing the declared license blobs
        # legitimately needs the transport this online path already opened.
        licenses = _hash_licenses(tmp_dir, source, commit, allow_transport=True)
        fmt = gitutil.object_format(tmp_dir)
        resolved_ref = gitutil.observe_concrete_ref(
            source.origin, track, commit, allow_transport=True
        )
        # A fetch by ref leaves only FETCH_HEAD behind, which advertises
        # nothing: without a real ref the cache cannot be cloned offline
        # later. Name the fetched commit on the cache's own branch.
        gitutil.set_branch(tmp_dir, gitutil.CACHE_BRANCH, commit)
    except BaseException:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
    publication.stage(tmp_dir, cache_dir)
    return commit, tree, licenses, fmt, resolved_ref


def lock_source(
    source: CatalogSource,
    *,
    project_root: Path,
    references_root: Path,
    generator: str,
    offline: bool,
    existing_entry: LockEntry | None,
    publication: CachePublication | None = None,
) -> LockEntry:
    """Observe ``source`` and return the lock entry it justifies.

    ``publication`` is the caller's open transaction; when it is omitted the
    single observation is published immediately, so a lone ``lock <id>`` and
    a ``lock --all`` share one publication mechanism.
    """
    if publication is None:
        own_publication = CachePublication()
        entry = lock_source(
            source,
            project_root=project_root,
            references_root=references_root,
            generator=generator,
            offline=offline,
            existing_entry=existing_entry,
            publication=own_publication,
        )
        with own_publication.publish():
            pass
        return entry

    if not source.lockable or source.track is None:
        raise NotLockableError(
            f"source {source.id!r} has no 'track'/'license_paths' declared and cannot be locked"
        )
    track = source.track
    cache_dir = object_cache_dir(references_root, source.id)

    if offline:
        repo_dir, acquisition = _resolve_offline_repo(source, project_root, cache_dir, track)
        commit = gitutil.resolve_commit(repo_dir, track)
        # A local sibling or object cache is a real, queryable repository, so
        # the selector is observed against it with no transport at all.
        resolved_ref = gitutil.observe_concrete_ref(str(repo_dir), track, commit)
        origin_verified = False
        tree = gitutil.tree_of_commit(repo_dir, commit)
        licenses = _hash_licenses(repo_dir, source, commit, allow_transport=False)
        fmt = gitutil.object_format(repo_dir)
    else:
        commit, tree, licenses, fmt, resolved_ref = _lock_remote(
            source, track, cache_dir, publication
        )
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
