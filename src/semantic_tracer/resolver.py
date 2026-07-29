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


def _matching_suite(theory_id: str, suites: list[JsonObject]) -> JsonObject | None:
    for suite in suites:
        if suite.get("theory") == theory_id:
            return suite
    return None


def _evaluate_candidate(
    theory: Theory,
    theory_id: str,
    realization: Realization,
    suites: list[JsonObject],
    policy: JsonObject,
) -> Candidate:
    suite = _matching_suite(theory_id, suites)
    if suite is None:
        return Candidate(
            realization=realization,
            eligible=False,
            reason_codes=(REASON_MISSING_EVIDENCE,),
            evidence=None,
        )

    transition = resolve_transition(operation_binding(realization.document, "transition"))
    replay_fn = resolve_replay(operation_binding(realization.document, "replay"))
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
