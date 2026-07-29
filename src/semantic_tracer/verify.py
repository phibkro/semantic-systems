"""`verify-resolution`: production, independent checking, and gated execution.

This orchestrator is not the resolver or the checker; it is free to import
both plus the conformance runner, operations, domain, and execution, because
none of design spec 0003's forbidden-import restrictions apply to it. It
exists precisely to keep those restrictions on `resolver.py` and
`checker.py` enforceable: this module is where their outputs meet.

Invalid checking blocks execution: the reference scenario only runs after
both the independent checker and the canonical-model binding report valid.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from semantic_tracer.checker import CheckerReport, check_resolution
from semantic_tracer.evidence import produce_all_evidence
from semantic_tracer.execution import ExecutionResult, execute_scenario
from semantic_tracer.inventory_binding import BindingReport, check_inventory_model_binding
from semantic_tracer.jsonutil import require_key, require_str
from semantic_tracer.loader import load_inventory
from semantic_tracer.operations import resolve_transition
from semantic_tracer.packets import EvidenceResultPacket, diagnostic_to_dict
from semantic_tracer.realization import normalize_realization, operation_binding
from semantic_tracer.resolver import Resolution, build_resolution_claim, resolve
from semantic_tracer.theory import Theory, normalize_theory, required_obligation_id
from semantic_tracer.types import JsonValue


def _aggregate_assumptions(resolution: Resolution) -> tuple[str, ...]:
    if resolution.status != "selected":
        return ()
    seen: dict[str, None] = {}
    selected = next(
        candidate
        for candidate in resolution.candidates
        if candidate.realization.realization_id == resolution.selected_realization
    )
    for item in selected.realization.assumptions:
        seen.setdefault(item, None)
    if selected.evidence is not None:
        for item in selected.evidence.assumptions:
            seen.setdefault(item, None)
    return tuple(seen)


def _case_count(resolution: Resolution, realization_id: str) -> tuple[int, int]:
    for candidate in resolution.candidates:
        if (
            candidate.realization.realization_id == realization_id
            and candidate.evidence is not None
        ):
            return candidate.evidence.passed_cases, candidate.evidence.total_cases
    return 0, 0


@dataclass(frozen=True, slots=True)
class VerifyResult:
    theory: Theory
    theory_id: str
    policy_id: str
    resolution: Resolution
    claim: dict[str, Any]
    checker_report: CheckerReport
    binding_report: BindingReport | None
    execution: ExecutionResult | None

    @property
    def valid(self) -> bool:
        return self.checker_report.valid and (
            self.binding_report is None or self.binding_report.valid
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "theory": {"id": self.theory_id, "identity": self.theory.identity},
            "resolution": self.resolution.to_dict(),
            "claim": self.claim,
            "checker": self.checker_report.to_dict(),
            "model_binding": self.binding_report.to_dict()
            if self.binding_report is not None
            else None,
            "valid": self.valid,
            "execution": self.execution.to_dict() if self.execution is not None else None,
        }


def verify_resolution(
    root: Path, policy: str = "development", model_root: Path | None = None
) -> VerifyResult:
    fixture = load_inventory(root, policy)
    theory_id = require_str(require_key(fixture.theory, "id", "theory"), "theory.id")
    theory = normalize_theory(fixture.theory)
    policy_id = require_str(require_key(fixture.policy, "id", "policy"), "policy.id")

    realizations = [
        normalize_realization(document, theory, theory_id) for document in fixture.realizations
    ]
    required_obligation = required_obligation_id(theory)
    evidence_outcomes = produce_all_evidence(
        theory, theory_id, required_obligation, realizations, fixture.evidence_suites
    )
    resolution = resolve(theory, theory_id, realizations, evidence_outcomes, fixture.policy)
    selected_assumptions = _aggregate_assumptions(resolution)
    claim = build_resolution_claim(
        theory, theory_id, fixture.policy, resolution, selected_assumptions
    )

    realization_identity_by_id = {
        realization.realization_id: realization.identity for realization in realizations
    }
    producer_outcomes: list[JsonValue] = [
        outcome.to_dict()
        if isinstance(outcome, EvidenceResultPacket)
        else diagnostic_to_dict(
            outcome, theory.identity, realization_identity_by_id[realization_id]
        )
        for realization_id, outcome in evidence_outcomes.items()
    ]
    checker_report = check_resolution(
        theory_document=fixture.theory,
        realization_documents=fixture.realizations,
        policy_document=fixture.policy,
        producer_outcomes=producer_outcomes,
        claim=claim,
    )

    binding_report: BindingReport | None = None
    if checker_report.valid and model_root is not None:
        pure_passed, pure_total = _case_count(resolution, "realization.inventory.pure")
        broken_passed, broken_total = _case_count(resolution, "realization.inventory.broken")
        pure_candidate = next(
            (
                candidate
                for candidate in resolution.candidates
                if candidate.realization.realization_id == "realization.inventory.pure"
            ),
            None,
        )
        broken_candidate = next(
            (
                candidate
                for candidate in resolution.candidates
                if candidate.realization.realization_id == "realization.inventory.broken"
            ),
            None,
        )
        if pure_candidate is not None and broken_candidate is not None:
            binding_report = check_inventory_model_binding(
                model_root,
                policy_id=policy_id,
                theory_identity=theory.identity,
                pure_realization_identity=pure_candidate.realization.identity,
                broken_realization_identity=broken_candidate.realization.identity,
                pure_case_count=(pure_passed, pure_total),
                broken_case_count=(broken_passed, broken_total),
                selected_realization_id=resolution.selected_realization,
            )

    valid = checker_report.valid and (binding_report is None or binding_report.valid)

    execution: ExecutionResult | None = None
    if valid and resolution.status == "selected":
        selected = next(
            candidate
            for candidate in resolution.candidates
            if candidate.realization.realization_id == resolution.selected_realization
        )
        transition = resolve_transition(
            operation_binding(selected.realization.document, "transition")
        )
        execution = execute_scenario(fixture.scenario, transition)

    return VerifyResult(
        theory=theory,
        theory_id=theory_id,
        policy_id=policy_id,
        resolution=resolution,
        claim=claim,
        checker_report=checker_report,
        binding_report=binding_report,
        execution=execution,
    )
