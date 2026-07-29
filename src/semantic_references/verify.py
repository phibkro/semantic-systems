"""The one place custody verification rules live.

``status`` and ``materialize`` must agree exactly about what a valid custody
observation is; keeping two copies of these rules is what let a checkout pass
one gate and fail the other. Both now call this module: ``status`` maps the
findings onto custody states, ``materialize`` refuses on any finding.

Two independent bindings are checked:

- **catalog binding** — the lock entry against the canonical catalog record
  it claims to derive from (digest plus every semantic field);
- **checkout binding** — the materialized checkout against the lock entry,
  covering both the committed objects the lock recorded and the ordinary
  working-tree bytes a researcher would read.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from semantic_references import gitutil
from semantic_references.catalog import CatalogSource, is_concrete_git_ref
from semantic_references.errors import AcquisitionError
from semantic_references.lockfile import LicenseObservation, LockEntry


def catalog_binding_reasons(source: CatalogSource, entry: LockEntry) -> tuple[str, ...]:
    """Reasons the lock entry is not a faithful observation of this catalog record.

    The digest covers the canonical catalog record; the field comparisons
    cross-bind the entry's own semantic claims, which a hand-edited lock can
    change while leaving a correct digest in place.
    """
    reasons: list[str] = []
    if entry.catalog_digest != source.canonical_digest():
        reasons.append("catalog record no longer matches the digest recorded at lock time")
    if entry.origin != source.origin:
        reasons.append(
            f"locked origin {entry.origin!r} is not the catalog origin {source.origin!r}"
        )
    if source.track is None or entry.track != source.track:
        reasons.append(f"locked track {entry.track!r} is not the catalog track {source.track!r}")
    if not is_concrete_git_ref(entry.resolved_ref):
        reasons.append(
            f"locked resolved_ref {entry.resolved_ref!r} is not a concrete valid refs/... name"
        )
    locked_paths = set(entry.licenses)
    declared_paths = set(source.license_paths)
    if locked_paths != declared_paths:
        reasons.append(
            f"locked license set {sorted(locked_paths)} is not the catalog declaration "
            f"{sorted(declared_paths)}"
        )
    return tuple(reasons)


@dataclass(frozen=True, slots=True)
class CheckoutVerification:
    """What a checkout inspection observed.

    ``head_mismatch`` is separate because it is the one finding that means
    *drift* (the checkout names a different commit) rather than *unverifiable*.
    """

    head_mismatch: str | None
    reasons: tuple[str, ...]

    @property
    def ok(self) -> bool:
        return self.head_mismatch is None and not self.reasons


def publication_blocking_reasons(
    verification: CheckoutVerification,
) -> tuple[str, ...]:
    """Findings that prevent publishing even an explicitly incomplete checkout.

    Gitlinks and LFS pointers are exact bytes of the superproject tree but are
    not fully materialized content.  Publishing that checkout is useful for
    inspection; strict status remains ``unverifiable`` and surfaces the exact
    missing-indirection reason.  Every other finding blocks publication.
    """
    visible_indirections = ("unmaterialized submodule gitlink", "Git LFS pointer")
    return tuple(
        reason
        for reason in verification.reasons
        if not any(marker in reason for marker in visible_indirections)
    )


def verify_checkout(worktree: Path, entry: LockEntry) -> CheckoutVerification:
    """Verify a checkout against the lock entry without mutating or fetching."""
    try:
        return _verify_checkout(worktree, entry)
    except AcquisitionError as exc:
        return CheckoutVerification(head_mismatch=None, reasons=(str(exc),))


def _verify_checkout(worktree: Path, entry: LockEntry) -> CheckoutVerification:
    if worktree.is_symlink():
        return CheckoutVerification(None, ("checkout path is an unsafe symlink",))
    if not gitutil.is_detached_head(worktree):
        return CheckoutVerification(None, ("checkout HEAD is not detached",))
    head = gitutil.head_commit(worktree)
    if head != entry.commit:
        return CheckoutVerification(
            head, (f"checkout is at {head}, locked commit is {entry.commit}",)
        )
    hidden_reasons = gitutil.hidden_index_reasons(worktree)
    if hidden_reasons:
        return CheckoutVerification(None, hidden_reasons)
    if not gitutil.is_clean_worktree(worktree):
        return CheckoutVerification(None, ("checkout has uncommitted changes",))

    reasons: list[str] = []
    tree = gitutil.tree_of_commit(worktree, head)
    if tree != entry.tree:
        reasons.append(f"checkout tree {tree} does not match locked tree {entry.tree}")
    for path, expected in entry.licenses.items():
        reasons.extend(_license_reasons(worktree, head, path, expected))
    reasons.extend(_complete_tree_reasons(worktree, head))
    return CheckoutVerification(None, tuple(reasons))


def _complete_tree_reasons(worktree: Path, head: str) -> list[str]:
    """Expose indirections that are not complete superproject content."""
    reasons: list[str] = []
    pointer_prefix_length = len(b"version https://git-lfs.github.com/spec")
    for entry in gitutil.ls_tree_recursive(worktree, head):
        if entry.mode == "160000" or entry.object_type == "commit":
            reasons.append(f"tracked path {entry.path!r} is an unmaterialized submodule gitlink")
            continue
        if entry.mode not in gitutil.REGULAR_BLOB_MODES:
            continue
        try:
            prefix = gitutil.worktree_file_prefix(worktree, entry.path, pointer_prefix_length)
        except AcquisitionError as exc:
            reasons.append(str(exc))
            continue
        if gitutil.looks_like_lfs_pointer(prefix):
            reasons.append(
                f"tracked path {entry.path!r} is a Git LFS pointer, not hydrated content"
            )
    return reasons


def _license_reasons(
    worktree: Path, head: str, path: str, expected: LicenseObservation
) -> list[str]:
    """Bind one license artifact twice: committed object, then checkout bytes."""
    reasons: list[str] = []
    tree_entry = gitutil.ls_tree_entry(worktree, head, path)
    if tree_entry is None:
        return [f"license path {path!r} is missing from the committed tree"]
    if tree_entry.object_type != "blob" or tree_entry.mode not in gitutil.REGULAR_BLOB_MODES:
        return [f"license path {path!r} is not a regular committed blob"]
    if tree_entry.mode != expected.mode or tree_entry.size != expected.size:
        reasons.append(f"license path {path!r} committed metadata changed")
    elif gitutil.blob_sha256(worktree, tree_entry.oid) != expected.sha256:
        reasons.append(f"license path {path!r} committed bytes changed")

    # The committed object can match while the checkout a researcher reads
    # does not: `assume-unchanged` / `skip-worktree` suppress Git's own change
    # detection, so the ordinary bytes are measured directly.
    try:
        content = gitutil.worktree_blob_bytes(worktree, path)
    except AcquisitionError as exc:
        return [*reasons, str(exc)]
    if gitutil.looks_like_lfs_pointer(content):
        reasons.append(f"license path {path!r} is a Git LFS pointer, not real content")
        return reasons
    if len(content) != expected.size:
        reasons.append(f"license path {path!r} working-tree size changed")
    elif hashlib.sha256(content).hexdigest() != expected.sha256:
        reasons.append(f"license path {path!r} working-tree bytes changed")
    return reasons
