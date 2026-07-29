"""Independent resolution-claim checker (design spec 0003).

Independently constructs the resolution value a `resolution_claim_v1`
*should* contain from the authored theory/realization/policy documents and
standalone evidence packets, then reports every field where the claim
disagrees. Never trusts a stored boolean, count, verdict, or status.

`_diff` is one data-driven recursive comparator (dicts by key, `candidates`
matched by realization ID since order is presentation-only, evidence by its
full canonical `to_dict()`) instead of one bespoke branch per field, so a
mutated identity, producer, assumption, case, or aggregate all surface the
same way. Eligibility policy is re-derived inline as its own small rule
table -- not a call into a function shared with the resolver, which would
let one bug validate itself on both sides. Only reason-code constants
(`reasons.py`) are shared.

One fact is not independently re-derivable: *why* a realization has no
evidence (unbound operation vs. stale recipe vs. missing suite) is a
producer-side detail this checker cannot recompute without importing the
forbidden producer/operation-binding logic. For that case, the checker
still does not trust the claim: it takes the diagnostic from a standalone,
subject-bound producer-diagnostic packet (`producer_outcomes`, alongside
evidence-result packets) that is independent of the claim being checked,
and compares the claim's embedded copy against that packet like everything
else. A diagnostic's *truth* remains an unverified producer observation
either way, but its *bytes* are never sourced from the claim.

Must not import the resolver, demo orchestration, conformance runner,
operation registry, domain semantics, or execution module. Performs no
execution, plugin loading, network access, or filesystem mutation. Sharing
canonical JSON and identity functions (`canonical.py`, `theory.py`,
`realization.py`) with the producer is a visible correlated-TCB assumption.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

from semantic_tracer.canonical import content_identity
from semantic_tracer.jsonutil import DocumentError, require_key, require_str
from semantic_tracer.packets import (
    DIAGNOSTIC_ARTIFACT_KIND,
    EVIDENCE_RESULT_ARTIFACT_KIND,
    EvidenceResultPacket,
    ProducerDiagnostic,
    evidence_result_from_dict,
    producer_diagnostic_from_dict,
)
from semantic_tracer.realization import Realization, normalize_realization
from semantic_tracer.reasons import (
    REASON_ASSUMPTIONS_NOT_ALLOWED,
    REASON_CATEGORY_NOT_ACCEPTED,
    REASON_CONFORMANCE_FAILED,
    REASON_MISSING_EVIDENCE,
    REASON_OBLIGATION_NOT_GOVERNED,
    REASON_OBLIGATION_SET_UNSUPPORTED,
    REASON_THEORY_MISMATCH,
)
from semantic_tracer.theory import Theory, normalize_theory, required_obligation_id
from semantic_tracer.types import JsonObject, JsonValue

V_MALFORMED_CLAIM = "malformed_claim"
V_FIELD_MISMATCH = "claim_field_mismatch"
V_CANDIDATE_MISSING = "candidate_missing"
V_CANDIDATE_DUPLICATE = "candidate_duplicate"
V_CANDIDATE_UNKNOWN = "candidate_unknown"
V_PRODUCER_OUTCOME_MALFORMED = "producer_outcome_malformed"
V_PRODUCER_OUTCOME_MULTIPLE = "multiple_producer_outcomes_for_subject"


@dataclass(frozen=True, slots=True)
class Violation:
    code: str
    subject: str
    detail: JsonObject

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "subject": self.subject, "detail": self.detail}


@dataclass(frozen=True, slots=True)
class CheckerReport:
    valid: bool
    violations: tuple[Violation, ...]
    recomputed_status: str | None
    recomputed_selected: JsonObject | None
    recomputed_selected_assumptions: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "violations": [violation.to_dict() for violation in self.violations],
            "recomputed_status": self.recomputed_status,
            "recomputed_selected": self.recomputed_selected,
            "recomputed_selected_assumptions": list(self.recomputed_selected_assumptions),
        }


def _malformed(detail: str) -> CheckerReport:
    return CheckerReport(
        valid=False,
        violations=(Violation(V_MALFORMED_CLAIM, "claim", {"error": detail}),),
        recomputed_status=None,
        recomputed_selected=None,
        recomputed_selected_assumptions=(),
    )


def _diff(
    subject: str, claimed: JsonValue, recomputed: JsonValue, violations: list[Violation]
) -> None:
    """Report every field where `claimed` disagrees with `recomputed`."""
    if isinstance(claimed, dict) and isinstance(recomputed, dict):
        for key in sorted(set(claimed) | set(recomputed)):
            if key == "candidates":
                continue  # matched by realization ID, not diffed positionally
            _diff(f"{subject}.{key}", claimed.get(key), recomputed.get(key), violations)
        return
    if isinstance(claimed, list) and isinstance(recomputed, list):
        if len(claimed) != len(recomputed):
            violations.append(
                Violation(
                    V_FIELD_MISMATCH,
                    subject,
                    {"claimed_len": len(claimed), "recomputed_len": len(recomputed)},
                )
            )
        for index, (claimed_item, recomputed_item) in enumerate(
            zip(claimed, recomputed, strict=False)
        ):
            _diff(f"{subject}[{index}]", claimed_item, recomputed_item, violations)
        return
    if claimed != recomputed:
        violations.append(
            Violation(V_FIELD_MISMATCH, subject, {"claimed": claimed, "recomputed": recomputed})
        )


def _evidence_reason_codes(
    evidence: EvidenceResultPacket, realization_assumptions: list[str], policy_document: JsonObject
) -> list[str]:
    requirements_raw = policy_document.get("requirements")
    requirement = (
        requirements_raw.get(evidence.obligation) if isinstance(requirements_raw, dict) else None
    )
    governed = isinstance(requirement, dict)
    accepted = governed and evidence.category in requirement.get("accepted_categories", [])  # type: ignore[union-attr]
    allows_assumptions = governed and requirement.get("allow_assumptions") is True  # type: ignore[union-attr]
    has_assumptions = bool(evidence.assumptions) or bool(realization_assumptions)
    rule_table = (
        (not governed, REASON_OBLIGATION_NOT_GOVERNED),
        (governed and not accepted, REASON_CATEGORY_NOT_ACCEPTED),
        (governed and has_assumptions and not allows_assumptions, REASON_ASSUMPTIONS_NOT_ALLOWED),
        (not evidence.passed, REASON_CONFORMANCE_FAILED),
    )
    return [code for failed, code in rule_table if failed]


_EvidenceIndex = dict[tuple[str, str, str], list[EvidenceResultPacket]]
_DiagnosticIndex = dict[tuple[str, str], list[ProducerDiagnostic]]


@dataclass(frozen=True, slots=True)
class _Context:
    """Everything independently derived before per-candidate comparison."""

    theory: Theory
    required_obligation: str | None
    policy_document: JsonObject
    evidence_by_subject: _EvidenceIndex
    diagnostic_by_subject: _DiagnosticIndex


def _expected_candidate(realization: Realization, ctx: _Context) -> tuple[JsonObject, bool]:
    """The candidate value the claim should contain, and whether it is eligible."""

    def built(
        reasons: list[str],
        evidence: EvidenceResultPacket | None = None,
        diagnostic: JsonObject | None = None,
    ) -> tuple[JsonObject, bool]:
        eligible = not reasons
        payload = cast(
            JsonObject,
            {
                "realization_id": realization.realization_id,
                "realization_identity": realization.identity,
                "targets_theory": realization.targets_theory,
                "realization_assumptions": list(realization.assumptions),
                "evidence": evidence.to_dict() if evidence is not None else None,
                "producer_diagnostic": diagnostic,
                "eligible": eligible,
                "reason_codes": reasons,
            },
        )
        return payload, eligible

    if not realization.targets_theory:
        return built([REASON_THEORY_MISMATCH])
    if ctx.required_obligation is None:
        return built([REASON_OBLIGATION_SET_UNSUPPORTED])

    subject = (ctx.theory.identity, realization.identity, ctx.required_obligation)
    matches = ctx.evidence_by_subject.get(subject, [])
    if len(matches) == 1:
        evidence = matches[0]
        reasons = _evidence_reason_codes(
            evidence, list(realization.assumptions), ctx.policy_document
        )
        return built(reasons, evidence)

    # Why production produced no single valid evidence result (unbound
    # operation, stale recipe, missing/ambiguous suite, ...) cannot be
    # independently recomputed without the forbidden producer/operation
    # imports. Source it from the standalone producer-diagnostic packet
    # instead of the claim under check.
    diagnostics = ctx.diagnostic_by_subject.get((ctx.theory.identity, realization.identity), [])
    if len(diagnostics) == 1:
        diagnostic = diagnostics[0]
        return built([diagnostic.reason_code], diagnostic=diagnostic.to_dict())
    return built([REASON_MISSING_EVIDENCE])


def _index_realizations(
    documents: list[JsonObject], theory: Theory, theory_id: str, violations: list[Violation]
) -> dict[str, Realization]:
    by_id: dict[str, Realization] = {}
    for realization in (normalize_realization(d, theory, theory_id) for d in documents):
        if realization.realization_id in by_id:
            source: JsonObject = {"source": "authored"}
            violations.append(Violation(V_CANDIDATE_DUPLICATE, realization.realization_id, source))
        else:
            by_id[realization.realization_id] = realization
    return by_id


def _index_producer_outcomes(
    producer_outcomes: list[JsonValue], violations: list[Violation]
) -> tuple[_EvidenceIndex, _DiagnosticIndex]:
    evidence_by_subject: _EvidenceIndex = {}
    diagnostic_by_subject: _DiagnosticIndex = {}
    for index, document in enumerate(producer_outcomes):
        subject = f"producer_outcomes[{index}]"
        if not isinstance(document, dict):
            violations.append(
                Violation(V_PRODUCER_OUTCOME_MALFORMED, subject, {"error": "not an object"})
            )
            continue
        kind = document.get("artifact_kind")
        try:
            if kind == EVIDENCE_RESULT_ARTIFACT_KIND:
                packet = evidence_result_from_dict(document, subject)
                key = (packet.theory_identity, packet.realization_identity, packet.obligation)
                evidence_by_subject.setdefault(key, []).append(packet)
            elif kind == DIAGNOSTIC_ARTIFACT_KIND:
                theory_id, realization_id, diagnostic = producer_diagnostic_from_dict(
                    document, subject
                )
                diagnostic_by_subject.setdefault((theory_id, realization_id), []).append(diagnostic)
            else:
                raise DocumentError(f"unknown artifact_kind {kind!r}")
        except DocumentError as error:
            violations.append(
                Violation(V_PRODUCER_OUTCOME_MALFORMED, subject, {"error": str(error)})
            )
    violations += [
        Violation(V_PRODUCER_OUTCOME_MULTIPLE, key[1], {"count": len(items)})
        for index in (evidence_by_subject, diagnostic_by_subject)
        for key, items in index.items()
        if len(items) > 1
    ]
    return evidence_by_subject, diagnostic_by_subject


def _index_claimed_candidates(
    claim_candidates: list[JsonValue], violations: list[Violation]
) -> dict[str, JsonObject]:
    claimed_by_id: dict[str, JsonObject] = {}
    for index, raw in enumerate(claim_candidates):
        realization_id = raw.get("realization_id") if isinstance(raw, dict) else None
        valid = (
            isinstance(raw, dict)
            and isinstance(realization_id, str)
            and realization_id not in claimed_by_id
        )
        if valid:
            claimed_by_id[realization_id] = raw  # type: ignore[index]
        else:
            violations.append(
                Violation(V_CANDIDATE_DUPLICATE, str(realization_id), {"index": index})
            )
    return claimed_by_id


def _derive_selection(
    eligible_ids: list[str], by_id: dict[str, Realization], ctx: _Context
) -> tuple[str, JsonObject | None, tuple[str, ...]]:
    if len(eligible_ids) != 1:
        return "rejected", None, ()
    picked = by_id[eligible_ids[0]]
    seen: dict[str, None] = dict.fromkeys(picked.assumptions)
    subject = (ctx.theory.identity, picked.identity, ctx.required_obligation or "")
    matches = ctx.evidence_by_subject.get(subject, [])
    if len(matches) == 1:
        seen.update(dict.fromkeys(matches[0].assumptions))
    return "selected", {"id": picked.realization_id, "identity": picked.identity}, tuple(seen)


def check_resolution(
    theory_document: JsonObject,
    realization_documents: list[JsonObject],
    policy_document: JsonObject,
    producer_outcomes: list[JsonValue],
    claim: JsonValue,
) -> CheckerReport:
    try:
        theory_id = require_str(require_key(theory_document, "id", "theory"), "theory.id")
        theory = normalize_theory(theory_document)
        policy_id = require_str(require_key(policy_document, "id", "policy"), "policy.id")
    except DocumentError as error:
        return _malformed(str(error))
    if not isinstance(claim, dict):
        return _malformed("claim must be an object")
    claim_candidates = claim.get("candidates")
    if not isinstance(claim_candidates, list):
        return _malformed("claim.candidates must be a list")

    violations: list[Violation] = []
    by_id = _index_realizations(realization_documents, theory, theory_id, violations)
    evidence_by_subject, diagnostic_by_subject = _index_producer_outcomes(
        producer_outcomes, violations
    )
    claimed_by_id = _index_claimed_candidates(claim_candidates, violations)
    ctx = _Context(
        theory,
        required_obligation_id(theory),
        policy_document,
        evidence_by_subject,
        diagnostic_by_subject,
    )

    eligible_ids: list[str] = []
    for realization_id, raw in claimed_by_id.items():
        realization = by_id.get(realization_id)
        if realization is None:
            violations.append(Violation(V_CANDIDATE_UNKNOWN, realization_id, {}))
            continue
        expected, eligible = _expected_candidate(realization, ctx)
        _diff(f"candidates[{realization_id}]", raw, expected, violations)
        if eligible:
            eligible_ids.append(realization_id)
    violations += [
        Violation(V_CANDIDATE_MISSING, realization_id, {})
        for realization_id in by_id
        if realization_id not in claimed_by_id
    ]

    status, selected, selected_assumptions = _derive_selection(eligible_ids, by_id, ctx)
    expected_claim: JsonObject = {
        "theory": {"id": theory_id, "identity": theory.identity},
        "required_obligation": ctx.required_obligation,
        "policy": {"id": policy_id, "content_identity": content_identity(policy_document)},
        "status": status,
        "selected": selected,
        "selected_assumptions": list(selected_assumptions),
    }
    _diff("claim", {key: claim.get(key) for key in expected_claim}, expected_claim, violations)

    return CheckerReport(not violations, tuple(violations), status, selected, selected_assumptions)
