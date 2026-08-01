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
  "design-specs/0041-surface-effect-driver-cli.md",
  "plans/active/0041-surface-effect-driver-cli.md",
  "model/work/surface-effect-driver-cli.json",
  "src/surface-cli/source.ts",
  "src/surface-cli/effect-schema.ts",
  "src/surface-cli/observation-script-bytes.ts",
  "src/surface-cli/drive.ts",
  "tests/surface-effect-driver-cli.test.ts",
  "tests/surface-effect-driver-cli-node.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing surface effect-driver CLI artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/surface-effect-driver-cli.test.ts"], { cwd: root });
  yield* runCommand([nodeExecutable, "--test", "tests/surface-effect-driver-cli-node.test.ts"], {
    cwd: root,
  });
  yield* runCommand(
    [
      "bun",
      "test",
      "tests/surface-runner-cli.test.ts",
      "tests/surface-effect-replay.test.ts",
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
      "src/surface-cli",
      "tests/surface-runner-cli.test.ts",
      "tests/surface-effect-driver-cli.test.ts",
      "tests/surface-effect-driver-cli-node.test.ts",
      "scripts/accept/0041-surface-effect-driver-cli.ts",
      "design-specs/0041-surface-effect-driver-cli.md",
      "plans/active/0041-surface-effect-driver-cli.md",
      "model/work/surface-effect-driver-cli.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0041", program);
