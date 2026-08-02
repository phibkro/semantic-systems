#!/usr/bin/env bun
import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { join, resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";
import { loadProject } from "../../src/project-model/loader.ts";
import { isFeatureDiagnostic, resolveFeature } from "../../src/project-model/work-lifecycle.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const requiredArtifacts = [
  "design-specs/0056-project-json-language-tooling.md",
  "model/work/features/0056-project-json-language-tooling.json",
  "src/project-model/project-json-schema.ts",
  "generated/schema/project-document.schema.json",
  "tests/project-json-language-tooling.test.ts",
  ".omp/lsp.json",
] as const;

const requireArtifacts = Effect.gen(function* () {
  for (const artifactPath of requiredArtifacts) {
    if (!(yield* Effect.promise(() => Bun.file(join(root, artifactPath)).exists()))) {
      return yield* new AcceptanceFailure({
        message: `required JSON tooling artifact is missing: ${artifactPath}`,
      });
    }
  }
});

const requireLedger = Effect.gen(function* () {
  const feature = resolveFeature(yield* loadProject(root), "0056-project-json-language-tooling");
  if (isFeatureDiagnostic(feature)) {
    return yield* new AcceptanceFailure({
      message: `cannot resolve JSON tooling feature: ${feature.message}`,
    });
  }
  if (!(yield* Effect.promise(() => Bun.file(join(root, feature.planPath)).exists()))) {
    return yield* new AcceptanceFailure({
      message: `required JSON tooling ledger is missing: ${feature.planPath}`,
    });
  }
});

const program = Effect.gen(function* () {
  yield* requireArtifacts;
  yield* requireLedger;
  for (const command of [
    ["bun", "test", "tests/project-json-language-tooling.test.ts"],
    ["bun", "test", "tests/project-model.test.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    ["bun", "run", "format:check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0056", program.pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])));
