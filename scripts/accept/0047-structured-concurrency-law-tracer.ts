#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";
const required = [
  "design-specs/0047-structured-concurrency-law-tracer.md",
  "plans/active/0047-structured-concurrency-law-tracer.md",
  "model/work/structured-concurrency-law-tracer.json",
  "src/structured-concurrency/model.ts",
  "src/structured-concurrency/oracle.ts",
  "src/structured-concurrency/effect-adapter.ts",
  "tests/structured-concurrency-law-tracer.test.ts",
  "tests/structured-concurrency-law-tracer-node.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing structured-concurrency artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/structured-concurrency-law-tracer.test.ts"], {
    cwd: root,
  });
  yield* runCommand(
    [nodeExecutable, "--test", "tests/structured-concurrency-law-tracer-node.test.ts"],
    { cwd: root },
  );
  yield* runCommand(["bun", "test", "tests/algebra-frontier.test.ts"], { cwd: root });
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/structured-concurrency",
      "src/algebra-frontier/model.ts",
      "tests/structured-concurrency-law-tracer.test.ts",
      "tests/structured-concurrency-law-tracer-node.test.ts",
      "tests/algebra-frontier.test.ts",
      "scripts/accept/0047-structured-concurrency-law-tracer.ts",
      "design-specs/0047-structured-concurrency-law-tracer.md",
      "plans/active/0047-structured-concurrency-law-tracer.md",
      "model/work/structured-concurrency-law-tracer.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0047", program);
