import { BunCrypto, BunPath } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Effect, Result, Schema } from "effect";
import type { Crypto, Path } from "effect";
import { assert as fcAssert, asyncProperty, boolean, integer } from "fast-check";
import {
  explorerBounds,
  ExplorerQueryRejected,
  ExplorerQueryResultSchema,
  queryExplorer,
  type ExplorerFactSource,
  type ExplorerQuery,
  type ExplorerQueryResult,
} from "../src/explorer-query/index.ts";
import { buildRelationalFactExport } from "../src/project-model/relational-facts.ts";
import type { Entity, ProjectGraph } from "../src/project-model/types.ts";

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

const runBuild = <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide([BunCrypto.layer, BunPath.layer])));

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

  test("captures one bounded inert source and query observation before Schema traversal", async () => {
    let rootElementCalls = 0;
    const excessiveRoots = Array.from({ length: explorerBounds.maximumRoots + 1 });
    Object.defineProperty(excessiveRoots, String(explorerBounds.maximumRoots), {
      enumerable: true,
      get: () => {
        rootElementCalls += 1;
        throw new Error("must not run");
      },
    });
    const excessiveRootResult = await Effect.runPromise(
      Effect.result(queryExplorer(source, { ...query(), roots: excessiveRoots })),
    );
    expect(Result.isFailure(excessiveRootResult)).toBeTrue();
    expect(rootElementCalls).toBe(0);

    let factElementCalls = 0;
    const excessiveFacts = Array.from({ length: explorerBounds.maximumFacts + 1 });
    Object.defineProperty(excessiveFacts, String(explorerBounds.maximumFacts), {
      enumerable: true,
      get: () => {
        factElementCalls += 1;
        throw new Error("must not run");
      },
    });
    const excessiveFactResult = await Effect.runPromise(
      Effect.result(
        queryExplorer(
          { format: "semantic.explorer-fact-source", version: 1, facts: excessiveFacts },
          query(),
        ),
      ),
    );
    expect(Result.isFailure(excessiveFactResult)).toBeTrue();
    expect(factElementCalls).toBe(0);

    let nestedAccessorCalls = 0;
    const accessorEntity = { ...entity("a") } as Record<string, unknown>;
    Object.defineProperty(accessorEntity, "name", {
      configurable: true,
      enumerable: true,
      get: () => {
        nestedAccessorCalls += 1;
        return "A";
      },
    });
    const nestedAccessorResult = await Effect.runPromise(
      Effect.result(
        queryExplorer(
          { format: "semantic.explorer-fact-source", version: 1, facts: [accessorEntity] },
          query(),
        ),
      ),
    );
    expect(Result.isFailure(nestedAccessorResult)).toBeTrue();
    expect(nestedAccessorCalls).toBe(0);

    let queryAccessorCalls = 0;
    const accessorQuery = { ...query() } as Record<string, unknown>;
    Object.defineProperty(accessorQuery, "roots", {
      configurable: true,
      enumerable: true,
      get: () => {
        queryAccessorCalls += 1;
        return ["a"];
      },
    });
    const accessorResult = await Effect.runPromise(
      Effect.result(queryExplorer(source, accessorQuery)),
    );
    expect(Result.isFailure(accessorResult)).toBeTrue();
    expect(queryAccessorCalls).toBe(0);

    let liveGetCalls = 0;
    const movingQuery = new Proxy(query(), {
      get: (target, key, receiver) => {
        liveGetCalls += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    expect(await run(movingQuery)).toEqual(await run(query()));
    expect(liveGetCalls).toBe(0);

    const revoked = Proxy.revocable(query(), {});
    revoked.revoke();
    const revokedResult = await Effect.runPromise(
      Effect.result(queryExplorer(source, revoked.proxy)),
    );
    expect(Result.isFailure(revokedResult)).toBeTrue();
    if (Result.isFailure(revokedResult)) {
      expect(revokedResult.failure).toBeInstanceOf(ExplorerQueryRejected);
      expect(revokedResult.failure.phase).toBe("query");
    }
  });

  test("rejects per-kind fact excess before observing the excess record body", async () => {
    const minimalEntity = {
      fact_type: "entity" as const,
      fact_key: "e",
      subject_id: "a",
      entity_kind: "e",
      status: null,
      name: "",
      provenance: {
        source_schema: "s",
        source_document: "d",
        source_record_kind: "entity" as const,
        source_record_key: "e",
      },
    };
    const minimalRelation = {
      fact_type: "relation" as const,
      fact_key: "r",
      subject_id: "a",
      object_id: "a",
      relation_kind: "r",
      family: "dependency" as const,
      provenance: {
        source_schema: "s",
        source_document: "d",
        source_record_kind: "relation" as const,
        source_record_key: "r",
      },
    };
    const guardedExcess = (factType: "entity" | "relation") => {
      let bodyObservations = 0;
      const value = new Proxy(
        { ...minimalEntity, fact_type: factType },
        {
          ownKeys: () => {
            bodyObservations += 1;
            throw new Error("excess fact body must not be observed");
          },
          getOwnPropertyDescriptor: (target, key) => {
            if (key === "fact_type") return Reflect.getOwnPropertyDescriptor(target, key);
            bodyObservations += 1;
            throw new Error("excess fact body must not be observed");
          },
        },
      );
      return { value, observations: () => bodyObservations };
    };

    const excessEntity = guardedExcess("entity");
    const entityResult = await Effect.runPromise(
      Effect.result(
        queryExplorer(
          {
            format: "semantic.explorer-fact-source",
            version: 1,
            facts: [
              ...Array.from({ length: explorerBounds.maximumEntities }, () => minimalEntity),
              excessEntity.value,
            ],
          },
          query(),
        ),
      ),
    );
    expect(Result.isFailure(entityResult)).toBeTrue();
    expect(excessEntity.observations()).toBe(0);

    const excessRelation = guardedExcess("relation");
    const relationResult = await Effect.runPromise(
      Effect.result(
        queryExplorer(
          {
            format: "semantic.explorer-fact-source",
            version: 1,
            facts: [
              minimalEntity,
              ...Array.from({ length: explorerBounds.maximumRelations }, () => minimalRelation),
              excessRelation.value,
            ],
          },
          query(),
        ),
      ),
    );
    expect(Result.isFailure(relationResult)).toBeTrue();
    expect(excessRelation.observations()).toBe(0);
  });

  test("keeps available relation-kind introspection inside its exported result schema", async () => {
    const manyKinds = {
      format: "semantic.explorer-fact-source" as const,
      version: 1 as const,
      facts: [
        entity("a"),
        ...Array.from({ length: 257 }, (_, index) =>
          relation(`relation:self:${index}`, "a", "a", "dependency", `kind.${index}`),
        ),
      ],
    };
    const result = await run(query({ max_nodes: 1 }), manyKinds);
    expect(result.available_relation_kinds).toHaveLength(257);
    expect(
      await Effect.runPromise(
        Schema.decodeUnknownEffect(ExplorerQueryResultSchema, {
          onExcessProperty: "error",
        })(result),
      ),
    ).toEqual(result);
  });

  test("losslessly adapts accepted 0034 Unicode and empty display fields", async () => {
    const root = "/workspace";
    const sourceDocument = `${root}/model/fixture.json`;
    const acceptedEntity: Entity = {
      id: "component.å",
      kind: "component",
      name: "",
      summary: "",
      status: "",
      tags: [],
      attributes: {},
      source: sourceDocument,
    };
    const project: ProjectGraph = {
      root,
      entities: new Map([[acceptedEntity.id, acceptedEntity]]),
      relations: [],
    };
    const artifact = await runBuild(buildRelationalFactExport(project));
    const adapted = {
      format: "semantic.explorer-fact-source" as const,
      version: 1 as const,
      facts: artifact.export.facts.map((fact) => {
        return "entity_kind" in fact
          ? {
              fact_type: "entity" as const,
              fact_key: fact.fact_key,
              subject_id: fact.subject_id,
              entity_kind: fact.entity_kind,
              status: fact.status,
              name: fact.name,
              provenance: fact.provenance,
            }
          : {
              fact_type: "relation" as const,
              fact_key: fact.fact_key,
              subject_id: fact.subject_id,
              object_id: fact.object_id,
              relation_kind: fact.relation_kind,
              family: fact.family,
              provenance: fact.provenance,
            };
      }),
    };
    const result = await run(
      query({ roots: [acceptedEntity.id], relation_families: [], max_nodes: 1 }),
      adapted,
    );
    expect(result.nodes).toEqual([
      expect.objectContaining({
        canonical_identity: "component.å",
        name: "",
        status: "",
      }),
    ]);
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
