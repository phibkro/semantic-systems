"""Resolve inventory realization candidates under a named evidence policy.

Zero eligible candidates rejects; more than one eligible candidate rejects as
ambiguous rather than selecting silently by lexical or load order (design
spec 0001).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from semantic_tracer.evidence import EvidenceResult, run_conformance
from semantic_tracer.explanation import ExplanationNode
from semantic_tracer.jsonutil import DocumentError, require_key, require_object, require_str
from semantic_tracer.operations import resolve_replay, resolve_transition
from semantic_tracer.realization import Realization, operation_binding
from semantic_tracer.theory import Theory
from semantic_tracer.types import JsonObject

REASON_MISSING_EVIDENCE = "missing_evidence"
REASON_CATEGORY_NOT_ACCEPTED = "evidence_category_not_accepted"
REASON_ASSUMPTIONS_NOT_ALLOWED = "assumptions_not_allowed"
REASON_CONFORMANCE_FAILED = "conformance_failed"
REASON_OBLIGATION_NOT_GOVERNED = "obligation_not_governed"
REASON_AMBIGUOUS = "ambiguous_candidates"
REASON_NO_ELIGIBLE = "no_eligible_candidates"
REASON_THEORY_MISMATCH = "theory_mismatch"
REASON_EVIDENCE_AMBIGUOUS = "ambiguous_evidence"
REASON_EVIDENCE_OBLIGATION_MISMATCH = "evidence_obligation_mismatch"
REASON_OBLIGATION_SET_UNSUPPORTED = "required_obligation_set_unsupported"
REASON_EVIDENCE_STALE = "stale_evidence_recipe"
REASON_OPERATION_UNBOUND = "unbound_operation"

CHANGE_OPTIONS = {
    REASON_MISSING_EVIDENCE: "Add one matching conformance suite for the required obligation.",
    REASON_CATEGORY_NOT_ACCEPTED: "Supply evidence in an accepted category or change the policy.",
    REASON_ASSUMPTIONS_NOT_ALLOWED: "Remove the assumptions or use a policy that permits them.",
    REASON_CONFORMANCE_FAILED: "Fix the realization or explicitly revise the frozen contract.",
    REASON_OBLIGATION_NOT_GOVERNED: "Add an explicit policy rule for the theory obligation.",
    REASON_THEORY_MISMATCH: "Target the exact authored theory identifier.",
    REASON_EVIDENCE_AMBIGUOUS: "Retain exactly one suite for the theory and obligation.",
    REASON_EVIDENCE_OBLIGATION_MISMATCH: "Bind the suite to the obligation declared by the theory.",
    REASON_OBLIGATION_SET_UNSUPPORTED: (
        "Use the single-obligation v0 contract or extend the resolver."
    ),
    REASON_EVIDENCE_STALE: "Re-author the suite against the exact normalized theory identity.",
    REASON_OPERATION_UNBOUND: "Bind every required operation to an available execution adapter.",
}


@dataclass(frozen=True, slots=True)
class Candidate:
    realization: Realization
    eligible: bool
    reason_codes: tuple[str, ...]
    evidence: EvidenceResult | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "realization_id": self.realization.realization_id,
            "realization_identity": self.realization.identity,
            "targets_theory": self.realization.targets_theory,
            "eligible": self.eligible,
            "reason_codes": list(self.reason_codes),
            "evidence": self.evidence.to_dict() if self.evidence is not None else None,
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


def _required_obligation(theory: Theory) -> str | None:
    raw = theory.payload.get("obligations")
    if not isinstance(raw, list) or len(raw) != 1 or not isinstance(raw[0], dict):
        return None
    value = raw[0].get("id")
    return value if isinstance(value, str) else None


def _theory_suites(theory_id: str, suites: list[JsonObject]) -> list[JsonObject]:
    return [suite for suite in suites if suite.get("theory") == theory_id]


def _evaluate_candidate(  # noqa: PLR0911
    theory: Theory,
    theory_id: str,
    realization: Realization,
    suites: list[JsonObject],
    policy: JsonObject,
) -> Candidate:
    if not realization.targets_theory:
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(REASON_THEORY_MISMATCH,),
            evidence=None,
        )

    required_obligation = _required_obligation(theory)
    if required_obligation is None:
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(REASON_OBLIGATION_SET_UNSUPPORTED,),
            evidence=None,
        )

    matching = _theory_suites(theory_id, suites)
    if not matching:
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(REASON_MISSING_EVIDENCE,),
            evidence=None,
        )
    if len(matching) > 1:
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(REASON_EVIDENCE_AMBIGUOUS,),
            evidence=None,
        )

    suite = matching[0]
    if suite.get("theory_identity") != theory.identity:
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(REASON_EVIDENCE_STALE,),
            evidence=None,
        )
    if suite.get("obligation") != required_obligation:
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(REASON_EVIDENCE_OBLIGATION_MISMATCH,),
            evidence=None,
        )

    try:
        transition = resolve_transition(operation_binding(realization.document, "transition"))
        replay_fn = resolve_replay(operation_binding(realization.document, "replay"))
    except DocumentError:
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(REASON_OPERATION_UNBOUND,),
            evidence=None,
        )
    evidence = run_conformance(theory, realization, suite, transition, replay_fn)

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
    suites: list[JsonObject],
    policy: JsonObject,
) -> Resolution:
    ambiguity = require_str(require_key(policy, "ambiguity", "policy"), "policy.ambiguity")
    if ambiguity != "reject":
        raise DocumentError(f"unsupported ambiguity policy {ambiguity!r}")

    candidates = tuple(
        _evaluate_candidate(theory, theory_id, realization, suites, policy)
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
