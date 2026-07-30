import { Console, Effect, Path, type Crypto, type FileSystem } from "effect";
import { canonicalJson } from "./canonical.ts";
import { runDemo, type DemoResult } from "./demo.ts";
import type { ExplanationNode } from "./explanation.ts";
import { EVIDENCE_RESULT_KIND, evidencePassedCases, evidenceTotalCases } from "./packets.ts";
import { realizationId } from "./realization.ts";

const printExplanation = (node: ExplanationNode, indent = 0): Effect.Effect<void> =>
  Effect.gen(function* () {
    const prefix = "  ".repeat(indent);
    yield* Console.log(`${prefix}- ${node.rule}: ${node.outcome} (${node.subject})`);
    yield* Console.log(`${prefix}  details: ${canonicalJson(node.details)}`);
    for (const child of node.children) yield* printExplanation(child, indent + 1);
  });

const printReport = (result: DemoResult): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Console.log(`Theory: ${result.theoryId} (${result.theory.identity})`);
    const policy = result.claim.policy as {
      readonly id: string;
      readonly content_identity: string;
    };
    yield* Console.log(`Policy: ${policy.id} (${policy.content_identity})`);
    const resolution = result.resolution;
    const selected = result.claim.selected as {
      readonly id: string;
      readonly identity: string;
    } | null;
    yield* Console.log(
      selected !== null
        ? `Selected: ${selected.id} (${selected.identity})`
        : `Selected: none (${resolution.reasonCodes.join(", ")})`,
    );
    for (const candidate of resolution.candidates) {
      if (!candidate.eligible) {
        yield* Console.log(
          `Rejected: ${realizationId(candidate.realization)} (${
            candidate.reasonCodes.join(", ") || "excluded"
          })`,
        );
      }
    }
    for (const outcome of result.producerOutcomes) {
      if (outcome.artifactKind === EVIDENCE_RESULT_KIND) {
        yield* Console.log(
          `Evidence result: ${outcome.identity} (recipe ${outcome.recipeIdentity}, subject ${outcome.realizationIdentity})`,
        );
      }
    }
    yield* Console.log(
      `Checker: ${result.checkerReport.valid ? "valid" : "invalid"} (${result.checkerReport.violations.length} violations)`,
    );
    for (const violation of result.checkerReport.violations) {
      yield* Console.log(
        `Checker violation: ${violation.code} (${violation.subject}) ${canonicalJson(violation.details)}`,
      );
    }
    yield* Console.log(
      `Model binding: ${result.checkerReport.modelBindingStatus.replace("_", " ")}`,
    );
    for (const violation of result.modelBindingReport?.violations ?? []) {
      yield* Console.log(
        `Model violation: ${violation.code} (${violation.subject}) ${canonicalJson(violation.details)}`,
      );
    }
    for (const candidate of resolution.candidates) {
      if (candidate.evidence !== null) {
        yield* Console.log(
          `Evidence: ${candidate.evidence.category} (${evidencePassedCases(candidate.evidence)}/${evidenceTotalCases(candidate.evidence)} cases passed) for ${realizationId(candidate.realization)}`,
        );
      }
    }
    yield* Console.log(
      `Assumptions: ${result.assumptions.length === 0 ? "none" : result.assumptions.join("; ")}`,
    );
    if (result.execution === null) {
      yield* Console.log("Result: no execution (resolution rejected)");
    } else {
      yield* Console.log(
        `Result: ${result.execution.matchesOracle ? "oracle matched" : "oracle mismatch"}`,
      );
      yield* Console.log(`Events: ${JSON.stringify(result.execution.events)}`);
      yield* Console.log(`Final state: ${JSON.stringify(result.execution.finalState)}`);
    }
    yield* Console.log("Explanation:");
    yield* printExplanation(result.explanation, 1);
  });

const parse = (
  arguments_: ReadonlyArray<string>,
):
  | {
      readonly command: "demo" | "verify-resolution";
      readonly root: string;
      readonly policy: string;
    }
  | undefined => {
  const command = arguments_[0];
  if ((command !== "demo" && command !== "verify-resolution") || arguments_[1] === undefined) {
    return undefined;
  }
  let policy = "development";
  for (let index = 2; index < arguments_.length; index += 1) {
    if (arguments_[index] !== "--policy" || arguments_[index + 1] === undefined) return undefined;
    policy = arguments_[++index]!;
  }
  return { command, root: arguments_[1], policy };
};

export const runTracerCli = (
  arguments_: ReadonlyArray<string>,
): Effect.Effect<number, never, FileSystem.FileSystem | Path.Path | Crypto.Crypto> => {
  const command = parse(arguments_);
  if (command === undefined) {
    return Console.error(
      "usage: semantic-tracer <demo|verify-resolution> ROOT [--policy POLICY]",
    ).pipe(Effect.as(2));
  }
  return Effect.gen(function* () {
    const path = yield* Path.Path;
    const result = yield* runDemo(path.resolve(command.root), command.policy);
    yield* printReport(result);
    return result.checkerReport.valid &&
      result.modelBindingReport?.valid === true &&
      result.resolution.status === "selected" &&
      result.execution !== null &&
      result.execution.matchesOracle
      ? 0
      : 1;
  }).pipe(
    Effect.catch((error) => {
      return Console.error(error.message).pipe(Effect.as(1));
    }),
  );
};
