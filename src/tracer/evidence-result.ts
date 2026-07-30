import { Crypto, Effect } from "effect";
import { contentIdentity, jsonEqual } from "./canonical.ts";
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

/**
 * Neutral evidence-result and producer-outcome data contracts (design spec
 * 0003 slices 2-3). This module holds only plain data shapes and pure
 * serialization/aggregation helpers over them — no domain semantics, no
 * conformance execution, no operation/adapter resolution, and no I/O beyond
 * the shared canonical-identity/crypto primitives already in the resolver's
 * closure (`canonical.ts`). The resolver imports runtime values and types
 * only from here, never from `evidence.ts`, which owns producer execution
 * and therefore transitively reaches domain/operations; see `resolver.ts`
 * and `evidence.ts`.
 */

export const ARTIFACT_KIND_EVIDENCE_RESULT = "evidence_result";
export const EVIDENCE_RESULT_SCHEMA_VERSION = 1;
export const EVIDENCE_CATEGORY = "example_test";

export interface CaseResult {
  readonly caseId: string;
  readonly passed: boolean;
  readonly detail: JsonObject | null;
}

/**
 * The frozen v1 artifact (design spec 0003, "`evidence_result_v1`"). Every
 * field here is semantic and participates in `identity` except `identity`
 * itself; `passed`/`total_cases`/`passed_cases`/`counterexamples` are
 * derived views computed only in `evidenceToJson` and never stored as part
 * of this typed shape, so nothing here can silently diverge from the case
 * results it derives from.
 */
export interface EvidenceResult {
  readonly identity: string;
  readonly artifactKind: typeof ARTIFACT_KIND_EVIDENCE_RESULT;
  readonly schemaVersion: typeof EVIDENCE_RESULT_SCHEMA_VERSION;
  readonly category: typeof EVIDENCE_CATEGORY;
  readonly producer: JsonObject;
  readonly recipeIdentity: string;
  readonly theoryIdentity: string;
  readonly realizationIdentity: string;
  readonly obligation: string;
  readonly assumptions: ReadonlyArray<string>;
  readonly caseResults: ReadonlyArray<CaseResult>;
}

export const evidenceTotalCases = (evidence: EvidenceResult): number => evidence.caseResults.length;
export const evidencePassedCases = (evidence: EvidenceResult): number =>
  evidence.caseResults.filter((item) => item.passed).length;
export const evidencePassed = (evidence: EvidenceResult): boolean =>
  evidenceTotalCases(evidence) > 0 &&
  evidencePassedCases(evidence) === evidenceTotalCases(evidence);
export const caseResultToJson = (result: CaseResult): JsonObject => ({
  case_id: result.caseId,
  passed: result.passed,
  detail: result.detail,
});
export const evidenceCounterexamples = (evidence: EvidenceResult): ReadonlyArray<JsonObject> =>
  evidence.caseResults.filter((item) => !item.passed).map(caseResultToJson);

/**
 * The exact semantic payload hashed into `EvidenceResult.identity`: every
 * frozen field except `identity` itself, with derived aggregates
 * (passed/counts/counterexamples) excluded (design spec 0003 slice 2).
 */
export const evidenceResultIdentityPayload = (
  evidence: Omit<EvidenceResult, "identity">,
): JsonObject => ({
  artifact_kind: evidence.artifactKind,
  schema_version: evidence.schemaVersion,
  category: evidence.category,
  producer: evidence.producer,
  recipe_identity: evidence.recipeIdentity,
  theory_identity: evidence.theoryIdentity,
  realization_identity: evidence.realizationIdentity,
  obligation: evidence.obligation,
  assumptions: evidence.assumptions,
  case_results: evidence.caseResults.map(caseResultToJson),
});

export const evidenceToJson = (evidence: EvidenceResult): JsonObject => ({
  artifact_kind: evidence.artifactKind,
  schema_version: evidence.schemaVersion,
  identity: evidence.identity,
  category: evidence.category,
  producer: evidence.producer,
  recipe_identity: evidence.recipeIdentity,
  theory_identity: evidence.theoryIdentity,
  realization_identity: evidence.realizationIdentity,
  obligation: evidence.obligation,
  assumptions: evidence.assumptions,
  case_results: evidence.caseResults.map(caseResultToJson),
  passed: evidencePassed(evidence),
  total_cases: evidenceTotalCases(evidence),
  passed_cases: evidencePassedCases(evidence),
  counterexamples: evidenceCounterexamples(evidence),
});

/**
 * Every outcome self-declares the realization it is bound to by declared ID
 * (not array position) plus the exact authored realization content
 * identity, so a resolver consuming a list of outcomes can reject
 * reordering, omission, duplication, or rebinding deterministically instead
 * of trusting positional alignment or the outcome's own say-so.
 * `realizationIdentity` is set alongside `result.realizationIdentity` for
 * the `ok: true` case (both derived from the same realization at
 * construction in `evidence.ts`) and is the only identity carrier for
 * diagnostics.
 */
export type ProducerDiagnosticKind =
  | "not_targeted"
  | "obligation_unsupported"
  | "missing_evidence"
  | "ambiguous_evidence"
  | "stale_evidence_recipe"
  | "evidence_obligation_mismatch"
  | "unbound_operation";

export interface ProducerDiagnostic {
  readonly kind: ProducerDiagnosticKind;
  readonly message: string;
}

export type ProducerOutcome =
  | {
      readonly ok: true;
      readonly realizationId: string;
      readonly realizationIdentity: string;
      readonly result: EvidenceResult;
    }
  | {
      readonly ok: false;
      readonly realizationId: string;
      readonly realizationIdentity: string;
      readonly diagnostic: ProducerDiagnostic;
    };

export const producerDiagnosticToJson = (diagnostic: ProducerDiagnostic): JsonObject => ({
  kind: diagnostic.kind,
  message: diagnostic.message,
});

const toDocumentError = (cause: unknown): DocumentError =>
  cause instanceof DocumentError
    ? cause
    : new DocumentError({ message: "cannot parse evidence result", cause });

const requireBoolean = (value: JsonValue, context: string): boolean => {
  if (typeof value !== "boolean") {
    throw new DocumentError({ message: `${context} must be a boolean` });
  }
  return value;
};

const requireDetail = (value: JsonValue, context: string): JsonObject | null => {
  if (value === null) return null;
  return requireObject(value, context);
};

interface ParsedFields {
  readonly identity: string;
  readonly fields: Omit<EvidenceResult, "identity">;
  readonly storedPassed: JsonValue;
  readonly storedTotalCases: JsonValue;
  readonly storedPassedCases: JsonValue;
  readonly storedCounterexamples: JsonValue;
}

const parseEvidenceResultFields = (document: JsonObject): ParsedFields => {
  const artifactKind = requireString(
    requireKey(document, "artifact_kind", "evidence_result"),
    "evidence_result.artifact_kind",
  );
  if (artifactKind !== ARTIFACT_KIND_EVIDENCE_RESULT) {
    throw new DocumentError({
      message: `evidence-result parser requires artifact_kind '${ARTIFACT_KIND_EVIDENCE_RESULT}', got '${artifactKind}'`,
    });
  }
  const schemaVersion = requireInteger(
    requireKey(document, "schema_version", "evidence_result"),
    "evidence_result.schema_version",
  );
  if (schemaVersion !== EVIDENCE_RESULT_SCHEMA_VERSION) {
    throw new DocumentError({
      message: `evidence-result parser requires schema_version ${EVIDENCE_RESULT_SCHEMA_VERSION}, got ${JSON.stringify(schemaVersion)}`,
    });
  }
  const category = requireString(
    requireKey(document, "category", "evidence_result"),
    "evidence_result.category",
  );
  if (category !== EVIDENCE_CATEGORY) {
    throw new DocumentError({
      message: `evidence-result parser requires category '${EVIDENCE_CATEGORY}', got '${category}'`,
    });
  }
  const identity = requireString(
    requireKey(document, "identity", "evidence_result"),
    "evidence_result.identity",
  );
  const producer = requireObject(
    requireKey(document, "producer", "evidence_result"),
    "evidence_result.producer",
  );
  requireString(
    requireKey(producer, "id", "evidence_result.producer"),
    "evidence_result.producer.id",
  );
  requireString(
    requireKey(producer, "version", "evidence_result.producer"),
    "evidence_result.producer.version",
  );
  const recipeIdentity = requireString(
    requireKey(document, "recipe_identity", "evidence_result"),
    "evidence_result.recipe_identity",
  );
  const theoryIdentity = requireString(
    requireKey(document, "theory_identity", "evidence_result"),
    "evidence_result.theory_identity",
  );
  const realizationIdentity = requireString(
    requireKey(document, "realization_identity", "evidence_result"),
    "evidence_result.realization_identity",
  );
  const obligation = requireString(
    requireKey(document, "obligation", "evidence_result"),
    "evidence_result.obligation",
  );
  const assumptions = requireStringList(
    requireKey(document, "assumptions", "evidence_result"),
    "evidence_result.assumptions",
  );
  const rawCases = requireObjectList(
    requireKey(document, "case_results", "evidence_result"),
    "evidence_result.case_results",
  );
  if (rawCases.length === 0) {
    throw new DocumentError({ message: "evidence_result.case_results must not be empty" });
  }
  const caseResults = rawCases.map((raw, index) => {
    const context = `evidence_result.case_results[${index}]`;
    const caseId = requireString(requireKey(raw, "case_id", context), `${context}.case_id`);
    const passed = requireBoolean(requireKey(raw, "passed", context), `${context}.passed`);
    const detail = requireDetail(requireKey(raw, "detail", context), `${context}.detail`);
    return { caseId, passed, detail };
  });
  const seenCaseIds = new Set<string>();
  for (const item of caseResults) {
    if (seenCaseIds.has(item.caseId)) {
      throw new DocumentError({
        message: `evidence_result.case_results contains duplicate case ID '${item.caseId}'`,
      });
    }
    seenCaseIds.add(item.caseId);
  }
  return {
    identity,
    fields: {
      artifactKind: ARTIFACT_KIND_EVIDENCE_RESULT,
      schemaVersion: EVIDENCE_RESULT_SCHEMA_VERSION,
      category: EVIDENCE_CATEGORY,
      producer,
      recipeIdentity,
      theoryIdentity,
      realizationIdentity,
      obligation,
      assumptions,
      caseResults,
    },
    storedPassed: requireKey(document, "passed", "evidence_result"),
    storedTotalCases: requireKey(document, "total_cases", "evidence_result"),
    storedPassedCases: requireKey(document, "passed_cases", "evidence_result"),
    storedCounterexamples: requireKey(document, "counterexamples", "evidence_result"),
  };
};

const finalizeEvidenceResult = (
  parsed: ParsedFields,
  recomputedIdentity: string,
): EvidenceResult => {
  if (recomputedIdentity !== parsed.identity) {
    throw new DocumentError({
      message: `evidence_result.identity mismatch: stored '${parsed.identity}' does not match recomputed '${recomputedIdentity}'`,
    });
  }
  const result: EvidenceResult = { identity: recomputedIdentity, ...parsed.fields };
  const recomputedPassed = evidencePassed(result);
  const recomputedTotalCases = evidenceTotalCases(result);
  const recomputedPassedCases = evidencePassedCases(result);
  const recomputedCounterexamples = evidenceCounterexamples(result);
  if (parsed.storedPassed !== recomputedPassed) {
    throw new DocumentError({
      message: `evidence_result.passed mismatch: stored ${JSON.stringify(parsed.storedPassed)} does not match recomputed ${recomputedPassed}`,
    });
  }
  if (parsed.storedTotalCases !== recomputedTotalCases) {
    throw new DocumentError({
      message: `evidence_result.total_cases mismatch: stored ${JSON.stringify(parsed.storedTotalCases)} does not match recomputed ${recomputedTotalCases}`,
    });
  }
  if (parsed.storedPassedCases !== recomputedPassedCases) {
    throw new DocumentError({
      message: `evidence_result.passed_cases mismatch: stored ${JSON.stringify(parsed.storedPassedCases)} does not match recomputed ${recomputedPassedCases}`,
    });
  }
  if (!jsonEqual(parsed.storedCounterexamples, recomputedCounterexamples)) {
    throw new DocumentError({
      message: "evidence_result.counterexamples mismatch: stored value does not match recomputed counterexamples",
    });
  }
  return result;
};

/**
 * Parses and validates a serialized `evidence_result_v1` artifact (the
 * output shape of `evidenceToJson`). It never trusts stored aggregates or
 * the stored identity: every derived view is recomputed from `case_results`
 * and compared against what is stored, and the overall content identity is
 * recomputed from `evidenceResultIdentityPayload` over the parsed semantic
 * fields. A conformance-suite recipe (`kind: "conformance_suite"`, no
 * `artifact_kind`/`identity`/`case_results` fields) fails the required-key
 * checks below and is rejected, never silently accepted as evidence
 * (correcting the defect in the rejected `a373ae9:src/tracer/packets.ts`
 * parser, which required only a stored identity string and returned a
 * recomputed value without comparing them).
 */
export const parseEvidenceResult = (
  document: JsonObject,
): Effect.Effect<EvidenceResult, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => parseEvidenceResultFields(document),
      catch: toDocumentError,
    });
    const recomputedIdentity = yield* contentIdentity(evidenceResultIdentityPayload(parsed.fields));
    return yield* Effect.try({
      try: () => finalizeEvidenceResult(parsed, recomputedIdentity),
      catch: toDocumentError,
    });
  });
