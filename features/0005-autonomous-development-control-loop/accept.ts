#!/usr/bin/env bun
import { resolve } from "node:path";
import { Console, Effect } from "effect";
import { requireTool, runCommand, runMain } from "../../scripts/lib/command.ts";

const root = resolve(import.meta.dirname, "../..");
const label = "accept/0005";
const cacheRoot = resolve(process.env.TMPDIR ?? "/tmp", "semantic-systems-accept-0005", "xdg");
const environment = { ...process.env, XDG_CACHE_HOME: cacheRoot };

const program = Effect.gen(function* () {
  for (const tool of ["actionlint", "bun"]) yield* requireTool(label, tool);
  for (const command of [
    ["bun", "test", "tests/development-control-loop.test.ts"],
    ["actionlint", ".github/workflows/check.yml"],
    ["bun", "run", "check-commit-policy"],
  ] as const) {
    yield* runCommand(command, { cwd: root, env: environment });
  }
  yield* Console.log(
    "accept/0005: feature-contract fixtures, Actionlint, and policy conformance passed.",
  );
});

runMain(label, program);
