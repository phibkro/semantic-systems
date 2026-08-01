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
  "design-specs/0033-semantic-runtime-closure-manifest.md",
  "plans/active/0033-semantic-runtime-closure-manifest.md",
  "model/work/semantic-runtime-closure-manifest.json",
  "src/language-build/runtime-closure.ts",
  "tests/language-build-runtime-closure.test.ts",
  "tests/language-build-runtime-closure-node.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing semantic runtime-closure artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/language-build-runtime-closure.test.ts"], {
    cwd: root,
  });
  yield* runCommand(
    [nodeExecutable, "--test", "tests/language-build-runtime-closure-node.test.ts"],
    { cwd: root },
  );
  yield* runCommand(["bun", "test", "tests/language-build-reachability.test.ts"], {
    cwd: root,
  });
  yield* runCommand(["bun", "test", "tests/language-build-semantic-store.test.ts"], {
    cwd: root,
  });
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/language-build",
      "tests/language-build-runtime-closure.test.ts",
      "tests/language-build-runtime-closure-node.test.ts",
      "scripts/accept/0033-semantic-runtime-closure-manifest.ts",
      "design-specs/0033-semantic-runtime-closure-manifest.md",
      "plans/active/0033-semantic-runtime-closure-manifest.md",
      "model/work/semantic-runtime-closure-manifest.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], {
    cwd: root,
  });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0033", program);
