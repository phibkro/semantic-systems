#!/usr/bin/env bun
/**
 * Executable acceptance boundary for design spec 0012.
 *
 * This program is intentionally established with the frozen contract before
 * the actor implementation. The first red observation is a missing focused
 * oracle/actor module, not a synthetic passing placeholder.
 */
import { resolve } from "node:path";
import { Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

const root = resolve(import.meta.dirname, "../..");

const program = Effect.gen(function* () {
  for (const command of [
    ["bun", "test", "tests/actor-runtime.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/actor",
      "tests/actor-runtime.test.ts",
      "scripts/accept/0012-minimal-actor-runtime.ts",
    ],
    ["bun", "src/actor/main-bun.ts", "examples/inventory/scenarios/demo.json"],
    ["node", "src/actor/main-node.ts", "examples/inventory/scenarios/demo.json"],
    ["bun", "test", "tests/inventory-tracer.test.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0012", program);
