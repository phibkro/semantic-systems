import { jsonEqual } from "./canonical.ts";
import { parseState, runSteps, stateToJson, type Event, type Transition } from "./domain.ts";
import { requireKey, requireObject, requireObjectList, type JsonObject } from "./json.ts";

export interface ExecutionResult {
  readonly events: ReadonlyArray<Event>;
  readonly finalState: JsonObject;
  readonly matchesOracle: boolean;
}

export const executionToJson = (result: ExecutionResult): JsonObject => ({
  events: result.events,
  final_state: result.finalState,
  matches_oracle: result.matchesOracle,
});

export const executeScenario = (scenario: JsonObject, transition: Transition): ExecutionResult => {
  const initialState = parseState(
    requireObject(requireKey(scenario, "initial_state", "scenario"), "scenario.initial_state"),
  );
  const steps = requireObjectList(requireKey(scenario, "steps", "scenario"), "scenario.steps");
  const expectedEvents = requireKey(scenario, "expected_events", "scenario");
  const expectedFinalState = requireObject(
    requireKey(scenario, "expected_final_state", "scenario"),
    "scenario.expected_final_state",
  );
  const [events, finalState] = runSteps(initialState, steps, transition);
  const actualFinalState = stateToJson(finalState);
  return {
    events,
    finalState: actualFinalState,
    matchesOracle:
      jsonEqual(events as never, expectedEvents) && jsonEqual(actualFinalState, expectedFinalState),
  };
};
