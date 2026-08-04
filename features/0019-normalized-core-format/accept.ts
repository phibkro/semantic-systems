#!/usr/bin/env bun
import { resolve } from "node:path";
import { BunCrypto } from "@effect/platform-bun";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../../scripts/lib/command.ts";
import {
  caseTerm,
  check,
  injectRight,
  int,
  operationSignature,
  returnTerm,
  unitType,
  variable,
} from "../../src/kernel-calculus/index.ts";
import { emitNormalizedCore } from "../../src/normalized-core/index.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const requiredArtifacts = [
  "src/normalized-core/index.ts",
  "src/normalized-core/schema.ts",
  "src/normalized-core/canonical.ts",
  "src/normalized-core/identity.ts",
  "src/normalized-core/normalize.ts",
  "tests/normalized-core-format.test.ts",
  "tests/normalized-core-custody.test.ts",
  "tests/normalized-core-node.test.ts",
  "examples/normalized-core/handled-program.expected.json",
  "scripts/oxlint/semantic-effect-rules.ts",
  "tests/semantic-effect-rules.test.ts",
] as const;

const requireArtifacts = Effect.forEach(requiredArtifacts, (relativePath) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing normalized core artifact ${relativePath}`,
      });
    }
  }),
);
const requireV2Boundary = Effect.gen(function* () {
  const checked = check(
    operationSignature([]),
    caseTerm(
      injectRight(unitType(), int(7)),
      returnTerm("1", int(0)),
      returnTerm("1", variable(0)),
    ),
  );
  if (checked.status !== "accepted") {
    return yield* new AcceptanceFailure({
      message: "active normalized-core boundary must accept its v2 sum tracer",
    });
  }
  const emitted = yield* emitNormalizedCore(checked.program, {
    assumptions: [],
    source: { units: [], correspondence: [] },
  }).pipe(Effect.provide(BunCrypto.layer));
  if (
    emitted.status !== "emitted" ||
    emitted.artifact.version !== 2 ||
    emitted.artifact.kernel !== "semantic.kernel-calculus/0018/v2" ||
    emitted.artifact.term.tag !== "case"
  ) {
    return yield* new AcceptanceFailure({
      message: "active normalized-core boundary must emit the v2 kernel and sum grammar",
    });
  }
});

const program = Effect.gen(function* () {
  yield* requireV2Boundary;
  yield* requireArtifacts;
  for (const command of [
    [
      "bun",
      "test",
      "tests/normalized-core-format.test.ts",
      "tests/normalized-core-custody.test.ts",
    ],
    [nodeExecutable, "--test", "tests/normalized-core-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/normalized-core",
      "tests/normalized-core-format.test.ts",
      "tests/normalized-core-custody.test.ts",
      "tests/normalized-core-node.test.ts",
      "examples/normalized-core",
      "features/0019-normalized-core-format/accept.ts",
      "scripts/oxlint/semantic-effect-rules.ts",
      "tests/semantic-effect-rules.test.ts",
    ],
    ["bun", "test", "tests/semantic-effect-rules.test.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    ["bun", "features/0018-minimal-kernel-calculus/accept.ts"],
    ["just", "check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0019", program);
