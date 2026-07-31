#!/usr/bin/env bun
/**
 * Integration loop (design spec 0005): frozen dependency install, fast loop,
 * full tests, and the remaining transitional custody Python checks.
 */
import { resolve } from "node:path";
import { Effect } from "effect";
import { requireTool, runCommand, runMain } from "./lib/command.ts";

const root = resolve(import.meta.dirname, "..");
const label = "check";

const program = Effect.gen(function* () {
  for (const tool of ["pyright", "bun", "pytest"]) yield* requireTool(label, tool);
  for (const command of [
    ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
    ["bun", "run", "effect:setup"],
    ["bun", "scripts/check-fast.ts"],
    ["bun", "test"],
    ["pyright"],
    ["pytest", "-p", "no:cacheprovider"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain(label, program);
