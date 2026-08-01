#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const required = [
  "design-specs/0030-reachability-analysis-receipt.md",
  "plans/active/0030-reachability-analysis-receipt.md",
  "model/work/reachability-analysis-receipt.json",
  "src/language-build/reachability.ts",
  "tests/language-build-reachability.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing reachability-analysis artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/language-build-reachability.test.ts"], { cwd: root });
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/language-build",
      "tests/language-build-reachability.test.ts",
      "scripts/accept/0030-reachability-analysis-receipt.ts",
      "design-specs/0030-reachability-analysis-receipt.md",
      "plans/active/0030-reachability-analysis-receipt.md",
      "model/work/reachability-analysis-receipt.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], {
    cwd: root,
  });
  yield* runCommand(["bun", "scripts/accept/0027-semantic-artifact-store.ts"], { cwd: root });
});

runMain("accept/0030", program);
