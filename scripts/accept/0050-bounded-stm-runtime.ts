#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const requiredFiles = [
  "src/stm/runtime.ts",
  "src/stm/runtime-report.ts",
  "src/stm/runtime-main-bun.ts",
  "src/stm/runtime-main-node.ts",
  "tests/stm-runtime.test.ts",
] as const;

const requireRuntimeArtifacts = Effect.gen(function* () {
  for (const relative of requiredFiles) {
    if (!(yield* Effect.promise(() => Bun.file(resolve(root, relative)).exists()))) {
      return yield* new AcceptanceFailure({
        message: `missing bounded STM runtime artifact: ${relative}`,
      });
    }
  }
});

const inspectPortableClosure = Effect.gen(function* () {
  for (const relative of ["src/stm/runtime.ts", "src/stm/runtime-report.ts"] as const) {
    const source = yield* Effect.tryPromise({
      try: () => Bun.file(resolve(root, relative)).text(),
      catch: (cause) =>
        new AcceptanceFailure({ message: `cannot inspect ${relative}: ${String(cause)}` }),
    });
    for (const forbidden of [
      "Effect.tx",
      "Effect.txRetry",
      "TxRef",
      "setTimeout",
      "setInterval",
      'from "node:',
      "Bun.",
      "process.",
      "Math.random",
      "fetch(",
      "console.",
    ]) {
      if (source.includes(forbidden)) {
        return yield* new AcceptanceFailure({
          message: `${relative} imports forbidden runtime authority or transaction primitive: ${forbidden}`,
        });
      }
    }
  }
});

const program = Effect.gen(function* () {
  yield* requireRuntimeArtifacts;
  for (const command of [
    ["bun", "test", "tests/stm-runtime.test.ts", "tests/stm-laws.test.ts"],
    [nodeExecutable, "src/stm/runtime-main-node.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/stm/runtime.ts",
      "src/stm/runtime-report.ts",
      "src/stm/runtime-main-bun.ts",
      "src/stm/runtime-main-node.ts",
      "tests/stm-runtime.test.ts",
      "scripts/accept/0050-bounded-stm-runtime.ts",
      "model/work/features/0050-bounded-stm-runtime.json",
      "design-specs/0050-bounded-stm-runtime.md",
      "plans/0050-bounded-stm-runtime.md",
    ],
    ["bun", "scripts/accept/0014-stm-effect-handler-laws.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
  yield* inspectPortableClosure;
});

runMain("accept/0050", program);
