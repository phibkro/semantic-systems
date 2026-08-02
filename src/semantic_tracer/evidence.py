"""Evidence production boundary (design spec 0003).

Conformance execution occurs before resolution. Given an exact theory,
realization, recipe, and execution adapter, production returns either one
`evidence_result_v1` packet or a typed producer diagnostic and no result. An
unbound adapter is a producer diagnostic, not an evidence result.

A conformance-suite recipe is not itself evidence (design spec 0001).
Running it here against the theory and realization identities in scope
produces an evidence result bound to those exact identities, so staleness
cannot occur: the subject is always the identity just computed.

The production resolver (`resolver.py`) must not import this module.
"""

from __future__ import annotations

from semantic_tracer.domain import ReplayFn, TransitionFn, parse_state, run_steps
from semantic_tracer.jsonutil import (
    DocumentError,
    require_key,
    require_object,
    require_object_list,
    require_str,
    require_str_list,
)
from semantic_tracer.operations import resolve_replay, resolve_transition
from semantic_tracer.packets import (
    CaseResult,
    EvidenceResultPacket,
    ProducerDiagnostic,
    ProducerOutcome,
)
from semantic_tracer.realization import Realization, operation_binding
from semantic_tracer.reasons import (
    REASON_EVIDENCE_AMBIGUOUS,
    REASON_EVIDENCE_OBLIGATION_MISMATCH,
    REASON_EVIDENCE_STALE,
    REASON_MISSING_EVIDENCE,
    REASON_OBLIGATION_SET_UNSUPPORTED,
    REASON_OPERATION_UNBOUND,
)
from semantic_tracer.theory import Theory
from semantic_tracer.types import JsonObject, JsonValue

EVIDENCE_CATEGORY = "example_test"


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
) -> EvidenceResultPacket:
    declared_category = require_str(
        require_key(suite, "category", "conformance_suite"), "suite.category"
    )
    if declared_category != EVIDENCE_CATEGORY:
        raise DocumentError(
            "the conformance runner produces example_test evidence; "
            f"the recipe cannot relabel it as {declared_category!r}"
        )
    obligation = require_str(
        require_key(suite, "obligation", "conformance_suite"), "suite.obligation"
    )
    producer = require_object(require_key(suite, "producer", "conformance_suite"), "suite.producer")
    assumptions_raw = suite.get("assumptions", [])
    assumptions = tuple(require_str_list(assumptions_raw, "suite.assumptions"))
    cases = require_object_list(require_key(suite, "cases", "conformance_suite"), "suite.cases")

    case_results = tuple(_run_case(case, transition, replay_fn) for case in cases)

    return EvidenceResultPacket(
        category=EVIDENCE_CATEGORY,
        obligation=obligation,
        producer=producer,
        theory_identity=theory.identity,
        realization_identity=realization.identity,
        assumptions=assumptions,
        case_results=case_results,
    )


def produce_realization_evidence(
    theory: Theory,
    theory_id: str,
    required_obligation: str | None,
    realization: Realization,
    suites: list[JsonObject],
) -> ProducerOutcome:
    """Produce one `evidence_result_v1` packet, or a diagnostic, for `realization`.

    Matches the one conformance-suite recipe declared for `theory_id`,
    verifies it targets the exact normalized theory identity and the
    theory's required obligation, resolves the realization's operation
    bindings, and executes it. Every failure mode short of a diagnosed,
    typed reason raises rather than silently producing partial evidence.
    """
    if required_obligation is None:
        return ProducerDiagnostic(REASON_OBLIGATION_SET_UNSUPPORTED)

    matching = [suite for suite in suites if suite.get("theory") == theory_id]
    suite = matching[0] if len(matching) == 1 else None
    diagnosis = (
        (not matching, REASON_MISSING_EVIDENCE),
        (len(matching) > 1, REASON_EVIDENCE_AMBIGUOUS),
        (
            suite is not None and suite.get("theory_identity") != theory.identity,
            REASON_EVIDENCE_STALE,
        ),
        (
            suite is not None and suite.get("obligation") != required_obligation,
            REASON_EVIDENCE_OBLIGATION_MISMATCH,
        ),
    )
    reason = next((code for failed, code in diagnosis if failed), None)
    if reason is not None or suite is None:
        return ProducerDiagnostic(reason or REASON_MISSING_EVIDENCE)

    try:
        transition = resolve_transition(operation_binding(realization.document, "transition"))
        replay_fn = resolve_replay(operation_binding(realization.document, "replay"))
    except DocumentError:
        return ProducerDiagnostic(REASON_OPERATION_UNBOUND)

    return run_conformance(theory, realization, suite, transition, replay_fn)


def produce_all_evidence(
    theory: Theory,
    theory_id: str,
    required_obligation: str | None,
    realizations: list[Realization],
    suites: list[JsonObject],
) -> dict[str, ProducerOutcome]:
    """Produce one outcome per authored realization, keyed by realization ID."""
    return {
        realization.realization_id: produce_realization_evidence(
            theory, theory_id, required_obligation, realization, suites
        )
        for realization in realizations
    }
