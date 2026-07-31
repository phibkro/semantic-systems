#!/usr/bin/env bun
/**
 * Fast loop (design spec 0005): formatting/lint, focused type checks, model
 * validation, and generated-view drift. Missing required tools fail closed.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { requireExecutable, requireTool, runCommand, runMain } from "./lib/command.ts";

class CacheRootCreateError extends Data.TaggedError("CacheRootCreateError")<{
  readonly path: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `${label}: cannot create cache root ${this.path}: ${String(this.cause)}`;
  }
}

const root = resolve(import.meta.dirname, "..");
const label = "check-fast";
const cacheRoot = resolve(process.env.TMPDIR ?? "/tmp", "semantic-systems-check-fast");
const environment = {
  ...process.env,
  PYTHONPYCACHEPREFIX: resolve(cacheRoot, "pycache"),
  RUFF_CACHE_DIR: resolve(cacheRoot, "ruff"),
  XDG_CACHE_HOME: resolve(cacheRoot, "xdg"),
};

const program = Effect.gen(function* () {
  yield* Effect.tryPromise({
    try: () => mkdir(cacheRoot, { recursive: true }),
    catch: (cause) => new CacheRootCreateError({ path: cacheRoot, cause }),
  });
  for (const tool of ["ruff", "bun", "actionlint", "just"]) yield* requireTool(label, tool);
  for (const executable of ["oxfmt", "oxlint", "tsc", "commitlint"]) {
    yield* requireExecutable(
      root,
      label,
      `node_modules/.bin/${executable}`,
      "run 'bun install --frozen-lockfile' first ('just check' does this for you).",
    );
  }

  for (const command of [
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    ["ruff", "check", "."],
    ["ruff", "format", "--check", "."],
    ["actionlint", ".github/workflows/check.yml"],
    ["just", "--fmt", "--check"],
    ["bun", "scripts/setup-effect-tsgo.ts", "--check"],
    ["bun", "run", "format:check"],
    ["bun", "run", "lint"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "check-commit-policy"],
  ] as const) {
    yield* runCommand(command, { cwd: root, env: environment });
  }
});

runMain(label, program);
