"""Execute the demo scenario against the selected realization only."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from semantic_tracer.domain import TransitionFn, parse_state, run_steps
from semantic_tracer.jsonutil import require_key, require_object, require_object_list
from semantic_tracer.types import JsonObject


@dataclass(frozen=True, slots=True)
class ExecutionResult:
    events: tuple[JsonObject, ...]
    final_state: JsonObject
    matches_oracle: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "events": list(self.events),
            "final_state": self.final_state,
            "matches_oracle": self.matches_oracle,
        }


def execute_scenario(scenario: JsonObject, transition: TransitionFn) -> ExecutionResult:
    initial_state = parse_state(
        require_object(require_key(scenario, "initial_state", "scenario"), "scenario.initial_state")
    )
    steps = require_object_list(require_key(scenario, "steps", "scenario"), "scenario.steps")
    expected_events = require_key(scenario, "expected_events", "scenario")
    expected_final_state = require_object(
        require_key(scenario, "expected_final_state", "scenario"),
        "scenario.expected_final_state",
    )

    events, final_state = run_steps(initial_state, steps, transition)
    actual_events = [event.to_dict() for event in events]
    actual_final_state = final_state.to_dict()
    matches_oracle = actual_events == expected_events and actual_final_state == expected_final_state

    return ExecutionResult(
        events=tuple(actual_events),
        final_state=actual_final_state,
        matches_oracle=matches_oracle,
    )
