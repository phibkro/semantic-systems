"""Network-free strict status.

Computes one of the six human-readable custody states from design spec 0004
without ever mutating anything or touching the network. ``--lock-only``
verifies lock structure, catalog derivation, and exact pins without opening
a checkout; the full mode additionally inspects ``.references/<id>/checkout``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from semantic_references import gitutil
from semantic_references.catalog import CatalogSource
from semantic_references.errors import AcquisitionError
from semantic_references.lockfile import LicenseObservation, Lock, LockEntry
from semantic_references.materialize import checkout_dir


class CustodyState(StrEnum):
    QUEUED_UNLOCKED = "queued_unlocked"
    LOCKED_UNMATERIALIZED = "locked_unmaterialized"
    MATERIALIZED_VERIFIED = "materialized_verified"
    MATERIALIZED_WITH_VISIBLE_ASSUMPTION = "materialized_with_visible_assumption"
    DRIFTED = "drifted"
    UNVERIFIABLE = "unverifiable"


_STRICT_OK_STATES = frozenset(
    {CustodyState.MATERIALIZED_VERIFIED, CustodyState.MATERIALIZED_WITH_VISIBLE_ASSUMPTION}
)


@dataclass(frozen=True, slots=True)
class StatusReport:
    source_id: str
    state: CustodyState
    reasons: tuple[str, ...]
    lock_only: bool = False
    origin: str | None = None
    track: str | None = None
    resolved_ref: str | None = None
    commit: str | None = None
    tree: str | None = None
    acquisition: str | None = None
    origin_verified: bool | None = None
    licenses: dict[str, str] | None = None

    @property
    def strict_ok(self) -> bool:
        """Whether this report satisfies strict status for the mode it ran in.

        ``--lock-only`` never opens a checkout, so its success bar is a
        structurally valid, undrifted lock (``locked_unmaterialized``); the
        strict default still requires an actual verified materialization.
        """
        if self.lock_only:
            return self.state == CustodyState.LOCKED_UNMATERIALIZED
        return self.state in _STRICT_OK_STATES

    def to_json(self) -> dict[str, object]:
        return {
            "source_id": self.source_id,
            "state": str(self.state),
            "strict_ok": self.strict_ok,
            "reasons": list(self.reasons),
            "origin": self.origin,
            "track": self.track,
            "resolved_ref": self.resolved_ref,
            "commit": self.commit,
            "tree": self.tree,
            "acquisition": self.acquisition,
            "origin_verified": self.origin_verified,
            "licenses": self.licenses,
        }


def _inspect_checkout(
    target: Path, entry_commit: str, entry_tree: str, licenses: dict[str, LicenseObservation]
) -> tuple[CustodyState | None, list[str]]:
    """Return ``(None, [])`` when the checkout fully verifies, else a state override."""
    if not gitutil.is_detached_head(target):
        return CustodyState.UNVERIFIABLE, ["checkout HEAD is not detached"]
    head = gitutil.head_commit(target)
    if head != entry_commit:
        return CustodyState.DRIFTED, [f"checkout is at {head}, locked commit is {entry_commit}"]
    if not gitutil.is_clean_worktree(target):
        return CustodyState.UNVERIFIABLE, ["checkout has uncommitted changes"]

    reasons: list[str] = []
    tree = gitutil.tree_of_commit(target, head)
    if tree != entry_tree:
        reasons.append(f"checkout tree {tree} does not match locked tree {entry_tree}")

    suspicious = gitutil.has_submodules_or_lfs_pointers(target, list(licenses))
    if suspicious:
        reasons.append(f"license path(s) look like a submodule or LFS pointer: {suspicious}")

    reasons.extend(_check_licenses(target, head, licenses))

    return (CustodyState.UNVERIFIABLE, reasons) if reasons else (None, [])


def _check_licenses(target: Path, head: str, licenses: dict[str, LicenseObservation]) -> list[str]:
    reasons: list[str] = []
    for path, expected in licenses.items():
        tree_entry = gitutil.ls_tree_entry(target, head, path)
        if tree_entry is None:
            reasons.append(f"license path {path!r} is missing from the checkout")
            continue
        if tree_entry.object_type != "blob" or tree_entry.mode == "120000":
            reasons.append(f"license path {path!r} is not a regular blob")
            continue
        if tree_entry.mode != expected.mode or tree_entry.size != expected.size:
            reasons.append(f"license path {path!r} metadata changed")
            continue
        digest = gitutil.blob_sha256(target, tree_entry.oid)
        if digest != expected.sha256:
            reasons.append(f"license path {path!r} bytes changed")
    return reasons


def _report_from_entry(
    source_id: str,
    entry: LockEntry,
    state: CustodyState,
    reasons: tuple[str, ...],
    *,
    lock_only: bool = False,
) -> StatusReport:
    return StatusReport(
        source_id=source_id,
        state=state,
        reasons=reasons,
        lock_only=lock_only,
        origin=entry.origin,
        track=entry.track,
        resolved_ref=entry.resolved_ref,
        commit=entry.commit,
        tree=entry.tree,
        acquisition=entry.acquisition,
        origin_verified=entry.origin_verified,
        licenses={path: obs.sha256 for path, obs in entry.licenses.items()},
    )


def compute_status(
    source: CatalogSource,
    lock: Lock,
    references_root: Path,
    *,
    lock_only: bool,
) -> StatusReport:
    entry = lock.sources.get(source.id)
    if entry is None:
        reasons = () if source.lockable else ("not lockable: 'track'/'license_paths' undeclared",)
        return StatusReport(
            source_id=source.id,
            state=CustodyState.QUEUED_UNLOCKED,
            reasons=reasons,
            lock_only=lock_only,
            origin=source.origin,
            track=source.track,
        )

    if entry.catalog_digest != source.canonical_digest():
        return _report_from_entry(
            source.id,
            entry,
            CustodyState.DRIFTED,
            ("catalog record no longer matches the digest recorded at lock time",),
            lock_only=lock_only,
        )

    if lock_only:
        return _report_from_entry(
            source.id,
            entry,
            CustodyState.LOCKED_UNMATERIALIZED,
            ("--lock-only: checkout was not inspected",),
            lock_only=True,
        )

    target = checkout_dir(references_root, source.id)
    if not target.exists():
        return _report_from_entry(source.id, entry, CustodyState.LOCKED_UNMATERIALIZED, ())

    try:
        override_state, reasons = _inspect_checkout(
            target, entry.commit, entry.tree, entry.licenses
        )
    except AcquisitionError as exc:
        override_state, reasons = CustodyState.UNVERIFIABLE, [str(exc)]

    if override_state is not None:
        return _report_from_entry(source.id, entry, override_state, tuple(reasons))

    state = (
        CustodyState.MATERIALIZED_VERIFIED
        if entry.origin_verified
        else CustodyState.MATERIALIZED_WITH_VISIBLE_ASSUMPTION
    )
    return _report_from_entry(source.id, entry, state, ())
