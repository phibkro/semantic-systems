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
  "design-specs/0039-kernel-runner-cli.md",
  "plans/active/0039-kernel-runner-cli.md",
  "model/work/kernel-runner-cli.json",
  "src/kernel-cli/cli.ts",
  "src/kernel-cli/main-bun.ts",
  "src/kernel-cli/main-node.ts",
  "tests/kernel-runner-cli.test.ts",
  "tests/kernel-runner-cli-node.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing kernel runner CLI artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/kernel-runner-cli.test.ts"], { cwd: root });
  yield* runCommand([nodeExecutable, "--test", "tests/kernel-runner-cli-node.test.ts"], {
    cwd: root,
  });
  yield* runCommand(
    [
      "bun",
      "test",
      "tests/kernel-reference-interpreter.test.ts",
      "tests/kernel-json-custody.test.ts",
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
      "src/kernel-cli",
      "tests/kernel-runner-cli.test.ts",
      "tests/kernel-runner-cli-node.test.ts",
      "scripts/accept/0039-kernel-runner-cli.ts",
      "design-specs/0039-kernel-runner-cli.md",
      "plans/active/0039-kernel-runner-cli.md",
      "model/work/kernel-runner-cli.json",
      "package.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0039", program);
