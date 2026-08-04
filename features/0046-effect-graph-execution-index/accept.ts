#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../../scripts/lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";
const required = [
  "features/0046-effect-graph-execution-index/spec.md",
  "features/0046-effect-graph-execution-index/plan.md",
  "generated/project-model/work-features.json",
  "src/portfolio-model/graph-index.ts",
  "tests/pbk-portfolio-model.test.ts",
] as const;

const nodeParityProbe = `
import { Effect } from "effect";
import {
  buildStableDirectedGraphIndex,
  topologicalStableIds,
} from "./src/portfolio-model/graph-index.ts";
const nodes = [{ id: "work.c" }, { id: "work.a" }, { id: "work.b" }];
const edges = [
  { id: "relation.02", source_id: "work.a", target_id: "work.b" },
  { id: "relation.01", source_id: "work.a", target_id: "work.b" },
  { id: "relation.03", source_id: "work.b", target_id: "work.c" },
];
const index = await Effect.runPromise(buildStableDirectedGraphIndex(nodes, edges));
const order = await Effect.runPromise(topologicalStableIds(index));
if (JSON.stringify(order) !== JSON.stringify(["work.a", "work.b", "work.c"])) {
  throw new Error("genuine Node produced a different stable topological order");
}
if (index.edgeIndexById.size !== 3) {
  throw new Error("genuine Node did not retain parallel edge identities");
}
`;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const exists = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).exists());
    if (!exists) {
      return yield* new AcceptanceFailure({
        message: `missing Effect Graph execution-index artifact ${relativePath}`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/pbk-portfolio-model.test.ts"], { cwd: root });
  yield* runCommand([nodeExecutable, "--input-type=module", "--eval", nodeParityProbe], {
    cwd: root,
  });
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/portfolio-model/graph-index.ts",
      "src/portfolio-model/project.ts",
      "tests/pbk-portfolio-model.test.ts",
      "features/0046-effect-graph-execution-index/accept.ts",
      "features/0046-effect-graph-execution-index/spec.md",
      "features/0046-effect-graph-execution-index/plan.md",
      "generated/project-model/work-features.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
  yield* runCommand(["just", "check"], { cwd: root });
});

runMain("accept/0046", program);
