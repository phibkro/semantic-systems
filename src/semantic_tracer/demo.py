"""Orchestrate normalization, resolution, execution, and explanation."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from semantic_tracer.execution import ExecutionResult, execute_scenario
from semantic_tracer.explanation import ExplanationNode
from semantic_tracer.jsonutil import require_key, require_str
from semantic_tracer.loader import load_inventory
from semantic_tracer.operations import resolve_transition
from semantic_tracer.realization import normalize_realization, operation_binding
from semantic_tracer.resolver import Resolution, resolve
from semantic_tracer.theory import Theory, normalize_theory


@dataclass(frozen=True, slots=True)
class DemoResult:
    theory: Theory
    theory_id: str
    resolution: Resolution
    execution: ExecutionResult | None
    assumptions: tuple[str, ...]
    explanation: ExplanationNode

    def to_dict(self) -> dict[str, Any]:
        return {
            "theory": {"id": self.theory_id, "identity": self.theory.identity},
            "resolution": self.resolution.to_dict(),
            "execution": self.execution.to_dict() if self.execution is not None else None,
            "assumptions": list(self.assumptions),
            "explanation": self.explanation.to_dict(),
        }


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


def run_demo(root: Path, policy: str = "development") -> DemoResult:
    fixture = load_inventory(root, policy)
    theory_id = require_str(require_key(fixture.theory, "id", "theory"), "theory.id")
    theory = normalize_theory(fixture.theory)

    realizations = [
        normalize_realization(document, theory, theory_id) for document in fixture.realizations
    ]
    resolution = resolve(theory, theory_id, realizations, fixture.evidence_suites, fixture.policy)

    execution: ExecutionResult | None = None
    if resolution.status == "selected":
        selected = next(
            candidate
            for candidate in resolution.candidates
            if candidate.realization.realization_id == resolution.selected_realization
        )
        transition = resolve_transition(
            operation_binding(selected.realization.document, "transition")
        )
        execution = execute_scenario(fixture.scenario, transition)

    assumptions = _aggregate_assumptions(resolution)

    explanation = ExplanationNode(
        rule="resolve_inventory_deployment",
        outcome=resolution.status,
        subject=theory.identity,
        details={
            "policy": require_str(require_key(fixture.policy, "id", "policy"), "policy.id"),
            "selected_realization": resolution.selected_realization,
            "reason_codes": list(resolution.reason_codes),
        },
        children=tuple(candidate.explanation() for candidate in resolution.candidates),
    )

    return DemoResult(
        theory=theory,
        theory_id=theory_id,
        resolution=resolution,
        execution=execution,
        assumptions=assumptions,
        explanation=explanation,
    )
