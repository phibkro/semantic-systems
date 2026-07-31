#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const requiredArtifacts = [
  "src/kernel-calculus/index.ts",
  "src/kernel-calculus/ast.ts",
  "src/kernel-calculus/grade.ts",
  "src/kernel-calculus/effect-row.ts",
  "src/kernel-calculus/checker.ts",
  "src/kernel-calculus/machine.ts",
  "src/kernel-calculus/report.ts",
  "tests/kernel-calculus-checker.test.ts",
  "tests/kernel-calculus-machine.test.ts",
  "tests/kernel-calculus-custody.test.ts",
  "tests/kernel-calculus-oracle.test.ts",
  "tests/kernel-calculus-node.test.ts",
] as const;

const requireArtifacts = Effect.forEach(requiredArtifacts, (relativePath) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing minimal kernel calculus artifact ${relativePath}`,
      });
    }
  }),
);

const program = Effect.gen(function* () {
  yield* requireArtifacts;

  for (const command of [
    [
      "bun",
      "test",
      "tests/kernel-calculus-checker.test.ts",
      "tests/kernel-calculus-machine.test.ts",
      "tests/kernel-calculus-custody.test.ts",
      "tests/kernel-calculus-oracle.test.ts",
    ],
    [nodeExecutable, "--test", "tests/kernel-calculus-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/kernel-calculus",
      "tests/kernel-calculus-checker.test.ts",
      "tests/kernel-calculus-machine.test.ts",
      "tests/kernel-calculus-custody.test.ts",
      "tests/kernel-calculus-oracle.test.ts",
      "tests/kernel-calculus-node.test.ts",
      "scripts/accept/0018-minimal-kernel-calculus.ts",
    ],
    ["bun", "test", "tests/semantic-effect-rules.test.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0018", program);
