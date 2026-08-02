#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { runCommand, runMain } from "../lib/command.ts";
import { loadProject } from "../../src/project-model/loader.ts";
import type { ProjectGraph } from "../../src/project-model/types.ts";
import {
  encodeRelationalFacts,
  exportRelationalFacts,
  queryEvidence,
  queryReachability,
  RelationalExportError,
  RelationalQueryError,
} from "../../src/relational-facts/index.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const requiredArtifacts = [
  "design-specs/0053-relational-fact-export.md",
  "plans/active/0053-relational-fact-export.md",
  "model/work/features/0053-relational-fact-export.json",
  "tests/relational-facts.test.ts",
  "examples/relational-facts/fixture.json",
  "examples/relational-facts/fixture.bundle.json.golden",
  "examples/relational-facts/fixture.query-summary.json.golden",
  "src/relational-facts/types.ts",
  "src/relational-facts/export.ts",
  "src/relational-facts/query.ts",
  "src/relational-facts/canonical.ts",
  "src/relational-facts/index.ts",
  "src/relational-facts/report.ts",
  "src/relational-facts/main-bun.ts",
  "src/relational-facts/main-node.ts",
] as const;

const ensure = (condition: boolean, message: string): Effect.Effect<void, AcceptanceFailure> =>
  condition ? Effect.void : Effect.fail(new AcceptanceFailure({ message }));

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const capture = (command: ReadonlyArray<string>): Effect.Effect<string, AcceptanceFailure> =>
  Effect.try({
    try: () => {
      const result = Bun.spawnSync({
        cmd: [...command],
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = new TextDecoder().decode(result.stdout);
      const stderr = new TextDecoder().decode(result.stderr);
      if (result.exitCode !== 0) {
        throw new Error(`${command.join(" ")} exited ${result.exitCode}: ${stderr}`);
      }
      return stdout;
    },
    catch: (cause) =>
      new AcceptanceFailure({ message: `cannot run ${command.join(" ")}: ${String(cause)}` }),
  });

const required = Effect.gen(function* () {
  for (const artifact of requiredArtifacts) {
    const exists = yield* Effect.tryPromise({
      try: () => Bun.file(resolve(root, artifact)).exists(),
      catch: (cause) =>
        new AcceptanceFailure({
          message: `cannot inspect required artifact ${artifact}: ${String(cause)}`,
        }),
    });
    yield* ensure(exists, `missing required artifact: ${artifact}`);
  }
});

const relativeSource = (project: ProjectGraph, source: string): string => {
  const prefix = `${project.root.replace(/\/$/, "")}/model/`;
  return source.startsWith(prefix) ? source.slice(prefix.length) : source;
};

const program = Effect.gen(function* () {
  yield* required;
  const project = yield* loadProject(root);
  const bundle = exportRelationalFacts(project);
  yield* ensure(!(bundle instanceof RelationalExportError), "canonical project export failed");
  if (bundle instanceof RelationalExportError) return yield* bundle;

  const expectedAttributes = [...project.entities.values()].reduce(
    (total, entity) => total + Object.keys(entity.attributes).length,
    0,
  );
  const expectedTags = [...project.entities.values()].reduce(
    (total, entity) => total + entity.tags.length,
    0,
  );
  const expectedSources = new Set([
    ...[...project.entities.values()].map((entity) => relativeSource(project, entity.source)),
    ...project.relations.map((relation) => relativeSource(project, relation.source)),
  ]);
  yield* ensure(
    bundle.entities.length === project.entities.size,
    "entity row count differs from canonical graph",
  );
  yield* ensure(
    bundle.relations.length === project.relations.length,
    "relation row count differs from canonical graph",
  );
  yield* ensure(bundle.tags.length === expectedTags, "tag row count differs from canonical graph");
  yield* ensure(
    bundle.attributes.length === expectedAttributes,
    "attribute row count differs from canonical graph",
  );
  yield* ensure(
    bundle.source_documents.length === expectedSources.size,
    "source-document row count differs from canonical graph",
  );
  yield* ensure(
    bundle.source_documents.every(
      ({ source_key }) =>
        expectedSources.has(source_key) &&
        !source_key.startsWith("/") &&
        !source_key.includes("\\") &&
        !source_key.includes("//") &&
        source_key
          .split("/")
          .every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
    ),
    "source-document rows contain invalid relative keys",
  );
  yield* ensure(
    bundle.entities.every((row) => expectedSources.has(row.source_key)),
    "entity source custody is incomplete",
  );
  yield* ensure(
    bundle.relations.every((row) => expectedSources.has(row.source_key)),
    "relation source custody is incomplete",
  );
  yield* ensure(
    Object.isFrozen(bundle) && Object.isFrozen(bundle.entities),
    "fact bundle is not deeply immutable",
  );
  yield* ensure(
    bundle.relations.every((row) => Object.isFrozen(row.attributes)),
    "relation attribute snapshots are not immutable",
  );

  const firstBytes = encodeRelationalFacts(bundle);
  const secondBytes = encodeRelationalFacts(bundle);
  yield* ensure(bytesEqual(firstBytes, secondBytes), "canonical encoding is not deterministic");
  const permutedProject: ProjectGraph = {
    ...project,
    entities: new Map([...project.entities].reverse()),
  };
  const permutedBundle = exportRelationalFacts(permutedProject);
  yield* ensure(!(permutedBundle instanceof RelationalExportError), "permuted graph export failed");
  if (permutedBundle instanceof RelationalExportError) return yield* permutedBundle;
  yield* ensure(
    bytesEqual(firstBytes, encodeRelationalFacts(permutedBundle)),
    "canonical encoding depends on entity Map insertion order",
  );

  const incoming = queryReachability(bundle, {
    roots: ["work.stm-runtime"],
    direction: "incoming",
    relationKinds: ["blocks"],
    maximumDepth: 64,
    maximumRows: 10_000,
  });
  yield* ensure(!(incoming instanceof RelationalQueryError), "incoming dependency query failed");
  if (incoming instanceof RelationalQueryError) return yield* incoming;
  const incomingIds = new Set(incoming.nodes.map((node) => node.entity_id));
  yield* ensure(
    incomingIds.has("work.inventory-stm"),
    "inventory dependency is missing from incoming reachability",
  );
  yield* ensure(
    incomingIds.has("work.stm-model-check"),
    "model-check dependency is missing from incoming reachability",
  );
  yield* ensure(
    incoming.relations.every((relation) => relation.kind === "blocks"),
    "incoming query mixed relation directions or kinds",
  );

  const evidence = queryEvidence(bundle, "obligation.inventory.conformance");
  yield* ensure(!(evidence instanceof RelationalQueryError), "evidence query failed");
  if (evidence instanceof RelationalQueryError) return yield* evidence;
  yield* ensure(evidence.evidence.length === 1, "obligation evidence multiplicity changed");
  yield* ensure(
    evidence.evidence[0]?.relation.kind === "covers",
    "obligation evidence relation kind changed",
  );
  yield* ensure(
    evidence.evidence[0]?.entity.entity_id === "evidence.inventory.pure-conformance-v0",
    "obligation direct evidence entity is missing",
  );
  yield* ensure(
    evidence.evidence[0]?.assumptions.length === 0,
    "query fabricated unsupported evidence assumptions",
  );
  yield* ensure(
    !("sufficient" in evidence) && !("discharged" in evidence),
    "evidence query made a sufficiency claim",
  );

  const invalidRoot = queryReachability(bundle, {
    roots: ["missing.root"],
    direction: "incoming",
    relationKinds: ["blocks"],
    maximumDepth: 1,
    maximumRows: 1,
  });
  yield* ensure(
    invalidRoot instanceof RelationalQueryError,
    "unknown roots did not return a typed query failure",
  );
  const invalidKind = queryReachability(bundle, {
    roots: ["work.stm-runtime"],
    direction: "incoming",
    relationKinds: ["not-authored"],
    maximumDepth: 1,
    maximumRows: 1,
  });
  yield* ensure(
    invalidKind instanceof RelationalQueryError,
    "unknown relation kinds did not return a typed query failure",
  );
  const invalidDepth = queryReachability(bundle, {
    roots: ["work.stm-runtime"],
    direction: "incoming",
    relationKinds: ["blocks"],
    maximumDepth: 65,
    maximumRows: 1,
  });
  yield* ensure(
    invalidDepth instanceof RelationalQueryError,
    "maximumDepth overflow did not return a typed query failure",
  );
  const invalidRows = queryReachability(bundle, {
    roots: ["work.stm-runtime"],
    direction: "incoming",
    relationKinds: ["blocks"],
    maximumDepth: 1,
    maximumRows: 10_001,
  });
  yield* ensure(
    invalidRows instanceof RelationalQueryError,
    "maximumRows overflow did not return a typed query failure",
  );

  const badSourceProject: ProjectGraph = {
    ...project,
    entities: new Map([
      ...project.entities,
      [
        "bad.source",
        {
          id: "bad.source",
          kind: "artifact",
          name: "Bad source",
          summary: "",
          status: null,
          tags: [],
          attributes: {},
          source: `${project.root}/outside.json`,
        },
      ],
    ]),
  };
  const badSource = exportRelationalFacts(badSourceProject);
  yield* ensure(
    badSource instanceof RelationalExportError,
    "outside source custody did not return a typed export failure",
  );

  const bunReport = yield* capture(["bun", "src/relational-facts/main-bun.ts", root]);
  const nodeReport = yield* capture(["node", "src/relational-facts/main-node.ts", root]);
  yield* ensure(bunReport === nodeReport, "Bun and genuine Node reports differ byte-for-byte");
  yield* Effect.try({
    try: () => JSON.parse(bunReport),
    catch: (cause) =>
      new AcceptanceFailure({ message: `canonical report is not JSON: ${String(cause)}` }),
  });

  for (const command of [
    ["bun", "test", "tests/relational-facts.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    ["bun", "run", "format:check"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
});

runMain("accept/0053", program.pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])));
