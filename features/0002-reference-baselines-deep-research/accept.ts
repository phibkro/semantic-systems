#!/usr/bin/env bun
import { resolve } from "node:path";
import { Effect } from "effect";
import { runCommand, runMain } from "../../scripts/lib/command.ts";

const root = resolve(import.meta.dirname, "../..");
const lockedDecisionSources = [
  "koka",
  "lean4",
  "lean4checker",
  "salsa",
  "rowan",
  "miette",
  "language-server-protocol",
] as const;

const program = Effect.gen(function* () {
  for (const command of [
    ["bun", "scripts/experiments/0002-generator-determinism.ts"],
    ["bun", "scripts/experiments/0002-assumption-query.ts"],
    ["node", "scripts/experiments/0002-assumption-query.ts"],
    ["bun", "scripts/experiments/0002-capability-wall.ts"],
    ["bun", "scripts/experiments/0003-enforcement-register.ts"],
    [
      "bun",
      "test",
      "tests/project-model-assumptions.test.ts",
      "tests/semantic-effect-rules.test.ts",
      "tests/enforcement-register.test.ts",
    ],
    ["bun", "run", "semrefs", "--", "catalog-check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }

  for (const sourceId of lockedDecisionSources) {
    yield* runCommand(
      ["bun", "run", "semrefs", "--", "status", sourceId, "--lock-only", "--json"],
      {
        cwd: root,
      },
    );
  }

  for (const command of [
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0002", program);
