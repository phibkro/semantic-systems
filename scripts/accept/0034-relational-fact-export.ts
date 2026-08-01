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
  "design-specs/0034-relational-fact-export.md",
  "plans/active/0034-relational-fact-export.md",
  "model/work/realization-roadmap.json",
  "src/project-model/relational-facts.ts",
  "tests/project-relational-facts.test.ts",
  "tests/project-relational-facts-node.test.ts",
  "examples/project-model/relational-facts/README.md",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing relational fact export artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/project-relational-facts.test.ts"], { cwd: root });
  yield* runCommand([nodeExecutable, "--test", "tests/project-relational-facts-node.test.ts"], {
    cwd: root,
  });
  yield* runCommand(["bun", "test", "tests/project-model.test.ts"], { cwd: root });
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/project-model/loader.ts",
      "src/project-model/relational-facts.ts",
      "tests/project-relational-facts.test.ts",
      "tests/project-relational-facts-node.test.ts",
      "scripts/accept/0034-relational-fact-export.ts",
      "design-specs/0034-relational-fact-export.md",
      "plans/active/0034-relational-fact-export.md",
      "model/work/realization-roadmap.json",
      "examples/project-model/relational-facts/README.md",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], {
    cwd: root,
  });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0034", program);
