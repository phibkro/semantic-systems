#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");

const artifacts = [
  "design-specs/0028-control-room-alchemy-cli-compat.md",
  "plans/active/0028-control-room-alchemy-cli-compat.md",
  "model/work/control-room-alchemy-cli-compat.json",
  ".github/workflows/control-room-alchemy-trusted.yml",
  "apps/control-room/tooling/workflow-safety.test.ts",
] as const;

const requireFile = (relativePath: string) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing Alchemy compatibility artifact ${relativePath}`,
      });
    }
  });

const program = Effect.gen(function* () {
  for (const artifact of artifacts) yield* requireFile(artifact);
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(
    ["bunx", "vitest", "run", "apps/control-room/tooling/workflow-safety.test.ts"],
    { cwd: root },
  );
  yield* runCommand(["bun", "scripts/accept/0021-pbk-portfolio-control-room.ts"], { cwd: root });
});

runMain("accept/0028", program);
