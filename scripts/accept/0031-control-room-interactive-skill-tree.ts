#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const artifacts = [
  "design-specs/0031-control-room-interactive-skill-tree.md",
  "plans/active/0031-control-room-interactive-skill-tree.md",
  "model/work/control-room-interactive-skill-tree.json",
  "apps/control-room/src/roadmap-model.ts",
  "apps/control-room/src/roadmap-model.test.ts",
  "apps/control-room/src/components/roadmap/skill-tree.tsx",
  "apps/control-room/src/components/roadmap/mosaic.tsx",
] as const;

const program = Effect.gen(function* () {
  for (const artifact of artifacts) {
    if (!(yield* Effect.promise(() => Bun.file(resolve(root, artifact)).exists()))) {
      return yield* new AcceptanceFailure({ message: `missing 0031 artifact ${artifact}` });
    }
  }
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "vitest",
      "run",
      "apps/control-room/src/roadmap-model.test.ts",
      "apps/control-room/src/Portfolio.vitest.tsx",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "scripts/accept/0021-pbk-portfolio-control-room.ts"], { cwd: root });
});

runMain("accept/0031", program);
