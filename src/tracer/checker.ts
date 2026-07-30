import { Effect, type Crypto } from "effect";
import { prepareCheckerInput, type ExpectedCandidate } from "./checker-input.ts";
import * as Report from "./checker-report.ts";
import * as Json from "./json.ts";
import * as Packets from "./packets.ts";
import * as Realizations from "./realization.ts";
import * as Reasons from "./reasons.ts";

const policyReasons = (
  evidence: Packets.EvidenceResult,
  realization: Realizations.Realization,
  policy: Json.JsonObject,
): ReadonlyArray<string> => {
  const requirements = Json.requireObject(
    Json.requireKey(policy, "requirements", "policy"),
    "policy.requirements",
  );
  const requirement = requirements[evidence.obligation];
  const reasons: Array<string> = [];
  if (requirement === undefined) {
    reasons.push(Reasons.REASON_OBLIGATION_NOT_GOVERNED);
  } else {
    const rule = Json.requireObject(requirement, `policy.requirements.${evidence.obligation}`);
    const categories = rule.accepted_categories;
    if (!Array.isArray(categories) || !categories.includes(evidence.category)) {
      reasons.push(Reasons.REASON_CATEGORY_NOT_ACCEPTED);
    }
    if (
      (evidence.assumptions.length > 0 ||
        Realizations.realizationAssumptions(realization).length > 0) &&
      rule.allow_assumptions !== true
    ) {
      reasons.push(Reasons.REASON_ASSUMPTIONS_NOT_ALLOWED);
    }
  }
  if (!Packets.evidencePassed(evidence)) reasons.push(Reasons.REASON_CONFORMANCE_FAILED);
  return reasons;
};

const expectedCandidate = (
  realization: Realizations.Realization,
  theoryIdentity: string,
  obligation: string | null,
  outcomes: ReadonlyArray<Packets.ProducerOutcome>,
  policy: Json.JsonObject,
): ExpectedCandidate => {
  let evidence: Packets.EvidenceResult | null = null;
  let diagnostic: Json.JsonObject | null = null;
  let reasons: ReadonlyArray<string>;
  if (!realization.targetsTheory) {
    reasons = [Reasons.REASON_THEORY_MISMATCH];
  } else if (obligation === null) {
    reasons = [Reasons.REASON_OBLIGATION_SET_UNSUPPORTED];
  } else {
    const matches = outcomes.filter(
      (outcome) =>
        outcome.theoryIdentity === theoryIdentity &&
        outcome.realizationIdentity === realization.identity &&
        (outcome.artifactKind === "producer_diagnostic" || outcome.obligation === obligation),
    );
    if (matches.length === 0) {
      reasons = [Reasons.REASON_MISSING_EVIDENCE];
    } else if (matches.length > 1) {
      reasons = [Reasons.REASON_EVIDENCE_AMBIGUOUS];
    } else if (matches[0]!.artifactKind === "producer_diagnostic") {
      const outcome = matches[0]!;
      reasons = [outcome.reasonCode];
      diagnostic = { reason_code: outcome.reasonCode, detail: outcome.detail };
    } else {
      evidence = matches[0]!;
      reasons = policyReasons(evidence, realization, policy);
    }
  }
  const eligible = reasons.length === 0;
  return {
    id: Realizations.realizationId(realization),
    eligible,
    realization,
    evidence,
    document: {
      realization_id: Realizations.realizationId(realization),
      realization_identity: realization.identity,
      targets_theory: realization.targetsTheory,
      realization_assumptions: Realizations.realizationAssumptions(realization),
      evidence: evidence === null ? null : Packets.evidenceToJson(evidence),
      producer_diagnostic: diagnostic,
      eligible,
      reason_codes: reasons,
    },
  };
};

export const checkResolution = (
  theoryDocument: Json.JsonObject,
  realizationDocuments: ReadonlyArray<Json.JsonObject>,
  recipeDocuments: ReadonlyArray<Json.JsonObject>,
  policyDocument: Json.JsonObject,
  producerOutcomeDocuments: ReadonlyArray<Json.JsonValue>,
  claimDocument: Json.JsonObject,
): Effect.Effect<Report.CheckerReport, never, Crypto.Crypto> =>
  prepareCheckerInput(
    theoryDocument,
    realizationDocuments,
    recipeDocuments,
    policyDocument,
    producerOutcomeDocuments,
    claimDocument,
  ).pipe(
    Effect.map((input) => {
      const expected = input.realizations.map((realization) =>
        expectedCandidate(
          realization,
          input.theoryIdentity,
          input.obligation,
          input.outcomes,
          input.policy,
        ),
      );
      const eligible = expected.filter((candidate) => candidate.eligible);
      const selected = eligible.length === 1 ? eligible[0]! : null;
      const status: "selected" | "rejected" = selected === null ? "rejected" : "selected";
      const selectedValue =
        selected === null ? null : { id: selected.id, identity: selected.realization.identity };
      const assumptions =
        selected === null
          ? []
          : [
              ...new Set([
                ...Realizations.realizationAssumptions(selected.realization),
                ...(selected.evidence?.assumptions ?? []),
              ]),
            ].sort();
      const expectedHeader: Json.JsonObject = {
        artifact_kind: "resolution_claim",
        schema_version: 1,
        theory: { id: input.theoryId, identity: input.theoryIdentity },
        required_obligation: input.obligation,
        policy: { id: input.policyId, content_identity: input.policyIdentity },
        status,
        selected: selectedValue,
        selected_assumptions: assumptions,
      };
      const violations: Array<Report.CheckerViolation> = [...input.violations];
      Report.diffSemanticJson("claim", input.claimedHeader, expectedHeader, violations);
      const claimedById = new Map<string, Json.JsonObject>();
      for (const candidate of input.claimedCandidates) {
        const id = Json.requireString(
          Json.requireKey(candidate, "realization_id", "claim candidate"),
          "claim candidate.realization_id",
        );
        if (claimedById.has(id)) {
          violations.push({ code: "candidate_duplicate", subject: id, details: {} });
        } else {
          claimedById.set(id, candidate);
        }
      }
      const expectedIds = new Set(expected.map((candidate) => candidate.id));
      for (const candidate of expected) {
        const claimed = claimedById.get(candidate.id);
        if (claimed === undefined) {
          violations.push({ code: "candidate_missing", subject: candidate.id, details: {} });
        } else {
          Report.diffSemanticJson(
            `claim.candidates.${candidate.id}`,
            claimed,
            candidate.document,
            violations,
          );
        }
      }
      for (const id of claimedById.keys()) {
        if (!expectedIds.has(id)) {
          violations.push({ code: "candidate_unknown", subject: id, details: {} });
        }
      }
      return {
        valid: violations.length === 0,
        violations,
        recomputedStatus: status,
        recomputedSelected: selectedValue,
        recomputedSelectedAssumptions: assumptions,
        modelBindingStatus: "not_checked" as const,
      };
    }),
    Effect.catch((error) =>
      Effect.succeed(
        Report.invalidCheckerInput(
          error instanceof Json.DocumentError
            ? error
            : new Json.DocumentError({
                message: "checker input is malformed",
                cause: error,
              }),
        ),
      ),
    ),
  );
