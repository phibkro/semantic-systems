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
  "src/kernel-source/index.ts",
  "src/kernel-source/bytes.ts",
  "src/kernel-source/green.ts",
  "src/kernel-source/lexer.ts",
  "src/kernel-source/parser.ts",
  "src/kernel-source/project.ts",
  "tests/kernel-source-format.test.ts",
  "tests/kernel-source-custody.test.ts",
  "tests/kernel-source-incremental.test.ts",
  "tests/kernel-source-node.test.ts",
  "examples/kernel-source/handled-program.semantic",
] as const;

const requireArtifacts = Effect.forEach(requiredArtifacts, (relativePath) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing lossless kernel source artifact ${relativePath}`,
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
      "tests/kernel-source-format.test.ts",
      "tests/kernel-source-custody.test.ts",
      "tests/kernel-source-incremental.test.ts",
    ],
    [nodeExecutable, "--test", "tests/kernel-source-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/kernel-source",
      "tests/kernel-source-format.test.ts",
      "tests/kernel-source-custody.test.ts",
      "tests/kernel-source-incremental.test.ts",
      "tests/kernel-source-node.test.ts",
      "examples/kernel-source",
      "scripts/accept/0020-lossless-kernel-source.ts",
      "scripts/oxlint/semantic-effect-rules.ts",
      "tests/semantic-effect-rules.test.ts",
    ],
    ["bun", "test", "tests/semantic-effect-rules.test.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    ["bun", "scripts/accept/0019-normalized-core-format.ts"],
    ["just", "check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0020", program);
