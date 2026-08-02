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
  "src/normalized-core/index.ts",
  "src/normalized-core/schema.ts",
  "src/normalized-core/canonical.ts",
  "src/normalized-core/identity.ts",
  "src/normalized-core/normalize.ts",
  "tests/normalized-core-format.test.ts",
  "tests/normalized-core-custody.test.ts",
  "tests/normalized-core-node.test.ts",
  "examples/normalized-core/handled-program.expected.json",
  "scripts/oxlint/semantic-effect-rules.ts",
  "tests/semantic-effect-rules.test.ts",
] as const;

const requireArtifacts = Effect.forEach(requiredArtifacts, (relativePath) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing normalized core artifact ${relativePath}`,
      });
    }
  }),
);
const requireV2Boundary = Effect.gen(function* () {
  const source = yield* Effect.promise(() =>
    Bun.file(resolve(root, "src/normalized-core/schema.ts")).text(),
  );
  if (
    !source.includes("version: 2") ||
    !source.includes("semantic.kernel-calculus/0018/v2") ||
    !source.includes('tag: "sum"')
  ) {
    return yield* new AcceptanceFailure({
      message: "active normalized-core boundary must expose the v2 kernel and sum grammar",
    });
  }
});

const program = Effect.gen(function* () {
  yield* requireV2Boundary;
  yield* requireArtifacts;
  for (const command of [
    [
      "bun",
      "test",
      "tests/normalized-core-format.test.ts",
      "tests/normalized-core-custody.test.ts",
    ],
    [nodeExecutable, "--test", "tests/normalized-core-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/normalized-core",
      "tests/normalized-core-format.test.ts",
      "tests/normalized-core-custody.test.ts",
      "tests/normalized-core-node.test.ts",
      "examples/normalized-core",
      "scripts/accept/0019-normalized-core-format.ts",
      "scripts/oxlint/semantic-effect-rules.ts",
      "tests/semantic-effect-rules.test.ts",
    ],
    ["bun", "test", "tests/semantic-effect-rules.test.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    ["bun", "scripts/accept/0018-minimal-kernel-calculus.ts"],
    ["just", "check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0019", program);
