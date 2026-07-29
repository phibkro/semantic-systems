"""Safe acquisition for ``materialize``: build a verified checkout.

The checkout under ``.references/<id>/checkout`` is built entirely in a
sibling temporary directory and only renamed into place after every
verification below passes, so a failed attempt can never damage a
previously valid checkout (design spec 0004, kill criteria).
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from semantic_references import gitutil
from semantic_references.acquire import object_cache_dir, resolve_local_sibling
from semantic_references.catalog import CatalogSource
from semantic_references.errors import AcquisitionError
from semantic_references.lockfile import LockEntry


def checkout_dir(references_root: Path, source_id: str) -> Path:
    return references_root / source_id / "checkout"


def _verify_worktree(worktree: Path, source: CatalogSource, entry: LockEntry) -> None:
    if not gitutil.is_detached_head(worktree):
        raise AcquisitionError(f"source {source.id!r}: checkout HEAD is not detached")
    head = gitutil.head_commit(worktree)
    if head != entry.commit:
        raise AcquisitionError(
            f"source {source.id!r}: checkout is at {head}, locked commit is {entry.commit}"
        )
    if not gitutil.is_clean_worktree(worktree):
        raise AcquisitionError(f"source {source.id!r}: checkout is dirty")
    tree = gitutil.tree_of_commit(worktree, head)
    if tree != entry.tree:
        raise AcquisitionError(f"source {source.id!r}: checkout tree {tree} != locked {entry.tree}")

    suspicious = gitutil.has_submodules_or_lfs_pointers(worktree, list(entry.licenses))
    if suspicious:
        raise AcquisitionError(
            f"source {source.id!r}: license path(s) {suspicious} look like a submodule "
            "or LFS pointer, not real content"
        )

    for path, expected in entry.licenses.items():
        tree_entry = gitutil.ls_tree_entry(worktree, head, path)
        if tree_entry is None:
            raise AcquisitionError(f"source {source.id!r}: license path {path!r} missing")
        if tree_entry.object_type != "blob" or tree_entry.mode == "120000":
            raise AcquisitionError(f"source {source.id!r}: license path {path!r} is not a blob")
        if tree_entry.mode != expected.mode or tree_entry.size != expected.size:
            raise AcquisitionError(f"source {source.id!r}: license path {path!r} metadata changed")
        digest = gitutil.blob_sha256(worktree, tree_entry.oid)
        if digest != expected.sha256:
            raise AcquisitionError(f"source {source.id!r}: license path {path!r} bytes changed")


def _already_materialized(worktree: Path, source: CatalogSource, entry: LockEntry) -> bool:
    if not worktree.exists():
        return False
    try:
        _verify_worktree(worktree, source, entry)
    except AcquisitionError:
        return False
    return True


def materialize_source(
    source: CatalogSource,
    entry: LockEntry,
    *,
    project_root: Path,
    references_root: Path,
    offline: bool,
    allow_history_fallback: bool,
) -> Path:
    target = checkout_dir(references_root, source.id)
    if target.exists():
        if _already_materialized(target, source, entry):
            return target
        raise AcquisitionError(
            f"source {source.id!r}: an existing checkout at {target} does not match the "
            "locked commit; refusing to overwrite or delete it — remove it manually first "
            "if you want it rebuilt"
        )

    tmp_parent = references_root / source.id
    tmp_parent.mkdir(parents=True, exist_ok=True)
    tmp_worktree = Path(tempfile.mkdtemp(prefix=".materialize-", dir=tmp_parent))
    try:
        if offline:
            _materialize_offline(tmp_worktree, source, entry, project_root, references_root)
        else:
            _materialize_remote(tmp_worktree, source, entry, allow_history_fallback)
        _verify_worktree(tmp_worktree, source, entry)

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
    cache_dir = object_cache_dir(references_root, source.id)
    if cache_dir.exists() and gitutil.object_exists(cache_dir, entry.commit):
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
    gitutil.init_repo(tmp_worktree)

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

    gitutil.checkout_detached(tmp_worktree, entry.commit)
