#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const required = [
  "design-specs/0049-effect-schema-public-snapshot-boundary.md",
  "plans/completed/0049-effect-schema-public-snapshot-boundary.md",
  "model/work/effect-schema-public-snapshot-boundary.json",
  "src/project-model/public-export.ts",
  "tests/public-export.test.ts",
  "apps/control-room/src/model.ts",
  "apps/control-room/src/snapshot.ts",
  "apps/control-room/src/snapshot.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing Effect Schema public-snapshot artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/public-export.test.ts"], { cwd: root });
  yield* runCommand(
    ["bun", "run", "--cwd", "apps/control-room", "test", "--", "src/snapshot.test.ts"],
    { cwd: root },
  );
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/project-model/public-export.ts",
      "tests/public-export.test.ts",
      "apps/control-room/src/model.ts",
      "apps/control-room/src/snapshot.ts",
      "apps/control-room/src/snapshot.test.ts",
      "scripts/accept/0049-effect-schema-public-snapshot-boundary.ts",
      "design-specs/0049-effect-schema-public-snapshot-boundary.md",
      "plans/completed/0049-effect-schema-public-snapshot-boundary.md",
      "model/work/effect-schema-public-snapshot-boundary.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(["bun", "scripts/accept/0017-control-room-reconstruction.ts"], { cwd: root });
});

runMain("accept/0049", program);
