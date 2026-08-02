#!/usr/bin/env bun
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const lifecycleDirectories = ["active", "completed", "superseded"] as const;
const requiredArtifacts = [
  "design-specs/0055-lifecycle-plan-layout.md",
  "plans/active/0055-lifecycle-plan-layout.md",
  "model/work/features/0055-lifecycle-plan-layout.json",
  "src/project-model/work-lifecycle.ts",
  "src/project-model/views.ts",
  "tests/work-lifecycle.test.ts",
  "scripts/accept/0055-lifecycle-plan-layout.ts",
  "CONTRIBUTING.md",
] as const;

const requireLayout = Effect.gen(function* () {
  for (const artifactPath of requiredArtifacts) {
    const exists = yield* Effect.promise(() => Bun.file(join(root, artifactPath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `required lifecycle-layout artifact is missing: ${artifactPath}`,
      });
    }
  }

  const plansRoot = join(root, "plans");
  const rootEntries = yield* Effect.tryPromise({
    try: () => readdir(plansRoot, { withFileTypes: true }),
    catch: (cause) =>
      new AcceptanceFailure({ message: `cannot inspect plans directory: ${String(cause)}` }),
  });
  const rootPlans = rootEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  if (rootPlans.length > 0) {
    return yield* new AcceptanceFailure({
      message: `root-level Markdown plans remain: ${rootPlans.join(", ")}`,
    });
  }

  for (const lifecycle of lifecycleDirectories) {
    const directory = join(plansRoot, lifecycle);
    const entries = yield* Effect.tryPromise({
      try: () => readdir(directory, { withFileTypes: true }),
      catch: (cause) =>
        new AcceptanceFailure({
          message: `cannot inspect lifecycle plan directory plans/${lifecycle}: ${String(cause)}`,
        }),
    });
    if (!entries.some((entry) => entry.isFile() && entry.name.endsWith(".md"))) {
      return yield* new AcceptanceFailure({
        message: `lifecycle plan directory has no Markdown ledgers: plans/${lifecycle}`,
      });
    }
  }
});

const program = Effect.gen(function* () {
  yield* requireLayout;
  for (const command of [
    ["bun", "test", "tests/work-lifecycle.test.ts"],
    ["bun", "run", "check:references"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    ["bun", "run", "format:check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0055", program);
