#!/usr/bin/env bun
/**
 * Network-free validation for the transitional reference-custody runtime.
 * This Bun entrypoint replaces shell orchestration; the invoked Python
 * implementation remains owned by migration slice 0010 until its live lock
 * worker has completed and its behavior is captured.
 */
import { resolve } from "node:path";
import { Effect } from "effect";
import { requireTool, runCommand, runMain } from "./lib/command.ts";

const root = resolve(import.meta.dirname, "..");
const label = "check-references";
const environment = {
  ...process.env,
  PYTHONPATH: [process.env.PYTHONPATH, "src"].filter(Boolean).join(":"),
};

const program = Effect.gen(function* () {
  for (const tool of ["python", "ruff", "pyright", "pytest"]) yield* requireTool(label, tool);
  for (const command of [
    [
      "python",
      "-m",
      "compileall",
      "-q",
      "src/semantic_references",
      "tests/test_reference_custody.py",
    ],
    ["python", "-m", "semantic_references", "catalog-check"],
    ["ruff", "check", "src/semantic_references", "tests/test_reference_custody.py"],
    ["ruff", "format", "--check", "src/semantic_references", "tests/test_reference_custody.py"],
    ["pyright", "src/semantic_references", "tests/test_reference_custody.py"],
    ["pytest", "-q", "tests/test_reference_custody.py"],
  ] as const) {
    yield* runCommand(command, { cwd: root, env: environment });
  }
});

runMain(label, program);
