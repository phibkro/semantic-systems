#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const artifacts = [
  "design-specs/0029-control-room-pinned-alchemy-workspace.md",
  "plans/active/0029-control-room-pinned-alchemy-workspace.md",
  "model/work/control-room-pinned-alchemy-workspace.json",
  ".github/workflows/control-room-alchemy-trusted.yml",
  "apps/control-room/tooling/workflow-safety.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const artifact of artifacts) {
    if (!(yield* Effect.promise(() => Bun.file(resolve(root, artifact)).exists()))) {
      return yield* new AcceptanceFailure({ message: `missing 0029 artifact ${artifact}` });
    }
  }
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(
    ["bunx", "vitest", "run", "apps/control-room/tooling/workflow-safety.test.ts"],
    { cwd: root },
  );
  yield* runCommand(["bun", "scripts/accept/0021-pbk-portfolio-control-room.ts"], { cwd: root });
});

runMain("accept/0029", program);
