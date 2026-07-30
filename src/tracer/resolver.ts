import {
  evidenceCounterexamples,
  evidencePassed,
  evidencePassedCases,
  evidenceToJson,
  evidenceTotalCases,
  producerDiagnosticToJson,
  type EvidenceResult,
  type ProducerDiagnostic,
  type ProducerDiagnosticKind,
  type ProducerOutcome,
} from "./evidence.ts";
import type { ExplanationNode } from "./explanation.ts";
import {
  DocumentError,
  requireKey,
  requireObject,
  requireString,
  type JsonObject,
} from "./json.ts";
import { realizationAssumptions, realizationId, type Realization } from "./realization.ts";
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
  counterexamples: candidate.evidence === null ? [] : evidenceCounterexamples(candidate.evidence),
  producer_diagnostic:
    candidate.producerDiagnostic === null
      ? null
      : producerDiagnosticToJson(candidate.producerDiagnostic),
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
  } else if (candidate.producerDiagnostic !== null) {
    children.push({
      rule: "produce_conformance_evidence",
      outcome: "diagnostic",
      subject: realizationId(candidate.realization),
      details: {
        kind: candidate.producerDiagnostic.kind,
        message: candidate.producerDiagnostic.message,
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

export const requiredObligation = (theory: Theory): string | null => {
  const raw = theory.payload.obligations;
  if (!Array.isArray(raw) || raw.length !== 1) return null;
  const first = raw[0];
  if (first === null || typeof first !== "object" || Array.isArray(first)) return null;
  return typeof first.id === "string" ? first.id : null;
};

// Exhaustive over ProducerDiagnosticKind so a new producer diagnostic fails
// the typecheck here instead of falling through unmapped. `not_targeted` and
// `obligation_unsupported` are unreachable in practice: resolver's own
// targetsTheory/requiredObligation gates below always short-circuit before a
// producer outcome carrying either kind is consulted; the entries exist for
// defense in depth if a caller ever hand-builds an outcome.
const DIAGNOSTIC_REASON: Readonly<Record<ProducerDiagnosticKind, string>> = {
  not_targeted: REASON_THEORY_MISMATCH,
  obligation_unsupported: REASON_OBLIGATION_SET_UNSUPPORTED,
  missing_evidence: REASON_MISSING_EVIDENCE,
  ambiguous_evidence: REASON_EVIDENCE_AMBIGUOUS,
  stale_evidence_recipe: REASON_EVIDENCE_STALE,
  evidence_obligation_mismatch: REASON_EVIDENCE_OBLIGATION_MISMATCH,
  unbound_operation: REASON_OPERATION_UNBOUND,
};

/**
 * Consumes an already-produced evidence packet (or typed producer
 * diagnostic); it never selects a recipe, resolves an execution adapter, or
 * runs conformance itself. See the evidence-production boundary in
 * `evidence.ts`.
 */
const evaluateCandidate = (
  theory: Theory,
  realization: Realization,
  producerOutcome: ProducerOutcome,
  policy: JsonObject,
): Candidate => {
  const reject = (reason: string, producerDiagnostic: ProducerDiagnostic | null = null): Candidate => ({
    realization,
    eligible: false,
    reasonCodes: [reason],
    evidence: null,
    producerDiagnostic,
  });
  if (!realization.targetsTheory) return reject(REASON_THEORY_MISMATCH);
  const obligation = requiredObligation(theory);
  if (obligation === null) return reject(REASON_OBLIGATION_SET_UNSUPPORTED);

  if (!producerOutcome.ok) {
    return reject(DIAGNOSTIC_REASON[producerOutcome.diagnostic.kind], producerOutcome.diagnostic);
  }
  const evidence = producerOutcome.result;
  // The producer only returns `ok: true` after matching this exact
  // obligation (see evidence.ts), but the resolver re-checks explicitly
  // rather than trusting that internal invariant alone.
  if (evidence.obligation !== obligation) return reject(REASON_EVIDENCE_OBLIGATION_MISMATCH);

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

/**
 * Binds each producer outcome to its realization by declared, unique
 * authored ID (`outcome.realizationId`), never by array position:
 * `evidenceOutcomes` may arrive in any order relative to `realizations`.
 * Coverage must be exact — one outcome per realization, no omission, no
 * duplicate binding, no outcome bound to an unknown realization. Every
 * outcome (success or diagnostic) must also declare the exact authored
 * realization content identity it claims, and every successful result must
 * declare the exact authored theory content identity; a mismatch on either
 * throws instead of silently misattributing evidence (a rebound pure result
 * or diagnostic must never make a different, broken realization eligible).
 */
const bindOutcomes = (
  theory: Theory,
  realizations: ReadonlyArray<Realization>,
  evidenceOutcomes: ReadonlyArray<ProducerOutcome>,
): ReadonlyMap<string, ProducerOutcome> => {
  const outcomeById = new Map<string, ProducerOutcome>();
  for (const outcome of evidenceOutcomes) {
    if (outcomeById.has(outcome.realizationId)) {
      throw new DocumentError({
        message: `duplicate evidence-production outcome bound to realization '${outcome.realizationId}'`,
      });
    }
    outcomeById.set(outcome.realizationId, outcome);
  }
  const knownIds = new Set(realizations.map((realization) => realizationId(realization)));
  for (const id of outcomeById.keys()) {
    if (!knownIds.has(id)) {
      throw new DocumentError({
        message: `evidence-production outcome bound to unknown realization '${id}'`,
      });
    }
  }
  for (const realization of realizations) {
    const id = realizationId(realization);
    const outcome = outcomeById.get(id);
    if (outcome === undefined) {
      throw new DocumentError({
        message: `missing evidence-production outcome for realization '${id}'`,
      });
    }
    if (outcome.realizationIdentity !== realization.identity) {
      throw new DocumentError({
        message: `evidence-production outcome for realization '${id}' carries a mismatched realization identity`,
      });
    }
    if (outcome.ok) {
      // The wrapper-level realizationIdentity check above only catches a
      // forged wrapper; also verify the embedded evidence artifact's own
      // claimed subject and theory, since a copied result could carry a
      // stale realizationIdentity even under a correctly rebound wrapper.
      if (outcome.result.realizationIdentity !== realization.identity) {
        throw new DocumentError({
          message: `evidence result for realization '${id}' carries a mismatched realization identity`,
        });
      }
      if (outcome.result.theoryIdentity !== theory.identity) {
        throw new DocumentError({
          message: `evidence-production outcome for realization '${id}' carries a mismatched theory identity`,
        });
      }
    }
  }
  return outcomeById;
};

export const resolve = (
  theory: Theory,
  realizations: ReadonlyArray<Realization>,
  evidenceOutcomes: ReadonlyArray<ProducerOutcome>,
  policy: JsonObject,
): Resolution => {
  const ambiguity = requireString(requireKey(policy, "ambiguity", "policy"), "policy.ambiguity");
  if (ambiguity !== "reject") {
    throw new DocumentError({ message: `unsupported ambiguity policy '${ambiguity}'` });
  }
  const outcomeById = bindOutcomes(theory, realizations, evidenceOutcomes);
  const candidates = realizations.map((realization) =>
    evaluateCandidate(theory, realization, outcomeById.get(realizationId(realization))!, policy),
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
