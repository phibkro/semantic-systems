"""Resolve inventory realization candidates under a named evidence policy.

Consumes precomputed evidence packets (design spec 0003); it never executes
a realization, an operation, or a conformance recipe itself. Zero eligible
candidates rejects; more than one eligible candidate rejects as ambiguous
rather than selecting silently by lexical or load order (design spec 0001).

Must not import the conformance runner (`evidence.py`), the operation
registry (`operations.py`), domain semantics (`domain.py`), or the execution
module (`execution.py`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from semantic_tracer.canonical import content_identity
from semantic_tracer.explanation import ExplanationNode
from semantic_tracer.jsonutil import DocumentError, require_key, require_object, require_str
from semantic_tracer.packets import EvidenceResultPacket, ProducerDiagnostic, ProducerOutcome
from semantic_tracer.realization import Realization
from semantic_tracer.reasons import (
    REASON_AMBIGUOUS,
    REASON_ASSUMPTIONS_NOT_ALLOWED,
    REASON_CATEGORY_NOT_ACCEPTED,
    REASON_CONFORMANCE_FAILED,
    REASON_MISSING_EVIDENCE,
    REASON_NO_ELIGIBLE,
    REASON_OBLIGATION_NOT_GOVERNED,
    REASON_OBLIGATION_SET_UNSUPPORTED,
    REASON_THEORY_MISMATCH,
)
from semantic_tracer.theory import Theory, required_obligation_id
from semantic_tracer.types import JsonObject

CLAIM_ARTIFACT_KIND = "resolution_claim"
CLAIM_SCHEMA_VERSION = 1

CHANGE_OPTIONS = {
    REASON_MISSING_EVIDENCE: "Add one matching conformance suite for the required obligation.",
    REASON_CATEGORY_NOT_ACCEPTED: "Supply evidence in an accepted category or change the policy.",
    REASON_ASSUMPTIONS_NOT_ALLOWED: "Remove the assumptions or use a policy that permits them.",
    REASON_CONFORMANCE_FAILED: "Fix the realization or explicitly revise the frozen contract.",
    REASON_OBLIGATION_NOT_GOVERNED: "Add an explicit policy rule for the theory obligation.",
    REASON_THEORY_MISMATCH: "Target the exact authored theory identifier.",
    "ambiguous_evidence": "Retain exactly one evidence result for the theory and obligation.",
    "evidence_obligation_mismatch": "Bind the suite to the obligation declared by the theory.",
    REASON_OBLIGATION_SET_UNSUPPORTED: (
        "Use the single-obligation v0 contract or extend the resolver."
    ),
    "stale_evidence_recipe": "Re-author the suite against the exact normalized theory identity.",
    "unbound_operation": "Bind every required operation to an available execution adapter.",
}


@dataclass(frozen=True, slots=True)
class Candidate:
    realization: Realization
    eligible: bool
    reason_codes: tuple[str, ...]
    evidence: EvidenceResultPacket | None
    diagnostic: ProducerDiagnostic | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "realization_id": self.realization.realization_id,
            "realization_identity": self.realization.identity,
            "targets_theory": self.realization.targets_theory,
            "eligible": self.eligible,
            "reason_codes": list(self.reason_codes),
            "evidence": self.evidence.to_dict() if self.evidence is not None else None,
            "producer_diagnostic": self.diagnostic.to_dict()
            if self.diagnostic is not None
            else None,
            "counterexamples": (
                list(self.evidence.counterexamples) if self.evidence is not None else []
            ),
        }

    def explanation(self) -> ExplanationNode:
        children: tuple[ExplanationNode, ...] = ()
        if self.evidence is not None:
            evidence = self.evidence
            evidence_node = ExplanationNode(
                rule="evaluate_conformance_evidence",
                outcome="passed" if evidence.passed else "failed",
                subject=evidence.realization_identity,
                details={
                    "category": evidence.category,
                    "passed_cases": evidence.passed_cases,
                    "total_cases": evidence.total_cases,
                    "assumptions": list(evidence.assumptions),
                    "counterexamples": list(evidence.counterexamples),
                },
            )
            children = (evidence_node,)
        elif self.diagnostic is not None:
            children = (
                ExplanationNode(
                    rule="evaluate_conformance_evidence",
                    outcome="no_result",
                    subject=self.realization.identity,
                    details={
                        "reason_code": self.diagnostic.reason_code,
                        "detail": self.diagnostic.detail,
                    },
                ),
            )
        return ExplanationNode(
            rule="evaluate_realization_candidate",
            outcome="eligible" if self.eligible else "rejected",
            subject=self.realization.realization_id,
            details={
                "realization_identity": self.realization.identity,
                "reason_codes": list(self.reason_codes),
                "assumptions": list(self.realization.assumptions),
                "change_options": [
                    CHANGE_OPTIONS[reason]
                    for reason in self.reason_codes
                    if reason in CHANGE_OPTIONS
                ],
            },
            children=children,
        )


@dataclass(frozen=True, slots=True)
class Resolution:
    status: str
    selected_realization: str | None
    reason_codes: tuple[str, ...]
    candidates: tuple[Candidate, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "selected_realization": self.selected_realization,
            "reason_codes": list(self.reason_codes),
            "candidates": [candidate.to_dict() for candidate in self.candidates],
        }


def _evaluate_candidate(
    theory: Theory,
    realization: Realization,
    required_obligation: str | None,
    outcome: ProducerOutcome | None,
    policy: JsonObject,
) -> Candidate:
    if not realization.targets_theory:
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(REASON_THEORY_MISMATCH,),
            evidence=None,
        )

    if required_obligation is None:
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(REASON_OBLIGATION_SET_UNSUPPORTED,),
            evidence=None,
        )

    if not isinstance(outcome, EvidenceResultPacket):
        diagnostic = (
            outcome
            if isinstance(outcome, ProducerDiagnostic)
            else ProducerDiagnostic(REASON_MISSING_EVIDENCE)
        )
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(diagnostic.reason_code,),
            evidence=None,
            diagnostic=diagnostic,
        )

    evidence = outcome
    reasons: list[str] = []
    requirements = require_object(
        require_key(policy, "requirements", "policy"), "policy.requirements"
    )
    requirement = requirements.get(evidence.obligation)
    if requirement is None:
        reasons.append(REASON_OBLIGATION_NOT_GOVERNED)
    else:
        requirement_object = require_object(
            requirement, f"policy.requirements.{evidence.obligation}"
        )
        accepted_categories = requirement_object.get("accepted_categories", [])
        category_accepted = (
            isinstance(accepted_categories, list) and evidence.category in accepted_categories
        )
        if not category_accepted:
            reasons.append(REASON_CATEGORY_NOT_ACCEPTED)
        allow_assumptions = requirement_object.get("allow_assumptions") is True
        assumptions_present = bool(evidence.assumptions) or bool(realization.assumptions)
        if assumptions_present and not allow_assumptions:
            reasons.append(REASON_ASSUMPTIONS_NOT_ALLOWED)

    if not evidence.passed:
        reasons.append(REASON_CONFORMANCE_FAILED)

    return Candidate(
        realization=realization,
        eligible=not reasons,
        reason_codes=tuple(reasons),
        evidence=evidence,
    )


def resolve(
    theory: Theory,
    theory_id: str,
    realizations: list[Realization],
    evidence_outcomes: dict[str, ProducerOutcome],
    policy: JsonObject,
) -> Resolution:
    ambiguity = require_str(require_key(policy, "ambiguity", "policy"), "policy.ambiguity")
    if ambiguity != "reject":
        raise DocumentError(f"unsupported ambiguity policy {ambiguity!r}")

    required_obligation = required_obligation_id(theory)
    candidates = tuple(
        _evaluate_candidate(
            theory,
            realization,
            required_obligation,
            evidence_outcomes.get(realization.realization_id),
            policy,
        )
        for realization in realizations
    )
    eligible = [candidate for candidate in candidates if candidate.eligible]

    if len(eligible) == 1:
        selected = eligible[0]
        return Resolution(
            status="selected",
            selected_realization=selected.realization.realization_id,
            reason_codes=(),
            candidates=candidates,
        )
    if len(eligible) == 0:
        return Resolution(
            status="rejected",
            selected_realization=None,
            reason_codes=(REASON_NO_ELIGIBLE,),
            candidates=candidates,
        )
    return Resolution(
        status="rejected",
        selected_realization=None,
        reason_codes=(REASON_AMBIGUOUS,),
        candidates=candidates,
    )


def build_resolution_claim(
    theory: Theory,
    theory_id: str,
    policy: JsonObject,
    resolution: Resolution,
    selected_assumptions: tuple[str, ...],
) -> JsonObject:
    """Serialize `resolution` as a `resolution_claim_v1` document."""
    policy_id = require_str(require_key(policy, "id", "policy"), "policy.id")

    selected: JsonObject | None = None
    if resolution.status == "selected":
        selected_candidate = next(
            candidate
            for candidate in resolution.candidates
            if candidate.realization.realization_id == resolution.selected_realization
        )
        selected = {
            "id": selected_candidate.realization.realization_id,
            "identity": selected_candidate.realization.identity,
        }

    return {
        "artifact_kind": CLAIM_ARTIFACT_KIND,
        "schema_version": CLAIM_SCHEMA_VERSION,
        "theory": {"id": theory_id, "identity": theory.identity},
        "required_obligation": required_obligation_id(theory),
        "policy": {"id": policy_id, "content_identity": content_identity(policy)},
        "candidates": [
            {
                "realization_id": candidate.realization.realization_id,
                "realization_identity": candidate.realization.identity,
                "targets_theory": candidate.realization.targets_theory,
                "realization_assumptions": list(candidate.realization.assumptions),
                "evidence": candidate.evidence.to_dict()
                if candidate.evidence is not None
                else None,
                "producer_diagnostic": (
                    candidate.diagnostic.to_dict() if candidate.diagnostic is not None else None
                ),
                "eligible": candidate.eligible,
                "reason_codes": list(candidate.reason_codes),
            }
            for candidate in resolution.candidates
        ],
        "status": resolution.status,
        "selected": selected,
        "selected_assumptions": list(selected_assumptions),
    }
