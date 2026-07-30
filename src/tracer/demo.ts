import { Effect, Path, type Crypto, type FileSystem } from "effect";
import { checkerReportToJson, type CheckerReport } from "./checker-report.ts";
import { checkResolution } from "./checker.ts";
import { executeScenario, executionToJson, type ExecutionResult } from "./execution.ts";
import { explanationToJson, type ExplanationNode } from "./explanation.ts";
import {
  checkInventoryModelBinding,
  modelBindingReportToJson,
  type ModelBindingReport,
} from "./inventory-binding.ts";
import { DocumentError, requireKey, requireString, type JsonObject } from "./json.ts";
import { loadInventory } from "./loader.ts";
import { resolveTransition } from "./operations.ts";
import { produceEvidence } from "./producer.ts";
import { producerOutcomeToJson, type ProducerOutcome } from "./packets.ts";
import { normalizeRealization, operationBinding, realizationId } from "./realization.ts";
import {
  candidateExplanation,
  buildResolutionClaim,
  resolutionToJson,
  resolve,
  selectedAssumptions,
  type Resolution,
} from "./resolver.ts";
import { normalizeTheory, requiredObligationId, type Theory } from "./theory.ts";

export interface DemoResult {
  readonly theory: Theory;
  readonly theoryId: string;
  readonly producerOutcomes: ReadonlyArray<ProducerOutcome>;
  readonly resolution: Resolution;
  readonly claim: JsonObject;
  readonly checkerReport: CheckerReport;
  readonly modelBindingReport: ModelBindingReport | null;
  readonly execution: ExecutionResult | null;
  readonly assumptions: ReadonlyArray<string>;
  readonly explanation: ExplanationNode;
}

export const demoToJson = (result: DemoResult): JsonObject => ({
  theory: { id: result.theoryId, identity: result.theory.identity },
  producer_outcomes: result.producerOutcomes.map(producerOutcomeToJson),
  resolution: resolutionToJson(result.resolution),
  claim: result.claim,
  checker: checkerReportToJson(result.checkerReport),
  model_binding:
    result.modelBindingReport === null ? null : modelBindingReportToJson(result.modelBindingReport),
  execution: result.execution === null ? null : executionToJson(result.execution),
  assumptions: result.assumptions,
  explanation: explanationToJson(result.explanation),
});

export const runDemo = (
  root: string,
  policy = "development",
  modelRoot?: string,
): Effect.Effect<DemoResult, DocumentError, FileSystem.FileSystem | Path.Path | Crypto.Crypto> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
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
    const obligation = requiredObligationId(theory);
    const producerOutcomes =
      obligation === null
        ? []
        : yield* produceEvidence(
            theory,
            theoryId,
            obligation,
            realizations,
            fixture.evidenceSuites,
          );
    const resolution = yield* Effect.try({
      try: () => {
        return resolve(theory, realizations, producerOutcomes, fixture.policy);
      },
      catch: (error) =>
        error instanceof DocumentError
          ? error
          : new DocumentError({ message: "inventory resolution failed", cause: error }),
    });
    const claim = yield* buildResolutionClaim(theory, theoryId, fixture.policy, resolution);
    const checkerReport = yield* checkResolution(
      fixture.theory,
      fixture.realizations,
      fixture.evidenceSuites,
      fixture.policy,
      producerOutcomes.map(producerOutcomeToJson),
      claim,
    );
    const modelBindingReport = checkerReport.valid
      ? yield* checkInventoryModelBinding(
          modelRoot ?? path.resolve(import.meta.dirname, "../../model"),
          claim,
        )
      : null;
    const checkedReport: CheckerReport = {
      ...checkerReport,
      modelBindingStatus:
        modelBindingReport === null
          ? "not_checked"
          : modelBindingReport.valid
            ? "valid"
            : "invalid",
    };
    return yield* Effect.try({
      try: () => {
        let execution: ExecutionResult | null = null;
        if (
          checkedReport.valid &&
          modelBindingReport?.valid === true &&
          resolution.status === "selected"
        ) {
          const selected = resolution.candidates.find(
            (candidate) => realizationId(candidate.realization) === resolution.selectedRealization,
          )!;
          execution = executeScenario(
            fixture.scenario,
            resolveTransition(operationBinding(selected.realization.document, "transition")),
          );
        }
        const assumptions = selectedAssumptions(resolution);
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
          producerOutcomes,
          resolution,
          claim,
          checkerReport: checkedReport,
          modelBindingReport,
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
