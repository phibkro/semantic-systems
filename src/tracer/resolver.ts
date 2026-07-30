import {
  evidenceCounterexamples,
  evidencePassed,
  evidencePassedCases,
  evidenceToJson,
  evidenceTotalCases,
  runConformance,
  type EvidenceResult,
} from "./evidence.ts";
import type { ExplanationNode } from "./explanation.ts";
import {
  DocumentError,
  requireKey,
  requireObject,
  requireString,
  type JsonObject,
} from "./json.ts";
import { resolveReplay, resolveTransition } from "./operations.ts";
import {
  operationBinding,
  realizationAssumptions,
  realizationId,
  type Realization,
} from "./realization.ts";
import type { Theory } from "./theory.ts";

export const REASON_MISSING_EVIDENCE = "missing_evidence";
export const REASON_CATEGORY_NOT_ACCEPTED = "evidence_category_not_accepted";
export const REASON_ASSUMPTIONS_NOT_ALLOWED = "assumptions_not_allowed";
export const REASON_CONFORMANCE_FAILED = "conformance_failed";
export const REASON_OBLIGATION_NOT_GOVERNED = "obligation_not_governed";
export const REASON_AMBIGUOUS = "ambiguous_candidates";
export const REASON_NO_ELIGIBLE = "no_eligible_candidates";
export const REASON_THEORY_MISMATCH = "theory_mismatch";
export const REASON_EVIDENCE_AMBIGUOUS = "ambiguous_evidence";
export const REASON_EVIDENCE_OBLIGATION_MISMATCH = "evidence_obligation_mismatch";
export const REASON_OBLIGATION_SET_UNSUPPORTED = "required_obligation_set_unsupported";
export const REASON_EVIDENCE_STALE = "stale_evidence_recipe";
export const REASON_OPERATION_UNBOUND = "unbound_operation";

const CHANGE_OPTIONS: Readonly<Record<string, string>> = {
  [REASON_MISSING_EVIDENCE]: "Add one matching conformance suite for the required obligation.",
  [REASON_CATEGORY_NOT_ACCEPTED]: "Supply evidence in an accepted category or change the policy.",
  [REASON_ASSUMPTIONS_NOT_ALLOWED]: "Remove the assumptions or use a policy that permits them.",
  [REASON_CONFORMANCE_FAILED]: "Fix the realization or explicitly revise the frozen contract.",
  [REASON_OBLIGATION_NOT_GOVERNED]: "Add an explicit policy rule for the theory obligation.",
  [REASON_THEORY_MISMATCH]: "Target the exact authored theory identifier.",
  [REASON_EVIDENCE_AMBIGUOUS]: "Retain exactly one suite for the theory and obligation.",
  [REASON_EVIDENCE_OBLIGATION_MISMATCH]: "Bind the suite to the obligation declared by the theory.",
  [REASON_OBLIGATION_SET_UNSUPPORTED]:
    "Use the single-obligation v0 contract or extend the resolver.",
  [REASON_EVIDENCE_STALE]: "Re-author the suite against the exact normalized theory identity.",
  [REASON_OPERATION_UNBOUND]: "Bind every required operation to an available execution adapter.",
};

export interface Candidate {
  readonly realization: Realization;
  readonly eligible: boolean;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly evidence: EvidenceResult | null;
}

export interface Resolution {
  readonly status: "selected" | "rejected";
  readonly selectedRealization: string | null;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<Candidate>;
}

export const candidateToJson = (candidate: Candidate): JsonObject => ({
  realization_id: realizationId(candidate.realization),
  realization_identity: candidate.realization.identity,
  targets_theory: candidate.realization.targetsTheory,
  eligible: candidate.eligible,
  reason_codes: candidate.reasonCodes,
  evidence: candidate.evidence === null ? null : evidenceToJson(candidate.evidence),
  counterexamples: candidate.evidence === null ? [] : evidenceCounterexamples(candidate.evidence),
});

export const candidateExplanation = (candidate: Candidate): ExplanationNode => {
  const children: Array<ExplanationNode> = [];
  if (candidate.evidence !== null) {
    const evidence = candidate.evidence;
    children.push({
      rule: "evaluate_conformance_evidence",
      outcome: evidencePassed(evidence) ? "passed" : "failed",
      subject: evidence.realizationIdentity,
      details: {
        category: evidence.category,
        passed_cases: evidencePassedCases(evidence),
        total_cases: evidenceTotalCases(evidence),
        assumptions: evidence.assumptions,
        counterexamples: evidenceCounterexamples(evidence),
      },
      children: [],
    });
  }
  return {
    rule: "evaluate_realization_candidate",
    outcome: candidate.eligible ? "eligible" : "rejected",
    subject: realizationId(candidate.realization),
    details: {
      realization_identity: candidate.realization.identity,
      reason_codes: candidate.reasonCodes,
      assumptions: realizationAssumptions(candidate.realization),
      change_options: candidate.reasonCodes.flatMap((reason) =>
        CHANGE_OPTIONS[reason] === undefined ? [] : [CHANGE_OPTIONS[reason]],
      ),
    },
    children,
  };
};

export const resolutionToJson = (resolution: Resolution): JsonObject => ({
  status: resolution.status,
  selected_realization: resolution.selectedRealization,
  reason_codes: resolution.reasonCodes,
  candidates: resolution.candidates.map(candidateToJson),
});

const requiredObligation = (theory: Theory): string | null => {
  const raw = theory.payload.obligations;
  if (!Array.isArray(raw) || raw.length !== 1) return null;
  const first = raw[0];
  if (first === null || typeof first !== "object" || Array.isArray(first)) return null;
  return typeof first.id === "string" ? first.id : null;
};

const evaluateCandidate = (
  theory: Theory,
  theoryId: string,
  realization: Realization,
  suites: ReadonlyArray<JsonObject>,
  policy: JsonObject,
): Candidate => {
  const reject = (reason: string): Candidate => ({
    realization,
    eligible: false,
    reasonCodes: [reason],
    evidence: null,
  });
  if (!realization.targetsTheory) return reject(REASON_THEORY_MISMATCH);
  const obligation = requiredObligation(theory);
  if (obligation === null) return reject(REASON_OBLIGATION_SET_UNSUPPORTED);

  const matching = suites.filter((suite) => suite.theory === theoryId);
  if (matching.length === 0) return reject(REASON_MISSING_EVIDENCE);
  if (matching.length > 1) return reject(REASON_EVIDENCE_AMBIGUOUS);
  const suite = matching[0]!;
  if (suite.theory_identity !== theory.identity) return reject(REASON_EVIDENCE_STALE);
  if (suite.obligation !== obligation) return reject(REASON_EVIDENCE_OBLIGATION_MISMATCH);

  let transition: ReturnType<typeof resolveTransition>;
  let replay: ReturnType<typeof resolveReplay>;
  try {
    transition = resolveTransition(operationBinding(realization.document, "transition"));
    replay = resolveReplay(operationBinding(realization.document, "replay"));
  } catch (error) {
    if (error instanceof DocumentError) return reject(REASON_OPERATION_UNBOUND);
    throw error;
  }
  const evidence: EvidenceResult = runConformance(theory, realization, suite, transition, replay);

  const reasons: Array<string> = [];
  const requirements = requireObject(
    requireKey(policy, "requirements", "policy"),
    "policy.requirements",
  );
  const requirement = requirements[evidence.obligation];
  if (requirement === undefined) {
    reasons.push(REASON_OBLIGATION_NOT_GOVERNED);
  } else {
    const rule = requireObject(requirement, `policy.requirements.${evidence.obligation}`);
    const categories = rule.accepted_categories ?? [];
    if (!Array.isArray(categories) || !categories.includes(evidence.category)) {
      reasons.push(REASON_CATEGORY_NOT_ACCEPTED);
    }
    const assumptionsPresent =
      evidence.assumptions.length > 0 || realizationAssumptions(realization).length > 0;
    if (assumptionsPresent && rule.allow_assumptions !== true) {
      reasons.push(REASON_ASSUMPTIONS_NOT_ALLOWED);
    }
  }
  if (!evidencePassed(evidence)) reasons.push(REASON_CONFORMANCE_FAILED);
  return {
    realization,
    eligible: reasons.length === 0,
    reasonCodes: reasons,
    evidence,
  };
};

export const resolve = (
  theory: Theory,
  theoryId: string,
  realizations: ReadonlyArray<Realization>,
  suites: ReadonlyArray<JsonObject>,
  policy: JsonObject,
): Resolution => {
  const ambiguity = requireString(requireKey(policy, "ambiguity", "policy"), "policy.ambiguity");
  if (ambiguity !== "reject") {
    throw new DocumentError({ message: `unsupported ambiguity policy '${ambiguity}'` });
  }
  const candidates = realizations.map((realization) =>
    evaluateCandidate(theory, theoryId, realization, suites, policy),
  );
  const eligible = candidates.filter((candidate) => candidate.eligible);
  if (eligible.length === 1) {
    return {
      status: "selected",
      selectedRealization: realizationId(eligible[0]!.realization),
      reasonCodes: [],
      candidates,
    };
  }
  return {
    status: "rejected",
    selectedRealization: null,
    reasonCodes: [eligible.length === 0 ? REASON_NO_ELIGIBLE : REASON_AMBIGUOUS],
    candidates,
  };
};
