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
  "design-specs/0036-explorer-query-contract.md",
  "plans/active/0036-explorer-query-contract.md",
  "model/work/realization-roadmap.json",
  "src/explorer-query/query.ts",
  "src/explorer-query/index.ts",
  "tests/explorer-query.test.ts",
  "tests/explorer-query-node.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists)
      return yield* new AcceptanceFailure({
        message: `missing explorer-query artifact ${relativePath}`,
      });
  }

  yield* runCommand(["bun", "test", "tests/explorer-query.test.ts"], { cwd: root });
  yield* runCommand([nodeExecutable, "--test", "tests/explorer-query-node.test.ts"], {
    cwd: root,
  });
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/explorer-query",
      "tests/explorer-query.test.ts",
      "tests/explorer-query-node.test.ts",
      "scripts/accept/0036-explorer-query-contract.ts",
      "design-specs/0036-explorer-query-contract.md",
      "plans/active/0036-explorer-query-contract.md",
      "model/work/realization-roadmap.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], {
    cwd: root,
  });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0036", program);
