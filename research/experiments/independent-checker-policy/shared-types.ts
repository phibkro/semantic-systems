/**
 * Neutral data types shared by `production.ts` and `checker.ts` (declarative
 * shared-policy experiment, plans/active/0003 "Next delegated resolving
 * experiment"). Every declaration here is a `type`/`interface` only: zero
 * runtime instructions, zero decision logic, zero imports. That is also why
 * the region classifier (`classifier.ts`) excludes this whole file from the
 * symmetric size measurement under the "type_only" rule rather than
 * counting it on either side.
 *
 * This file must never gain a runtime (`const`/`function`) export. The
 * classifier does not grant that exemption at file granularity — it
 * discovers `type_only` per DECLARATION (only actual `interface`/`type`
 * nodes), so a runtime export placed here would surface as its own
 * "const"/"function" region requiring a manifest entry like any other file,
 * and — being absent from the manifest — would fail classification instead
 * of silently inheriting this file's exclusion. See
 * `classifier.test.ts`'s "a runtime const in an otherwise type-only file is
 * not exempted by file-level type_only" regression, which mixes an
 * `interface` and a `const` in one fixture file and asserts only the
 * interface is auto-excluded while the const is reported unclassified.
 * Fixed artifact-kind/schema-version/category/diagnostic-kind literals are
 * therefore declarative DATA, not types, and live in `policy-contract.ts`
 * (counted on both sides) — literal string/number types here reference them
 * structurally without importing any value.
 *
 * This is the ONLY file, besides `policy-contract.ts` (the declarative
 * contract) and `canonical.ts` (canonical JSON/hash), that `production.ts`
 * and `checker.ts` are both permitted to import — per the frozen experiment
 * architecture, they must not import each other or a shared evaluator.
 */

export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | ReadonlyArray<JsonValue> | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** A discriminated union: only `passed:true,detail:null` and
 * `passed:false,detail:JsonObject` are representable, mirroring
 * `src/tracer/evidence-result.ts`'s `CaseResult`. */
export type CaseResult =
  | { readonly caseId: string; readonly passed: true; readonly detail: null }
  | { readonly caseId: string; readonly passed: false; readonly detail: JsonObject };

/** The frozen `evidence_result_v1` artifact (design spec 0003). Every field
 * except `identity` participates in the content identity; aggregates
 * (passed/counts/counterexamples) are derived views, never stored here. The
 * fixed literal tags mirror `policy-contract.ts`'s
 * `ARTIFACT_KIND_EVIDENCE_RESULT`/`EVIDENCE_RESULT_SCHEMA_VERSION`/
 * `EVIDENCE_CATEGORY` runtime constants without importing them. */
export interface EvidenceResult {
  readonly identity: string;
  readonly artifactKind: "evidence_result";
  readonly schemaVersion: 1;
  readonly category: "example_test";
  readonly producer: JsonObject;
  readonly recipeIdentity: string;
  readonly theoryIdentity: string;
  readonly realizationIdentity: string;
  readonly obligation: string;
  readonly assumptions: ReadonlyArray<string>;
  readonly caseResults: ReadonlyArray<CaseResult>;
}

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

/** Every packet self-declares the realization it is bound to by declared ID
 * (never array position) plus the exact authored realization content
 * identity, so a consumer can reject reordering/omission/duplication/rebind
 * deterministically instead of trusting positional alignment. */
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

export interface RealizationDocument {
  readonly id: string;
  readonly identity: string;
  readonly targetsTheory: boolean;
  readonly assumptions: ReadonlyArray<string>;
}

export interface TheoryDocument {
  readonly id: string;
  readonly identity: string;
  readonly requiredObligation: string | null;
}

export interface IdentityPair {
  readonly id: string;
  readonly identity: string;
}

export interface ClaimPolicySubject {
  readonly id: string;
  readonly contentIdentity: string;
}

export interface ClaimCandidate {
  readonly realizationId: string;
  readonly realizationIdentity: string;
  readonly targetsTheory: boolean;
  readonly realizationAssumptions: ReadonlyArray<string>;
  readonly evidence: EvidenceResult | null;
  readonly producerDiagnostic: ProducerDiagnostic | null;
  readonly eligible: boolean;
  readonly reasonCodes: ReadonlyArray<string>;
}

/** The frozen `resolution_claim_v1` shape (design spec 0003). Candidate and
 * reason ordering are presentation-only; membership/identities/reasons/
 * status/selection/assumptions are semantic. */
export interface ResolutionClaim {
  readonly artifactKind: "resolution_claim";
  readonly schemaVersion: 1;
  readonly theory: IdentityPair;
  readonly requiredObligation: string | null;
  readonly policy: ClaimPolicySubject;
  readonly candidates: ReadonlyArray<ClaimCandidate>;
  readonly status: "selected" | "rejected";
  readonly selected: IdentityPair | null;
  readonly selectedAssumptions: ReadonlyArray<string>;
}

export type ModelBindingStatus = "not_checked" | "agree" | "disagree";

/** The checker report (design spec 0003 "Checker report"). Violation
 * ordering is presentation-only. `modelBinding` is populated only by the
 * separate canonical-binding adapter, never by the generic checker itself. */
export interface CheckerViolation {
  readonly code: string;
  readonly subject: string;
  readonly details: JsonObject;
}

export interface CheckerReport {
  readonly valid: boolean;
  readonly violations: ReadonlyArray<CheckerViolation>;
  readonly recomputedStatus: "selected" | "rejected" | null;
  readonly recomputedSelected: IdentityPair | null;
  readonly modelBinding: ModelBindingStatus;
}
