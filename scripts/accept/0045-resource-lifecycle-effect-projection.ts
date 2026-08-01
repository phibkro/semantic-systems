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
  "design-specs/0045-resource-lifecycle-effect-projection.md",
  "plans/active/0045-resource-lifecycle-effect-projection.md",
  "model/work/resource-lifecycle-effect-projection.json",
  "src/resource-lifecycle-projection/model.ts",
  "src/resource-lifecycle-projection/index.ts",
  "tests/resource-lifecycle-effect-projection.test.ts",
  "tests/resource-lifecycle-effect-projection-node.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing resource lifecycle projection artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/resource-lifecycle-effect-projection.test.ts"], {
    cwd: root,
  });
  yield* runCommand(
    [nodeExecutable, "--test", "tests/resource-lifecycle-effect-projection-node.test.ts"],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/resource-lifecycle-projection",
      "tests/resource-lifecycle-effect-projection.test.ts",
      "tests/resource-lifecycle-effect-projection-node.test.ts",
      "scripts/accept/0045-resource-lifecycle-effect-projection.ts",
      "plans/active/0045-resource-lifecycle-effect-projection.md",
      "model/work/resource-lifecycle-effect-projection.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0045", program);
