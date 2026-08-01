import { describe, expect, test } from "bun:test";
import { Effect, Result, Schema } from "effect";
import { assert as fcAssert, asyncProperty, boolean, integer } from "fast-check";
import {
  ExplorerQueryRejected,
  ExplorerQueryResultSchema,
  queryExplorer,
  type ExplorerFactSource,
  type ExplorerQuery,
  type ExplorerQueryResult,
} from "../src/explorer-query/index.ts";

const entity = (subject_id: string) => ({
  fact_type: "entity" as const,
  fact_key: `entity:${subject_id}`,
  subject_id,
  entity_kind: "work_item",
  status: "ready",
  name: subject_id.toUpperCase(),
  provenance: {
    source_schema: "semantic.project-model/v1",
    source_document: `model/${subject_id}.json`,
    source_record_kind: "entity" as const,
    source_record_key: subject_id,
  },
});

const relation = (
  fact_key: string,
  subject_id: string,
  object_id: string,
  family: "dependency" | "evidence" | "ownership",
  relation_kind: string,
) => ({
  fact_type: "relation" as const,
  fact_key,
  subject_id,
  object_id,
  relation_kind,
  family,
  provenance: {
    source_schema: "semantic.project-model/v1",
    source_document: "model/graph.json",
    source_record_kind: "relation" as const,
    source_record_key: fact_key,
  },
});

const source: ExplorerFactSource = {
  format: "semantic.explorer-fact-source",
  version: 1,
  facts: [
    ...["a", "b", "c", "d"].map(entity),
    relation("relation:a-b", "a", "b", "dependency", "requires"),
    relation("relation:b-c", "b", "c", "evidence", "supports"),
    relation("relation:b-d", "b", "d", "dependency", "requires"),
    relation("relation:c-a", "c", "a", "ownership", "contains"),
    relation("relation:d-a", "d", "a", "dependency", "requires"),
  ],
};

const query = (overrides: Partial<ExplorerQuery> = {}): ExplorerQuery => ({
  format: "semantic.explorer-query",
  version: 1,
  roots: ["a"],
  direction: "outgoing",
  relation_families: ["dependency"],
  relation_kinds: [],
  expansion: { default: "expanded", expanded_ids: [], collapsed_ids: [] },
  max_depth: 64,
  max_nodes: 64,
  view: "tree",
  ...overrides,
});

const run = (request: ExplorerQuery, factSource: unknown = source): Promise<ExplorerQueryResult> =>
  Effect.runPromise(queryExplorer(factSource, request));

const selected = (result: ExplorerQueryResult): ReadonlyArray<string> =>
  result.nodes.map(({ canonical_identity }) => canonical_identity);

describe("storage-independent explorer query", () => {
  test("recursively traverses a cycle once and preserves exact canonical provenance", async () => {
    const result = await run(query());

    expect(selected(result)).toEqual(["a", "b", "d"]);
    expect(result.relations.map(({ fact_key }) => fact_key)).toEqual([
      "relation:a-b",
      "relation:b-d",
      "relation:d-a",
    ]);
    expect(result.available_relation_families).toEqual(["dependency", "evidence", "ownership"]);
    expect(result.available_relation_kinds).toEqual(["contains", "requires", "supports"]);
    expect(result.nodes[1]).toEqual({
      canonical_identity: "b",
      fact_key: "entity:b",
      entity_kind: "work_item",
      status: "ready",
      name: "B",
      provenance: {
        source_schema: "semantic.project-model/v1",
        source_document: "model/b.json",
        source_record_kind: "entity",
        source_record_key: "b",
      },
    });
    expect(result.projection.kind).toBe("tree");
    if (result.projection.kind === "tree") {
      expect(result.projection.rows).toHaveLength(3);
      expect(result.projection.rows[2]).toMatchObject({
        canonical_identity: "d",
        parent_identity: "b",
        parent_relation_fact_key: "relation:b-d",
      });
    }
    expect(Object.isFrozen(result)).toBeTrue();
    expect(Object.isFrozen(result.nodes)).toBeTrue();
    expect(Object.isFrozen(result.nodes[0]!.provenance)).toBeTrue();
    expect(Object.isFrozen(result.projection)).toBeTrue();
    expect(
      await Effect.runPromise(
        Schema.decodeUnknownEffect(ExplorerQueryResultSchema, {
          onExcessProperty: "error",
        })(result),
      ),
    ).toEqual(result);
  });

  test("expands and collapses recursively under one explicit policy", async () => {
    const collapsed = await run(
      query({
        expansion: { default: "expanded", expanded_ids: [], collapsed_ids: ["b"] },
      }),
    );
    expect(selected(collapsed)).toEqual(["a", "b"]);
    expect(collapsed.frontier).toEqual([
      { canonical_identity: "b", reason: "collapsed", hidden_relation_count: 1 },
    ]);

    const selectivelyExpanded = await run(
      query({
        expansion: {
          default: "collapsed",
          expanded_ids: ["a", "b", "d"],
          collapsed_ids: [],
        },
      }),
    );
    expect(selected(selectivelyExpanded)).toEqual(["a", "b", "d"]);
    expect(selectivelyExpanded.frontier).toEqual([]);
  });

  test("reports a depth-limited frontier without claiming a complete traversal", async () => {
    const result = await run(query({ max_depth: 1 }));
    expect(selected(result)).toEqual(["a", "b"]);
    expect(result.frontier).toEqual([
      { canonical_identity: "b", reason: "depth-limit", hidden_relation_count: 1 },
    ]);
  });

  test("keeps relation family, relation kind, and direction filters orthogonal", async () => {
    const evidence = await run(query({ relation_families: ["evidence"], roots: ["b"] }));
    expect(selected(evidence)).toEqual(["b", "c"]);
    expect(evidence.relations.map(({ family }) => family)).toEqual(["evidence"]);

    const wrongKind = await run(query({ relation_kinds: ["supports"] }));
    expect(selected(wrongKind)).toEqual(["a"]);

    const incoming = await run(query({ direction: "incoming" }));
    expect(selected(incoming)).toEqual(["a", "b", "d"]);
    expect(incoming.projection.kind).toBe("tree");
    if (incoming.projection.kind === "tree")
      expect(incoming.projection.rows[1]).toMatchObject({
        canonical_identity: "d",
        parent_identity: "a",
        parent_relation_fact_key: "relation:d-a",
      });
  });

  test("projects one selected identity set as list, tree, and mosaic", async () => {
    const [list, tree, mosaic] = await Promise.all([
      run(query({ view: "list" })),
      run(query({ view: "tree" })),
      run(query({ view: "mosaic" })),
    ]);
    expect(selected(list)).toEqual(selected(tree));
    expect(selected(tree)).toEqual(selected(mosaic));
    expect(list.relations).toEqual(tree.relations);
    expect(tree.relations).toEqual(mosaic.relations);
    expect(list.projection.kind).toBe("list");
    expect(tree.projection.kind).toBe("tree");
    expect(mosaic.projection.kind).toBe("mosaic");
  });

  test("is invariant under entity and relation presentation order", async () => {
    await fcAssert(
      asyncProperty(integer(), boolean(), async (offset, reverse) => {
        const rotate = <Value>(values: ReadonlyArray<Value>): ReadonlyArray<Value> => {
          const start = Math.abs(offset) % values.length;
          const rotated = [...values.slice(start), ...values.slice(0, start)];
          return reverse ? rotated.reverse() : rotated;
        };
        const permuted = {
          ...source,
          facts: rotate(source.facts),
        };
        expect(await run(query({ view: "tree" }), permuted)).toEqual(
          await run(query({ view: "tree" })),
        );
      }),
      { numRuns: 80 },
    );
  });

  test("rejects overflow instead of returning an unlabeled partial result", async () => {
    const result = await Effect.runPromise(
      Effect.result(queryExplorer(source, query({ max_nodes: 2 }))),
    );
    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(ExplorerQueryRejected);
      expect(result.failure.phase).toBe("traversal");
      expect(result.failure.reason).toContain("exceeds max_nodes 2");
    }
  });

  test("strictly rejects conflicting overrides, unknown endpoints, duplicates, and excess fields", async () => {
    const attempts = [
      queryExplorer(
        source,
        query({
          expansion: { default: "expanded", expanded_ids: ["b"], collapsed_ids: ["b"] },
        }),
      ),
      queryExplorer(source, query({ roots: ["missing"] })),
      queryExplorer(source, query({ roots: ["a", "b"], max_nodes: 1 })),
      queryExplorer({ ...source, facts: [...source.facts, entity("a")] }, query()),
      queryExplorer(
        {
          ...source,
          facts: [
            ...source.facts,
            relation("relation:foreign", "a", "missing", "dependency", "requires"),
          ],
        },
        query(),
      ),
      queryExplorer({ ...source, undeclared: true }, query()),
    ];
    const results = await Promise.all(
      attempts.map((attempt) => Effect.runPromise(Effect.result(attempt))),
    );
    expect(results.every(Result.isFailure)).toBeTrue();
  });
});
