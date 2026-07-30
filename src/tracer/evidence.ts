import { Effect, type Crypto } from "effect";
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

const CONFORMANCE_SUITE_KIND = "conformance_suite";
const CONFORMANCE_SUITE_SCHEMA_VERSION = 1;
const RECIPE_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "kind",
  "schema_version",
  "id",
  "name",
  "theory",
  "theory_identity",
  "obligation",
  "category",
  "producer",
  "assumptions",
  "cases",
]);

interface RecipeEnvelope {
  readonly obligation: string;
  readonly producer: JsonObject;
  readonly assumptions: ReadonlyArray<string>;
  readonly cases: ReadonlyArray<JsonObject>;
  readonly recipePayload: JsonObject;
}

const requireNonEmptyString = (value: JsonValue, context: string): string => {
  const stringValue = requireString(value, context);
  if (stringValue.length === 0) {
    throw new DocumentError({ message: `${context} must be a nonempty string` });
  }
  return stringValue;
};

/**
 * The smallest pure recipe-envelope validator shared by `produceEvidence`
 * (before adapter resolution) and `runConformance` (before case execution),
 * so neither can select or execute a malformed recipe, and neither trusts
 * the recipe's own claimed theory binding without checking it against the
 * exact theory the caller actually supplied. It rejects:
 *
 * - every unknown top-level key — the allowed set is exactly `kind`,
 *   `schema_version`, `id`, `name`, `theory`, `theory_identity`,
 *   `obligation`, `category`, `producer`, `assumptions`, `cases`;
 * - a non-literal `kind` or `schema_version`;
 * - an empty `id`, `theory`, `theory_identity`, or `obligation`;
 * - a recipe whose `theory`/`theory_identity` does not exactly match the
 *   `theoryId`/`theoryIdentity` the caller supplies (a foreign or empty
 *   binding never reaches transition/replay/case work);
 * - a `name` present with a non-string value (a valid string `name` is
 *   still accepted and remains the sole presentation-only field excluded
 *   from the recipe identity below);
 * - a `producer` without nonempty string `id`/`version`;
 * - a missing `assumptions` key (an author must declare `[]` explicitly;
 *   omission is rejected, not silently defaulted — this changes nothing
 *   about the *identity* of an explicit `[]`, only whether omission is
 *   accepted at all);
 * - an empty or duplicate-ID case list, and any case with an empty `id`.
 *
 * This is independent of `loader.ts`'s schema: both exported functions can
 * be called directly with an arbitrary `JsonObject`, so the boundary
 * re-checks everything itself rather than trusting the loader to have run
 * first.
 *
 * It also derives the exact recipe identity payload (design spec 0003 slice
 * 2/frozen requirement 3): a SHA-256 content identity over the source
 * recipe's semantic payload — `kind`, `schema_version`, `id`, `theory`,
 * `theory_identity`, `obligation`, `category`, `producer`, `assumptions`,
 * and complete `cases`. Only the recipe's own `name` is excluded, as
 * presentation metadata, consistent with the theory/realization
 * normalization posture in `theory.ts` and `realization.ts`. This
 * deliberately hashes the complete authored `cases` array, never an ad hoc
 * reduced list of case IDs.
 */
const validateRecipeEnvelope = (
  suite: JsonObject,
  theoryId: string,
  theoryIdentity: string,
): RecipeEnvelope => {
  for (const key of Object.keys(suite)) {
    if (!RECIPE_ALLOWED_KEYS.has(key)) {
      throw new DocumentError({
        message: `conformance_suite contains an unknown top-level key '${key}'`,
      });
    }
  }
  const kind = requireString(requireKey(suite, "kind", "conformance_suite"), "suite.kind");
  if (kind !== CONFORMANCE_SUITE_KIND) {
    throw new DocumentError({
      message: `conformance_suite requires kind '${CONFORMANCE_SUITE_KIND}', got '${kind}'`,
    });
  }
  const schemaVersion = requireInteger(
    requireKey(suite, "schema_version", "conformance_suite"),
    "suite.schema_version",
  );
  if (schemaVersion !== CONFORMANCE_SUITE_SCHEMA_VERSION) {
    throw new DocumentError({
      message: `conformance_suite requires schema_version ${CONFORMANCE_SUITE_SCHEMA_VERSION}, got ${JSON.stringify(schemaVersion)}`,
    });
  }
  const id = requireNonEmptyString(requireKey(suite, "id", "conformance_suite"), "suite.id");
  if ("name" in suite && typeof suite.name !== "string") {
    throw new DocumentError({ message: "suite.name must be a string when present" });
  }
  const declaredTheory = requireNonEmptyString(
    requireKey(suite, "theory", "conformance_suite"),
    "suite.theory",
  );
  const declaredTheoryIdentity = requireNonEmptyString(
    requireKey(suite, "theory_identity", "conformance_suite"),
    "suite.theory_identity",
  );
  if (declaredTheory !== theoryId) {
    throw new DocumentError({
      message: `conformance_suite targets theory '${declaredTheory}', not the supplied theory '${theoryId}'`,
    });
  }
  if (declaredTheoryIdentity !== theoryIdentity) {
    throw new DocumentError({
      message: `conformance_suite targets a foreign theory_identity '${declaredTheoryIdentity}', not the supplied theory identity '${theoryIdentity}'`,
    });
  }
  const obligation = requireNonEmptyString(
    requireKey(suite, "obligation", "conformance_suite"),
    "suite.obligation",
  );
  const category = requireString(
    requireKey(suite, "category", "conformance_suite"),
    "suite.category",
  );
  if (category !== EVIDENCE_CATEGORY) {
    throw new DocumentError({
      message: `the conformance runner produces example_test evidence; the recipe cannot relabel it as '${category}'`,
    });
  }
  const producer = requireObject(
    requireKey(suite, "producer", "conformance_suite"),
    "suite.producer",
  );
  requireNonEmptyString(requireKey(producer, "id", "suite.producer"), "suite.producer.id");
  requireNonEmptyString(
    requireKey(producer, "version", "suite.producer"),
    "suite.producer.version",
  );
  const assumptions = requireStringList(
    requireKey(suite, "assumptions", "conformance_suite"),
    "suite.assumptions",
  );
  const cases = requireObjectList(requireKey(suite, "cases", "conformance_suite"), "suite.cases");
  if (cases.length === 0) {
    throw new DocumentError({ message: "conformance_suite.cases must not be empty" });
  }
  const caseIds = cases.map((testCase, index) =>
    requireString(requireKey(testCase, "id", `suite.cases[${index}]`), `suite.cases[${index}].id`),
  );
  caseIds.forEach((caseId, index) => {
    if (caseId.length === 0) {
      throw new DocumentError({ message: `suite.cases[${index}].id must be a nonempty string` });
    }
  });
  const seenCaseIds = new Set<string>();
  for (const caseId of caseIds) {
    if (seenCaseIds.has(caseId)) {
      throw new DocumentError({
        message: `conformance_suite.cases contains duplicate case ID '${caseId}'`,
      });
    }
    seenCaseIds.add(caseId);
  }
  return {
    obligation,
    producer,
    assumptions,
    cases,
    recipePayload: {
      kind,
      schema_version: schemaVersion,
      id,
      theory: declaredTheory,
      theory_identity: declaredTheoryIdentity,
      obligation,
      category,
      producer,
      assumptions,
      cases,
    },
  };
};

const toDocumentError = (cause: unknown): DocumentError =>
  cause instanceof DocumentError
    ? cause
    : new DocumentError({ message: "cannot validate conformance recipe", cause });

/**
 * `theoryId` is threaded in explicitly (rather than recovered from
 * `theory`) because `Theory` (see `theory.ts`) carries only the normalized
 * `identity` and `payload` — the author-declared ID is not part of the
 * normalized shape at all. Binding the recipe to the exact supplied theory
 * (both `theoryId` and `theory.identity`) happens inside
 * `validateRecipeEnvelope` below, before any transition/replay/case work.
 */
export const runConformance = (
  theory: Theory,
  theoryId: string,
  realization: Realization,
  suite: JsonObject,
  transition: Transition,
  replay: Replay,
): Effect.Effect<EvidenceResult, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const envelope = yield* Effect.try({
      try: () => validateRecipeEnvelope(suite, theoryId, theory.identity),
      catch: toDocumentError,
    });
    const caseResults = yield* Effect.try({
      try: () => envelope.cases.map((testCase) => runCase(testCase, transition, replay)),
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot run conformance evidence", cause }),
    });
    const recipeIdentity = yield* contentIdentity(envelope.recipePayload);
    const withoutIdentity: Omit<EvidenceResult, "identity"> = {
      artifactKind: ARTIFACT_KIND_EVIDENCE_RESULT,
      schemaVersion: EVIDENCE_RESULT_SCHEMA_VERSION,
      category: EVIDENCE_CATEGORY,
      producer: envelope.producer,
      recipeIdentity,
      theoryIdentity: theory.identity,
      realizationIdentity: realization.identity,
      obligation: envelope.obligation,
      assumptions: envelope.assumptions,
      caseResults,
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
    // Validate the recipe envelope before ever resolving an adapter (shared
    // with `runConformance`'s pre-case-execution validation). A malformed
    // recipe (wrong kind/schema_version, invalid producer identity, an
    // unknown top-level key, or an empty/duplicate/empty-ID case list)
    // fails this Effect outright, consistent with the existing
    // wrong-category hard failure below — it is not a `ProducerDiagnostic`.
    yield* Effect.try({
      try: () => validateRecipeEnvelope(suite, theoryId, theory.identity),
      catch: toDocumentError,
    });
    // Extracting the operation-binding keys from the realization document is
    // a document-shape concern, independent of whether the resolved adapter
    // itself recognizes those keys. A binding-decoding `DocumentError` (a
    // malformed/missing `realization.operations.*` entry) must fail this
    // Effect directly; only a `DocumentError` thrown by the adapters
    // themselves, once given a well-formed key, may become the
    // `unbound_operation` diagnostic below.
    const bindings = yield* Effect.try({
      try: () => ({
        transitionKey: operationBinding(realization.document, "transition"),
        replayKey: operationBinding(realization.document, "replay"),
      }),
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot resolve realization operation bindings", cause }),
    });
    // The single-arg form of `Effect.try` maps a thrown value into
    // `Cause.UnknownError`, preserving the original thrown value unchanged
    // in `.cause`. `Effect.catchIf` then recovers ONLY when that original
    // cause is a genuine adapter `DocumentError` (the unbound-operation
    // case); any other cause re-fails with the original `UnknownError`,
    // which `Effect.mapError` turns into a `DocumentError` that still
    // retains the original thrown value as its own `cause` — so an
    // unexpected adapter defect fails this Effect instead of silently
    // becoming an `unbound_operation` diagnostic.
    const operations = yield* Effect.try(() => ({
      kind: "resolved" as const,
      transition: adapters.resolveTransition(bindings.transitionKey),
      replay: adapters.resolveReplay(bindings.replayKey),
    })).pipe(
      Effect.catchIf(
        (error) => error.cause instanceof DocumentError,
        (error) =>
          Effect.succeed({
            kind: "unbound" as const,
            message: (error.cause as DocumentError).message,
          }),
      ),
      Effect.mapError(
        (error) =>
          new DocumentError({
            message: "cannot resolve realization operations",
            cause: error.cause,
          }),
      ),
    );
    if (operations.kind === "unbound") {
      return reject("unbound_operation", operations.message);
    }
    return {
      ok: true,
      realizationId: subjectId,
      realizationIdentity: subjectIdentity,
      result: yield* runConformance(
        theory,
        theoryId,
        realization,
        suite,
        operations.transition,
        operations.replay,
      ),
    };
  });
