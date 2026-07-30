import type { JsonObject } from "./json.ts";

/**
 * Neutral evidence-result and producer-outcome data contracts (design spec
 * 0003 slices 2-3). This module holds only plain data shapes and pure
 * serialization/aggregation helpers over them — no domain semantics, no
 * conformance execution, no operation/adapter resolution, and no I/O. The
 * resolver imports runtime values and types only from here, never from
 * `evidence.ts`, which owns producer execution and therefore transitively
 * reaches domain/operations; see `resolver.ts` and `evidence.ts`.
 */

export const EVIDENCE_CATEGORY = "example_test";

export interface CaseResult {
  readonly caseId: string;
  readonly passed: boolean;
  readonly detail: JsonObject | null;
}

export interface EvidenceResult {
  readonly category: string;
  readonly obligation: string;
  readonly producer: JsonObject;
  readonly theoryIdentity: string;
  readonly realizationIdentity: string;
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

export const evidenceToJson = (evidence: EvidenceResult): JsonObject => ({
  category: evidence.category,
  obligation: evidence.obligation,
  producer: evidence.producer,
  theory_identity: evidence.theoryIdentity,
  realization_identity: evidence.realizationIdentity,
  assumptions: evidence.assumptions,
  passed: evidencePassed(evidence),
  total_cases: evidenceTotalCases(evidence),
  passed_cases: evidencePassedCases(evidence),
  case_results: evidence.caseResults.map(caseResultToJson),
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
