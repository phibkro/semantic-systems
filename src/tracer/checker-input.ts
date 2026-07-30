import { Effect, type Crypto } from "effect";
import { contentIdentity, jsonEqual } from "./canonical.ts";
import { diffSemanticJson, type CheckerViolation } from "./checker-report.ts";
import {
  DocumentError,
  requireKey,
  requireObject,
  requireObjectList,
  requireString,
  requireStringList,
  type JsonObject,
  type JsonValue,
} from "./json.ts";
import {
  parseProducerOutcome,
  producerOutcomeToJson,
  type EvidenceResult,
  type ProducerOutcome,
} from "./packets.ts";
import { normalizeRealization, type Realization } from "./realization.ts";
import { normalizeTheory, requiredObligationId } from "./theory.ts";

export interface PreparedCheckerInput {
  readonly theoryId: string;
  readonly theoryIdentity: string;
  readonly obligation: string | null;
  readonly realizations: ReadonlyArray<Realization>;
  readonly policy: JsonObject;
  readonly policyId: string;
  readonly policyIdentity: string;
  readonly outcomes: ReadonlyArray<ProducerOutcome>;
  readonly claim: JsonObject;
  readonly claimedCandidates: ReadonlyArray<JsonObject>;
  readonly claimedHeader: JsonObject;
  readonly violations: Array<CheckerViolation>;
}

export interface ExpectedCandidate {
  readonly id: string;
  readonly document: JsonObject;
  readonly eligible: boolean;
  readonly realization: Realization;
  readonly evidence: EvidenceResult | null;
}

interface AuthoredRecipe {
  readonly identity: string;
  readonly theoryId: string;
  readonly theoryIdentity: string;
  readonly obligation: string;
  readonly category: string;
  readonly producer: JsonObject;
  readonly assumptions: ReadonlyArray<string>;
  readonly caseIds: ReadonlyArray<string>;
}

const parseRecipes = (
  documents: ReadonlyArray<JsonObject>,
  violations: Array<CheckerViolation>,
): Effect.Effect<ReadonlyMap<string, AuthoredRecipe>, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const recipes = new Map<string, AuthoredRecipe>();
    for (const [index, document] of documents.entries()) {
      const subject = `recipes[${index}]`;
      if (document.kind !== "conformance_suite") {
        return yield* new DocumentError({
          message: `${subject}.kind must be 'conformance_suite'`,
        });
      }
      const identity = yield* contentIdentity(document);
      if (recipes.has(identity)) {
        violations.push({ code: "recipe_duplicate", subject: identity, details: {} });
        continue;
      }
      const cases = requireObjectList(requireKey(document, "cases", subject), `${subject}.cases`);
      recipes.set(identity, {
        identity,
        theoryId: requireString(requireKey(document, "theory", subject), `${subject}.theory`),
        theoryIdentity: requireString(
          requireKey(document, "theory_identity", subject),
          `${subject}.theory_identity`,
        ),
        obligation: requireString(
          requireKey(document, "obligation", subject),
          `${subject}.obligation`,
        ),
        category: requireString(requireKey(document, "category", subject), `${subject}.category`),
        producer: requireObject(requireKey(document, "producer", subject), `${subject}.producer`),
        assumptions: requireStringList(document.assumptions ?? [], `${subject}.assumptions`),
        caseIds: cases.map((item, caseIndex) =>
          requireString(
            requireKey(item, "id", `${subject}.cases[${caseIndex}]`),
            `${subject}.cases[${caseIndex}].id`,
          ),
        ),
      });
    }
    return recipes;
  });

const sameStrings = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

const validateRecipeBindings = (
  outcomes: ReadonlyArray<ProducerOutcome>,
  recipes: ReadonlyMap<string, AuthoredRecipe>,
  theoryId: string,
  theoryIdentity: string,
  obligation: string | null,
  violations: Array<CheckerViolation>,
): void => {
  for (const outcome of outcomes) {
    if (outcome.artifactKind !== "evidence_result") continue;
    const subject = outcome.identity;
    if (outcome.caseResults.length === 0) {
      violations.push({ code: "evidence_cases_empty", subject, details: {} });
    }
    const recipe = recipes.get(outcome.recipeIdentity);
    if (recipe === undefined) {
      violations.push({
        code: "evidence_recipe_unbound",
        subject,
        details: { recipe_identity: outcome.recipeIdentity },
      });
      continue;
    }
    const mismatches: Array<string> = [];
    if (recipe.theoryId !== theoryId) mismatches.push("theory");
    if (recipe.theoryIdentity !== theoryIdentity) mismatches.push("theory_identity");
    if (recipe.obligation !== obligation) mismatches.push("obligation");
    if (recipe.category !== outcome.category) mismatches.push("category");
    if (!jsonEqual(recipe.producer, outcome.producer)) mismatches.push("producer");
    if (!sameStrings(recipe.assumptions, outcome.assumptions)) mismatches.push("assumptions");
    const caseIds = outcome.caseResults.map((item) => item.caseId);
    if (new Set(caseIds).size !== caseIds.length || !sameStrings(recipe.caseIds, caseIds)) {
      mismatches.push("case_ids");
    }
    if (mismatches.length > 0) {
      violations.push({
        code: "evidence_recipe_field_mismatch",
        subject,
        details: { fields: mismatches },
      });
    }
  }
};

const parseOutcomes = (
  documents: ReadonlyArray<JsonValue>,
  violations: Array<CheckerViolation>,
): Effect.Effect<ReadonlyArray<ProducerOutcome>, never, Crypto.Crypto> =>
  Effect.gen(function* () {
    const outcomes: Array<ProducerOutcome> = [];
    for (const [index, document] of documents.entries()) {
      const subject = `producer_outcomes[${index}]`;
      const parsed = yield* parseProducerOutcome(document, subject).pipe(
        Effect.catch((error) => {
          violations.push({
            code: "producer_outcome_malformed",
            subject,
            details: { error: error.message },
          });
          return Effect.succeed(null);
        }),
      );
      if (parsed === null) continue;
      const mismatches: Array<CheckerViolation> = [];
      diffSemanticJson(subject, document, producerOutcomeToJson(parsed), mismatches);
      for (const violation of mismatches) {
        violations.push({
          ...violation,
          code: "producer_outcome_field_mismatch",
        });
      }
      outcomes.push(parsed);
    }
    const counts = new Map<string, number>();
    for (const outcome of outcomes) {
      const key = [
        outcome.theoryIdentity,
        outcome.realizationIdentity,
        outcome.artifactKind === "evidence_result" ? outcome.obligation : "diagnostic",
      ].join("\0");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [subject, count] of counts) {
      if (count > 1) {
        violations.push({
          code: "producer_outcome_multiple",
          subject,
          details: { count },
        });
      }
    }
    return outcomes;
  });

export const prepareCheckerInput = (
  theoryDocument: JsonObject,
  realizationDocuments: ReadonlyArray<JsonObject>,
  recipeDocuments: ReadonlyArray<JsonObject>,
  policy: JsonObject,
  producerOutcomeDocuments: ReadonlyArray<JsonValue>,
  claim: JsonObject,
): Effect.Effect<PreparedCheckerInput, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const violations: Array<CheckerViolation> = [];
    const theoryId = requireString(requireKey(theoryDocument, "id", "theory"), "theory.id");
    const theory = yield* normalizeTheory(theoryDocument);
    const realizations = yield* Effect.forEach(realizationDocuments, (document) =>
      normalizeRealization(document, theory, theoryId),
    );
    const claimedCandidates = requireObjectList(
      requireKey(claim, "candidates", "claim"),
      "claim.candidates",
    );
    const obligation = requiredObligationId(theory);
    const recipes = yield* parseRecipes(recipeDocuments, violations);
    const outcomes = yield* parseOutcomes(producerOutcomeDocuments, violations);
    validateRecipeBindings(outcomes, recipes, theoryId, theory.identity, obligation, violations);
    return {
      theoryId,
      theoryIdentity: theory.identity,
      obligation,
      realizations,
      policy,
      policyId: requireString(requireKey(policy, "id", "policy"), "policy.id"),
      policyIdentity: yield* contentIdentity(policy),
      outcomes,
      claim,
      claimedCandidates,
      claimedHeader: Object.fromEntries(
        Object.entries(claim).filter(([key]) => key !== "candidates"),
      ) as JsonObject,
      violations,
    };
  });
