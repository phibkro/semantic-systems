#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const required = [
  "design-specs/0042-user-defined-algebra-frontier.md",
  "plans/active/0042-user-defined-algebra-frontier.md",
  "decisions/0007-algebra-promotion-ladder.md",
  "model/work/user-defined-algebra-frontier.json",
  "src/algebra-frontier/model.ts",
  "tests/algebra-frontier.test.ts",
] as const;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing user-defined algebra frontier artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/algebra-frontier.test.ts"], { cwd: root });
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/algebra-frontier",
      "tests/algebra-frontier.test.ts",
      "scripts/accept/0042-user-defined-algebra-frontier.ts",
      "design-specs/0042-user-defined-algebra-frontier.md",
      "plans/active/0042-user-defined-algebra-frontier.md",
      "decisions/0007-algebra-promotion-ladder.md",
      "model/work/user-defined-algebra-frontier.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0042", program);
