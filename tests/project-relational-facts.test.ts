import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { Crypto, Effect, Layer, Result } from "effect";
import type { Path } from "effect";
import { assert as fcAssert, asyncProperty, boolean, integer } from "fast-check";
import { canonicalBytes, type CanonicalJsonValue } from "../src/normalized-core/canonical.ts";
import {
  buildRelationalFactExport,
  queryEvidence,
  queryImpact,
  relationFactFamily,
  RelationalFactDigestFailure,
  RelationalFactExportRejected,
  RelationalFactQueryRejected,
  relationalFactBounds,
  validateRelationalFactExportBytes,
} from "../src/project-model/relational-facts.ts";
import { loadProject } from "../src/project-model/loader.ts";
import type { Entity, ProjectGraph, Relation } from "../src/project-model/types.ts";

const root = "/workspace";
const source = `${root}/model/fixture.json`;
const repositoryRoot = resolve(import.meta.dir, "..");

const entity = (id: string, kind = "component", status: string | null = "current"): Entity => ({
  id,
  kind,
  name: id,
  summary: "",
  status,
  tags: [],
  attributes: kind === "evidence" ? { evidence_type: "test" } : {},
  source,
});

const relation = (sourceId: string, kind: string, targetId: string): Relation => ({
  sourceId,
  targetId,
  kind,
  summary: "",
  attributes: {},
  source,
});

const graph = (
  entities: ReadonlyArray<Entity>,
  relations: ReadonlyArray<Relation>,
): ProjectGraph => ({
  root,
  entities: new Map(entities.map((item) => [item.id, item])),
  relations,
});

const tracerGraph = (): ProjectGraph =>
  graph(
    [
      entity("component.a"),
      entity("component.b"),
      entity("component.c"),
      entity("component.d"),
      entity("claim.safe", "claim", "open"),
      entity("obligation.safe", "obligation", "open"),
      entity("evidence.safe", "evidence", "current"),
      entity("assumption.host", "assumption", "open"),
    ],
    [
      relation("component.a", "requires", "component.b"),
      relation("component.b", "requires", "component.c"),
      relation("component.b", "requires", "component.a"),
      relation("component.a", "blocks", "component.d"),
      relation("obligation.safe", "discharges", "claim.safe"),
      relation("evidence.safe", "discharges", "obligation.safe"),
      relation("claim.safe", "assumes", "assumption.host"),
    ],
  );

const runBuild = <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide([BunCrypto.layer, BunPath.layer])));

const runCrypto = <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto>) =>
  Effect.runPromise(effect.pipe(Effect.provide(BunCrypto.layer)));

describe("project relational fact export 0034", () => {
  test("builds and independently validates a deterministic immutable fact artifact", async () => {
    const first = await runBuild(buildRelationalFactExport(tracerGraph()));
    const permuted = tracerGraph();
    const second = await runBuild(
      buildRelationalFactExport({
        ...permuted,
        entities: new Map([...permuted.entities].reverse()),
        relations: [...permuted.relations].reverse(),
      }),
    );
    const validated = await runCrypto(validateRelationalFactExportBytes(first.bytes));

    expect(first.bytes).toEqual(second.bytes);
    expect(first.export).toEqual(validated);
    expect(first.export.authority).toBe("derived-non-authoritative");
    expect(first.export.entity_count).toBe(8);
    expect(first.export.relation_count).toBe(7);
    expect(first.export.fact_count).toBe(15);
    expect(first.export.export_identity).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Object.isFrozen(first.export)).toBeTrue();
    expect(Object.isFrozen(first.export.facts)).toBeTrue();
    expect(Object.isFrozen(first.export.facts[0]!.provenance)).toBeTrue();
    expect(
      first.export.facts.every((fact) => fact.provenance.source_document === "model/fixture.json"),
    ).toBeTrue();

    const exposed = first.bytes;
    exposed.fill(0);
    expect(first.bytes[0]).toBe("{".charCodeAt(0));
  });

  test("projects the accepted repository model and explains its real evidence chain", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* loadProject(repositoryRoot);
        const artifact = yield* buildRelationalFactExport(project);
        const evidence = yield* queryEvidence(artifact.bytes, {
          format: "semantic.evidence-query",
          version: 1,
          subject_ids: ["claim.inventory.invariant"],
          max_depth: 8,
          max_nodes: 64,
        });
        return { artifact, evidence };
      }).pipe(Effect.provide([BunFileSystem.layer, BunPath.layer, BunCrypto.layer])),
    );

    expect(result.artifact.export.entity_count).toBeGreaterThanOrEqual(130);
    expect(result.artifact.export.relation_count).toBeGreaterThanOrEqual(200);
    expect(
      result.artifact.export.facts.every((fact) =>
        fact.provenance.source_document.startsWith("model/"),
      ),
    ).toBeTrue();
    expect(result.evidence.matches.map(({ subject_id }) => subject_id)).toContain(
      "evidence.inventory.tests",
    );
    expect(result.evidence.matches.map(({ subject_id }) => subject_id)).toContain(
      "obligation.inventory.proof",
    );
  });

  test("derives cyclic dependency impact with explicit direction and shortest paths", async () => {
    const artifact = await runBuild(buildRelationalFactExport(tracerGraph()));
    const result = await runCrypto(
      queryImpact(artifact.bytes, {
        format: "semantic.impact-query",
        version: 1,
        subject_ids: ["component.c"],
        max_depth: 8,
        max_nodes: 32,
      }),
    );

    expect(result.depth_limited).toBeFalse();
    expect(
      result.affected.map(({ subject_id, minimum_depth }) => [subject_id, minimum_depth]),
    ).toEqual([
      ["component.b", 1],
      ["component.a", 2],
      ["component.d", 3],
    ]);
    expect(result.affected[1]!.path_fact_keys).toHaveLength(2);
    expect(result.affected.every((item) => Object.isFrozen(item.path_fact_keys))).toBeTrue();
  });

  test("returns exact transitive evidence, obligation, and assumption paths", async () => {
    const artifact = await runBuild(buildRelationalFactExport(tracerGraph()));
    const result = await runCrypto(
      queryEvidence(artifact.bytes, {
        format: "semantic.evidence-query",
        version: 1,
        subject_ids: ["claim.safe"],
        max_depth: 8,
        max_nodes: 32,
      }),
    );

    expect(result.depth_limited).toBeFalse();
    expect(
      result.matches.map(({ subject_id, entity_kind, minimum_depth }) => [
        subject_id,
        entity_kind,
        minimum_depth,
      ]),
    ).toEqual([
      ["assumption.host", "assumption", 1],
      ["obligation.safe", "obligation", 1],
      ["evidence.safe", "evidence", 2],
    ]);
    expect(
      result.matches.find(({ subject_id }) => subject_id === "evidence.safe")?.path_fact_keys,
    ).toHaveLength(2);
  });

  test("keeps relation families explicit and conservative", () => {
    expect(relationFactFamily("requires")).toBe("dependency");
    expect(relationFactFamily("handles")).toBe("effect");
    expect(relationFactFamily("accountable_for")).toBe("ownership");
    expect(relationFactFamily("derives")).toBe("derivation");
    expect(relationFactFamily("changes")).toBe("causality");
    expect(relationFactFamily("reads")).toBe("observation");
    expect(relationFactFamily("supports")).toBe("evidence");
    expect(relationFactFamily("contains")).toBe("other");
    expect(relationFactFamily("sends")).toBe("other");
  });

  test("exposes depth limitation and rejects node excess rather than claiming completeness", async () => {
    const artifact = await runBuild(buildRelationalFactExport(tracerGraph()));
    const depthLimited = await runCrypto(
      queryImpact(artifact.bytes, {
        format: "semantic.impact-query",
        version: 1,
        subject_ids: ["component.c"],
        max_depth: 1,
        max_nodes: 32,
      }),
    );
    const nodeLimited = await runCrypto(
      queryImpact(artifact.bytes, {
        format: "semantic.impact-query",
        version: 1,
        subject_ids: ["component.c"],
        max_depth: 8,
        max_nodes: 2,
      }).pipe(Effect.result),
    );

    expect(depthLimited.depth_limited).toBeTrue();
    expect(depthLimited.affected.map(({ subject_id }) => subject_id)).toEqual(["component.b"]);
    expect(Result.isFailure(nodeLimited)).toBeTrue();
    if (Result.isFailure(nodeLimited)) {
      expect(nodeLimited.failure).toBeInstanceOf(RelationalFactQueryRejected);
      if (nodeLimited.failure instanceof RelationalFactQueryRejected) {
        expect(nodeLimited.failure.reason).toContain("max_nodes");
      }
    }
  });

  test("maps hostile query request observations into the typed rejection channel", async () => {
    const artifact = await runBuild(buildRelationalFactExport(tracerGraph()));
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const result = await runCrypto(queryImpact(artifact.bytes, revoked.proxy).pipe(Effect.result));

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(RelationalFactQueryRejected);
    }
  });

  test("rejects excessive query roots before reading any root element", async () => {
    const artifact = await runBuild(buildRelationalFactExport(tracerGraph()));
    let accessorCalls = 0;
    const subjectIds = Array.from(
      { length: relationalFactBounds.maximumQueryRoots + 1 },
      (_, index) => `component.${index}`,
    );
    Object.defineProperty(subjectIds, relationalFactBounds.maximumQueryRoots, {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorCalls += 1;
        throw new Error("over-limit query root must not be read");
      },
    });
    const result = await runCrypto(
      queryImpact(artifact.bytes, {
        format: "semantic.impact-query",
        version: 1,
        subject_ids: subjectIds,
        max_depth: 1,
        max_nodes: relationalFactBounds.maximumQueryNodes,
      }).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result) && result.failure instanceof RelationalFactQueryRejected) {
      expect(result.failure.reason).toContain("roots");
    }
    expect(accessorCalls).toBe(0);
  });

  test("rejects unknown roots, invalid project state, foreign paths, duplicates, and non-canonical bytes", async () => {
    const artifact = await runBuild(buildRelationalFactExport(tracerGraph()));
    const unknown = await runCrypto(
      queryImpact(artifact.bytes, {
        format: "semantic.impact-query",
        version: 1,
        subject_ids: ["component.unknown"],
        max_depth: 1,
        max_nodes: 8,
      }).pipe(Effect.result),
    );
    const duplicateRelationGraph = tracerGraph();
    const duplicate = await runBuild(
      buildRelationalFactExport({
        ...duplicateRelationGraph,
        relations: [...duplicateRelationGraph.relations, duplicateRelationGraph.relations[0]!],
      }).pipe(Effect.result),
    );
    const foreign = tracerGraph();
    const foreignEntity = { ...foreign.entities.get("component.a")!, source: "/outside.json" };
    const foreignPath = await runBuild(
      buildRelationalFactExport({
        ...foreign,
        entities: new Map([...foreign.entities, [foreignEntity.id, foreignEntity]]),
      }).pipe(Effect.result),
    );
    const invalid = tracerGraph();
    const invalidProject = await runBuild(
      buildRelationalFactExport({
        ...invalid,
        relations: [...invalid.relations, relation("component.a", "requires", "missing")],
      }).pipe(Effect.result),
    );
    const invalidUnicode = tracerGraph();
    const invalidUnicodeEntity = {
      ...invalidUnicode.entities.get("component.a")!,
      name: "\ud800",
    };
    const invalidUnicodeResult = await runBuild(
      buildRelationalFactExport({
        ...invalidUnicode,
        entities: new Map([
          ...[...invalidUnicode.entities].filter(([id]) => id !== invalidUnicodeEntity.id),
          [invalidUnicodeEntity.id, invalidUnicodeEntity],
        ]),
      }).pipe(Effect.result),
    );
    const pretty = new TextEncoder().encode(
      JSON.stringify(JSON.parse(new TextDecoder().decode(artifact.bytes)), null, 2),
    );
    const nonCanonical = await runCrypto(
      validateRelationalFactExportBytes(pretty).pipe(Effect.result),
    );
    const forgery = JSON.parse(new TextDecoder().decode(artifact.bytes)) as Record<string, unknown>;
    const forgedFacts = forgery["facts"] as Array<Record<string, unknown>>;
    forgedFacts[0]!["name"] = "forged presentation";
    const forged = await runCrypto(
      validateRelationalFactExportBytes(
        canonicalBytes(forgery as unknown as CanonicalJsonValue),
      ).pipe(Effect.result),
    );

    expect(Result.isFailure(unknown)).toBeTrue();
    expect(Result.isFailure(duplicate)).toBeTrue();
    expect(Result.isFailure(foreignPath)).toBeTrue();
    expect(Result.isFailure(invalidProject)).toBeTrue();
    expect(Result.isFailure(invalidUnicodeResult)).toBeTrue();
    expect(Result.isFailure(nonCanonical)).toBeTrue();
    expect(Result.isFailure(forged)).toBeTrue();
    if (Result.isFailure(duplicate))
      expect(duplicate.failure).toBeInstanceOf(RelationalFactExportRejected);
    if (Result.isFailure(foreignPath))
      expect(foreignPath.failure).toBeInstanceOf(RelationalFactExportRejected);
    if (Result.isFailure(nonCanonical))
      expect(nonCanonical.failure).toBeInstanceOf(RelationalFactExportRejected);
  });

  test("rejects export byte lookalikes and oversized observations before copying", async () => {
    let accessorCalls = 0;
    const lookalike = {
      get byteLength(): number {
        accessorCalls += 1;
        return 0;
      },
    };
    const lookalikeResult = await runCrypto(
      validateRelationalFactExportBytes(lookalike).pipe(Effect.result),
    );
    const overLimitResult = await runCrypto(
      validateRelationalFactExportBytes(new Uint8Array(relationalFactBounds.maximumBytes + 1)).pipe(
        Effect.result,
      ),
    );

    expect(Result.isFailure(lookalikeResult)).toBeTrue();
    expect(Result.isFailure(overLimitResult)).toBeTrue();
    if (Result.isFailure(lookalikeResult)) {
      expect(lookalikeResult.failure).toBeInstanceOf(RelationalFactExportRejected);
    }
    if (
      Result.isFailure(overLimitResult) &&
      overLimitResult.failure instanceof RelationalFactExportRejected
    ) {
      expect(overLimitResult.failure.reason).toContain("exceeds");
    }
    expect(accessorCalls).toBe(0);
  });

  test("preserves invalid digest observations as typed failures", async () => {
    const invalidCrypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: () => Effect.succeed(Uint8Array.of(0)),
      }),
    );
    const result = await Effect.runPromise(
      buildRelationalFactExport(tracerGraph()).pipe(
        Effect.provide([BunPath.layer, invalidCrypto]),
        Effect.result,
      ),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result))
      expect(result.failure).toBeInstanceOf(RelationalFactDigestFailure);
  });

  test("rejects excessive graph cardinality before inspecting any record", async () => {
    let accessorCalls = 0;
    const unreadable = Object.defineProperty({}, "id", {
      enumerable: true,
      get: () => {
        accessorCalls += 1;
        throw new Error("over-limit graph record must not be read");
      },
    }) as unknown as Entity;
    const tooManyEntities = new Map<string, Entity>(
      Array.from({ length: relationalFactBounds.maximumEntities + 1 }, (_, index) => [
        `entity.${index}`,
        unreadable,
      ]),
    );
    const tooManyRelations = Array.from(
      { length: relationalFactBounds.maximumRelations + 1 },
      () => unreadable as unknown as Relation,
    );
    const entityResult = await runBuild(
      buildRelationalFactExport({ root, entities: tooManyEntities, relations: [] }).pipe(
        Effect.result,
      ),
    );
    const relationResult = await runBuild(
      buildRelationalFactExport({ root, entities: new Map(), relations: tooManyRelations }).pipe(
        Effect.result,
      ),
    );
    expect(Result.isFailure(entityResult)).toBeTrue();
    expect(Result.isFailure(relationResult)).toBeTrue();
    if (
      Result.isFailure(entityResult) &&
      entityResult.failure instanceof RelationalFactExportRejected
    ) {
      expect(entityResult.failure.reason).toContain("entities");
    }
    if (
      Result.isFailure(relationResult) &&
      relationResult.failure instanceof RelationalFactExportRejected
    ) {
      expect(relationResult.failure.reason).toContain("relations");
    }
    expect(accessorCalls).toBe(0);
  });

  test("rejects oversized digest observations through the typed identity boundary", async () => {
    const invalidCrypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: () => Effect.succeed(new Uint8Array(33)),
      }),
    );
    const result = await Effect.runPromise(
      buildRelationalFactExport(tracerGraph()).pipe(
        Effect.provide([BunPath.layer, invalidCrypto]),
        Effect.result,
      ),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result) && result.failure instanceof RelationalFactDigestFailure) {
      expect(result.failure.message).toContain("invalid relational fact SHA-256");
    } else {
      throw new Error("oversized digest must fail with RelationalFactDigestFailure");
    }
  });

  test("matches chain impact depths across generated bounded permutations", async () => {
    await fcAssert(
      asyncProperty(integer({ min: 2, max: 16 }), boolean(), async (size, reverse) => {
        const entities = Array.from({ length: size }, (_, index) => entity(`node.${index}`));
        const relations = Array.from({ length: size - 1 }, (_, index) =>
          relation(`node.${index}`, "requires", `node.${index + 1}`),
        );
        const artifact = await runBuild(
          buildRelationalFactExport(
            graph(
              reverse ? [...entities].reverse() : entities,
              reverse ? [...relations].reverse() : relations,
            ),
          ),
        );
        const result = await runCrypto(
          queryImpact(artifact.bytes, {
            format: "semantic.impact-query",
            version: 1,
            subject_ids: [`node.${size - 1}`],
            max_depth: relationalFactBounds.maximumQueryDepth,
            max_nodes: size,
          }),
        );
        expect(result.depth_limited).toBeFalse();
        expect(result.affected.map(({ minimum_depth }) => minimum_depth)).toEqual(
          Array.from({ length: size - 1 }, (_, index) => index + 1),
        );
        expect(result.affected.map(({ subject_id }) => subject_id)).toEqual(
          Array.from({ length: size - 1 }, (_, index) => `node.${size - index - 2}`),
        );
      }),
      { numRuns: 48, seed: 0x0034 },
    );
  });

  test("publishes the frozen resource bounds", () => {
    expect(relationalFactBounds).toEqual({
      maximumEntities: 16_384,
      maximumRelations: 65_536,
      maximumFacts: 81_920,
      maximumInputCodeUnits: 4_194_304,
      maximumBytes: 16_777_216,
      maximumJsonDepth: 64,
      maximumJsonValues: 524_288,
      maximumQueryRoots: 128,
      maximumQueryDepth: 64,
      maximumQueryNodes: 4_096,
    });
  });
});
