import type { Manifest } from "./classifier.ts";

/**
 * The classification manifest: for every `const`/`function` region the
 * classifier structurally discovers in `production.ts`, `checker.ts`,
 * `canonical.ts`, and `policy-contract.ts`, this supplies "included" (with
 * a named responsibility category) or "excluded" (with a named exclusion
 * rule). `shared-types.ts` intentionally has no entry: the classifier
 * verifies it discovers zero `const`/`function` regions there at all (see
 * `classifier.test.ts`).
 *
 * A region the classifier discovers but that has no entry here throws in
 * `classifyClosure` — this manifest cannot silently under-classify; it can
 * only be caught omitting an entry the classifier will demand.
 *
 * Excluded categories:
 *   canonical_json_hash_runtime — shared canonical JSON/SHA-256 runtime
 *     (design spec 0003: "a visible correlated-TCB assumption, not
 *     independent proof of hashing correctness").
 *   type_only / import — applied automatically by SyntaxKind, not listed
 *     here.
 *   nonsemantic_presentation — pure field-renaming JSON emission with no
 *     branching; excluded under the frozen measurement rule's "identical
 *     nonsemantic presentation" carve-out.
 *
 * Included categories mirror design spec 0003's independent-checker
 * responsibility list: structural_parsing, identity_recomputation,
 * candidate_coverage, evidence_aggregate_derivation, policy_adjudication,
 * terminal_selection, assumption_projection, report_assembly (checker-only:
 * the checker's own violation/report construction, the checker-side analog
 * of production's candidate/claim assembly), and contract (the shared
 * declarative policy contract, counted on both sides per plans/active/0003:
 * "count the shared declarative semantic contract on both sides").
 */

const included = (category: string) => ({ classification: "included" as const, category });
const excluded = (category: string) => ({ classification: "excluded" as const, category });

export const REGION_MANIFEST: Manifest = {
  "canonical.ts": {
    canonicalize: excluded("canonical_json_hash_runtime"),
    canonicalJson: excluded("canonical_json_hash_runtime"),
    contentIdentity: excluded("canonical_json_hash_runtime"),
    jsonEqual: excluded("canonical_json_hash_runtime"),
  },

  "policy-contract.ts": {
    ARTIFACT_KIND_EVIDENCE_RESULT: included("contract"),
    EVIDENCE_RESULT_SCHEMA_VERSION: included("contract"),
    EVIDENCE_CATEGORY: included("contract"),
    ARTIFACT_KIND_RESOLUTION_CLAIM: included("contract"),
    RESOLUTION_CLAIM_SCHEMA_VERSION: included("contract"),
    PRODUCER_DIAGNOSTIC_KINDS: included("contract"),
    AMBIGUITY_POLICY: included("contract"),
    REASON_CODES: included("contract"),
    PRECONDITION_RULES: included("contract"),
    DIAGNOSTIC_REASON: included("contract"),
    REQUIREMENT_RULES: included("contract"),
    TERMINAL_RULES: included("contract"),
  },

  "shared-types.ts": {},

  "production.ts": {
    fail: included("structural_parsing"),
    requireObject: included("structural_parsing"),
    requireOwn: included("structural_parsing"),
    requireString: included("structural_parsing"),
    requireNonEmptyString: included("structural_parsing"),
    requireBoolean: included("structural_parsing"),
    requireArray: included("structural_parsing"),
    requireStringArray: included("structural_parsing"),
    theoryIdentityPayload: included("identity_recomputation"),
    requiredObligationOf: included("structural_parsing"),
    normalizeTheory: included("identity_recomputation"),
    REALIZATION_DISPLAY_FIELDS: included("identity_recomputation"),
    realizationIdentityPayload: included("identity_recomputation"),
    normalizeRealization: included("identity_recomputation"),
    parseRequirement: included("structural_parsing"),
    normalizePolicy: included("structural_parsing"),
    evidenceIdentityPayload: included("identity_recomputation"),
    caseResultToJson: included("identity_recomputation"),
    parseCaseResult: included("structural_parsing"),
    parseEvidenceResult: included("structural_parsing"),
    parseProducerDiagnostic: included("structural_parsing"),
    parseOutcomeEnvelope: included("structural_parsing"),
    bindOutcomes: included("candidate_coverage"),
    evidencePassed: included("evidence_aggregate_derivation"),
    evaluatePrecondition: included("policy_adjudication"),
    evaluateRequirement: included("policy_adjudication"),
    evaluateCandidate: included("policy_adjudication"),
    sortedUniqueStrings: included("assumption_projection"),
    adjudicate: included("terminal_selection"),
    evidenceToJson: excluded("nonsemantic_presentation"),
    candidateToJson: excluded("nonsemantic_presentation"),
    claimToJson: excluded("nonsemantic_presentation"),
  },

  "checker.ts": {
    violate: included("report_assembly"),
    abort: included("structural_parsing"),
    expectObject: included("structural_parsing"),
    expectOwn: included("structural_parsing"),
    expectNoForeignKeys: included("structural_parsing"),
    expectString: included("structural_parsing"),
    expectNonEmptyString: included("structural_parsing"),
    expectBoolean: included("structural_parsing"),
    expectArray: included("structural_parsing"),
    expectObjectArray: included("structural_parsing"),
    expectStringArray: included("structural_parsing"),
    recomputeTheory: included("identity_recomputation"),
    REALIZATION_DISPLAY_KEYS: included("identity_recomputation"),
    recomputeRealization: included("identity_recomputation"),
    recomputeRequirement: included("structural_parsing"),
    recomputePolicy: included("structural_parsing"),
    EVIDENCE_ALLOWED_KEYS: included("structural_parsing"),
    CASE_RESULT_ALLOWED_KEYS: included("structural_parsing"),
    evidenceIdentityPayload: included("identity_recomputation"),
    caseResultJson: included("identity_recomputation"),
    parseCaseResult: included("structural_parsing"),
    evidencePassed: included("evidence_aggregate_derivation"),
    parseEvidenceResult: included("structural_parsing"),
    parseProducerDiagnostic: included("structural_parsing"),
    parseOutcomeEnvelope: included("structural_parsing"),
    CLAIM_ALLOWED_KEYS: included("structural_parsing"),
    IDENTITY_PAIR_KEYS: included("structural_parsing"),
    POLICY_SUBJECT_KEYS: included("structural_parsing"),
    CANDIDATE_ALLOWED_KEYS: included("structural_parsing"),
    parseIdentityPair: included("structural_parsing"),
    parseClaimCandidate: included("structural_parsing"),
    parseClaim: included("structural_parsing"),
    checkPrecondition: included("policy_adjudication"),
    checkRequirement: included("policy_adjudication"),
    recomputeEligibility: included("policy_adjudication"),
    sortedUniqueStrings: included("assumption_projection"),
    sameStringSet: included("policy_adjudication"),
    sameStringArray: included("assumption_projection"),
    parseAuthoredInput: included("structural_parsing"),
    INVALID_REPORT: included("report_assembly"),
    compare: included("report_assembly"),
  },
};
