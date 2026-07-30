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
  ClaimCandidate,
  EvidenceResult,
  IdentityPair,
  JsonObject,
  JsonValue,
  ProducerDiagnostic,
  ProducerDiagnosticKind,
  ProducerOutcome,
  ResolutionClaim,
} from "./shared-types.ts";

/**
 * The production adjudicator half of the declarative shared-policy
 * experiment. Independently authored from `checker.ts`: it owns its own
 * structural JSON parsing, its own interpreter over `policy-contract.ts`'s
 * rule tables, and its own resolution-claim builder. It never imports
 * `checker.ts` or `canonical-binding-adapter.ts`.
 *
 * Error messages use string concatenation, never interpolated template
 * literals: `classifier.ts`'s region scanner is a plain-token scanner
 * (`typescript/unstable/ast`'s `Scanner`, without the parser's template
 * re-scan orchestration), and a bare `.scan()` loop cannot correctly resume
 * after a `${...}` substitution — verified empirically to corrupt all
 * tokenization after the first substitution. Concatenation keeps this file
 * (and `checker.ts`/`canonical.ts`, which the classifier also walks) safe
 * for that scanner. See `classifier.test.ts`'s template-literal negative
 * control.
 */

const fail = (message: string): never => {
  throw new Error("production: " + message);
};

const requireObject = (value: JsonValue, context: string): JsonObject => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(context + " must be an object");
  }
  return value as JsonObject;
};

const requireOwn = (document: JsonObject, key: string, context: string): JsonValue => {
  if (!Object.hasOwn(document, key))
    return fail(context + " is missing required key '" + key + "'");
  return document[key]!;
};

const requireString = (value: JsonValue, context: string): string => {
  if (typeof value !== "string") return fail(context + " must be a string");
  return value;
};

const requireNonEmptyString = (value: JsonValue, context: string): string => {
  const text = requireString(value, context);
  if (text.length === 0) return fail(context + " must be a nonempty string");
  return text;
};

const requireBoolean = (value: JsonValue, context: string): boolean => {
  if (typeof value !== "boolean") return fail(context + " must be a boolean");
  return value;
};

const requireArray = (value: JsonValue, context: string): ReadonlyArray<JsonValue> => {
  if (!Array.isArray(value)) return fail(context + " must be a list");
  return value;
};

const requireStringArray = (value: JsonValue, context: string): ReadonlyArray<string> =>
  requireArray(value, context).map((item, index) =>
    requireString(item, context + "[" + index + "]"),
  );

// --- Authored theory/realization (structural parsing + identity recomputation) ---

export interface NormalizedTheory {
  readonly id: string;
  readonly identity: string;
  readonly requiredObligation: string | null;
}

/** Excludes only `id` from the identity payload: renaming a theory's
 * authored ID never changes what it means. */
const theoryIdentityPayload = (document: JsonObject): JsonObject =>
  Object.fromEntries(Object.entries(document).filter(([key]) => key !== "id"));

const requiredObligationOf = (document: JsonObject): string | null => {
  const rawObligations = requireOwn(document, "obligations", "theory");
  const obligations = requireArray(rawObligations, "theory.obligations");
  if (obligations.length !== 1) return null;
  const first = requireObject(obligations[0]!, "theory.obligations[0]");
  const id = requireOwn(first, "id", "theory.obligations[0]");
  return typeof id === "string" ? id : null;
};

export const normalizeTheory = (document: JsonObject, hash: HashFn): NormalizedTheory => {
  const id = requireNonEmptyString(requireOwn(document, "id", "theory"), "theory.id");
  const identity = contentIdentity(hash, theoryIdentityPayload(document));
  return { id, identity, requiredObligation: requiredObligationOf(document) };
};

export interface NormalizedRealization {
  readonly id: string;
  readonly identity: string;
  readonly targetsTheory: boolean;
  readonly assumptions: ReadonlyArray<string>;
}

/** Excludes `id` and `name`: two distinct authored realization IDs may
 * legitimately share one content identity (the accepted ambiguity scenario
 * depends on this — design spec 0003, `resolution_claim_v1`). */
const REALIZATION_DISPLAY_FIELDS = new Set(["id", "name"]);
const realizationIdentityPayload = (document: JsonObject, theoryIdentity: string): JsonObject => ({
  theory_identity: theoryIdentity,
  ...Object.fromEntries(
    Object.entries(document).filter(
      ([key]) => !REALIZATION_DISPLAY_FIELDS.has(key) && key !== "theory",
    ),
  ),
});

export const normalizeRealization = (
  document: JsonObject,
  theoryId: string,
  theoryIdentity: string,
  hash: HashFn,
): NormalizedRealization => {
  const id = requireNonEmptyString(requireOwn(document, "id", "realization"), "realization.id");
  const declaredTheory = requireString(
    requireOwn(document, "theory", "realization"),
    "realization.theory",
  );
  const identity = contentIdentity(hash, realizationIdentityPayload(document, theoryIdentity));
  const assumptions = requireStringArray(document.assumptions ?? [], "realization.assumptions");
  return { id, identity, targetsTheory: declaredTheory === theoryId, assumptions };
};

// --- Authored policy (structural parsing) ---

export interface NormalizedPolicy {
  readonly id: string;
  readonly requirements: ReadonlyMap<string, ObligationRequirement>;
  readonly contentIdentity: string;
}

const parseRequirement = (value: JsonValue, context: string): ObligationRequirement => {
  const object = requireObject(value, context);
  const acceptedCategories = requireStringArray(
    requireOwn(object, "accepted_categories", context),
    context + ".accepted_categories",
  );
  const allowAssumptions = requireBoolean(
    requireOwn(object, "allow_assumptions", context),
    context + ".allow_assumptions",
  );
  return { acceptedCategories, allowAssumptions };
};

export const normalizePolicy = (document: JsonObject, hash: HashFn): NormalizedPolicy => {
  const id = requireNonEmptyString(requireOwn(document, "id", "policy"), "policy.id");
  const ambiguity = requireString(requireOwn(document, "ambiguity", "policy"), "policy.ambiguity");
  if (ambiguity !== "reject") return fail("unsupported ambiguity policy '" + ambiguity + "'");
  const requirementsObject = requireObject(
    requireOwn(document, "requirements", "policy"),
    "policy.requirements",
  );
  const requirements = new Map<string, ObligationRequirement>();
  for (const key of Object.keys(requirementsObject)) {
    requirements.set(key, parseRequirement(requirementsObject[key]!, "policy.requirements." + key));
  }
  return { id, requirements, contentIdentity: contentIdentity(hash, document) };
};

// --- Evidence packets (structural parsing + identity recomputation) ---

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
  case_results: evidence.caseResults.map(caseResultToJson),
});

function caseResultToJson(result: CaseResult): JsonObject {
  return { case_id: result.caseId, passed: result.passed, detail: result.detail };
}

const parseCaseResult = (value: JsonValue, context: string): CaseResult => {
  const object = requireObject(value, context);
  const caseId = requireNonEmptyString(
    requireOwn(object, "case_id", context),
    context + ".case_id",
  );
  const passed = requireBoolean(requireOwn(object, "passed", context), context + ".passed");
  const rawDetail = requireOwn(object, "detail", context);
  if (passed) {
    if (rawDetail !== null) return fail(context + ".detail must be null when passed is true");
    return { caseId, passed: true, detail: null };
  }
  if (rawDetail === null)
    return fail(context + ".detail must be a non-null object when passed is false");
  return { caseId, passed: false, detail: requireObject(rawDetail, context + ".detail") };
};

export const parseEvidenceResult = (document: JsonObject, hash: HashFn): EvidenceResult => {
  const artifactKind = requireString(
    requireOwn(document, "artifact_kind", "evidence_result"),
    "artifact_kind",
  );
  if (artifactKind !== ARTIFACT_KIND_EVIDENCE_RESULT)
    return fail("unexpected artifact_kind '" + artifactKind + "'");
  const schemaVersion = requireOwn(document, "schema_version", "evidence_result");
  if (schemaVersion !== EVIDENCE_RESULT_SCHEMA_VERSION) return fail("unexpected schema_version");
  const category = requireString(requireOwn(document, "category", "evidence_result"), "category");
  if (category !== EVIDENCE_CATEGORY) return fail("unexpected category '" + category + "'");
  const storedIdentity = requireNonEmptyString(
    requireOwn(document, "identity", "evidence_result"),
    "identity",
  );
  const producer = requireObject(requireOwn(document, "producer", "evidence_result"), "producer");
  const recipeIdentity = requireNonEmptyString(
    requireOwn(document, "recipe_identity", "evidence_result"),
    "recipe_identity",
  );
  const theoryIdentity = requireNonEmptyString(
    requireOwn(document, "theory_identity", "evidence_result"),
    "theory_identity",
  );
  const realizationIdentity = requireNonEmptyString(
    requireOwn(document, "realization_identity", "evidence_result"),
    "realization_identity",
  );
  const obligation = requireNonEmptyString(
    requireOwn(document, "obligation", "evidence_result"),
    "obligation",
  );
  const assumptions = requireStringArray(
    requireOwn(document, "assumptions", "evidence_result"),
    "assumptions",
  );
  const rawCases = requireArray(
    requireOwn(document, "case_results", "evidence_result"),
    "case_results",
  );
  if (rawCases.length === 0) return fail("case_results must not be empty");
  const caseResults = rawCases.map((item, index) =>
    parseCaseResult(item, "case_results[" + index + "]"),
  );
  const seen = new Set<string>();
  for (const item of caseResults) {
    if (seen.has(item.caseId)) return fail("duplicate case ID '" + item.caseId + "'");
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
  const recomputed = contentIdentity(hash, evidenceIdentityPayload(withoutIdentity));
  if (recomputed !== storedIdentity)
    return fail("evidence_result.identity does not match its recomputed content");
  return { identity: recomputed, ...withoutIdentity };
};

const parseProducerDiagnostic = (value: JsonValue, context: string): ProducerDiagnostic => {
  const object = requireObject(value, context);
  const kind = requireNonEmptyString(requireOwn(object, "kind", context), context + ".kind");
  if (!PRODUCER_DIAGNOSTIC_KINDS.includes(kind as ProducerDiagnosticKind)) {
    return fail(context + ".kind is not a known producer diagnostic kind");
  }
  const message = requireNonEmptyString(
    requireOwn(object, "message", context),
    context + ".message",
  );
  return { kind: kind as ProducerDiagnosticKind, message };
};

export const parseOutcomeEnvelope = (document: JsonObject, hash: HashFn): ProducerOutcome => {
  const ok = requireBoolean(requireOwn(document, "ok", "producer_outcome"), "ok");
  const realizationId = requireNonEmptyString(
    requireOwn(document, "realization_id", "producer_outcome"),
    "realization_id",
  );
  const realizationIdentity = requireNonEmptyString(
    requireOwn(document, "realization_identity", "producer_outcome"),
    "realization_identity",
  );
  if (ok) {
    const evidenceValue = requireOwn(document, "evidence", "producer_outcome");
    const result = parseEvidenceResult(
      requireObject(evidenceValue, "producer_outcome.evidence"),
      hash,
    );
    return { ok: true, realizationId, realizationIdentity, result };
  }
  const diagnosticValue = requireOwn(document, "diagnostic", "producer_outcome");
  const diagnostic = parseProducerDiagnostic(diagnosticValue, "producer_outcome.diagnostic");
  return { ok: false, realizationId, realizationIdentity, diagnostic };
};

// --- Candidate/packet coverage ---

const bindOutcomes = (
  realizations: ReadonlyArray<NormalizedRealization>,
  outcomes: ReadonlyArray<ProducerOutcome>,
): ReadonlyMap<string, ProducerOutcome> => {
  const seenIds = new Set<string>();
  for (const realization of realizations) {
    if (seenIds.has(realization.id))
      return fail("duplicate authored realization ID '" + realization.id + "'");
    seenIds.add(realization.id);
  }
  const byId = new Map<string, ProducerOutcome>();
  for (const outcome of outcomes) {
    if (byId.has(outcome.realizationId)) {
      return fail("duplicate evidence-production outcome bound to '" + outcome.realizationId + "'");
    }
    byId.set(outcome.realizationId, outcome);
  }
  for (const id of byId.keys()) {
    if (!seenIds.has(id))
      return fail("evidence-production outcome bound to unknown realization '" + id + "'");
  }
  for (const realization of realizations) {
    const outcome = byId.get(realization.id);
    if (outcome === undefined)
      return fail("missing evidence-production outcome for realization '" + realization.id + "'");
    if (outcome.realizationIdentity !== realization.identity) {
      return fail("outcome for '" + realization.id + "' carries a mismatched realization identity");
    }
    if (outcome.ok && outcome.result.realizationIdentity !== realization.identity) {
      return fail(
        "evidence result for '" + realization.id + "' carries a mismatched realization identity",
      );
    }
  }
  return byId;
};

// --- Policy-contract interpretation (production's own dispatcher) ---

const evidencePassed = (evidence: EvidenceResult): boolean =>
  evidence.caseResults.length > 0 && evidence.caseResults.every((item) => item.passed);

interface CandidateContext {
  readonly realization: NormalizedRealization;
  readonly requiredObligation: string | null;
  readonly outcome: ProducerOutcome;
  readonly policy: NormalizedPolicy;
}

const evaluatePrecondition = (check: PreconditionCheck, context: CandidateContext): boolean => {
  if (check === "targets_theory") return context.realization.targetsTheory;
  if (check === "obligation_declared") return context.requiredObligation !== null;
  if (check === "producer_ok") return context.outcome.ok;
  return context.outcome.ok && context.outcome.result.obligation === context.requiredObligation;
};

const evaluateRequirement = (
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
  return evidencePassed(evidence);
};

export interface EvaluatedCandidate {
  readonly realization: NormalizedRealization;
  readonly eligible: boolean;
  readonly reasonCodes: ReadonlyArray<ReasonCode>;
  readonly evidence: EvidenceResult | null;
  readonly producerDiagnostic: ProducerDiagnostic | null;
}

const evaluateCandidate = (
  realization: NormalizedRealization,
  requiredObligation: string | null,
  outcome: ProducerOutcome,
  policy: NormalizedPolicy,
): EvaluatedCandidate => {
  const context: CandidateContext = { realization, requiredObligation, outcome, policy };
  for (const rule of PRECONDITION_RULES) {
    if (evaluatePrecondition(rule.check, context)) continue;
    const reason =
      rule.reason ??
      (outcome.ok
        ? fail("producer_ok failed but outcome is ok")
        : DIAGNOSTIC_REASON[outcome.diagnostic.kind]);
    return {
      realization,
      eligible: false,
      reasonCodes: [reason],
      evidence: null,
      producerDiagnostic: outcome.ok ? null : outcome.diagnostic,
    };
  }
  if (!outcome.ok) return fail("producer_ok precondition passed but outcome is not ok");
  const evidence = outcome.result;
  // `policy.requirements` is a Map keyed only by whatever obligation IDs the
  // authored JSON actually declared as own keys (`normalizePolicy` populates
  // it via `Object.keys`, which never surfaces inherited properties). A Map
  // has no prototype chain of its own data, so `.get("__proto__")` or
  // `.get("constructor")` can only ever return an entry this policy itself
  // declared — never `Object.prototype`'s members.
  const requirement = policy.requirements.get(evidence.obligation);
  const reasons: Array<ReasonCode> = [];
  for (const rule of REQUIREMENT_RULES) {
    if (rule.dependsOn !== null) {
      const dependency = REQUIREMENT_RULES.find((item) => item.check === rule.dependsOn)!;
      if (!evaluateRequirement(dependency.check, context, requirement, evidence)) continue;
    }
    if (!evaluateRequirement(rule.check, context, requirement, evidence)) reasons.push(rule.reason);
  }
  return {
    realization,
    eligible: reasons.length === 0,
    reasonCodes: reasons,
    evidence,
    producerDiagnostic: null,
  };
};

// --- Terminal selection + assumption projection ---

const sortedUniqueStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

// --- Claim assembly (internal coherence + serialization) ---

export interface ProductionRequest {
  readonly theoryId: string;
  readonly theoryDocument: JsonObject;
  readonly realizationDocuments: ReadonlyArray<JsonObject>;
  readonly policyDocument: JsonObject;
  readonly outcomeEnvelopes: ReadonlyArray<JsonObject>;
}

export const adjudicate = (request: ProductionRequest, hash: HashFn): ResolutionClaim => {
  const theory = normalizeTheory(request.theoryDocument, hash);
  if (theory.id !== request.theoryId)
    return fail("theory document ID does not match the requested theory ID");
  const realizations = request.realizationDocuments.map((document) =>
    normalizeRealization(document, theory.id, theory.identity, hash),
  );
  const policy = normalizePolicy(request.policyDocument, hash);
  const outcomes = request.outcomeEnvelopes.map((envelope) => parseOutcomeEnvelope(envelope, hash));
  const bound = bindOutcomes(realizations, outcomes);

  const evaluated = realizations.map((realization) =>
    evaluateCandidate(realization, theory.requiredObligation, bound.get(realization.id)!, policy),
  );
  const eligible = evaluated.filter((item) => item.eligible);
  const terminalRule = TERMINAL_RULES.find(
    (rule) =>
      rule.eligibleCount ===
      (eligible.length === 0 ? "zero" : eligible.length === 1 ? "one" : "many"),
  )!;

  const selectedWinner = terminalRule.status === "selected" ? eligible[0]! : null;
  const selected: IdentityPair | null =
    selectedWinner === null
      ? null
      : { id: selectedWinner.realization.id, identity: selectedWinner.realization.identity };
  const selectedAssumptions =
    selectedWinner === null
      ? []
      : sortedUniqueStrings([
          ...selectedWinner.realization.assumptions,
          ...(selectedWinner.evidence?.assumptions ?? []),
        ]);

  const candidates: ReadonlyArray<ClaimCandidate> = evaluated
    .map(
      (item): ClaimCandidate => ({
        realizationId: item.realization.id,
        realizationIdentity: item.realization.identity,
        targetsTheory: item.realization.targetsTheory,
        realizationAssumptions: item.realization.assumptions,
        evidence: item.evidence,
        producerDiagnostic: item.producerDiagnostic,
        eligible: item.eligible,
        reasonCodes: item.reasonCodes,
      }),
    )
    .slice()
    .sort((left, right) =>
      left.realizationId < right.realizationId
        ? -1
        : left.realizationId > right.realizationId
          ? 1
          : 0,
    );

  const seenCandidateIds = new Set<string>();
  for (const candidate of candidates) {
    if (seenCandidateIds.has(candidate.realizationId))
      return fail("duplicate candidate ID '" + candidate.realizationId + "'");
    seenCandidateIds.add(candidate.realizationId);
    if ((candidate.evidence === null) === (candidate.producerDiagnostic === null)) {
      return fail(
        "candidate '" +
          candidate.realizationId +
          "' must carry exactly one of evidence or producer diagnostic",
      );
    }
    if (candidate.eligible !== (candidate.reasonCodes.length === 0)) {
      return fail(
        "candidate '" + candidate.realizationId + "' eligibility disagrees with its reason set",
      );
    }
  }

  return {
    artifactKind: ARTIFACT_KIND_RESOLUTION_CLAIM,
    schemaVersion: RESOLUTION_CLAIM_SCHEMA_VERSION,
    theory: { id: theory.id, identity: theory.identity },
    requiredObligation: theory.requiredObligation,
    policy: { id: policy.id, contentIdentity: policy.contentIdentity },
    candidates,
    status: terminalRule.status,
    selected,
    selectedAssumptions,
  };
};

// --- Presentation-only JSON serialization (excluded: nonsemantic presentation) ---

const evidenceToJson = (evidence: EvidenceResult): JsonObject => ({
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
  total_cases: evidence.caseResults.length,
  passed_cases: evidence.caseResults.filter((item) => item.passed).length,
  counterexamples: evidence.caseResults.filter((item) => !item.passed).map(caseResultToJson),
});

const candidateToJson = (candidate: ClaimCandidate): JsonObject => ({
  realization: { id: candidate.realizationId, identity: candidate.realizationIdentity },
  targets_theory: candidate.targetsTheory,
  realization_assumptions: candidate.realizationAssumptions,
  evidence: candidate.evidence === null ? null : evidenceToJson(candidate.evidence),
  producer_diagnostic:
    candidate.producerDiagnostic === null
      ? null
      : { kind: candidate.producerDiagnostic.kind, message: candidate.producerDiagnostic.message },
  eligible: candidate.eligible,
  reason_codes: candidate.reasonCodes,
});

export const claimToJson = (claim: ResolutionClaim): JsonObject => ({
  artifact_kind: claim.artifactKind,
  schema_version: claim.schemaVersion,
  theory: { id: claim.theory.id, identity: claim.theory.identity },
  required_obligation: claim.requiredObligation,
  policy: { id: claim.policy.id, content_identity: claim.policy.contentIdentity },
  candidates: claim.candidates.map(candidateToJson),
  status: claim.status,
  selected:
    claim.selected === null ? null : { id: claim.selected.id, identity: claim.selected.identity },
  selected_assumptions: claim.selectedAssumptions,
});
