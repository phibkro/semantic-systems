import { jsonEqual } from "./canonical.ts";
import { parseState, runSteps, stateToJson, type Replay, type Transition } from "./domain.ts";
import {
  DocumentError,
  requireKey,
  requireObject,
  requireObjectList,
  requireString,
  requireStringList,
  type JsonObject,
  type JsonValue,
} from "./json.ts";
import {
  EVIDENCE_RESULT_KIND,
  PACKET_SCHEMA_VERSION,
  type CaseResult,
  type EvidenceResultInput,
} from "./packets.ts";
import type { Realization } from "./realization.ts";
import type { Theory } from "./theory.ts";

export const EVIDENCE_CATEGORY = "example_test";

const invariantViolations = (state: JsonObject): ReadonlyArray<string> => {
  const violations: Array<string> = [];
  const stock = state.stock;
  if (stock !== null && typeof stock === "object" && !Array.isArray(stock)) {
    for (const [item, quantity] of Object.entries(stock)) {
      if (typeof quantity === "number" && quantity < 0) {
        violations.push(`stock[${item}] is negative: ${quantity}`);
      }
    }
  }
  const reservations = state.reservations;
  if (reservations !== null && typeof reservations === "object" && !Array.isArray(reservations)) {
    for (const [id, reservation] of Object.entries(reservations)) {
      if (reservation !== null && typeof reservation === "object" && !Array.isArray(reservation)) {
        const quantity = (reservation as JsonObject).quantity;
        if (typeof quantity === "number" && quantity <= 0) {
          violations.push(`reservations[${id}].quantity is not positive: ${quantity}`);
        }
      }
    }
  }
  return violations;
};

const runCase = (testCase: JsonObject, transition: Transition, replay: Replay): CaseResult => {
  const caseId = requireString(requireKey(testCase, "id", "conformance_case"), "case.id");
  const initialState = parseState(
    requireObject(requireKey(testCase, "initial_state", caseId), `${caseId}.initial_state`),
  );
  const steps = requireObjectList(requireKey(testCase, "steps", caseId), `${caseId}.steps`);
  const expectedEvents = requireKey(testCase, "expected_events", caseId);
  const expectedFinalState = requireObject(
    requireKey(testCase, "expected_final_state", caseId),
    `${caseId}.expected_final_state`,
  );
  const [events, finalState] = runSteps(initialState, steps, transition);
  const actualEvents = events as unknown as ReadonlyArray<JsonValue>;
  const actualFinalState = stateToJson(finalState);
  const replayFinalState = stateToJson(replay(initialState, events));
  const violations = invariantViolations(actualFinalState);
  const passed =
    jsonEqual(actualEvents, expectedEvents) &&
    jsonEqual(actualFinalState, expectedFinalState) &&
    jsonEqual(replayFinalState, actualFinalState) &&
    violations.length === 0;
  if (passed) return { caseId, passed: true, detail: null };

  const detail: Record<string, JsonValue> = {
    expected_events: expectedEvents,
    actual_events: actualEvents,
    expected_final_state: expectedFinalState,
    actual_final_state: actualFinalState,
  };
  if (!jsonEqual(replayFinalState, actualFinalState)) detail.replay_final_state = replayFinalState;
  if (violations.length > 0) detail.invariant_violations = violations;
  return { caseId, passed: false, detail };
};

export const runConformance = (
  theory: Theory,
  realization: Realization,
  suite: JsonObject,
  recipeIdentity: string,
  transition: Transition,
  replay: Replay,
): EvidenceResultInput => {
  const category = requireString(
    requireKey(suite, "category", "conformance_suite"),
    "suite.category",
  );
  if (category !== EVIDENCE_CATEGORY) {
    throw new DocumentError({
      message: `the conformance runner produces example_test evidence; the recipe cannot relabel it as '${category}'`,
    });
  }
  const obligation = requireString(
    requireKey(suite, "obligation", "conformance_suite"),
    "suite.obligation",
  );
  const producer = requireObject(
    requireKey(suite, "producer", "conformance_suite"),
    "suite.producer",
  );
  const assumptions = requireStringList(suite.assumptions ?? [], "suite.assumptions");
  const cases = requireObjectList(requireKey(suite, "cases", "conformance_suite"), "suite.cases");
  return {
    artifactKind: EVIDENCE_RESULT_KIND,
    schemaVersion: PACKET_SCHEMA_VERSION,
    category: EVIDENCE_CATEGORY,
    obligation,
    producer,
    recipeIdentity,
    theoryIdentity: theory.identity,
    realizationIdentity: realization.identity,
    assumptions,
    caseResults: cases.map((testCase) => runCase(testCase, transition, replay)),
  };
};
