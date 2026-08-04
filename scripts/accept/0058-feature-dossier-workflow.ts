#!/usr/bin/env bun
import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const featureId = "0058-feature-dossier-workflow";
const dossierRoot = join(root, "features", featureId);
const requiredArtifacts = [
  "proposal.md",
  "design.md",
  "spec.md",
  "plan.md",
  "implementation-report.md",
  "accept.ts",
] as const;

const readDirectoryOrEmpty = (directory: string) =>
  Effect.tryPromise({
    try: async () => {
      try {
        return await readdir(directory, { withFileTypes: true });
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw cause;
      }
    },
    catch: (cause) =>
      new AcceptanceFailure({
        message: `cannot inspect old authority directory ${directory}: ${String(cause)}`,
      }),
  });

const requireFinalDossier = Effect.gen(function* () {
  for (const artifact of requiredArtifacts) {
    const file = Bun.file(join(dossierRoot, artifact));
    if (!(yield* Effect.promise(() => file.exists())) || file.size === 0) {
      return yield* new AcceptanceFailure({
        message: `required feature dossier artifact is missing or empty: features/${featureId}/${artifact}`,
      });
    }
  }

  for (const directory of ["verification", "transitions"] as const) {
    const path = join(dossierRoot, directory);
    const entries = yield* Effect.tryPromise({
      try: () => readdir(path, { withFileTypes: true }),
      catch: (cause) =>
        new AcceptanceFailure({
          message: `required feature dossier directory is missing: features/${featureId}/${directory}: ${String(cause)}`,
        }),
    });
    if (!entries.some((entry) => entry.isFile())) {
      return yield* new AcceptanceFailure({
        message: `required feature dossier directory has no receipt: features/${featureId}/${directory}`,
      });
    }
  }
});

const requireOldAuthorityAbsent = Effect.gen(function* () {
  const oldRoots = [
    [join(root, "design-specs"), (name: string) => name.endsWith(".md") && name !== "TEMPLATE.md"],
    [join(root, "model", "work", "features"), (name: string) => name.endsWith(".json")],
    [join(root, "plans", "active"), (name: string) => name.endsWith(".md")],
    [join(root, "plans", "completed"), (name: string) => name.endsWith(".md")],
    [join(root, "plans", "superseded"), (name: string) => name.endsWith(".md")],
    [join(root, "scripts", "accept"), (name: string) => name.endsWith(".ts")],
  ] as const;

  for (const [directory, isOldAuthority] of oldRoots) {
    const entries = yield* readDirectoryOrEmpty(directory);
    const remaining = entries
      .filter((entry) => entry.isFile() && isOldAuthority(entry.name))
      .map((entry) => entry.name)
      .sort();
    if (remaining.length > 0) {
      return yield* new AcceptanceFailure({
        message: `old lifecycle authority remains in ${directory}: ${remaining.join(", ")}`,
      });
    }
  }
});

const program = Effect.gen(function* () {
  yield* requireFinalDossier;
  yield* requireOldAuthorityAbsent;
  for (const command of [
    ["bun", "run", "semproj", "--", "feature", "validate", "--feature", featureId],
    ["bun", "test", "tests/feature-dossier-workflow.test.ts"],
    ["bun", "test", "tests/repository-workflow.test.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    ["bun", "run", "format:check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0058", program.pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])));
