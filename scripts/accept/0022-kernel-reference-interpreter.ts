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
  "design-specs/0022-kernel-reference-interpreter.md",
  "plans/active/0022-kernel-reference-interpreter.md",
  "model/work/kernel-reference-interpreter.json",
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

const program = Effect.gen(function* () {
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
      "plans/active/0022-kernel-reference-interpreter.md",
      "model/work/kernel-reference-interpreter.json",
    ],
    ["bun", "scripts/accept/0020-agent-facing-kernel-json.ts"],
    ["just", "check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0022", program);
