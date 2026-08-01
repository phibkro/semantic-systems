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
  "design-specs/0037-one-shot-external-effect-replay.md",
  "plans/active/0037-one-shot-external-effect-replay.md",
  "model/work/one-shot-external-effect-replay.json",
  "src/kernel-execution/external-observations.ts",
  "tests/kernel-external-effect-replay.test.ts",
  "tests/kernel-external-effect-replay-node.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing one-shot external-effect artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/kernel-external-effect-replay.test.ts"], {
    cwd: root,
  });
  yield* runCommand(
    [nodeExecutable, "--test", "tests/kernel-external-effect-replay-node.test.ts"],
    {
      cwd: root,
    },
  );
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/kernel-execution/external-observations.ts",
      "src/kernel-interpreter",
      "src/kernel-bytecode",
      "tests/kernel-external-effect-replay.test.ts",
      "tests/kernel-external-effect-replay-node.test.ts",
      "scripts/accept/0037-one-shot-external-effect-replay.ts",
      "design-specs/0037-one-shot-external-effect-replay.md",
      "plans/active/0037-one-shot-external-effect-replay.md",
      "model/work/one-shot-external-effect-replay.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], {
    cwd: root,
  });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0037", program);
