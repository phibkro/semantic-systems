#!/usr/bin/env bun
/** Network-free focused validation for the accepted reference-custody runtime. */
import { resolve } from "node:path";
import { Effect } from "effect";
import { requireExecutable, requireTool, runCommand, runMain } from "./lib/command.ts";

const root = resolve(import.meta.dirname, "..");
const label = "check-references";

const program = Effect.gen(function* () {
  for (const tool of ["bun", "node"]) yield* requireTool(label, tool);
  for (const executable of ["oxfmt", "oxlint", "tsc"]) {
    yield* requireExecutable(
      root,
      label,
      `node_modules/.bin/${executable}`,
      "run 'bun install --frozen-lockfile' first.",
    );
  }
  for (const command of [
    ["bun", "test", "tests/reference-custody.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    ["node_modules/.bin/oxfmt", "--check", "src/references", "tests/reference-custody.test.ts"],
    ["node", "src/references/main-node.ts", "catalog-check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain(label, program);
