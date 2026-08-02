#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");

const requireText = (path: string, label: string): Effect.Effect<string, AcceptanceFailure> =>
  Effect.gen(function* () {
    const file = Bun.file(resolve(root, path));
    if (!(yield* Effect.promise(() => file.exists()))) {
      return yield* new AcceptanceFailure({
        message: `missing ${label}: ${path}`,
      });
    }
    return yield* Effect.promise(() => file.text());
  });

const requirePhrase = (
  text: string,
  phrase: string,
  label: string,
): Effect.Effect<void, AcceptanceFailure> =>
  text.includes(phrase)
    ? Effect.void
    : Effect.fail(
        new AcceptanceFailure({
          message: `${label} does not expose ${JSON.stringify(phrase)}`,
        }),
      );

const requiredHeadings = [
  "### Boundary and warranted state",
  "### Semantic inputs",
  "### Semantic outputs",
  "### Effect protocols and uncertainty",
  "### Components and orthogonal structures",
  "### Bounded autonomy and resources",
  "### Evidence, assumptions, and unsupported claims",
] as const;

const program = Effect.gen(function* () {
  const doctrine = yield* requireText(
    "docs/open-semantic-system-design.md",
    "canonical open-system design doctrine",
  );
  const template = yield* requireText("design-specs/TEMPLATE.md", "design-spec template");
  const agents = yield* requireText("AGENTS.md", "agent guidance");
  const constitution = yield* requireText("docs/constitution.md", "project constitution");
  const migrated = yield* requireText(
    "design-specs/0005-autonomous-development-control-loop.md",
    "migrated autonomous loop contract",
  );
  yield* requireText(
    "tests/open-semantic-system-design-lens.test.ts",
    "dedicated design-lens oracle",
  );

  for (const [text, phrase, label] of [
    [doctrine, "maintained epistemic model", "canonical doctrine"],
    [doctrine, "boundary-relative", "canonical doctrine"],
    [doctrine, "Effect request", "canonical doctrine"],
    [doctrine, "returned observation", "canonical doctrine"],
    [constitution, "maintained epistemic", "constitution"],
    [agents, "open semantic system design lens", "agent guidance"],
    [migrated, "open-semantic-system-v1", "migrated feature loop"],
    [template, "Design-Lens-Version: open-semantic-system-v1", "design template"],
  ] as const) {
    yield* requirePhrase(text, phrase, label);
  }
  for (const heading of requiredHeadings) {
    yield* requirePhrase(template, heading, "design template");
  }

  for (const command of [
    ["bun", "test", "tests/open-semantic-system-design-lens.test.ts"],
    ["bun", "test", "tests/development-control-loop.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "AGENTS.md",
      "docs/open-semantic-system-design.md",
      "docs/constitution.md",
      "docs/pattern-catalog.md",
      "design-specs/TEMPLATE.md",
      "design-specs/0005-autonomous-development-control-loop.md",
      "design-specs/0015-open-semantic-system-design-lens.md",
      "plans/completed/0015-open-semantic-system-design-lens.md",
      "scripts/check-feature-contract.ts",
      "scripts/accept/0015-open-semantic-system-design-lens.ts",
      "tests/open-semantic-system-design-lens.test.ts",
    ],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0015", program);
