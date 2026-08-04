#!/usr/bin/env bun
import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { join, resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../../scripts/lib/command.ts";
import {
  compileFeatureDossiers,
  isFeatureDiagnostic,
  resolveFeature,
} from "../../src/project-model/work-lifecycle.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const requiredArtifacts = [
  "features/0055-lifecycle-plan-layout/spec.md",
  "generated/project-model/work-features.json",
  "src/project-model/work-lifecycle.ts",
  "src/project-model/views.ts",
  "tests/project-model-integration.test.ts",
  "features/0055-lifecycle-plan-layout/accept.ts",
  "CONTRIBUTING.md",
] as const;

const requireLayout = Effect.gen(function* () {
  for (const artifactPath of requiredArtifacts) {
    const exists = yield* Effect.promise(() => Bun.file(join(root, artifactPath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `required lifecycle-layout artifact is missing: ${artifactPath}`,
      });
    }
  }

  const dossiers = yield* compileFeatureDossiers(root);
  const feature = resolveFeature(dossiers, "0055-lifecycle-plan-layout");
  if (isFeatureDiagnostic(feature)) {
    return yield* new AcceptanceFailure({
      message: `cannot resolve lifecycle-layout feature: ${feature.message}`,
    });
  }
  if (feature.planPath !== "features/0055-lifecycle-plan-layout/plan.md") {
    return yield* new AcceptanceFailure({
      message: `noncanonical lifecycle-layout plan path: ${feature.planPath}`,
    });
  }
  if (!(yield* Effect.promise(() => Bun.file(join(root, feature.planPath)).exists()))) {
    return yield* new AcceptanceFailure({
      message: `required lifecycle-layout ledger is missing: ${feature.planPath}`,
    });
  }

  for (const obsoleteRoot of ["plans", "model/work/features", "scripts/accept"]) {
    if (yield* Effect.promise(() => Bun.file(join(root, obsoleteRoot)).exists())) {
      return yield* new AcceptanceFailure({
        message: `obsolete lifecycle authority root remains: ${obsoleteRoot}`,
      });
    }
  }
});

const program = Effect.gen(function* () {
  yield* requireLayout;
  for (const command of [
    ["bun", "test", "tests/project-model-integration.test.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    ["bun", "run", "format:check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain(
  "accept/0055",
  program.pipe(
    Effect.provide(BunCrypto.layer),
    Effect.provide([BunFileSystem.layer, BunPath.layer]),
  ),
);
