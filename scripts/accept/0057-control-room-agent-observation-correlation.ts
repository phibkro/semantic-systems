#!/usr/bin/env bun
import { resolve } from "node:path";
import { Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

const root = resolve(import.meta.dirname, "../..");

const program = Effect.gen(function* () {
  for (const command of [
    [
      "bun",
      "test",
      "tests/agent-observation.test.ts",
      "apps/control-room/src/agent-observation-projection.test.ts",
    ],
    ["bun", "examples/agent-observation/smoke.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    ["bun", "run", "format:check"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0057", program);
