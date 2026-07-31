#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");

const artifacts = [
  "design-specs/0027-semantic-artifact-store.md",
  "plans/active/0027-semantic-artifact-store.md",
  "model/work/semantic-artifact-store.json",
  "src/language-build/index.ts",
  "src/language-build/semantic-store.ts",
  "tests/language-build-semantic-store.test.ts",
] as const;

const requireFile = (relativePath: string) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing semantic artifact store ${relativePath}`,
      });
    }
  });

const program = Effect.gen(function* () {
  for (const artifact of artifacts) yield* requireFile(artifact);

  for (const command of [
    ["bun", "test", "tests/language-build-semantic-store.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/language-build",
      "tests/language-build-semantic-store.test.ts",
      "scripts/accept/0027-semantic-artifact-store.ts",
      "design-specs/0027-semantic-artifact-store.md",
      "plans/active/0027-semantic-artifact-store.md",
      "model/work/semantic-artifact-store.json",
    ],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    ["bun", "scripts/accept/0019-normalized-core-format.ts"],
    ["just", "check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0027", program);
