#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const schemaArtifact = "spec/kernel-json/kernel-json-v2.schema.json";
const schemaIdentifier = "https://semantic.phibkro.org/spec/kernel-json/kernel-json-v2.schema.json";

const goldenExamples = [
  ["examples/kernel-json/pure-program.kernel.json", "semantic.kernel-json"],
  ["examples/kernel-json/handled-program.kernel.json", "semantic.kernel-json"],
  ["examples/kernel-json/pure-program.accepted.kernel-check.json", "semantic.kernel-check"],
  ["examples/kernel-json/handled-program.accepted.kernel-check.json", "semantic.kernel-check"],
  ["examples/kernel-json/sum-case.kernel.json", "semantic.kernel-json"],
  ["examples/kernel-json/sum-case.accepted.kernel-check.json", "semantic.kernel-check"],
  ["examples/kernel-json/rejected-double-resume.kernel.json", "semantic.kernel-json"],
  ["examples/kernel-json/rejected-type-mismatch.kernel.json", "semantic.kernel-json"],
  [
    "examples/kernel-json/rejected-double-resume.rejected.kernel-check.json",
    "semantic.kernel-check",
  ],
] as const;

const contractArtifacts = [
  "design-specs/0020-agent-facing-kernel-json.md",
  "plans/0020-agent-facing-kernel-json.md",
  "design-specs/0020-lossless-kernel-source.md",
  "plans/0020-lossless-kernel-source.md",
  "tests/kernel-json-observation-bounds.test.ts",
  schemaArtifact,
  ...goldenExamples.map(([path]) => path),
] as const;

const implementationArtifacts = [
  "src/kernel-json/index.ts",
  "src/kernel-json/bounds.ts",
  "src/kernel-json/decode.ts",
  "src/kernel-json/canonical.ts",
  "src/kernel-json/schema.ts",
  "src/kernel-json/observe.ts",
  "tests/kernel-json-format.test.ts",
  "tests/kernel-json-check-view.test.ts",
  "tests/kernel-json-custody.test.ts",
  "tests/kernel-json-diagnostic-fact-custody.test.ts",
  "tests/kernel-json-node.test.ts",
] as const;

const requireFile = (relativePath: string, kind: string) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing agent-facing kernel JSON ${kind} artifact ${relativePath}`,
      });
    }
  });

const requireJsonDocument = (relativePath: string) =>
  Effect.gen(function* () {
    const parsed: unknown = yield* Effect.tryPromise({
      try: async () => JSON.parse(await Bun.file(resolve(root, relativePath)).text()) as unknown,
      catch: (cause) =>
        new AcceptanceFailure({
          message: `contract artifact ${relativePath} is not valid JSON: ${String(cause)}`,
        }),
    });
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return yield* new AcceptanceFailure({
        message: `contract artifact ${relativePath} must be one JSON object`,
      });
    }
    return parsed as Record<string, unknown>;
  });

const requireContractArtifacts = Effect.gen(function* () {
  for (const relativePath of contractArtifacts) {
    yield* requireFile(relativePath, "contract");
  }
  const schema = yield* requireJsonDocument(schemaArtifact);
  if (schema["$schema"] !== "https://json-schema.org/draft/2020-12/schema") {
    return yield* new AcceptanceFailure({
      message: `${schemaArtifact} must declare JSON Schema Draft 2020-12`,
    });
  }
  if (schema["$id"] !== schemaIdentifier) {
    return yield* new AcceptanceFailure({
      message: `${schemaArtifact} must keep the stable $id ${schemaIdentifier}`,
    });
  }
  for (const [relativePath, format] of goldenExamples) {
    const example = yield* requireJsonDocument(relativePath);
    if (example["format"] !== format || example["version"] !== 2) {
      return yield* new AcceptanceFailure({
        message: `golden example ${relativePath} must declare format ${format} version 2`,
      });
    }
  }
});

const requireImplementationArtifacts = Effect.forEach(implementationArtifacts, (relativePath) =>
  requireFile(relativePath, "implementation"),
);

const program = Effect.gen(function* () {
  yield* requireContractArtifacts;
  yield* runCommand(["bun", "test", "tests/kernel-json-observation-bounds.test.ts"], {
    cwd: root,
  });
  yield* requireImplementationArtifacts;

  for (const command of [
    [
      "bun",
      "test",
      "tests/kernel-json-format.test.ts",
      "tests/kernel-json-check-view.test.ts",
      "tests/kernel-json-custody.test.ts",
      "tests/kernel-json-diagnostic-fact-custody.test.ts",
    ],
    [nodeExecutable, "--test", "tests/kernel-json-node.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/kernel-json",
      "tests/kernel-json-format.test.ts",
      "tests/kernel-json-check-view.test.ts",
      "tests/kernel-json-custody.test.ts",
      "tests/kernel-json-diagnostic-fact-custody.test.ts",
      "tests/kernel-json-node.test.ts",
      "tests/kernel-json-observation-bounds.test.ts",
      "examples/kernel-json",
      "spec/kernel-json",
      "scripts/accept/0020-agent-facing-kernel-json.ts",
    ],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    ["bun", "scripts/accept/0019-normalized-core-format.ts"],
    ["just", "check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0020", program);
