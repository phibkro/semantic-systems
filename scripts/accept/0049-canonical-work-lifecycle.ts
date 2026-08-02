#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const required = [
  "design-specs/0049-canonical-work-lifecycle.md",
  "plans/0049-canonical-work-lifecycle.md",
  "model/work/features/0049-canonical-work-lifecycle.json",
  "src/project-model/work-lifecycle.ts",
  "scripts/check-feature-contract.ts",
  "scripts/run-feature-acceptance.ts",
  "tests/work-lifecycle.test.ts",
  "tests/development-control-loop.test.ts",
  "generated/08-feature-lifecycle.md",
] as const;
const forbidden = [
  ["plans", "active"],
  ["plans", "completed"],
  ["plans", "superseded"],
  ["design-specs", "superseded"],
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing canonical work lifecycle artifact ${relativePath}`,
      });
    }
  }
  for (const segments of forbidden) {
    const relativePath = segments.join("/");
    if (existsSync(resolve(root, ...segments))) {
      return yield* new AcceptanceFailure({
        message: `obsolete lifecycle directory remains ${relativePath}`,
      });
    }
  }

  yield* runCommand(
    [
      "bun",
      "test",
      "tests/work-lifecycle.test.ts",
      "tests/project-model.test.ts",
      "tests/development-control-loop.test.ts",
      "tests/open-semantic-system-design-lens.test.ts",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "scripts/check-references.ts"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/project-model",
      "scripts/check-feature-contract.ts",
      "scripts/run-feature-acceptance.ts",
      "scripts/accept/0049-canonical-work-lifecycle.ts",
      "tests/work-lifecycle.test.ts",
      "tests/development-control-loop.test.ts",
      "design-specs/0049-canonical-work-lifecycle.md",
      "plans/0049-canonical-work-lifecycle.md",
      "model/work/features/0049-canonical-work-lifecycle.json",
    ],
    { cwd: root },
  );
});

runMain("accept/0049", program);
