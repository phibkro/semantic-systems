#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";
const required = [
  "design-specs/0038-surface-effect-replay.md",
  "plans/active/0038-surface-effect-replay.md",
  "model/work/surface-effect-replay.json",
  "examples/surface-language/unhandled-two-step.semantic",
  "src/surface-execution/index.ts",
  "tests/surface-effect-replay.test.ts",
  "tests/surface-effect-replay-node.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing surface effect-replay artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/surface-effect-replay.test.ts"], { cwd: root });
  yield* runCommand([nodeExecutable, "--test", "tests/surface-effect-replay-node.test.ts"], {
    cwd: root,
  });
  yield* runCommand(
    [
      "bun",
      "test",
      "tests/semantic-surface-language.test.ts",
      "tests/kernel-external-effect-replay.test.ts",
      "tests/kernel-bytecode-architecture.test.ts",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/surface-execution",
      "tests/surface-effect-replay.test.ts",
      "tests/surface-effect-replay-node.test.ts",
      "scripts/accept/0038-surface-effect-replay.ts",
      "design-specs/0038-surface-effect-replay.md",
      "plans/active/0038-surface-effect-replay.md",
      "model/work/surface-effect-replay.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0038", program);
