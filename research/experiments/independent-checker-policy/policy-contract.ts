import type { ProducerDiagnosticKind } from "./shared-types.ts";

/**
 * The declarative shared-policy contract (uncertainty 0004, plans/active/0003
 * "Next delegated resolving experiment: declarative shared policy"). Every
 * export below is bounded typed DATA — string/array/record literals — with
 * no evaluator function. `production.ts` and `checker.ts` each write their
 * own small interpreter that walks these tables; the tables themselves are
 * the only thing the two sides share (besides `shared-types.ts` and
 * `canonical.ts`). The classifier counts this file's data regions on BOTH
 * sides symmetrically (plans/active/0003: "count the shared declarative
 * semantic contract on both sides"), so inflating it does not game the
 * ratio.
 *
 * The table shapes are adapted from — not copy-pasted out of —
 * `src/tracer/resolver.ts`'s `evaluateCandidate`/`resolve`: same branch
 * structure (exclusive preconditions, then accumulating requirement checks,
 * then a terminal rule over the eligible count), re-expressed as data so two
 * independent interpreters can walk it without duplicating the branches in
 * source.
 */

/**
 * Fixed artifact-kind/schema-version/category vocabulary for the two frozen
 * v1 artifacts. These are declarative protocol tags, not adjudication
 * logic, so they live here (counted symmetrically on both sides) rather
 * than in `shared-types.ts`, which stays strictly `type`/`interface`-only —
 * see that file's header and `classifier.test.ts`'s mixed-file regression.
 */
export const ARTIFACT_KIND_EVIDENCE_RESULT = "evidence_result";
export const EVIDENCE_RESULT_SCHEMA_VERSION = 1;
export const EVIDENCE_CATEGORY = "example_test";
export const ARTIFACT_KIND_RESOLUTION_CLAIM = "resolution_claim";
export const RESOLUTION_CLAIM_SCHEMA_VERSION = 1;

export const PRODUCER_DIAGNOSTIC_KINDS: ReadonlyArray<ProducerDiagnosticKind> = [
  "not_targeted",
  "obligation_unsupported",
  "missing_evidence",
  "ambiguous_evidence",
  "stale_evidence_recipe",
  "evidence_obligation_mismatch",
  "unbound_operation",
];

export const AMBIGUITY_POLICY = "reject";
export type AmbiguityPolicy = typeof AMBIGUITY_POLICY;

export interface ObligationRequirement {
  readonly acceptedCategories: ReadonlyArray<string>;
  readonly allowAssumptions: boolean;
}

export const REASON_CODES = [
  "missing_evidence",
  "evidence_category_not_accepted",
  "assumptions_not_allowed",
  "conformance_failed",
  "obligation_not_governed",
  "ambiguous_candidates",
  "no_eligible_candidates",
  "theory_mismatch",
  "ambiguous_evidence",
  "evidence_obligation_mismatch",
  "required_obligation_set_unsupported",
  "stale_evidence_recipe",
  "unbound_operation",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * Exclusive short-circuit preconditions, evaluated in order: the first one
 * that fails supplies the candidate's sole reason and stops evaluation
 * (mirrors `evaluateCandidate`'s early `reject(...)` returns). `reason: null`
 * on `"producer_ok"` means the reason is not fixed data — it is looked up in
 * `DIAGNOSTIC_REASON` by the producer diagnostic's own `kind` when the
 * precondition fails.
 */
export type PreconditionCheck =
  | "targets_theory"
  | "obligation_declared"
  | "producer_ok"
  | "evidence_obligation_match";

export interface PreconditionRule {
  readonly check: PreconditionCheck;
  readonly reason: ReasonCode | null;
}

export const PRECONDITION_RULES: ReadonlyArray<PreconditionRule> = [
  { check: "targets_theory", reason: "theory_mismatch" },
  { check: "obligation_declared", reason: "required_obligation_set_unsupported" },
  { check: "producer_ok", reason: null },
  { check: "evidence_obligation_match", reason: "evidence_obligation_mismatch" },
];

/** A producer diagnostic's `kind` supplies the reason when `"producer_ok"`
 * fails; a plain lookup table, not an evaluator. */
export const DIAGNOSTIC_REASON: Readonly<Record<ProducerDiagnosticKind, ReasonCode>> = {
  not_targeted: "theory_mismatch",
  obligation_unsupported: "required_obligation_set_unsupported",
  missing_evidence: "missing_evidence",
  ambiguous_evidence: "ambiguous_evidence",
  stale_evidence_recipe: "stale_evidence_recipe",
  evidence_obligation_mismatch: "evidence_obligation_mismatch",
  unbound_operation: "unbound_operation",
};

/**
 * Accumulating requirement checks, evaluated only once every precondition
 * above has passed. `dependsOn` names another check in this same table that
 * must itself have PASSED for this rule to be evaluated at all — encoding
 * `evaluateCandidate`'s `if (requirement === undefined) { ...only obligation
 * check... } else { ...category/assumptions checks... }` as a data
 * dependency instead of nested control flow. Every rule in this table may
 * fire independently (all applicable reasons accumulate; the frozen
 * contract requires a stable, complete reason set, never a first-match
 * short circuit here).
 */
export type RequirementCheck =
  | "requirement_governed"
  | "category_accepted"
  | "assumptions_allowed"
  | "conformance_passed";

export interface RequirementRule {
  readonly check: RequirementCheck;
  readonly reason: ReasonCode;
  readonly dependsOn: RequirementCheck | null;
}

export const REQUIREMENT_RULES: ReadonlyArray<RequirementRule> = [
  { check: "requirement_governed", reason: "obligation_not_governed", dependsOn: null },
  {
    check: "category_accepted",
    reason: "evidence_category_not_accepted",
    dependsOn: "requirement_governed",
  },
  {
    check: "assumptions_allowed",
    reason: "assumptions_not_allowed",
    dependsOn: "requirement_governed",
  },
  { check: "conformance_passed", reason: "conformance_failed", dependsOn: null },
];

export type EligibleCount = "zero" | "one" | "many";

export interface TerminalRule {
  readonly eligibleCount: EligibleCount;
  readonly ambiguityPolicy: AmbiguityPolicy;
  readonly status: "selected" | "rejected";
  readonly reason: ReasonCode | null;
}

/** The zero/one/multiple-candidate terminal rule (design spec 0003 falsifiable
 * claim, item 5), as data keyed by eligible-candidate count and the policy's
 * declared ambiguity strategy. `reason: null` on the `"one"` row means a
 * selected claim carries no rejection reason. */
export const TERMINAL_RULES: ReadonlyArray<TerminalRule> = [
  {
    eligibleCount: "zero",
    ambiguityPolicy: AMBIGUITY_POLICY,
    status: "rejected",
    reason: "no_eligible_candidates",
  },
  { eligibleCount: "one", ambiguityPolicy: AMBIGUITY_POLICY, status: "selected", reason: null },
  {
    eligibleCount: "many",
    ambiguityPolicy: AMBIGUITY_POLICY,
    status: "rejected",
    reason: "ambiguous_candidates",
  },
];
