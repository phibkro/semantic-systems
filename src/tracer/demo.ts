import { Effect, type Crypto, type FileSystem, type Path } from "effect";
import { produceEvidence, type EvidenceAdapters } from "./evidence.ts";
import { executeScenario, executionToJson, type ExecutionResult } from "./execution.ts";
import { explanationToJson, type ExplanationNode } from "./explanation.ts";
import { DocumentError, requireKey, requireString, type JsonObject } from "./json.ts";
import { loadInventory } from "./loader.ts";
import { resolveReplay, resolveTransition } from "./operations.ts";
import { normalizeRealization, operationBinding, realizationId } from "./realization.ts";
import { resolutionClaimToJson, type ResolutionClaim } from "./resolution-claim.ts";
import {
  buildResolutionClaimFromResolution,
  candidateExplanation,
  requiredObligation,
  resolutionToJson,
  resolve,
  type Resolution,
} from "./resolver.ts";
import { normalizeTheory, type Theory } from "./theory.ts";

const EVIDENCE_ADAPTERS: EvidenceAdapters = { resolveTransition, resolveReplay };

export interface DemoResult {
  readonly theory: Theory;
  readonly theoryId: string;
  readonly resolution: Resolution;
  readonly resolutionClaim: ResolutionClaim;
  readonly execution: ExecutionResult | null;
  readonly assumptions: ReadonlyArray<string>;
  readonly explanation: ExplanationNode;
}

export const demoToJson = (result: DemoResult): JsonObject => ({
  theory: { id: result.theoryId, identity: result.theory.identity },
  resolution: resolutionToJson(result.resolution),
  resolution_claim: resolutionClaimToJson(result.resolutionClaim),
  execution: result.execution === null ? null : executionToJson(result.execution),
  assumptions: result.assumptions,
  explanation: explanationToJson(result.explanation),
});

export const runDemo = (
  root: string,
  policy = "development",
): Effect.Effect<DemoResult, DocumentError, FileSystem.FileSystem | Path.Path | Crypto.Crypto> =>
  Effect.gen(function* () {
    const fixture = yield* loadInventory(root, policy);
    const theoryId = yield* Effect.try({
      try: () => requireString(requireKey(fixture.theory, "id", "theory"), "theory.id"),
      catch: (error) =>
        error instanceof DocumentError
          ? error
          : new DocumentError({ message: "inventory theory identifier is invalid", cause: error }),
    });
    const theory = yield* normalizeTheory(fixture.theory);
    const realizations = yield* Effect.forEach(fixture.realizations, (document) =>
      normalizeRealization(document, theory, theoryId),
    );
    const obligation = requiredObligation(theory);
    const evidenceOutcomes = yield* Effect.forEach(realizations, (realization) =>
      produceEvidence(
        theory,
        theoryId,
        obligation,
        realization,
        fixture.evidenceSuites,
        EVIDENCE_ADAPTERS,
      ),
    );
    const resolution = yield* resolve(theory, realizations, evidenceOutcomes, fixture.policy);
    const resolutionClaim = yield* buildResolutionClaimFromResolution(
      theoryId,
      theory,
      fixture.policy,
      resolution,
    );
    return yield* Effect.try({
      try: () => {
        let execution: ExecutionResult | null = null;
        if (resolution.status === "selected") {
          const selected = resolution.candidates.find(
            (candidate) => realizationId(candidate.realization) === resolution.selectedRealization,
          )!;
          execution = executeScenario(
            fixture.scenario,
            resolveTransition(operationBinding(selected.realization.document, "transition")),
          );
        }
        const assumptions = resolutionClaim.selectedAssumptions;
        const explanation: ExplanationNode = {
          rule: "resolve_inventory_deployment",
          outcome: resolution.status,
          subject: theory.identity,
          details: {
            policy: requireString(requireKey(fixture.policy, "id", "policy"), "policy.id"),
            selected_realization: resolution.selectedRealization,
            reason_codes: resolution.reasonCodes,
            assumptions,
            change_options:
              resolution.status === "selected"
                ? []
                : [
                    "Inspect candidate reason codes and satisfy exactly one candidate.",
                    "If several candidates are eligible, add an explicit future selection rule.",
                  ],
          },
          children: resolution.candidates.map(candidateExplanation),
        };
        return {
          theory,
          theoryId,
          resolution,
          resolutionClaim,
          execution,
          assumptions,
          explanation,
        };
      },
      catch: (error) =>
        error instanceof DocumentError
          ? error
          : new DocumentError({ message: "inventory tracer failed", cause: error }),
    });
  });
