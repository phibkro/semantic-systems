import { BunCrypto } from "@effect/platform-bun";
import { Effect } from "effect";
import { describe, expect, test } from "bun:test";
import { buildPublicArtifact, type ExportObservation } from "../src/project-model/public-export.ts";
import { assessWork } from "../src/project-model/schedule.ts";
import type { Entity, ProjectGraph, Relation } from "../src/project-model/types.ts";

const ROOT = "/workspace/semantic";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const observation = (overrides: Partial<ExportObservation> = {}): ExportObservation => ({
  commit: COMMIT,
  observedAt: "2026-07-31T12:00:00Z",
  freshnessSeconds: 86_400,
  deployedCheckStatus: "not_checked",
  observationSource: "local_preview",
  ...overrides,
});

const entity = (overrides: Partial<Entity> = {}): Entity => ({
  id: "component.alpha",
  kind: "component",
  name: "Alpha",
  summary: "A public component",
  status: "active",
  tags: ["system"],
  attributes: {},
  source: `${ROOT}/model/fixture.json`,
  ...overrides,
});

const relation = (overrides: Partial<Relation> = {}): Relation => ({
  sourceId: "component.alpha",
  targetId: "claim.beta",
  kind: "informs",
  summary: "Alpha informs beta",
  attributes: {},
  source: `${ROOT}/model/fixture.json`,
  ...overrides,
});

const graph = (overrides: Partial<ProjectGraph> = {}): ProjectGraph => {
  const entities = new Map<string, Entity>([
    [
      "component.alpha",
      entity({
        attributes: {
          arbitrary: "SECRET_SHAPED_SENTINEL",
          path: "/home/operator/private",
          prompt: "<developer>PRIVATE_TRANSCRIPT_SENTINEL",
        },
      }),
    ],
    [
      "claim.beta",
      entity({
        id: "claim.beta",
        kind: "claim",
        name: "Beta",
        summary: "<script>window.pwned=true</script>",
        status: "proposed",
        tags: ["evidence"],
      }),
    ],
    [
      "work.accepted",
      entity({
        id: "work.accepted",
        kind: "work_item",
        name: "Accepted work",
        status: "accepted",
      }),
    ],
    [
      "work.superseded",
      entity({
        id: "work.superseded",
        kind: "work_item",
        name: "Superseded work",
        status: "superseded",
      }),
    ],
    [
      "work.ready",
      entity({
        id: "work.ready",
        kind: "work_item",
        name: "Ready work",
        status: "ready",
      }),
    ],
  ]);
  return {
    root: ROOT,
    entities,
    relations: [relation()],
    ...overrides,
  };
};

const run = (project = graph(), metadata = observation()) =>
  Effect.runPromise(buildPublicArtifact(project, metadata).pipe(Effect.provide(BunCrypto.layer)));

describe("strict public projection", () => {
  test("is deterministic, content addressed, deeply immutable, and exact allowlisted", async () => {
    const first = await run();
    const second = await run();
    expect(first.snapshotBytes).toBe(second.snapshotBytes);
    expect(first.versionBytes).toBe(second.versionBytes);
    expect(first.snapshotName).toBe(`snapshot.${first.digest}.json`);
    expect(first.version.snapshot).toBe(first.snapshotName);
    expect(Object.isFrozen(first.snapshot.entities[0])).toBe(true);

    const encoded = first.snapshotBytes;
    for (const forbidden of [
      "SECRET_SHAPED_SENTINEL",
      "/home/operator/private",
      "PRIVATE_TRANSCRIPT_SENTINEL",
    ]) {
      expect(encoded).not.toContain(forbidden);
    }
    expect(Object.keys(first.snapshot.entities[0]!).sort()).toEqual([
      "assumptions",
      "evidence_category",
      "id",
      "kind",
      "name",
      "source_url",
      "status",
      "summary",
      "tags",
    ]);
  });

  test("uses explicit UTF-16 code-unit ordering without locale-dependent collation", async () => {
    const astral = entity({ id: "component.💩", name: "Astral" });
    const replacement = entity({ id: "component.�", name: "Replacement" });
    const project = graph({
      entities: new Map([
        [replacement.id, replacement],
        [astral.id, astral],
      ]),
      relations: [],
    });
    const result = await run(project);
    expect(result.snapshot.entities.map((item) => item.id)).toEqual([
      "component.💩",
      "component.�",
    ]);
  });

  test("rejects path escapes, malformed metadata, unknown kinds, and missing endpoints", async () => {
    await expect(
      run(
        graph({
          entities: new Map([
            ["component.alpha", entity({ source: `${ROOT}/model/../private/secrets.json` })],
          ]),
          relations: [],
        }),
      ),
    ).rejects.toThrow("outside model");
    await expect(run(graph(), observation({ commit: "abc123" }))).rejects.toThrow(
      "exact lowercase",
    );
    await expect(run(graph(), observation({ observedAt: "2026-02-30T12:00:00Z" }))).rejects.toThrow(
      "valid whole-second",
    );
    await expect(
      run(
        graph({
          entities: new Map([["unknown", entity({ id: "unknown", kind: "not_a_kind" })]]),
          relations: [],
        }),
      ),
    ).rejects.toThrow("unsupported entity kind");
    await expect(
      run(graph({ relations: [relation({ targetId: "claim.missing" })] })),
    ).rejects.toThrow("missing target identity");
    await expect(run(graph({ relations: [relation({ kind: "not_a_relation" })] }))).rejects.toThrow(
      "unsupported relation kind",
    );
  });

  test("projects current scheduler readiness and all terminal meanings", async () => {
    const project = graph();
    const result = await run(project);
    expect(result.snapshot.ready_work_ids).toEqual(
      assessWork(project)
        .filter((assessment) => assessment.ready)
        .map((assessment) => assessment.entity.id)
        .sort(),
    );
    expect(result.snapshot.completed_work_ids).toEqual(["work.accepted", "work.superseded"]);
    expect(result.snapshot.unsupported_claim_ids).toEqual(["claim.beta"]);
  });

  test("a meaning-bearing allowlisted change changes identity", async () => {
    const first = await run();
    const base = graph();
    const changedEntities = new Map(base.entities);
    const original = changedEntities.get("component.alpha")!;
    changedEntities.set("component.alpha", { ...original, summary: "Meaning changed" });
    const changed = { ...base, entities: changedEntities };
    const second = await run(changed);
    expect(second.digest).not.toBe(first.digest);
  });
});
