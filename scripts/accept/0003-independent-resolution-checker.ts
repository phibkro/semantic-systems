#!/usr/bin/env bun
import { resolve } from "node:path";
import { Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

const root = resolve(import.meta.dirname, "../..");

const program = Effect.gen(function* () {
  for (const command of [
    ["bun", "test", "tests/resolution-checker.test.ts", "tests/inventory-tracer.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "semantic-tracer", "--", "verify-resolution", "examples/inventory"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0003", program);
