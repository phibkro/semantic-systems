#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const requiredArtifacts = [
  "src/semantic-system/index.ts",
  "src/semantic-system/definition.ts",
  "src/semantic-system/kernel.ts",
  "src/semantic-system/driver.ts",
  "src/semantic-system/graph.ts",
  "src/semantic-system/inventory.ts",
  "tests/semantic-system-kernel.test.ts",
  "tests/semantic-system-custody.test.ts",
  "tests/semantic-system-driver.test.ts",
  "tests/semantic-system-inventory.test.ts",
  "tests/semantic-system-actor.test.ts",
  "tests/semantic-system-node.test.ts",
] as const;

const requireArtifacts = Effect.forEach(requiredArtifacts, (relativePath) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing executable semantic-system artifact ${relativePath}`,
      });
    }
  }),
);

const program = Effect.gen(function* () {
  yield* requireArtifacts;
  for (const command of [
    [
      "bun",
      "test",
      "tests/semantic-system-kernel.test.ts",
      "tests/semantic-system-custody.test.ts",
      "tests/semantic-system-driver.test.ts",
      "tests/semantic-system-inventory.test.ts",
      "tests/semantic-system-actor.test.ts",
    ],
    [nodeExecutable, "--test", "tests/semantic-system-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/semantic-system",
      "tests/semantic-system-kernel.test.ts",
      "tests/semantic-system-custody.test.ts",
      "tests/semantic-system-driver.test.ts",
      "tests/semantic-system-inventory.test.ts",
      "tests/semantic-system-actor.test.ts",
      "tests/semantic-system-node.test.ts",
      "scripts/accept/0016-executable-semantic-system-kernel.ts",
    ],
    ["bun", "test", "tests/inventory-tracer.test.ts"],
    ["bun", "scripts/accept/0012-minimal-actor-runtime.ts"],
    ["bun", "scripts/accept/0013-bounded-actor-trace-retention.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0016", program);
