#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const contractArtifacts = [
  "design-specs/0032-baseline-bytecode-backend.md",
  "plans/active/0032-baseline-bytecode-backend.md",
  "model/work/baseline-bytecode-backend.json",
] as const;

const implementationArtifacts = [
  "src/kernel-execution/prepare.ts",
  "src/kernel-bytecode/index.ts",
  "src/kernel-bytecode/compiler.ts",
  "src/kernel-bytecode/custody.ts",
  "src/kernel-bytecode/differential.ts",
  "src/kernel-bytecode/instruction.ts",
  "src/kernel-bytecode/schema.ts",
  "src/kernel-bytecode/vm.ts",
  "tests/kernel-execution-preparation.test.ts",
  "tests/kernel-bytecode-architecture.test.ts",
  "tests/kernel-bytecode-backend.test.ts",
  "tests/kernel-bytecode-bounds.test.ts",
  "tests/kernel-bytecode-differential.test.ts",
  "tests/kernel-bytecode-backend-node.test.ts",
  "examples/kernel-bytecode/perturbed-opcode.kernel.json",
  "examples/kernel-bytecode/perturbed-branch.kernel.json",
  "examples/kernel-bytecode/perturbed-slot.kernel.json",
] as const;

const requireFile = (relativePath: string, kind: "contract" | "implementation") =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing baseline bytecode backend ${kind} artifact ${relativePath}`,
      });
    }
  });

const program = Effect.gen(function* () {
  for (const artifact of contractArtifacts) yield* requireFile(artifact, "contract");

  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });

  for (const artifact of implementationArtifacts) yield* requireFile(artifact, "implementation");

  for (const command of [
    [
      "bun",
      "test",
      "tests/kernel-execution-preparation.test.ts",
      "tests/kernel-bytecode-architecture.test.ts",
      "tests/kernel-bytecode-backend.test.ts",
      "tests/kernel-bytecode-bounds.test.ts",
      "tests/kernel-bytecode-differential.test.ts",
    ],
    [nodeExecutable, "--test", "tests/kernel-bytecode-backend-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/kernel-execution",
      "src/kernel-bytecode",
      "tests/kernel-execution-preparation.test.ts",
      "tests/kernel-bytecode-architecture.test.ts",
      "tests/kernel-bytecode-backend.test.ts",
      "tests/kernel-bytecode-bounds.test.ts",
      "tests/kernel-bytecode-differential.test.ts",
      "tests/kernel-bytecode-backend-node.test.ts",
      "examples/kernel-bytecode",
      "scripts/accept/0032-baseline-bytecode-backend.ts",
      "design-specs/0032-baseline-bytecode-backend.md",
      "plans/active/0032-baseline-bytecode-backend.md",
      "model/work/baseline-bytecode-backend.json",
    ],
    ["bun", "scripts/accept/0018-minimal-kernel-calculus.ts"],
    ["bun", "scripts/accept/0020-agent-facing-kernel-json.ts"],
    ["bun", "scripts/accept/0022-kernel-reference-interpreter.ts"],
    ["just", "check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0032", program);
