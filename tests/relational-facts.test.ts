import { describe, expect, test } from "bun:test";
import type { Entity, ProjectGraph, Relation } from "../src/project-model/types.ts";
import {
  encodeRelationalFacts,
  exportRelationalFacts,
  queryEvidence,
  queryReachability,
  RelationalExportError,
  RelationalQueryError,
} from "../src/relational-facts/index.ts";

const ROOT = "/workspace/semantic";
const source = (key: string): string => `${ROOT}/model/${key}`;

const makeEntity = (overrides: Partial<Entity> & Pick<Entity, "id" | "kind">): Entity => ({
  id: overrides.id,
  kind: overrides.kind,
  name: overrides.name ?? overrides.id,
  summary: overrides.summary ?? "",
  status: overrides.status === undefined ? null : overrides.status,
  tags: overrides.tags ?? [],
  attributes: overrides.attributes ?? {},
  source: overrides.source ?? source("fixture.json"),
});

const makeRelation = (
  overrides: Partial<Relation> & Pick<Relation, "sourceId" | "targetId" | "kind">,
): Relation => ({
  sourceId: overrides.sourceId,
  targetId: overrides.targetId,
  kind: overrides.kind,
  summary: overrides.summary ?? "",
  attributes: overrides.attributes ?? {},
  source: overrides.source ?? source("fixture.json"),
});

const graph = (reverseEntities = false): ProjectGraph => {
  const entities = [
    makeEntity({
      id: "obligation.inventory.conformance",
      kind: "obligation",
      name: "Inventory conformance",
      summary: "A realization must satisfy every reference case.",
      tags: ["evidence", "evidence"],
      attributes: { nested: { values: [1, { stable: true }] } },
      source: source("semantic/inventory-tracer.json"),
    }),
    makeEntity({
      id: "evidence.inventory.pure",
      kind: "evidence",
      name: "Pure conformance",
      attributes: { category: "example_test" },
      source: source("evidence/inventory-tracer.json"),
    }),
    makeEntity({
      id: "assumption.inventory.direct",
      kind: "assumption",
      name: "Direct assumption",
      source: source("semantic/inventory-tracer.json"),
    }),
    makeEntity({
      id: "assumption.inventory.transitive",
      kind: "assumption",
      name: "Transitive assumption",
      source: source("semantic/inventory-tracer.json"),
    }),
    makeEntity({ id: "work.stm-runtime", kind: "work_item", source: source("work/0050.json") }),
    makeEntity({ id: "work.inventory-stm", kind: "work_item", source: source("work/0050.json") }),
    makeEntity({ id: "work.stm-model-check", kind: "work_item", source: source("work/0050.json") }),
  ];
  const ordered = reverseEntities ? [...entities].reverse() : entities;
  return {
    entities: new Map(ordered.map((entity) => [entity.id, entity])),
    relations: [
      makeRelation({
        sourceId: "work.inventory-stm",
        targetId: "work.stm-runtime",
        kind: "blocks",
        source: source("work/0050.json"),
      }),
      makeRelation({
        sourceId: "work.stm-model-check",
        targetId: "work.stm-runtime",
        kind: "blocks",
        source: source("work/0050.json"),
      }),
      makeRelation({
        sourceId: "evidence.inventory.pure",
        targetId: "obligation.inventory.conformance",
        kind: "supports",
        source: source("evidence/inventory-tracer.json"),
      }),
      makeRelation({
        sourceId: "evidence.inventory.pure",
        targetId: "obligation.inventory.conformance",
        kind: "invalidates",
        source: source("evidence/inventory-tracer.json"),
      }),
      makeRelation({
        sourceId: "evidence.inventory.pure",
        targetId: "assumption.inventory.direct",
        kind: "assumes",
        source: source("evidence/inventory-tracer.json"),
      }),
      makeRelation({
        sourceId: "assumption.inventory.direct",
        targetId: "assumption.inventory.transitive",
        kind: "assumes",
        source: source("semantic/inventory-tracer.json"),
      }),
      makeRelation({
        sourceId: "evidence.inventory.pure",
        targetId: "obligation.inventory.conformance",
        kind: "supports",
        source: source("evidence/inventory-tracer.json"),
      }),
    ],
    root: ROOT,
  };
};

const bundleOf = (project = graph()) => {
  const bundle = exportRelationalFacts(project);
  if (bundle instanceof RelationalExportError) throw bundle;
  return bundle;
};

describe("relational fact export", () => {
  test("preserves lossless rows, custody, multiplicity, and immutable snapshots", () => {
    const project = graph();
    const original = project.entities.get("obligation.inventory.conformance")!;
    const bundle = bundleOf(project);

    expect(bundle.entities).toHaveLength(7);
    expect(bundle.relations).toHaveLength(7);
    expect(bundle.tags).toHaveLength(2);
    expect(bundle.attributes).toHaveLength(2);
    expect(bundle.source_documents).toHaveLength(3);
    expect(bundle.relations.map((relation) => relation.relation_ordinal)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(bundle.relations.filter((relation) => relation.kind === "supports")).toHaveLength(2);
    expect(bundle.entities.every((entity) => !entity.source_key.startsWith("/"))).toBe(true);
    expect(bundle.entities.every((entity) => entity.source_key.split("/").every(Boolean))).toBe(
      true,
    );
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.attributes[0])).toBe(true);
    expect(Object.isFrozen(bundle.attributes[0]!.value)).toBe(true);
    const mutableOriginal = original as unknown as {
      attributes: { nested: { values: Array<unknown> } };
      tags: string[];
    };
    mutableOriginal.attributes.nested.values[1] = "changed";
    mutableOriginal.tags.push("mutated");
    expect(bundle.attributes.find((attribute) => attribute.key === "nested")!.value).toEqual({
      values: [1, { stable: true }],
    });
    expect(bundle.tags).toHaveLength(2);
    expect(() => (bundle.attributes as unknown as Array<unknown>).push(null)).toThrow();
  });

  test("canonical bytes do not depend on entity Map insertion order", () => {
    const first = encodeRelationalFacts(bundleOf(graph(false)));
    const second = encodeRelationalFacts(bundleOf(graph(true)));
    expect(new TextDecoder().decode(first)).toBe(new TextDecoder().decode(second));
  });

  test("uses exact incoming breadth-first reachability and reports bounds", () => {
    const result = queryReachability(bundleOf(), {
      roots: ["work.stm-runtime"],
      direction: "incoming",
      relationKinds: ["blocks"],
      maximumDepth: 64,
      maximumRows: 10,
    });
    if (result instanceof RelationalQueryError) throw result;
    expect(result.nodes.map((node) => node.entity_id)).toEqual([
      "work.stm-runtime",
      "work.inventory-stm",
      "work.stm-model-check",
    ]);
    expect(result.relations.map((relation) => relation.relation_ordinal)).toEqual([0, 1]);
    expect(result.paths[1]).toEqual({
      entity_id: "work.inventory-stm",
      entity_ids: ["work.stm-runtime", "work.inventory-stm"],
      relation_ordinals: [0],
    });
    expect(result.truncated).toBe(false);

    const depthBound = queryReachability(bundleOf(), {
      roots: ["work.stm-runtime"],
      direction: "incoming",
      relationKinds: ["blocks"],
      maximumDepth: 1,
      maximumRows: 10,
    });
    if (depthBound instanceof RelationalQueryError) throw depthBound;
    expect(depthBound.nodes).toHaveLength(3);
    expect(depthBound.truncated).toBe(false);

    const rowBound = queryReachability(bundleOf(), {
      roots: ["work.stm-runtime"],
      direction: "incoming",
      relationKinds: ["blocks"],
      maximumDepth: 64,
      maximumRows: 1,
    });
    if (rowBound instanceof RelationalQueryError) throw rowBound;
    expect(rowBound.nodes).toHaveLength(1);
    expect(rowBound.truncated).toBe(true);
  });

  test("keeps invalidating evidence visible and follows assumptions transitively", () => {
    const result = queryEvidence(bundleOf(), "obligation.inventory.conformance");
    if (result instanceof RelationalQueryError) throw result;
    expect(result.target.entity_id).toBe("obligation.inventory.conformance");
    expect(result.evidence.map((record) => record.relation.kind)).toEqual([
      "supports",
      "invalidates",
      "supports",
    ]);
    expect(
      result.evidence[0]!.assumptions.map((assumption) => assumption.entity.entity_id),
    ).toEqual(["assumption.inventory.direct", "assumption.inventory.transitive"]);
    expect(result.evidence[0]!.assumption_relations.map((relation) => relation.kind)).toEqual([
      "assumes",
      "assumes",
    ]);
    expect(result.evidence[1]!.relation.kind).toBe("invalidates");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evidence[0]!.assumptions[0])).toBe(true);
  });

  test("returns typed failures for invalid source custody and query inputs", () => {
    const outside = graph();
    const mutableEntities = outside.entities as unknown as Map<string, Entity>;
    mutableEntities.set(
      "bad.source",
      makeEntity({ id: "bad.source", kind: "artifact", source: "/workspace/other/file.json" }),
    );
    const exportFailure = exportRelationalFacts(outside);
    expect(exportFailure).toBeInstanceOf(RelationalExportError);
    if (!(exportFailure instanceof RelationalExportError))
      throw new Error("expected export failure");
    expect(exportFailure.code).toBe("export.source-custody");

    const unnormalizedRoot = exportRelationalFacts({
      ...graph(),
      root: "/workspace/semantic/../semantic",
    });
    expect(unnormalizedRoot).toBeInstanceOf(RelationalExportError);
    if (!(unnormalizedRoot instanceof RelationalExportError)) {
      throw new Error("expected project-root export failure");
    }
    expect(unnormalizedRoot.code).toBe("export.project-root");

    const bundle = bundleOf();
    const unknownRoot = queryReachability(bundle, {
      roots: ["missing"],
      direction: "incoming",
      relationKinds: ["blocks"],
      maximumDepth: 1,
      maximumRows: 1,
    });
    expect(unknownRoot).toBeInstanceOf(RelationalQueryError);
    const unknownKind = queryReachability(bundle, {
      roots: ["work.stm-runtime"],
      direction: "incoming",
      relationKinds: ["requires"],
      maximumDepth: 1,
      maximumRows: 1,
    });
    expect(unknownKind).toBeInstanceOf(RelationalQueryError);
    const badBound = queryReachability(bundle, {
      roots: ["work.stm-runtime"],
      direction: "incoming",
      relationKinds: ["blocks"],
      maximumDepth: 65,
      maximumRows: 1,
    });
    expect(badBound).toBeInstanceOf(RelationalQueryError);
  });
});
