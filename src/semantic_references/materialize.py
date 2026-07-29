"""Safe acquisition for ``materialize``: build a verified checkout.

Order is load-bearing:

1. the lock entry is bound to the canonical catalog record *before* anything
   under ``.references/`` is created, so catalog drift is refused without
   leaving a directory, a temporary clone, or a partial checkout behind;
2. the checkout is built entirely in a sibling temporary directory and only
   renamed into place after :mod:`semantic_references.verify` passes, so a
   failed attempt can never damage a previously valid checkout;
3. a pre-existing checkout that does not verify is refused, never repaired
   and never deleted (design spec 0004, kill criteria).
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from semantic_references import gitutil
from semantic_references.acquire import resolve_local_sibling
from semantic_references.catalog import CatalogSource
from semantic_references.errors import AcquisitionError
from semantic_references.lockfile import LockEntry
from semantic_references.paths import (
    inspect_managed_directory,
    require_child_absent_or_real,
)
from semantic_references.verify import (
    catalog_binding_reasons,
    publication_blocking_reasons,
    verify_checkout,
)


def checkout_dir(references_root: Path, source_id: str) -> Path:
    return references_root / source_id / "checkout"


def _require_catalog_binding(source: CatalogSource, entry: LockEntry) -> None:
    reasons = catalog_binding_reasons(source, entry)
    if reasons:
        raise AcquisitionError(
            f"source {source.id!r}: refusing to materialize a lock entry that no longer "
            f"matches the catalog record: {'; '.join(reasons)}"
        )


def _require_verified_worktree(worktree: Path, source: CatalogSource, entry: LockEntry) -> None:
    verification = verify_checkout(worktree, entry)
    blocking = publication_blocking_reasons(verification)
    if verification.head_mismatch is not None or blocking:
        reasons = blocking or verification.reasons
        raise AcquisitionError(f"source {source.id!r}: {'; '.join(reasons)}")


def _already_materialized(worktree: Path, entry: LockEntry) -> bool:
    if not worktree.exists():
        return False
    verification = verify_checkout(worktree, entry)
    return verification.head_mismatch is None and not publication_blocking_reasons(verification)


def materialize_source(
    source: CatalogSource,
    entry: LockEntry,
    *,
    project_root: Path,
    references_root: Path,
    offline: bool,
    allow_history_fallback: bool,
) -> Path:
    # Fail closed before any mutation: catalog drift must not create state.
    _require_catalog_binding(source, entry)

    target = require_child_absent_or_real(
        references_root, source.id, "checkout", create_source=True
    )
    if target.exists():
        if _already_materialized(target, entry):
            return target
        raise AcquisitionError(
            f"source {source.id!r}: an existing checkout at {target} does not match the "
            "locked commit; refusing to overwrite or delete it — remove it manually first "
            "if you want it rebuilt"
        )

    tmp_parent = target.parent
    tmp_worktree = Path(tempfile.mkdtemp(prefix=".materialize-", dir=tmp_parent))
    try:
        if offline:
            _materialize_offline(tmp_worktree, source, entry, project_root, references_root)
        else:
            _materialize_remote(tmp_worktree, source, entry, allow_history_fallback)
        _require_verified_worktree(tmp_worktree, source, entry)

        # `target` is guaranteed absent here (checked above), so this is a
        # plain install, never an overwrite of existing content.
        tmp_worktree.replace(target)
    except BaseException:
        shutil.rmtree(tmp_worktree, ignore_errors=True)
        raise
    return target


def _materialize_offline(
    tmp_worktree: Path,
    source: CatalogSource,
    entry: LockEntry,
    project_root: Path,
    references_root: Path,
) -> None:
    cache_dir = inspect_managed_directory(references_root, source.id, ".git-cache")
    if cache_dir is not None and gitutil.object_exists(cache_dir, entry.commit):
        gitutil.clone_local(cache_dir, tmp_worktree)
        gitutil.checkout_detached(tmp_worktree, entry.commit)
        return

    sibling = resolve_local_sibling(source, project_root)
    if not gitutil.object_exists(sibling, entry.commit):
        raise AcquisitionError(
            f"source {source.id!r}: locked commit {entry.commit} is not available offline "
            "(missing from both the local object cache and the declared local sibling)"
        )
    gitutil.clone_local(sibling / ".git", tmp_worktree)
    gitutil.checkout_detached(tmp_worktree, entry.commit)


def _fetch_shallow_if_matches(tmp_worktree: Path, origin: str, ref: str, want_commit: str) -> bool:
    """Shallow-fetch ``ref`` and report whether it produced exactly ``want_commit``.

    A fetch that succeeds but lands on a different commit (the ref moved) is
    reported as a miss, not an error — the caller decides what to do next.
    """
    try:
        resolved = gitutil.fetch_shallow_blobless(tmp_worktree, origin, ref)
    except AcquisitionError:
        return False
    return resolved == want_commit


def _materialize_remote(
    tmp_worktree: Path,
    source: CatalogSource,
    entry: LockEntry,
    allow_history_fallback: bool,
) -> None:
    gitutil.init_repo(tmp_worktree, object_format=entry.object_format)

    # 1. Exact shallow fetch of the locked commit itself. 2. Failing that, a
    #    shallow fetch of the recorded ref, accepted only if it still
    #    resolves to the locked commit (the branch hasn't moved).
    exact_ok = _fetch_shallow_if_matches(tmp_worktree, source.origin, entry.commit, entry.commit)
    ref_ok = exact_ok or _fetch_shallow_if_matches(
        tmp_worktree, source.origin, entry.resolved_ref, entry.commit
    )
    if not ref_ok:
        if not allow_history_fallback:
            raise AcquisitionError(
                f"source {source.id!r}: exact shallow fetch of {entry.commit} failed, and "
                f"a shallow fetch of tracked ref {entry.resolved_ref!r} did not resolve to "
                "the locked commit; --allow-history-fallback was not given"
            )
        # 3. Broader blobless history fetch, explicitly opted into.
        gitutil.fetch_blobless_history(tmp_worktree, source.origin, entry.track)
        if not gitutil.object_exists(tmp_worktree, entry.commit):
            raise AcquisitionError(
                f"source {source.id!r}: locked commit {entry.commit} is not reachable "
                f"from tracked ref {entry.track!r} even after a broader history fetch"
            )

    # This repository was fetched blobless from the network; checking out the
    # working tree legitimately needs its blobs, so transport is allowed here
    # and only here.
    gitutil.checkout_detached(tmp_worktree, entry.commit, allow_transport=True)
