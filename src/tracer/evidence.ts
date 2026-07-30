import { Crypto, Effect, Result } from "effect";
import { contentIdentity, jsonEqual } from "./canonical.ts";
import { parseState, runSteps, stateToJson, type Replay, type Transition } from "./domain.ts";
import {
  ARTIFACT_KIND_EVIDENCE_RESULT,
  EVIDENCE_CATEGORY,
  EVIDENCE_RESULT_SCHEMA_VERSION,
  evidenceResultIdentityPayload,
  type CaseResult,
  type EvidenceResult,
  type ProducerDiagnosticKind,
  type ProducerOutcome,
} from "./evidence-result.ts";
import {
  DocumentError,
  requireInteger,
  requireKey,
  requireObject,
  requireObjectList,
  requireString,
  requireStringList,
  type JsonObject,
  type JsonValue,
} from "./json.ts";
import { operationBinding, realizationId, type Realization } from "./realization.ts";
import type { Theory } from "./theory.ts";

// Re-export the neutral data contracts so existing importers of this module
// (demo.ts, tests, cli.ts) keep working; the canonical definitions and the
// resolver-facing import path both live in evidence-result.ts.
export * from "./evidence-result.ts";

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

/**
 * The exact recipe identity (design spec 0003 slice 2/frozen requirement 3):
 * a SHA-256 content identity over the source recipe's semantic payload —
 * `kind`, `schema_version`, `id`, `theory`, `theory_identity`, `obligation`,
 * `category`, `producer`, `assumptions`, and complete `cases`. Only the
 * recipe's own `name` is excluded, as presentation metadata, consistent
 * with the theory/realization normalization posture in `theory.ts` and
 * `realization.ts`. This deliberately hashes the complete authored `cases`
 * array, never an ad hoc reduced list of case IDs.
 */
const recipeIdentityPayload = (suite: JsonObject): JsonObject => ({
  kind: requireString(requireKey(suite, "kind", "conformance_suite"), "suite.kind"),
  schema_version: requireInteger(
    requireKey(suite, "schema_version", "conformance_suite"),
    "suite.schema_version",
  ),
  id: requireString(requireKey(suite, "id", "conformance_suite"), "suite.id"),
  theory: requireString(requireKey(suite, "theory", "conformance_suite"), "suite.theory"),
  theory_identity: requireString(
    requireKey(suite, "theory_identity", "conformance_suite"),
    "suite.theory_identity",
  ),
  obligation: requireString(requireKey(suite, "obligation", "conformance_suite"), "suite.obligation"),
  category: requireString(requireKey(suite, "category", "conformance_suite"), "suite.category"),
  producer: requireObject(requireKey(suite, "producer", "conformance_suite"), "suite.producer"),
  assumptions: requireStringList(suite.assumptions ?? [], "suite.assumptions"),
  cases: requireObjectList(requireKey(suite, "cases", "conformance_suite"), "suite.cases"),
});

export const runConformance = (
  theory: Theory,
  realization: Realization,
  suite: JsonObject,
  transition: Transition,
  replay: Replay,
): Effect.Effect<EvidenceResult, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => {
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
        const cases = requireObjectList(
          requireKey(suite, "cases", "conformance_suite"),
          "suite.cases",
        );
        return {
          obligation,
          producer,
          assumptions,
          caseResults: cases.map((testCase) => runCase(testCase, transition, replay)),
          recipePayload: recipeIdentityPayload(suite),
        };
      },
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot run conformance evidence", cause }),
    });
    const recipeIdentity = yield* contentIdentity(parsed.recipePayload);
    const withoutIdentity: Omit<EvidenceResult, "identity"> = {
      artifactKind: ARTIFACT_KIND_EVIDENCE_RESULT,
      schemaVersion: EVIDENCE_RESULT_SCHEMA_VERSION,
      category: EVIDENCE_CATEGORY,
      producer: parsed.producer,
      recipeIdentity,
      theoryIdentity: theory.identity,
      realizationIdentity: realization.identity,
      obligation: parsed.obligation,
      assumptions: parsed.assumptions,
      caseResults: parsed.caseResults,
    };
    const identity = yield* contentIdentity(evidenceResultIdentityPayload(withoutIdentity));
    return { identity, ...withoutIdentity };
  });

/**
 * Evidence-production boundary (contract slices 2-3): the producer is the
 * only place that selects a conformance recipe, resolves execution adapters,
 * and runs `runConformance`. It returns one lossless `EvidenceResult` or a
 * typed diagnostic and no result (data contracts in `evidence-result.ts`);
 * it never adjudicates policy or eligibility.
 *
 * Every non-executing preflight (theory targeting, obligation shape, recipe
 * matching, staleness, and obligation binding) is rejected before an adapter
 * is resolved or conformance runs, so a wrong-theory realization or a
 * wrong-obligation/stale/ambiguous/missing suite never triggers execution.
 * `requiredObligation` is threaded in (rather than recomputed here) so
 * `resolver.ts` stays the single definition of the theory's obligation
 * shape.
 */
export interface EvidenceAdapters {
  readonly resolveTransition: (key: string) => Transition;
  readonly resolveReplay: (key: string) => Replay;
}

export const produceEvidence = (
  theory: Theory,
  theoryId: string,
  requiredObligation: string | null,
  realization: Realization,
  suites: ReadonlyArray<JsonObject>,
  adapters: EvidenceAdapters,
): Effect.Effect<ProducerOutcome, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const subjectId = realizationId(realization);
    const subjectIdentity = realization.identity;
    const reject = (kind: ProducerDiagnosticKind, message: string): ProducerOutcome => ({
      ok: false,
      realizationId: subjectId,
      realizationIdentity: subjectIdentity,
      diagnostic: { kind, message },
    });
    if (!realization.targetsTheory) {
      return reject("not_targeted", `realization does not target theory '${theoryId}'`);
    }
    if (requiredObligation === null) {
      return reject(
        "obligation_unsupported",
        "the theory does not declare exactly one required obligation",
      );
    }
    const matching = suites.filter((suite) => suite.theory === theoryId);
    if (matching.length === 0) {
      return reject("missing_evidence", `no conformance suite declares theory '${theoryId}'`);
    }
    if (matching.length > 1) {
      return reject(
        "ambiguous_evidence",
        `multiple conformance suites declare theory '${theoryId}'`,
      );
    }
    const suite = matching[0]!;
    if (suite.theory_identity !== theory.identity) {
      return reject(
        "stale_evidence_recipe",
        "the conformance suite targets a stale theory identity",
      );
    }
    if (suite.obligation !== requiredObligation) {
      return reject(
        "evidence_obligation_mismatch",
        `the suite declares obligation '${String(suite.obligation)}' but the theory requires '${requiredObligation}'`,
      );
    }
    const operations = yield* Effect.try({
      try: () => ({
        transition: adapters.resolveTransition(
          operationBinding(realization.document, "transition"),
        ),
        replay: adapters.resolveReplay(operationBinding(realization.document, "replay")),
      }),
      catch: (cause): DocumentError =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot resolve realization operations", cause }),
    }).pipe(Effect.result);
    if (Result.isFailure(operations)) {
      return reject("unbound_operation", operations.failure.message);
    }
    return {
      ok: true,
      realizationId: subjectId,
      realizationIdentity: subjectIdentity,
      result: yield* runConformance(
        theory,
        realization,
        suite,
        operations.success.transition,
        operations.success.replay,
      ),
    };
  });
