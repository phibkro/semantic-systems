import { contentIdentity, type HashFn } from "./canonical.ts";
import {
  ARTIFACT_KIND_EVIDENCE_RESULT,
  ARTIFACT_KIND_RESOLUTION_CLAIM,
  DIAGNOSTIC_REASON,
  EVIDENCE_CATEGORY,
  EVIDENCE_RESULT_SCHEMA_VERSION,
  PRECONDITION_RULES,
  PRODUCER_DIAGNOSTIC_KINDS,
  REQUIREMENT_RULES,
  RESOLUTION_CLAIM_SCHEMA_VERSION,
  TERMINAL_RULES,
  type ObligationRequirement,
  type PreconditionCheck,
  type ReasonCode,
  type RequirementCheck,
} from "./policy-contract.ts";
import type {
  CaseResult,
  CheckerReport,
  CheckerViolation,
  EvidenceResult,
  IdentityPair,
  JsonObject,
  JsonValue,
  ProducerDiagnostic,
  ProducerDiagnosticKind,
  ProducerOutcome,
} from "./shared-types.ts";

/**
 * The checker comparator half of the declarative shared-policy experiment.
 * Independently authored from `production.ts`: separate structural JSON
 * helpers, a separate identity-recomputation implementation, a separate
 * interpreter over `policy-contract.ts`'s rule tables, and a claim-parsing
 * path production never needs (production builds a claim; it never parses
 * one back from untrusted JSON). It never imports `production.ts` or
 * `canonical-binding-adapter.ts`, and it has no execution, filesystem,
 * network, recipe-source, or canonical-model authority (`node:crypto` via
 * `canonical.ts` is the sole, explicitly-carved-out shared dependency).
 *
 * Error messages use string concatenation, never interpolated template
 * literals — see `production.ts`'s header note and
 * `classifier.test.ts`'s template-literal negative control.
 */

interface Violations {
  readonly items: Array<CheckerViolation>;
}

const violate = (
  violations: Violations,
  code: string,
  subject: string,
  details: JsonObject,
): void => {
  violations.items.push({ code, subject, details });
};

const abort = (message: string): never => {
  throw new Error("checker: " + message);
};

const expectObject = (value: JsonValue, context: string): JsonObject => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return abort(context + " must be an object");
  return value as JsonObject;
};

const expectOwn = (document: JsonObject, key: string, context: string): JsonValue => {
  if (!Object.hasOwn(document, key))
    return abort(context + " is missing required key '" + key + "'");
  return document[key]!;
};

const expectNoForeignKeys = (
  document: JsonObject,
  allowed: ReadonlySet<string>,
  context: string,
): void => {
  for (const key of Object.keys(document)) {
    if (!allowed.has(key)) abort(context + " contains an unknown key '" + key + "'");
  }
};

const expectString = (value: JsonValue, context: string): string => {
  if (typeof value !== "string") return abort(context + " must be a string");
  return value;
};

const expectNonEmptyString = (value: JsonValue, context: string): string => {
  const text = expectString(value, context);
  if (text.length === 0) return abort(context + " must be a nonempty string");
  return text;
};

const expectBoolean = (value: JsonValue, context: string): boolean => {
  if (typeof value !== "boolean") return abort(context + " must be a boolean");
  return value;
};

const expectArray = (value: JsonValue, context: string): ReadonlyArray<JsonValue> => {
  if (!Array.isArray(value)) return abort(context + " must be a list");
  return value;
};

const expectObjectArray = (value: JsonValue, context: string): ReadonlyArray<JsonObject> =>
  expectArray(value, context).map((item, index) => expectObject(item, context + "[" + index + "]"));

const expectStringArray = (value: JsonValue, context: string): ReadonlyArray<string> =>
  expectArray(value, context).map((item, index) => expectString(item, context + "[" + index + "]"));

// --- Authored identity recomputation (independent from production.ts) ---

interface RecomputedTheory {
  readonly id: string;
  readonly identity: string;
  readonly requiredObligation: string | null;
}

const recomputeTheory = (document: JsonObject, hash: HashFn): RecomputedTheory => {
  const id = expectNonEmptyString(expectOwn(document, "id", "theory"), "theory.id");
  const payload = Object.fromEntries(Object.entries(document).filter(([key]) => key !== "id"));
  const identity = contentIdentity(hash, payload);
  const rawObligations = expectArray(
    expectOwn(document, "obligations", "theory"),
    "theory.obligations",
  );
  let requiredObligation: string | null = null;
  if (rawObligations.length === 1) {
    const first = expectObject(rawObligations[0]!, "theory.obligations[0]");
    const obligationId = expectOwn(first, "id", "theory.obligations[0]");
    requiredObligation = typeof obligationId === "string" ? obligationId : null;
  }
  return { id, identity, requiredObligation };
};

interface RecomputedRealization {
  readonly id: string;
  readonly identity: string;
  readonly targetsTheory: boolean;
  readonly assumptions: ReadonlyArray<string>;
}

const REALIZATION_DISPLAY_KEYS = new Set(["id", "name", "theory"]);

const recomputeRealization = (
  document: JsonObject,
  theoryId: string,
  theoryIdentity: string,
  hash: HashFn,
): RecomputedRealization => {
  const id = expectNonEmptyString(expectOwn(document, "id", "realization"), "realization.id");
  const declaredTheory = expectString(
    expectOwn(document, "theory", "realization"),
    "realization.theory",
  );
  const payload: JsonObject = {
    theory_identity: theoryIdentity,
    ...Object.fromEntries(
      Object.entries(document).filter(([key]) => !REALIZATION_DISPLAY_KEYS.has(key)),
    ),
  };
  const identity = contentIdentity(hash, payload);
  const assumptions = expectStringArray(document.assumptions ?? [], "realization.assumptions");
  return { id, identity, targetsTheory: declaredTheory === theoryId, assumptions };
};

interface RecomputedPolicy {
  readonly id: string;
  readonly requirements: ReadonlyMap<string, ObligationRequirement>;
  readonly contentIdentity: string;
  readonly ambiguity: string;
}

const recomputeRequirement = (value: JsonValue, context: string): ObligationRequirement => {
  const object = expectObject(value, context);
  const acceptedCategories = expectStringArray(
    expectOwn(object, "accepted_categories", context),
    context + ".accepted_categories",
  );
  const allowAssumptions = expectBoolean(
    expectOwn(object, "allow_assumptions", context),
    context + ".allow_assumptions",
  );
  return { acceptedCategories, allowAssumptions };
};

const recomputePolicy = (document: JsonObject, hash: HashFn): RecomputedPolicy => {
  const id = expectNonEmptyString(expectOwn(document, "id", "policy"), "policy.id");
  const ambiguity = expectString(expectOwn(document, "ambiguity", "policy"), "policy.ambiguity");
  const requirementsObject = expectObject(
    expectOwn(document, "requirements", "policy"),
    "policy.requirements",
  );
  const requirements = new Map<string, ObligationRequirement>();
  for (const key of Object.keys(requirementsObject)) {
    requirements.set(
      key,
      recomputeRequirement(requirementsObject[key]!, "policy.requirements." + key),
    );
  }
  return { id, requirements, contentIdentity: contentIdentity(hash, document), ambiguity };
};

// --- Independent evidence-packet parsing (structural parsing) ---

const EVIDENCE_ALLOWED_KEYS = new Set([
  "artifact_kind",
  "schema_version",
  "identity",
  "category",
  "producer",
  "recipe_identity",
  "theory_identity",
  "realization_identity",
  "obligation",
  "assumptions",
  "case_results",
  "passed",
  "total_cases",
  "passed_cases",
  "counterexamples",
]);
const CASE_RESULT_ALLOWED_KEYS = new Set(["case_id", "passed", "detail"]);

const evidenceIdentityPayload = (evidence: Omit<EvidenceResult, "identity">): JsonObject => ({
  artifact_kind: evidence.artifactKind,
  schema_version: evidence.schemaVersion,
  category: evidence.category,
  producer: evidence.producer,
  recipe_identity: evidence.recipeIdentity,
  theory_identity: evidence.theoryIdentity,
  realization_identity: evidence.realizationIdentity,
  obligation: evidence.obligation,
  assumptions: evidence.assumptions,
  case_results: evidence.caseResults.map(caseResultJson),
});

function caseResultJson(result: CaseResult): JsonObject {
  return { case_id: result.caseId, passed: result.passed, detail: result.detail };
}

const parseCaseResult = (value: JsonValue, context: string): CaseResult => {
  const object = expectObject(value, context);
  expectNoForeignKeys(object, CASE_RESULT_ALLOWED_KEYS, context);
  const caseId = expectNonEmptyString(expectOwn(object, "case_id", context), context + ".case_id");
  const passed = expectBoolean(expectOwn(object, "passed", context), context + ".passed");
  const rawDetail = expectOwn(object, "detail", context);
  if (passed) {
    if (rawDetail !== null) return abort(context + ".detail must be null when passed is true");
    return { caseId, passed: true, detail: null };
  }
  if (rawDetail === null)
    return abort(context + ".detail must be a non-null object when passed is false");
  return { caseId, passed: false, detail: expectObject(rawDetail, context + ".detail") };
};

const evidencePassed = (results: ReadonlyArray<CaseResult>): boolean =>
  results.length > 0 && results.every((item) => item.passed);

const parseEvidenceResult = (document: JsonObject, hash: HashFn): EvidenceResult => {
  expectNoForeignKeys(document, EVIDENCE_ALLOWED_KEYS, "evidence_result");
  const artifactKind = expectString(
    expectOwn(document, "artifact_kind", "evidence_result"),
    "artifact_kind",
  );
  if (artifactKind !== ARTIFACT_KIND_EVIDENCE_RESULT)
    return abort("unexpected artifact_kind '" + artifactKind + "'");
  if (expectOwn(document, "schema_version", "evidence_result") !== EVIDENCE_RESULT_SCHEMA_VERSION) {
    return abort("unexpected schema_version");
  }
  const category = expectString(expectOwn(document, "category", "evidence_result"), "category");
  if (category !== EVIDENCE_CATEGORY) return abort("unexpected category '" + category + "'");
  const storedIdentity = expectNonEmptyString(
    expectOwn(document, "identity", "evidence_result"),
    "identity",
  );
  const producer = expectObject(expectOwn(document, "producer", "evidence_result"), "producer");
  const recipeIdentity = expectNonEmptyString(
    expectOwn(document, "recipe_identity", "evidence_result"),
    "recipe_identity",
  );
  const theoryIdentity = expectNonEmptyString(
    expectOwn(document, "theory_identity", "evidence_result"),
    "theory_identity",
  );
  const realizationIdentity = expectNonEmptyString(
    expectOwn(document, "realization_identity", "evidence_result"),
    "realization_identity",
  );
  const obligation = expectNonEmptyString(
    expectOwn(document, "obligation", "evidence_result"),
    "obligation",
  );
  const assumptions = expectStringArray(
    expectOwn(document, "assumptions", "evidence_result"),
    "assumptions",
  );
  const rawCases = expectArray(
    expectOwn(document, "case_results", "evidence_result"),
    "case_results",
  );
  if (rawCases.length === 0) return abort("case_results must not be empty");
  const caseResults = rawCases.map((item, index) =>
    parseCaseResult(item, "case_results[" + index + "]"),
  );
  const seen = new Set<string>();
  for (const item of caseResults) {
    if (seen.has(item.caseId)) return abort("duplicate case ID '" + item.caseId + "'");
    seen.add(item.caseId);
  }
  const withoutIdentity: Omit<EvidenceResult, "identity"> = {
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
  };
  const recomputedIdentity = contentIdentity(hash, evidenceIdentityPayload(withoutIdentity));
  if (recomputedIdentity !== storedIdentity)
    return abort("evidence_result.identity does not match its recomputed content");
  const recomputedPassed = evidencePassed(caseResults);
  const recomputedTotal = caseResults.length;
  const recomputedPassedCases = caseResults.filter((item) => item.passed).length;
  if (expectOwn(document, "passed", "evidence_result") !== recomputedPassed)
    return abort("evidence_result.passed mismatch");
  if (expectOwn(document, "total_cases", "evidence_result") !== recomputedTotal) {
    return abort("evidence_result.total_cases mismatch");
  }
  if (expectOwn(document, "passed_cases", "evidence_result") !== recomputedPassedCases) {
    return abort("evidence_result.passed_cases mismatch");
  }
  return { identity: recomputedIdentity, ...withoutIdentity };
};

const parseProducerDiagnostic = (value: JsonValue, context: string): ProducerDiagnostic => {
  const object = expectObject(value, context);
  const kind = expectNonEmptyString(expectOwn(object, "kind", context), context + ".kind");
  if (!PRODUCER_DIAGNOSTIC_KINDS.includes(kind as ProducerDiagnosticKind)) {
    return abort(context + ".kind is not a known producer diagnostic kind");
  }
  const message = expectNonEmptyString(expectOwn(object, "message", context), context + ".message");
  return { kind: kind as ProducerDiagnosticKind, message };
};

const parseOutcomeEnvelope = (document: JsonObject, hash: HashFn): ProducerOutcome => {
  const ok = expectBoolean(expectOwn(document, "ok", "producer_outcome"), "ok");
  const realizationId = expectNonEmptyString(
    expectOwn(document, "realization_id", "producer_outcome"),
    "realization_id",
  );
  const realizationIdentity = expectNonEmptyString(
    expectOwn(document, "realization_identity", "producer_outcome"),
    "realization_identity",
  );
  if (ok) {
    const result = parseEvidenceResult(
      expectObject(
        expectOwn(document, "evidence", "producer_outcome"),
        "producer_outcome.evidence",
      ),
      hash,
    );
    return { ok: true, realizationId, realizationIdentity, result };
  }
  const diagnostic = parseProducerDiagnostic(
    expectOwn(document, "diagnostic", "producer_outcome"),
    "producer_outcome.diagnostic",
  );
  return { ok: false, realizationId, realizationIdentity, diagnostic };
};

// --- Independent claim-envelope parsing (production never parses its own output) ---

const CLAIM_ALLOWED_KEYS = new Set([
  "artifact_kind",
  "schema_version",
  "theory",
  "required_obligation",
  "policy",
  "candidates",
  "status",
  "selected",
  "selected_assumptions",
]);
const IDENTITY_PAIR_KEYS = new Set(["id", "identity"]);
const POLICY_SUBJECT_KEYS = new Set(["id", "content_identity"]);
const CANDIDATE_ALLOWED_KEYS = new Set([
  "realization",
  "targets_theory",
  "realization_assumptions",
  "evidence",
  "producer_diagnostic",
  "eligible",
  "reason_codes",
]);

interface ParsedIdentityPair {
  readonly id: string;
  readonly identity: string;
}

const parseIdentityPair = (value: JsonValue, context: string): ParsedIdentityPair => {
  const object = expectObject(value, context);
  expectNoForeignKeys(object, IDENTITY_PAIR_KEYS, context);
  return {
    id: expectNonEmptyString(expectOwn(object, "id", context), context + ".id"),
    identity: expectNonEmptyString(expectOwn(object, "identity", context), context + ".identity"),
  };
};

interface ParsedClaimCandidate {
  readonly realizationId: string;
  readonly realizationIdentity: string;
  readonly targetsTheory: boolean;
  readonly realizationAssumptions: ReadonlyArray<string>;
  readonly evidence: EvidenceResult | null;
  readonly producerDiagnostic: ProducerDiagnostic | null;
  readonly eligible: boolean;
  readonly reasonCodes: ReadonlyArray<string>;
}

const parseClaimCandidate = (
  raw: JsonObject,
  context: string,
  hash: HashFn,
): ParsedClaimCandidate => {
  expectNoForeignKeys(raw, CANDIDATE_ALLOWED_KEYS, context);
  const realization = parseIdentityPair(
    expectOwn(raw, "realization", context),
    context + ".realization",
  );
  const targetsTheory = expectBoolean(
    expectOwn(raw, "targets_theory", context),
    context + ".targets_theory",
  );
  const realizationAssumptions = expectStringArray(
    expectOwn(raw, "realization_assumptions", context),
    context + ".realization_assumptions",
  );
  const rawEvidence = expectOwn(raw, "evidence", context);
  const evidence =
    rawEvidence === null
      ? null
      : parseEvidenceResult(expectObject(rawEvidence, context + ".evidence"), hash);
  const rawDiagnostic = expectOwn(raw, "producer_diagnostic", context);
  const producerDiagnostic =
    rawDiagnostic === null
      ? null
      : parseProducerDiagnostic(rawDiagnostic, context + ".producer_diagnostic");
  const eligible = expectBoolean(expectOwn(raw, "eligible", context), context + ".eligible");
  const reasonCodes = expectStringArray(
    expectOwn(raw, "reason_codes", context),
    context + ".reason_codes",
  );
  return {
    realizationId: realization.id,
    realizationIdentity: realization.identity,
    targetsTheory,
    realizationAssumptions,
    evidence,
    producerDiagnostic,
    eligible,
    reasonCodes,
  };
};

interface ParsedClaim {
  readonly theory: ParsedIdentityPair;
  readonly requiredObligation: string | null;
  readonly policyId: string;
  readonly policyContentIdentity: string;
  readonly candidates: ReadonlyArray<ParsedClaimCandidate>;
  readonly status: "selected" | "rejected";
  readonly selected: ParsedIdentityPair | null;
  readonly selectedAssumptions: ReadonlyArray<string>;
}

const parseClaim = (document: JsonObject, hash: HashFn): ParsedClaim => {
  expectNoForeignKeys(document, CLAIM_ALLOWED_KEYS, "resolution_claim");
  const artifactKind = expectString(
    expectOwn(document, "artifact_kind", "resolution_claim"),
    "artifact_kind",
  );
  if (artifactKind !== ARTIFACT_KIND_RESOLUTION_CLAIM)
    return abort("unexpected artifact_kind '" + artifactKind + "'");
  if (
    expectOwn(document, "schema_version", "resolution_claim") !== RESOLUTION_CLAIM_SCHEMA_VERSION
  ) {
    return abort("unexpected schema_version");
  }
  const theory = parseIdentityPair(
    expectOwn(document, "theory", "resolution_claim"),
    "resolution_claim.theory",
  );
  const rawObligation = expectOwn(document, "required_obligation", "resolution_claim");
  const requiredObligation =
    rawObligation === null
      ? null
      : expectNonEmptyString(rawObligation, "resolution_claim.required_obligation");
  const policyRaw = expectObject(
    expectOwn(document, "policy", "resolution_claim"),
    "resolution_claim.policy",
  );
  expectNoForeignKeys(policyRaw, POLICY_SUBJECT_KEYS, "resolution_claim.policy");
  const policyId = expectNonEmptyString(
    expectOwn(policyRaw, "id", "resolution_claim.policy"),
    "resolution_claim.policy.id",
  );
  const policyContentIdentity = expectNonEmptyString(
    expectOwn(policyRaw, "content_identity", "resolution_claim.policy"),
    "resolution_claim.policy.content_identity",
  );
  const rawCandidates = expectObjectArray(
    expectOwn(document, "candidates", "resolution_claim"),
    "resolution_claim.candidates",
  );
  const candidates = rawCandidates.map((raw, index) =>
    parseClaimCandidate(raw, "resolution_claim.candidates[" + index + "]", hash),
  );
  const seenCandidateIds = new Set<string>();
  for (const candidate of candidates) {
    if (seenCandidateIds.has(candidate.realizationId))
      return abort("duplicate candidate ID '" + candidate.realizationId + "'");
    seenCandidateIds.add(candidate.realizationId);
  }
  const status = expectString(
    expectOwn(document, "status", "resolution_claim"),
    "resolution_claim.status",
  );
  if (status !== "selected" && status !== "rejected")
    return abort("resolution_claim.status must be 'selected' or 'rejected'");
  const rawSelected = expectOwn(document, "selected", "resolution_claim");
  const selected =
    rawSelected === null ? null : parseIdentityPair(rawSelected, "resolution_claim.selected");
  const selectedAssumptions = expectStringArray(
    expectOwn(document, "selected_assumptions", "resolution_claim"),
    "resolution_claim.selected_assumptions",
  );
  return {
    theory,
    requiredObligation,
    policyId,
    policyContentIdentity,
    candidates,
    status,
    selected,
    selectedAssumptions,
  };
};

// --- Independent packet coverage + policy-contract re-interpretation ---

interface CandidateContext {
  readonly realization: RecomputedRealization;
  readonly requiredObligation: string | null;
  readonly outcome: ProducerOutcome;
}

const checkPrecondition = (check: PreconditionCheck, context: CandidateContext): boolean => {
  if (check === "targets_theory") return context.realization.targetsTheory;
  if (check === "obligation_declared") return context.requiredObligation !== null;
  if (check === "producer_ok") return context.outcome.ok;
  return context.outcome.ok && context.outcome.result.obligation === context.requiredObligation;
};

const checkRequirement = (
  check: RequirementCheck,
  context: CandidateContext,
  requirement: ObligationRequirement | undefined,
  evidence: EvidenceResult,
): boolean => {
  if (check === "requirement_governed") return requirement !== undefined;
  if (check === "category_accepted")
    return requirement!.acceptedCategories.includes(evidence.category);
  if (check === "assumptions_allowed") {
    const present = evidence.assumptions.length > 0 || context.realization.assumptions.length > 0;
    return !present || requirement!.allowAssumptions;
  }
  return evidencePassed(evidence.caseResults);
};

interface RecomputedCandidate {
  readonly eligible: boolean;
  readonly reasonCodes: ReadonlySet<ReasonCode>;
}

const recomputeEligibility = (
  realization: RecomputedRealization,
  requiredObligation: string | null,
  outcome: ProducerOutcome,
  policy: RecomputedPolicy,
): RecomputedCandidate => {
  const context: CandidateContext = { realization, requiredObligation, outcome };
  for (const rule of PRECONDITION_RULES) {
    if (checkPrecondition(rule.check, context)) continue;
    const reason =
      rule.reason ??
      (outcome.ok
        ? abort("producer_ok failed but outcome is ok")
        : DIAGNOSTIC_REASON[outcome.diagnostic.kind]);
    return { eligible: false, reasonCodes: new Set([reason]) };
  }
  if (!outcome.ok) return abort("producer_ok precondition passed but outcome is not ok");
  const evidence = outcome.result;
  // Same own-property reasoning as `production.ts`'s independent copy of
  // this lookup: `policy.requirements` is a Map populated only from the
  // authored JSON's own keys, so `.get("__proto__")`/`.get("constructor")`
  // can only surface an entry this policy actually declared.
  const requirement = policy.requirements.get(evidence.obligation);
  const reasons = new Set<ReasonCode>();
  for (const rule of REQUIREMENT_RULES) {
    if (rule.dependsOn !== null) {
      const dependency = REQUIREMENT_RULES.find((item) => item.check === rule.dependsOn)!;
      if (!checkRequirement(dependency.check, context, requirement, evidence)) continue;
    }
    if (!checkRequirement(rule.check, context, requirement, evidence)) reasons.add(rule.reason);
  }
  return { eligible: reasons.size === 0, reasonCodes: reasons };
};

const sortedUniqueStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

const sameStringSet = (left: ReadonlyArray<string>, right: ReadonlySet<string>): boolean =>
  left.length === right.size && left.every((item) => right.has(item));

const sameStringArray = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);

// --- Checker entrypoint ---

export interface CheckerRequest {
  readonly theoryId: string;
  readonly theoryDocument: JsonObject;
  readonly realizationDocuments: ReadonlyArray<JsonObject>;
  readonly policyDocument: JsonObject;
  readonly outcomeEnvelopes: ReadonlyArray<JsonObject>;
  readonly claimDocument: JsonObject;
}

interface AuthoredInput {
  readonly theory: RecomputedTheory;
  readonly realizations: ReadonlyArray<RecomputedRealization>;
  readonly policy: RecomputedPolicy;
  readonly outcomes: ReadonlyArray<ProducerOutcome>;
}

const parseAuthoredInput = (request: CheckerRequest, hash: HashFn): AuthoredInput => {
  const theory = recomputeTheory(request.theoryDocument, hash);
  const realizations = request.realizationDocuments.map((document) =>
    recomputeRealization(document, theory.id, theory.identity, hash),
  );
  const policy = recomputePolicy(request.policyDocument, hash);
  const outcomes = request.outcomeEnvelopes.map((envelope) => parseOutcomeEnvelope(envelope, hash));
  return { theory, realizations, policy, outcomes };
};

const INVALID_REPORT: CheckerReport = {
  valid: false,
  violations: [],
  recomputedStatus: null,
  recomputedSelected: null,
  modelBinding: "not_checked",
};

export const compare = (request: CheckerRequest, hash: HashFn): CheckerReport => {
  const violations: Violations = { items: [] };
  let claim: ParsedClaim;
  try {
    claim = parseClaim(request.claimDocument, hash);
  } catch (cause) {
    violate(violations, "malformed_claim", "resolution_claim", { message: String(cause) });
    return { ...INVALID_REPORT, violations: violations.items };
  }

  let authored: AuthoredInput;
  try {
    authored = parseAuthoredInput(request, hash);
  } catch (cause) {
    violate(violations, "malformed_authored_input", "authored_input", { message: String(cause) });
    return { ...INVALID_REPORT, violations: violations.items };
  }
  const { theory, realizations, policy, outcomes } = authored;

  if (theory.id !== request.theoryId)
    violate(violations, "theory_id_mismatch", theory.id, { expected: request.theoryId });
  if (claim.theory.id !== theory.id)
    violate(violations, "theory_id_stale", claim.theory.id, { expected: theory.id });
  if (claim.theory.identity !== theory.identity) {
    violate(violations, "theory_identity_stale", claim.theory.identity, {
      expected: theory.identity,
    });
  }
  if (claim.requiredObligation !== theory.requiredObligation) {
    violate(violations, "required_obligation_stale", String(claim.requiredObligation), {
      expected: theory.requiredObligation,
    });
  }

  const authoredIds = new Set(realizations.map((item) => item.id));
  if (authoredIds.size !== realizations.length)
    violate(violations, "duplicate_authored_realization", theory.id, {});
  const realizationById = new Map(realizations.map((item) => [item.id, item] as const));

  // `parseClaim` already rejects a duplicate candidate ID as
  // `malformed_claim` before `compare` ever reaches this point, so
  // `claimIdSet` is guaranteed the same size as `claimIds` here; no
  // separate `duplicate_candidate` check is reachable.
  const claimIds = claim.candidates.map((item) => item.realizationId);
  const claimIdSet = new Set(claimIds);
  for (const id of authoredIds) {
    if (!claimIdSet.has(id)) violate(violations, "missing_candidate", id, {});
  }
  for (const id of claimIdSet) {
    if (!authoredIds.has(id)) violate(violations, "foreign_candidate", id, {});
  }

  if (policy.ambiguity !== "reject")
    violate(violations, "unsupported_ambiguity_policy", policy.ambiguity, {});
  if (claim.policyId !== policy.id)
    violate(violations, "policy_id_stale", claim.policyId, { expected: policy.id });
  if (claim.policyContentIdentity !== policy.contentIdentity) {
    violate(violations, "policy_content_identity_stale", claim.policyContentIdentity, {
      expected: policy.contentIdentity,
    });
  }

  const outcomeById = new Map<string, ProducerOutcome>();
  for (const outcome of outcomes) {
    if (outcomeById.has(outcome.realizationId)) {
      violate(violations, "duplicate_evidence_packet", outcome.realizationId, {});
      continue;
    }
    outcomeById.set(outcome.realizationId, outcome);
  }
  for (const id of outcomeById.keys()) {
    if (!authoredIds.has(id)) violate(violations, "foreign_evidence_packet", id, {});
  }
  for (const id of authoredIds) {
    if (!outcomeById.has(id)) violate(violations, "missing_evidence_packet", id, {});
  }

  const recomputedByCandidate = new Map<string, RecomputedCandidate>();
  for (const candidateId of claimIdSet) {
    const realization = realizationById.get(candidateId);
    const outcome = outcomeById.get(candidateId);
    const claimCandidate = claim.candidates.find((item) => item.realizationId === candidateId)!;
    if (realization === undefined || outcome === undefined) continue; // already reported above

    if (outcome.realizationIdentity !== realization.identity) {
      violate(violations, "packet_subject_stale", candidateId, { expected: realization.identity });
    }
    if (outcome.ok && outcome.result.realizationIdentity !== realization.identity) {
      violate(violations, "evidence_subject_stale", candidateId, {
        expected: realization.identity,
      });
    }
    if (outcome.ok && outcome.result.theoryIdentity !== theory.identity) {
      violate(violations, "evidence_theory_stale", candidateId, { expected: theory.identity });
    }

    if (claimCandidate.realizationIdentity !== realization.identity) {
      violate(violations, "candidate_realization_identity_stale", candidateId, {
        expected: realization.identity,
      });
    }
    if (claimCandidate.targetsTheory !== realization.targetsTheory) {
      violate(violations, "candidate_targets_theory_stale", candidateId, {
        expected: realization.targetsTheory,
      });
    }
    if (
      !sameStringArray(
        sortedUniqueStrings(claimCandidate.realizationAssumptions),
        sortedUniqueStrings(realization.assumptions),
      )
    ) {
      violate(violations, "candidate_assumptions_stale", candidateId, {});
    }
    if ((claimCandidate.evidence === null) === (claimCandidate.producerDiagnostic === null)) {
      violate(violations, "evidence_diagnostic_exclusivity", candidateId, {});
    }
    if (outcome.ok && claimCandidate.evidence !== null) {
      if (claimCandidate.evidence.recipeIdentity.length === 0) {
        violate(violations, "recipe_identity_missing", candidateId, {});
      } else if (claimCandidate.evidence.recipeIdentity !== outcome.result.recipeIdentity) {
        violate(violations, "recipe_identity_not_propagated", candidateId, {
          expected: outcome.result.recipeIdentity,
        });
      }
      if (claimCandidate.evidence.identity !== outcome.result.identity) {
        violate(violations, "candidate_evidence_stale", candidateId, {
          expected: outcome.result.identity,
        });
      }
    }

    const recomputed = recomputeEligibility(
      realization,
      theory.requiredObligation,
      outcome,
      policy,
    );
    recomputedByCandidate.set(candidateId, recomputed);
    if (claimCandidate.eligible !== recomputed.eligible) {
      violate(violations, "eligibility_stale", candidateId, { expected: recomputed.eligible });
    }
    if (!sameStringSet(claimCandidate.reasonCodes, recomputed.reasonCodes)) {
      violate(violations, "reason_set_stale", candidateId, {
        expected: [...recomputed.reasonCodes],
      });
    }
  }

  const eligibleIds = [...recomputedByCandidate.entries()]
    .filter(([, value]) => value.eligible)
    .map(([id]) => id);
  const terminalRule = TERMINAL_RULES.find(
    (rule) =>
      rule.eligibleCount ===
      (eligibleIds.length === 0 ? "zero" : eligibleIds.length === 1 ? "one" : "many"),
  )!;
  const recomputedSelected: IdentityPair | null =
    terminalRule.status === "selected"
      ? { id: eligibleIds[0]!, identity: realizationById.get(eligibleIds[0]!)!.identity }
      : null;

  const recomputedSelectedJson =
    recomputedSelected === null
      ? null
      : { id: recomputedSelected.id, identity: recomputedSelected.identity };
  if (claim.status !== terminalRule.status)
    violate(violations, "status_stale", claim.status, { expected: terminalRule.status });
  if ((claim.selected === null) !== (recomputedSelected === null)) {
    violate(violations, "selected_stale", String(claim.selected?.id), {
      expected: recomputedSelectedJson,
    });
  } else if (claim.selected !== null && recomputedSelected !== null) {
    if (
      claim.selected.id !== recomputedSelected.id ||
      claim.selected.identity !== recomputedSelected.identity
    ) {
      violate(violations, "selected_stale", claim.selected.id, {
        expected: recomputedSelectedJson,
      });
    }
  }

  const winnerRealization =
    recomputedSelected === null ? null : realizationById.get(recomputedSelected.id)!;
  const winnerOutcome = recomputedSelected === null ? null : outcomeById.get(recomputedSelected.id);
  const recomputedSelectedAssumptions =
    winnerRealization === null ||
    winnerOutcome === undefined ||
    winnerOutcome === null ||
    !winnerOutcome.ok
      ? []
      : sortedUniqueStrings([
          ...winnerRealization.assumptions,
          ...winnerOutcome.result.assumptions,
        ]);
  if (!sameStringArray(claim.selectedAssumptions, recomputedSelectedAssumptions)) {
    violate(violations, "selected_assumptions_stale", String(claim.selected?.id), {
      expected: recomputedSelectedAssumptions,
    });
  }

  return {
    valid: violations.items.length === 0,
    violations: violations.items,
    recomputedStatus: terminalRule.status,
    recomputedSelected,
    modelBinding: "not_checked",
  };
};
