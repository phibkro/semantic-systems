#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";
import {
  canonicalKernelRunObservationJson,
  interpretKernelJsonBytes,
  type KernelRunObservation,
} from "../../src/kernel-interpreter/index.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const contractArtifacts = [
  "design-specs/0022-kernel-reference-interpreter.md",
  "plans/completed/0022-kernel-reference-interpreter.md",
  "model/work/features/0022-kernel-reference-interpreter.json",
] as const;

const implementationArtifacts = [
  "src/kernel-interpreter/index.ts",
  "src/kernel-interpreter/observe.ts",
  "src/kernel-interpreter/schema.ts",
  "src/kernel-interpreter/portable-fact.ts",
  "tests/kernel-reference-interpreter.test.ts",
  "tests/kernel-reference-interpreter-node.test.ts",
  "examples/kernel-json/pure-program.kernel-run.json.golden",
  "examples/kernel-json/handled-program.kernel-run.json.golden",
  "examples/kernel-json/rejected-double-resume.kernel-run.json.golden",
  "examples/kernel-json/rejected-type-mismatch.kernel-run.json.golden",
  "examples/kernel-json/sum-case.kernel.json",
  "examples/kernel-json/sum-case.kernel-run.json.golden",
] as const;

const requireFile = (relativePath: string, kind: string) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing kernel reference interpreter ${kind} artifact ${relativePath}`,
      });
    }
  });

const requireSumCaseObservation = Effect.gen(function* () {
  const [input, expected] = yield* Effect.tryPromise({
    try: async () =>
      [
        new Uint8Array(
          await Bun.file(resolve(root, "examples/kernel-json/sum-case.kernel.json")).arrayBuffer(),
        ),
        JSON.parse(
          await Bun.file(
            resolve(root, "examples/kernel-json/sum-case.kernel-run.json.golden"),
          ).text(),
        ) as unknown,
      ] as const,
    catch: (cause) =>
      new AcceptanceFailure({
        message: `cannot read the v2 sum interpreter tracer: ${String(cause)}`,
      }),
  });
  const actual = interpretKernelJsonBytes(input);
  if (
    actual.version !== 2 ||
    actual.kernel !== "semantic.kernel-calculus/0018/v2" ||
    actual.observation.tag !== "returned" ||
    actual.observation.value.kind !== "int" ||
    actual.observation.value.value !== 7
  ) {
    return yield* new AcceptanceFailure({
      message: "active reference interpreter boundary must emit the v2 sum tracer result",
    });
  }
  const [actualCanonical, expectedCanonical] = yield* Effect.try({
    try: () =>
      [
        canonicalKernelRunObservationJson(actual),
        canonicalKernelRunObservationJson(expected as KernelRunObservation),
      ] as const,
    catch: (cause) =>
      new AcceptanceFailure({
        message: `invalid v2 sum interpreter observation: ${String(cause)}`,
      }),
  });
  if (actualCanonical !== expectedCanonical) {
    return yield* new AcceptanceFailure({
      message: "active reference interpreter must reproduce the frozen v2 sum observation",
    });
  }
});

const program = Effect.gen(function* () {
  yield* requireSumCaseObservation;
  for (const artifact of contractArtifacts) yield* requireFile(artifact, "contract");
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  for (const artifact of implementationArtifacts) yield* requireFile(artifact, "implementation");

  for (const command of [
    ["bun", "test", "tests/kernel-reference-interpreter.test.ts"],
    [nodeExecutable, "--test", "tests/kernel-reference-interpreter-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/kernel-interpreter",
      "tests/kernel-reference-interpreter.test.ts",
      "tests/kernel-reference-interpreter-node.test.ts",
      "scripts/accept/0022-kernel-reference-interpreter.ts",
      "design-specs/0022-kernel-reference-interpreter.md",
      "plans/completed/0022-kernel-reference-interpreter.md",
      "model/work/features/0022-kernel-reference-interpreter.json",
    ],
    ["bun", "scripts/accept/0020-agent-facing-kernel-json.ts"],
    ["just", "check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0022", program);
