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
  "plans/completed/0031-control-room-interactive-skill-tree.md",
  "model/work/features/0031-control-room-interactive-skill-tree.json",
  "apps/control-room/src/roadmap-model.ts",
  "apps/control-room/src/roadmap-model.test.ts",
  "apps/control-room/src/portfolio-ui-machine.test.ts",
  "apps/control-room/src/components/roadmap/RoadmapGraph.tsx",
  "apps/control-room/src/components/roadmap/RoadmapMosaic.tsx",
  "apps/control-room/src/components/roadmap/RoadmapNavigation.tsx",
  "apps/control-room/src/components/roadmap/RoadmapExplorer.tsx",
  "apps/control-room/src/components/roadmap/roadmap.vitest.tsx",
  "apps/control-room/e2e/skill-tree.pw.ts",
  "tests/pbk-portfolio-model.test.ts",
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
      "src/roadmap-model.test.ts",
      "src/portfolio-ui-machine.test.ts",
      "src/components/roadmap/roadmap.vitest.tsx",
    ],
    { cwd: resolve(root, "apps/control-room") },
  );
  yield* runCommand(["bun", "test", "tests/pbk-portfolio-model.test.ts"], { cwd: root });
  yield* runCommand(
    [
      "nix",
      "develop",
      "--offline",
      "--command",
      "bash",
      "-lc",
      "cd apps/control-room && bun run build && bunx playwright test e2e/skill-tree.pw.ts",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "scripts/accept/0021-pbk-portfolio-control-room.ts"], { cwd: root });
});

runMain("accept/0031", program);
