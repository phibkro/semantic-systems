import { Effect, type Crypto } from "effect";
import { contentIdentity } from "./canonical.ts";
import {
  evidenceCounterexamples,
  evidencePassed,
  evidencePassedCases,
  evidenceToJson,
  evidenceTotalCases,
  type EvidenceResult,
  type ProducerDiagnostic,
  type ProducerOutcome,
} from "./packets.ts";
import type { ExplanationNode } from "./explanation.ts";
import {
  DocumentError,
  requireKey,
  requireObject,
  requireString,
  type JsonObject,
} from "./json.ts";
import { realizationAssumptions, realizationId, type Realization } from "./realization.ts";
import {
  REASON_AMBIGUOUS,
  REASON_ASSUMPTIONS_NOT_ALLOWED,
  REASON_CATEGORY_NOT_ACCEPTED,
  REASON_CONFORMANCE_FAILED,
  REASON_EVIDENCE_AMBIGUOUS,
  REASON_EVIDENCE_OBLIGATION_MISMATCH,
  REASON_EVIDENCE_STALE,
  REASON_MISSING_EVIDENCE,
  REASON_NO_ELIGIBLE,
  REASON_OBLIGATION_NOT_GOVERNED,
  REASON_OBLIGATION_SET_UNSUPPORTED,
  REASON_OPERATION_UNBOUND,
  REASON_THEORY_MISMATCH,
} from "./reasons.ts";
import { requiredObligationId, type Theory } from "./theory.ts";

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
  readonly producerDiagnostic: ProducerDiagnostic | null;
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
  producer_diagnostic:
    candidate.producerDiagnostic === null
      ? null
      : {
          reason_code: candidate.producerDiagnostic.reasonCode,
          detail: candidate.producerDiagnostic.detail,
        },
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

export const selectedAssumptions = (resolution: Resolution): ReadonlyArray<string> => {
  if (resolution.status !== "selected") return [];
  const selected = resolution.candidates.find(
    (candidate) => realizationId(candidate.realization) === resolution.selectedRealization,
  );
  if (selected === undefined) {
    throw new DocumentError({ message: "selected realization is absent from candidates" });
  }
  return [
    ...new Set([
      ...realizationAssumptions(selected.realization),
      ...(selected.evidence?.assumptions ?? []),
    ]),
  ].sort();
};

const claimCandidateToJson = (candidate: Candidate): JsonObject => ({
  realization_id: realizationId(candidate.realization),
  realization_identity: candidate.realization.identity,
  targets_theory: candidate.realization.targetsTheory,
  realization_assumptions: realizationAssumptions(candidate.realization),
  evidence: candidate.evidence === null ? null : evidenceToJson(candidate.evidence),
  producer_diagnostic:
    candidate.producerDiagnostic === null
      ? null
      : {
          reason_code: candidate.producerDiagnostic.reasonCode,
          detail: candidate.producerDiagnostic.detail,
        },
  eligible: candidate.eligible,
  reason_codes: candidate.reasonCodes,
});

export const buildResolutionClaim = (
  theory: Theory,
  theoryId: string,
  policy: JsonObject,
  resolution: Resolution,
): Effect.Effect<JsonObject, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const policyId = yield* Effect.try({
      try: () => requireString(requireKey(policy, "id", "policy"), "policy.id"),
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot identify resolution policy", cause }),
    });
    const selectedCandidate =
      resolution.status === "selected"
        ? resolution.candidates.find(
            (candidate) => realizationId(candidate.realization) === resolution.selectedRealization,
          )
        : undefined;
    if (resolution.status === "selected" && selectedCandidate === undefined) {
      return yield* new DocumentError({
        message: "selected realization is absent from resolution candidates",
      });
    }
    return {
      artifact_kind: "resolution_claim",
      schema_version: 1,
      theory: { id: theoryId, identity: theory.identity },
      required_obligation: requiredObligationId(theory),
      policy: { id: policyId, content_identity: yield* contentIdentity(policy) },
      candidates: resolution.candidates.map(claimCandidateToJson),
      status: resolution.status,
      selected:
        selectedCandidate === undefined
          ? null
          : {
              id: realizationId(selectedCandidate.realization),
              identity: selectedCandidate.realization.identity,
            },
      selected_assumptions: selectedAssumptions(resolution),
    };
  });

const evaluateCandidate = (
  theory: Theory,
  realization: Realization,
  outcomes: ReadonlyArray<ProducerOutcome>,
  policy: JsonObject,
): Candidate => {
  const reject = (
    reason: string,
    producerDiagnostic: ProducerDiagnostic | null = null,
  ): Candidate => ({
    realization,
    eligible: false,
    reasonCodes: [reason],
    evidence: null,
    producerDiagnostic,
  });
  if (!realization.targetsTheory) return reject(REASON_THEORY_MISMATCH);
  const obligation = requiredObligationId(theory);
  if (obligation === null) return reject(REASON_OBLIGATION_SET_UNSUPPORTED);

  const matching = outcomes.filter(
    (outcome) =>
      outcome.theoryIdentity === theory.identity &&
      outcome.realizationIdentity === realization.identity,
  );
  if (matching.length === 0) return reject(REASON_MISSING_EVIDENCE);
  if (matching.length > 1) return reject(REASON_EVIDENCE_AMBIGUOUS);
  const outcome = matching[0]!;
  if (outcome.artifactKind === "producer_diagnostic") {
    return reject(outcome.reasonCode, outcome);
  }
  const evidence = outcome;
  if (evidence.obligation !== obligation) {
    return reject(REASON_EVIDENCE_OBLIGATION_MISMATCH);
  }

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
    producerDiagnostic: null,
  };
};

export const resolve = (
  theory: Theory,
  realizations: ReadonlyArray<Realization>,
  outcomes: ReadonlyArray<ProducerOutcome>,
  policy: JsonObject,
): Resolution => {
  const ambiguity = requireString(requireKey(policy, "ambiguity", "policy"), "policy.ambiguity");
  if (ambiguity !== "reject") {
    throw new DocumentError({ message: `unsupported ambiguity policy '${ambiguity}'` });
  }
  const candidates = realizations.map((realization) =>
    evaluateCandidate(theory, realization, outcomes, policy),
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
