#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const artifacts = [
  "design-specs/0027-semantic-artifact-store.md",
  "plans/active/0027-semantic-artifact-store.md",
  "model/work/semantic-artifact-store.json",
  "src/language-build/index.ts",
  "src/language-build/semantic-store.ts",
  "tests/language-build-semantic-store.test.ts",
] as const;

const requireFile = (relativePath: string) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing semantic artifact store ${relativePath}`,
      });
    }
  });

const program = Effect.gen(function* () {
  for (const artifact of artifacts) yield* requireFile(artifact);

  // Exercise the new store before broader repository work can obscure its
  // first failing observation.
  yield* runCommand(["bun", "test", "tests/language-build-semantic-store.test.ts"], {
    cwd: root,
  });

  // Re-establish the portable TypeScript boundary and checked-in projections.
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/language-build",
      "tests/language-build-semantic-store.test.ts",
      "scripts/accept/0027-semantic-artifact-store.ts",
      "design-specs/0027-semantic-artifact-store.md",
      "plans/active/0027-semantic-artifact-store.md",
      "model/work/semantic-artifact-store.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], {
    cwd: root,
  });

  // Reobserve the accepted 0019 seam without reopening its historical,
  // machine-local external oracle.
  yield* runCommand(
    [
      "bun",
      "test",
      "tests/normalized-core-format.test.ts",
      "tests/normalized-core-custody.test.ts",
    ],
    { cwd: root },
  );
  yield* runCommand([nodeExecutable, "--test", "tests/normalized-core-node.test.ts"], {
    cwd: root,
  });

  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0027", program);
