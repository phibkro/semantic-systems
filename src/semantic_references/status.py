"""Network-free, mutation-free strict status.

Computes one of the six human-readable custody states from design spec 0004.
Every Git invocation runs through :mod:`semantic_references.gitutil`, whose
default-deny transport policy and allowlisted environment keep this command
away from transports, repository-configured programs, and the index.
``--lock-only`` verifies lock structure and the full catalog binding without
opening a checkout; the full mode additionally inspects
``.references/<id>/checkout`` through :mod:`semantic_references.verify`.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from semantic_references.catalog import CatalogSource
from semantic_references.lockfile import Lock, LockEntry
from semantic_references.materialize import checkout_dir
from semantic_references.verify import catalog_binding_reasons, verify_checkout


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

    drift = catalog_binding_reasons(source, entry)
    if drift:
        return _report_from_entry(
            source.id, entry, CustodyState.DRIFTED, drift, lock_only=lock_only
        )

    if lock_only:
        return _report_from_entry(
            source.id,
            entry,
            CustodyState.LOCKED_UNMATERIALIZED,
            ("--lock-only: checkout was not inspected",),
            lock_only=True,
        )

    return _checkout_report(source.id, entry, references_root)


def _checkout_report(source_id: str, entry: LockEntry, references_root: Path) -> StatusReport:
    target = checkout_dir(references_root, source_id)
    if not target.exists():
        return _report_from_entry(source_id, entry, CustodyState.LOCKED_UNMATERIALIZED, ())

    verification = verify_checkout(target, entry)
    if verification.head_mismatch is not None:
        return _report_from_entry(source_id, entry, CustodyState.DRIFTED, verification.reasons)
    if verification.reasons:
        return _report_from_entry(source_id, entry, CustodyState.UNVERIFIABLE, verification.reasons)

    state = (
        CustodyState.MATERIALIZED_VERIFIED
        if entry.origin_verified
        else CustodyState.MATERIALIZED_WITH_VISIBLE_ASSUMPTION
    )
    return _report_from_entry(source_id, entry, state, ())
