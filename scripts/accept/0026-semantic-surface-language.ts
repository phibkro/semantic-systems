#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const artifacts = [
  "design-specs/0026-semantic-surface-language.md",
  "plans/active/0026-semantic-surface-language.md",
  "model/work/semantic-surface-language.json",
  "src/surface-language/index.ts",
  "src/surface-language/ast.ts",
  "src/surface-language/errors.ts",
  "src/surface-language/lexer.ts",
  "src/surface-language/parser.ts",
  "src/surface-language/elaborate.ts",
  "tests/semantic-surface-language.test.ts",
  "tests/semantic-surface-language-node.test.ts",
  "examples/surface-language/handled-fresh.semantic",
] as const;

const requireFile = (relativePath: string) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing surface-language artifact ${relativePath}`,
      });
    }
  });

const program = Effect.gen(function* () {
  for (const artifact of artifacts) yield* requireFile(artifact);
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });

  for (const command of [
    ["bun", "test", "tests/semantic-surface-language.test.ts"],
    [nodeExecutable, "--test", "tests/semantic-surface-language-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/surface-language",
      "tests/semantic-surface-language.test.ts",
      "tests/semantic-surface-language-node.test.ts",
      "scripts/accept/0026-semantic-surface-language.ts",
      "design-specs/0026-semantic-surface-language.md",
      "plans/active/0026-semantic-surface-language.md",
      "model/work/semantic-surface-language.json",
      "examples/surface-language",
    ],
    [
      "bun",
      "test",
      "tests/kernel-json-format.test.ts",
      "tests/kernel-reference-interpreter.test.ts",
    ],
    ["just", "check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0026", program);
