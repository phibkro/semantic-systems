#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";
const v1SchemaDigest = "43760534c0c08a3ab9626f624cd1789c3803002d26f3bb73a6c048b57926eee8";

const requiredArtifacts = [
  "design-specs/0051-kernel-finite-sums.md",
  "plans/0051-kernel-finite-sums.md",
  "model/work/features/0051-kernel-finite-sums.json",
  "model/work/work.json",
  "src/kernel-json/schema-data-v2.ts",
  "spec/kernel-json/kernel-json-v2.schema.json",
  "tests/kernel-finite-sums.test.ts",
  "tests/kernel-json-observation-bounds.test.ts",
  "examples/kernel-json/sum-case.kernel.json",
  "examples/kernel-json/sum-case.accepted.kernel-check.json",
  "examples/kernel-json/sum-case.kernel-run.json.golden",
  "examples/normalized-core/sum-case.expected.json",
] as const;

const requireArtifacts = Effect.gen(function* () {
  for (const relative of requiredArtifacts) {
    if (!(yield* Effect.promise(() => Bun.file(resolve(root, relative)).exists()))) {
      return yield* new AcceptanceFailure({
        message: `missing kernel finite-sums artifact: ${relative}`,
      });
    }
  }
});

const preserveV1Schema = Effect.gen(function* () {
  const bytes = yield* Effect.tryPromise({
    try: () => Bun.file(resolve(root, "spec/kernel-json/kernel-json-v1.schema.json")).arrayBuffer(),
    catch: (cause) =>
      new AcceptanceFailure({ message: `cannot read historical v1 schema: ${String(cause)}` }),
  });
  const actual = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  if (actual !== v1SchemaDigest) {
    return yield* new AcceptanceFailure({
      message: `historical v1 schema changed: expected ${v1SchemaDigest}, received ${actual}`,
    });
  }
});

const program = Effect.gen(function* () {
  yield* requireArtifacts;
  yield* preserveV1Schema;

  for (const command of [
    ["bun", "test", "tests/kernel-finite-sums.test.ts"],
    [
      "bun",
      "test",
      "tests/kernel-calculus-checker.test.ts",
      "tests/kernel-calculus-machine.test.ts",
      "tests/kernel-calculus-oracle.test.ts",
      "tests/kernel-calculus-custody.test.ts",
      "tests/kernel-json-format.test.ts",
      "tests/kernel-json-check-view.test.ts",
      "tests/kernel-json-custody.test.ts",
      "tests/kernel-json-diagnostic-fact-custody.test.ts",
      "tests/kernel-json-observation-bounds.test.ts",
      "tests/normalized-core-format.test.ts",
      "tests/normalized-core-custody.test.ts",
      "tests/kernel-reference-interpreter.test.ts",
    ],
    [nodeExecutable, "--test", "tests/kernel-calculus-node.test.ts"],
    [nodeExecutable, "--test", "tests/kernel-json-node.test.ts"],
    [nodeExecutable, "--test", "tests/normalized-core-node.test.ts"],
    [nodeExecutable, "--test", "tests/kernel-reference-interpreter-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/kernel-calculus",
      "src/kernel-json",
      "src/normalized-core",
      "src/kernel-interpreter",
      "tests/kernel-finite-sums.test.ts",
      "tests/kernel-calculus-checker.test.ts",
      "tests/kernel-calculus-machine.test.ts",
      "tests/kernel-json-format.test.ts",
      "tests/kernel-json-check-view.test.ts",
      "tests/normalized-core-format.test.ts",
      "tests/kernel-reference-interpreter.test.ts",
      "examples/kernel-calculus",
      "examples/kernel-json",
      "examples/normalized-core",
      "spec/kernel-json",
      "scripts/accept/0051-kernel-finite-sums.ts",
    ],
    ["bun", "scripts/accept/0018-minimal-kernel-calculus.ts"],
    ["bun", "scripts/accept/0019-normalized-core-format.ts"],
    ["bun", "scripts/accept/0020-agent-facing-kernel-json.ts"],
    ["bun", "scripts/accept/0022-kernel-reference-interpreter.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0051", program);
