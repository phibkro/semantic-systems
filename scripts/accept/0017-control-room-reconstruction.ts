#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");

const requiredArtifacts = [
  "src/project-model/public-export.ts",
  "tests/public-export.test.ts",
  "apps/control-room/package.json",
  "apps/control-room/src/App.tsx",
  "apps/control-room/src/snapshot.ts",
  "apps/control-room/src/deployment.ts",
  "apps/control-room/src/deployment.test.ts",
  "apps/control-room/tooling/alchemy-memo.test.ts",
  "apps/control-room/tooling/workflow-safety.test.ts",
  "apps/control-room/alchemy.run.ts",
  "apps/control-room/playwright.config.ts",
  ".github/workflows/control-room-alchemy.yml",
] as const;

const requireArtifacts = Effect.forEach(requiredArtifacts, (relativePath) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing Control Room reconstruction artifact ${relativePath}`,
      });
    }
  }),
);

const program = Effect.gen(function* () {
  yield* requireArtifacts;
  for (const command of [
    ["bun", "test", "tests/public-export.test.ts"],
    ["bun", "run", "--cwd", "apps/control-room", "check"],
    ["nix", "develop", "--command", "bun", "run", "--cwd", "apps/control-room", "test:browser"],
    ["bun", "run", "--cwd", "apps/control-room", "scan"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/project-model/public-export.ts",
      "tests/public-export.test.ts",
      "apps/control-room",
      "scripts/accept/0017-control-room-reconstruction.ts",
      "model/work/control-room-reconstruction.json",
    ],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
    [
      "nix",
      "develop",
      "--command",
      "bun",
      "scripts/accept/0016-executable-semantic-system-kernel.ts",
    ],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0017", program);
