#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../../scripts/lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const requireDedicatedOracle = Effect.gen(function* () {
  const path = resolve(root, "tests/actor-trace-retention.test.ts");
  if (!(yield* Effect.promise(() => Bun.file(path).exists()))) {
    return yield* new AcceptanceFailure({
      message: "missing dedicated actor trace retention counterexample test",
    });
  }
});

const rejectLifetimeTraceAppend = Effect.gen(function* () {
  const runtime = yield* Effect.tryPromise({
    try: () => Bun.file(resolve(root, "src/actor/runtime.ts")).text(),
    catch: (cause) =>
      new AcceptanceFailure({ message: `cannot inspect actor runtime: ${String(cause)}` }),
  });
  if (/Ref\.update\([^,]+,\s*\([^)]*\)\s*=>\s*\[\.\.\.[^\]]+,\s*[^\]]+\]\)/s.test(runtime)) {
    return yield* new AcceptanceFailure({
      message: "actor runtime still contains a lifetime-growing Ref array append",
    });
  }
});

const program = Effect.gen(function* () {
  yield* requireDedicatedOracle;
  for (const command of [
    ["bun", "test", "tests/actor-trace-retention.test.ts", "tests/actor-runtime.test.ts"],
    [nodeExecutable, "--test", "tests/actor-runtime-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/actor",
      "tests/actor-trace-retention.test.ts",
      "tests/actor-runtime.test.ts",
      "tests/actor-runtime-node.test.ts",
      "features/0013-bounded-actor-trace-retention/accept.ts",
    ],
    ["bun", "features/0012-minimal-actor-runtime/accept.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
  yield* rejectLifetimeTraceAppend;
});

runMain("accept/0013", program);
