#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../../scripts/lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");

const contractArtifacts = [
  "features/0021-pbk-portfolio-control-room/spec.md",
  "features/0021-pbk-portfolio-control-room/plan.md",
  "generated/project-model/work-features.json",
] as const;

const implementationArtifacts = [
  "portfolio/studio/pbk-technologies.json",
  "src/portfolio-model/index.ts",
  "src/portfolio-model/assemble.ts",
  "src/portfolio-model/decode.ts",
  "src/portfolio-model/query.ts",
  "src/portfolio-model/project.ts",
  "tests/pbk-portfolio-model.test.ts",
  "apps/control-room/src/Portfolio.tsx",
  "apps/control-room/src/Portfolio.vitest.tsx",
] as const;

const requireFile = (relativePath: string, kind: string) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing PBK portfolio Control Room ${kind} artifact ${relativePath}`,
      });
    }
  });

export const portfolioControlRoomAcceptance = Effect.gen(function* () {
  for (const artifact of contractArtifacts) yield* requireFile(artifact, "contract");
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  for (const artifact of implementationArtifacts) yield* requireFile(artifact, "implementation");

  for (const command of [
    ["bun", "test", "tests/pbk-portfolio-model.test.ts"],
    ["bun", "run", "--cwd", "apps/control-room", "check"],
    [
      "nix",
      "develop",
      "--offline",
      "--command",
      "bun",
      "run",
      "--cwd",
      "apps/control-room",
      "test:browser",
    ],
    ["bun", "run", "--cwd", "apps/control-room", "scan"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "portfolio",
      "src/portfolio-model",
      "tests/pbk-portfolio-model.test.ts",
      "apps/control-room",
      "features/0021-pbk-portfolio-control-room/accept.ts",
      "generated/project-model/work-features.json",
    ],
    ["bun", "features/0017-control-room-reconstruction/accept.ts"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

if (import.meta.main) runMain("accept/0021", portfolioControlRoomAcceptance);
