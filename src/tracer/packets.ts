import { Effect, type Crypto } from "effect";
import { contentIdentity } from "./canonical.ts";
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

export const EVIDENCE_RESULT_KIND = "evidence_result";
export const PRODUCER_DIAGNOSTIC_KIND = "producer_diagnostic";
export const PACKET_SCHEMA_VERSION = 1;

export interface CaseResult {
  readonly caseId: string;
  readonly passed: boolean;
  readonly detail: JsonObject | null;
}

export interface EvidenceResult {
  readonly artifactKind: typeof EVIDENCE_RESULT_KIND;
  readonly schemaVersion: typeof PACKET_SCHEMA_VERSION;
  readonly identity: string;
  readonly category: string;
  readonly obligation: string;
  readonly producer: JsonObject;
  readonly recipeIdentity: string;
  readonly theoryIdentity: string;
  readonly realizationIdentity: string;
  readonly assumptions: ReadonlyArray<string>;
  readonly caseResults: ReadonlyArray<CaseResult>;
}

export interface ProducerDiagnostic {
  readonly artifactKind: typeof PRODUCER_DIAGNOSTIC_KIND;
  readonly schemaVersion: typeof PACKET_SCHEMA_VERSION;
  readonly theoryIdentity: string;
  readonly realizationIdentity: string;
  readonly reasonCode: string;
  readonly detail: JsonObject | null;
}

export type ProducerOutcome = EvidenceResult | ProducerDiagnostic;
export type EvidenceResultInput = Omit<EvidenceResult, "identity">;

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

const evidenceIdentityPayload = (evidence: EvidenceResultInput | EvidenceResult): JsonObject => ({
  artifact_kind: evidence.artifactKind,
  schema_version: evidence.schemaVersion,
  category: evidence.category,
  obligation: evidence.obligation,
  producer: evidence.producer,
  recipe_identity: evidence.recipeIdentity,
  theory_identity: evidence.theoryIdentity,
  realization_identity: evidence.realizationIdentity,
  assumptions: evidence.assumptions,
  case_results: evidence.caseResults.map(caseResultToJson),
});

export const finalizeEvidenceResult = (
  input: EvidenceResultInput,
): Effect.Effect<EvidenceResult, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const identity = yield* contentIdentity(evidenceIdentityPayload(input));
    return { ...input, identity };
  });

export const evidenceToJson = (evidence: EvidenceResult): JsonObject => ({
  ...evidenceIdentityPayload(evidence),
  identity: evidence.identity,
  passed: evidencePassed(evidence),
  total_cases: evidenceTotalCases(evidence),
  passed_cases: evidencePassedCases(evidence),
  counterexamples: evidenceCounterexamples(evidence),
});

export const diagnosticToJson = (diagnostic: ProducerDiagnostic): JsonObject => ({
  artifact_kind: diagnostic.artifactKind,
  schema_version: diagnostic.schemaVersion,
  theory_identity: diagnostic.theoryIdentity,
  realization_identity: diagnostic.realizationIdentity,
  reason_code: diagnostic.reasonCode,
  detail: diagnostic.detail,
});

export const producerOutcomeToJson = (outcome: ProducerOutcome): JsonObject =>
  outcome.artifactKind === EVIDENCE_RESULT_KIND
    ? evidenceToJson(outcome)
    : diagnosticToJson(outcome);

const requireBoolean = (value: JsonValue, context: string): boolean => {
  if (typeof value !== "boolean") {
    throw new DocumentError({ message: `${context} must be a boolean` });
  }
  return value;
};

const parseCaseResult = (document: JsonObject, context: string): CaseResult => {
  const detail = document.detail;
  return {
    caseId: requireString(requireKey(document, "case_id", context), `${context}.case_id`),
    passed: requireBoolean(requireKey(document, "passed", context), `${context}.passed`),
    detail:
      detail === undefined || detail === null ? null : requireObject(detail, `${context}.detail`),
  };
};

export const parseEvidenceResult = (
  document: JsonObject,
  context = "evidence_result",
): Effect.Effect<EvidenceResult, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    if (document.artifact_kind !== EVIDENCE_RESULT_KIND) {
      return yield* new DocumentError({
        message: `${context}.artifact_kind must be '${EVIDENCE_RESULT_KIND}'; a recipe is not evidence`,
      });
    }
    if (
      requireInteger(
        requireKey(document, "schema_version", context),
        `${context}.schema_version`,
      ) !== PACKET_SCHEMA_VERSION
    ) {
      return yield* new DocumentError({
        message: `${context}.schema_version must be ${PACKET_SCHEMA_VERSION}`,
      });
    }
    const input: EvidenceResultInput = {
      artifactKind: EVIDENCE_RESULT_KIND,
      schemaVersion: PACKET_SCHEMA_VERSION,
      category: requireString(requireKey(document, "category", context), `${context}.category`),
      obligation: requireString(
        requireKey(document, "obligation", context),
        `${context}.obligation`,
      ),
      producer: requireObject(requireKey(document, "producer", context), `${context}.producer`),
      recipeIdentity: requireString(
        requireKey(document, "recipe_identity", context),
        `${context}.recipe_identity`,
      ),
      theoryIdentity: requireString(
        requireKey(document, "theory_identity", context),
        `${context}.theory_identity`,
      ),
      realizationIdentity: requireString(
        requireKey(document, "realization_identity", context),
        `${context}.realization_identity`,
      ),
      assumptions: requireStringList(document.assumptions ?? [], `${context}.assumptions`),
      caseResults: requireObjectList(
        requireKey(document, "case_results", context),
        `${context}.case_results`,
      ).map((item, index) => parseCaseResult(item, `${context}.case_results[${index}]`)),
    };
    const recomputed = yield* finalizeEvidenceResult(input);
    requireString(requireKey(document, "identity", context), `${context}.identity`);
    return recomputed;
  });

export const parseProducerDiagnostic = (
  document: JsonObject,
  context = "producer_diagnostic",
): ProducerDiagnostic => {
  if (document.artifact_kind !== PRODUCER_DIAGNOSTIC_KIND) {
    throw new DocumentError({
      message: `${context}.artifact_kind must be '${PRODUCER_DIAGNOSTIC_KIND}'`,
    });
  }
  if (
    requireInteger(requireKey(document, "schema_version", context), `${context}.schema_version`) !==
    PACKET_SCHEMA_VERSION
  ) {
    throw new DocumentError({
      message: `${context}.schema_version must be ${PACKET_SCHEMA_VERSION}`,
    });
  }
  const detail = document.detail;
  return {
    artifactKind: PRODUCER_DIAGNOSTIC_KIND,
    schemaVersion: PACKET_SCHEMA_VERSION,
    theoryIdentity: requireString(
      requireKey(document, "theory_identity", context),
      `${context}.theory_identity`,
    ),
    realizationIdentity: requireString(
      requireKey(document, "realization_identity", context),
      `${context}.realization_identity`,
    ),
    reasonCode: requireString(
      requireKey(document, "reason_code", context),
      `${context}.reason_code`,
    ),
    detail:
      detail === undefined || detail === null ? null : requireObject(detail, `${context}.detail`),
  };
};

export const parseProducerOutcome = (
  value: JsonValue,
  context: string,
): Effect.Effect<ProducerOutcome, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const document = yield* Effect.try({
      try: () => requireObject(value, context),
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: `${context} is malformed`, cause }),
    });
    return document.artifact_kind === EVIDENCE_RESULT_KIND
      ? yield* parseEvidenceResult(document, context)
      : yield* Effect.try({
          try: () => parseProducerDiagnostic(document, context),
          catch: (cause) =>
            cause instanceof DocumentError
              ? cause
              : new DocumentError({ message: `${context} is malformed`, cause }),
        });
  });
