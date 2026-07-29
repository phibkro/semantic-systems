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
from semantic_references.catalog import CatalogSource
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


def verify_checkout(worktree: Path, entry: LockEntry) -> CheckoutVerification:
    """Verify a checkout against the lock entry without mutating or fetching."""
    try:
        return _verify_checkout(worktree, entry)
    except AcquisitionError as exc:
        return CheckoutVerification(head_mismatch=None, reasons=(str(exc),))


def _verify_checkout(worktree: Path, entry: LockEntry) -> CheckoutVerification:
    if not gitutil.is_detached_head(worktree):
        return CheckoutVerification(None, ("checkout HEAD is not detached",))
    head = gitutil.head_commit(worktree)
    if head != entry.commit:
        return CheckoutVerification(
            head, (f"checkout is at {head}, locked commit is {entry.commit}",)
        )
    if not gitutil.is_clean_worktree(worktree):
        return CheckoutVerification(None, ("checkout has uncommitted changes",))

    reasons: list[str] = []
    tree = gitutil.tree_of_commit(worktree, head)
    if tree != entry.tree:
        reasons.append(f"checkout tree {tree} does not match locked tree {entry.tree}")
    for path, expected in entry.licenses.items():
        reasons.extend(_license_reasons(worktree, head, path, expected))
    return CheckoutVerification(None, tuple(reasons))


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
