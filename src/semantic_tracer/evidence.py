"""Conformance evidence: execute a suite recipe against one exact realization.

A conformance-suite recipe is not itself evidence (design spec 0001). Running
it here against the theory and realization identities in scope produces an
evidence result bound to those exact identities, so staleness cannot occur:
the subject is always the identity just computed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from semantic_tracer.domain import ReplayFn, TransitionFn, parse_state, run_steps
from semantic_tracer.jsonutil import (
    require_key,
    require_object,
    require_object_list,
    require_str,
)
from semantic_tracer.realization import Realization
from semantic_tracer.theory import Theory
from semantic_tracer.types import JsonObject, JsonValue


@dataclass(frozen=True, slots=True)
class CaseResult:
    case_id: str
    passed: bool
    detail: JsonObject | None

    def to_dict(self) -> dict[str, Any]:
        return {"case_id": self.case_id, "passed": self.passed, "detail": self.detail}


@dataclass(frozen=True, slots=True)
class EvidenceResult:
    category: str
    obligation: str
    producer: JsonObject
    theory_identity: str
    realization_identity: str
    assumptions: tuple[str, ...]
    case_results: tuple[CaseResult, ...]

    @property
    def total_cases(self) -> int:
        return len(self.case_results)

    @property
    def passed_cases(self) -> int:
        return sum(1 for case in self.case_results if case.passed)

    @property
    def passed(self) -> bool:
        return self.total_cases > 0 and self.passed_cases == self.total_cases

    @property
    def counterexamples(self) -> tuple[dict[str, Any], ...]:
        return tuple(case.to_dict() for case in self.case_results if not case.passed)

    def to_dict(self) -> dict[str, Any]:
        return {
            "category": self.category,
            "obligation": self.obligation,
            "producer": dict(self.producer),
            "theory_identity": self.theory_identity,
            "realization_identity": self.realization_identity,
            "assumptions": list(self.assumptions),
            "passed": self.passed,
            "total_cases": self.total_cases,
            "passed_cases": self.passed_cases,
        }


def _invariant_violations(state_dict: JsonObject) -> list[str]:
    violations: list[str] = []
    stock = state_dict["stock"]
    if isinstance(stock, dict):
        for item, quantity in stock.items():
            if isinstance(quantity, int) and quantity < 0:
                violations.append(f"stock[{item}] is negative: {quantity}")
    reservations = state_dict["reservations"]
    if isinstance(reservations, dict):
        for reservation_id, reservation in reservations.items():
            if isinstance(reservation, dict):
                quantity = reservation.get("quantity")
                if isinstance(quantity, int) and quantity <= 0:
                    violations.append(
                        f"reservations[{reservation_id}].quantity is not positive: {quantity}"
                    )
    return violations


def _run_case(case: JsonObject, transition: TransitionFn, replay_fn: ReplayFn) -> CaseResult:
    case_id = require_str(require_key(case, "id", "conformance_case"), "case.id")
    initial_state = parse_state(
        require_object(require_key(case, "initial_state", case_id), f"{case_id}.initial_state")
    )
    steps = require_object_list(require_key(case, "steps", case_id), f"{case_id}.steps")
    expected_events = require_key(case, "expected_events", case_id)
    expected_final_state = require_object(
        require_key(case, "expected_final_state", case_id), f"{case_id}.expected_final_state"
    )

    events, final_state = run_steps(initial_state, steps, transition)
    actual_events: list[JsonValue] = [event.to_dict() for event in events]
    actual_final_state = final_state.to_dict()
    replay_final_state = replay_fn(initial_state, events).to_dict()

    invariant_violations = _invariant_violations(actual_final_state)

    checks_passed = (
        actual_events == expected_events
        and actual_final_state == expected_final_state
        and replay_final_state == actual_final_state
        and not invariant_violations
    )
    if checks_passed:
        return CaseResult(case_id=case_id, passed=True, detail=None)

    detail: JsonObject = {
        "expected_events": expected_events,
        "actual_events": actual_events,
        "expected_final_state": expected_final_state,
        "actual_final_state": actual_final_state,
    }
    if replay_final_state != actual_final_state:
        detail["replay_final_state"] = replay_final_state
    if invariant_violations:
        violations_value: list[JsonValue] = list(invariant_violations)
        detail["invariant_violations"] = violations_value
    return CaseResult(case_id=case_id, passed=False, detail=detail)


def run_conformance(
    theory: Theory,
    realization: Realization,
    suite: JsonObject,
    transition: TransitionFn,
    replay_fn: ReplayFn,
) -> EvidenceResult:
    category = require_str(require_key(suite, "category", "conformance_suite"), "suite.category")
    obligation = require_str(
        require_key(suite, "obligation", "conformance_suite"), "suite.obligation"
    )
    producer = require_object(require_key(suite, "producer", "conformance_suite"), "suite.producer")
    assumptions_raw = suite.get("assumptions", [])
    assumptions = (
        tuple(item for item in assumptions_raw if isinstance(item, str))
        if isinstance(assumptions_raw, list)
        else ()
    )
    cases = require_object_list(require_key(suite, "cases", "conformance_suite"), "suite.cases")

    case_results = tuple(_run_case(case, transition, replay_fn) for case in cases)

    return EvidenceResult(
        category=category,
        obligation=obligation,
        producer=producer,
        theory_identity=theory.identity,
        realization_identity=realization.identity,
        assumptions=assumptions,
        case_results=case_results,
    )
