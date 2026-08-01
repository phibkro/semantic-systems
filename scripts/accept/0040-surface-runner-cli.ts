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
  "design-specs/0040-surface-runner-cli.md",
  "plans/active/0040-surface-runner-cli.md",
  "model/work/surface-runner-cli.json",
  "src/surface-cli/cli.ts",
  "src/surface-cli/schema.ts",
  "src/surface-cli/process-host.ts",
  "src/surface-cli/main-bun.ts",
  "src/surface-cli/main-node.ts",
  "tests/surface-runner-cli.test.ts",
  "tests/surface-runner-cli-node.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing surface runner CLI artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/surface-runner-cli.test.ts"], { cwd: root });
  yield* runCommand([nodeExecutable, "--test", "tests/surface-runner-cli-node.test.ts"], {
    cwd: root,
  });
  yield* runCommand(
    [
      "bun",
      "test",
      "tests/semantic-surface-language.test.ts",
      "tests/kernel-reference-interpreter.test.ts",
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
      "src/surface-cli",
      "tests/surface-runner-cli.test.ts",
      "tests/surface-runner-cli-node.test.ts",
      "scripts/accept/0040-surface-runner-cli.ts",
      "design-specs/0040-surface-runner-cli.md",
      "plans/active/0040-surface-runner-cli.md",
      "model/work/surface-runner-cli.json",
      "package.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0040", program);
