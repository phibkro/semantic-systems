import { afterEach, describe, expect, test } from "bun:test";
import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { Effect, type FileSystem, type Path } from "effect";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  featuresForChangedPaths,
  isFeatureDiagnostic,
  renderFeatureLifecycle,
  resolveFeature,
  resolveFeatures,
  validateFeatureRepository,
  type FeatureArtifacts,
} from "../src/project-model/work-lifecycle.ts";
import type { Entity, JsonValue, ProjectGraph } from "../src/project-model/types.ts";

const temporaryRoots: Array<string> = [];
const SHA = "0123456789abcdef0123456789abcdef01234567";

const runBun = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])));

const evidence = {
  role: "status_basis",
  category: "assertion",
  method: "recorded",
  source: { kind: "authored_assertion" },
  claim: "the operator recorded the bounded result",
} as const;

const completion = {
  outcome: "positive",
  implementation_head: SHA,
  evidence: [evidence],
} as const;

const entity = (
  root: string,
  featureId: string,
  status: string,
  overrides: Readonly<Record<string, JsonValue>> = {},
): Entity => ({
  id: `work.${featureId}`,
  kind: "work_item",
  name: `Feature ${featureId}`,
  summary: "A focused lifecycle fixture",
  status,
  tags: [],
  attributes: {
    feature_id: featureId,
    feature_loop: "managed",
    ...overrides,
  },
  source: join(root, "model/work/features", `${featureId}.json`),
});

const project = (root: string, entities: ReadonlyArray<Entity>): ProjectGraph => ({
  entities: new Map(entities.map((item) => [item.id, item])),
  relations: [],
  root,
});

const writeText = async (root: string, relative: string, text = "#!/usr/bin/env bun\n") => {
  const destination = join(root, relative);
  await mkdir(join(destination, ".."), { recursive: true });
  await writeFile(destination, text);
  return destination;
};

const writeFeatureArtifacts = async (root: string, featureId: string, executable = true) => {
  await writeText(root, `model/work/features/${featureId}.json`, "{}\n");
  await writeText(root, `design-specs/${featureId}.md`, `# Design ${featureId}\n`);
  await writeText(root, `plans/${featureId}.md`, `# Plan ${featureId}: fixture\n`);
  const acceptance = await writeText(root, `scripts/accept/${featureId}.ts`);
  if (executable) await chmod(acceptance, 0o755);
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("canonical work lifecycle", () => {
  test("resolves managed records and inverts every stable artifact path", () => {
    const root = "/fixture";
    const record = entity(root, "0005-managed-feature", "in_progress");
    const graph = project(root, [record]);
    const resolved = resolveFeature(graph, "0005-managed-feature");
    expect(isFeatureDiagnostic(resolved)).toBeFalse();
    if (isFeatureDiagnostic(resolved)) return;
    expect(resolved.lifecycle).toBe("active");
    expect(resolved.acceptance).toEqual({
      kind: "runnable",
      path: "scripts/accept/0005-managed-feature.ts",
    });
    expect(
      featuresForChangedPaths(graph, [
        "model/work/features/0005-managed-feature.json",
        "design-specs/0005-managed-feature.md",
        "plans/0005-managed-feature.md",
        "scripts/accept/0005-managed-feature.ts",
      ]),
    ).toEqual(["0005-managed-feature"]);
  });

  test("returns typed diagnostics for invalid status, duplicate owners, and unknown IDs", () => {
    const root = "/fixture";
    const first = entity(root, "0005-duplicate", "ready");
    const second = { ...entity(root, "0005-duplicate", "ready"), id: "work.other-owner" };
    const graph = project(root, [first, second]);
    const invalid = resolveFeature(graph, "0005-duplicate");
    expect(isFeatureDiagnostic(invalid)).toBeTrue();
    if (!isFeatureDiagnostic(invalid)) return;
    expect(invalid.code).toBe("feature.duplicate");
    const invalidStatus = resolveFeature(
      project(root, [entity(root, "0006-invalid", "accepted")]),
      "0006-invalid",
    );
    expect(isFeatureDiagnostic(invalidStatus)).toBeTrue();
    if (!isFeatureDiagnostic(invalidStatus)) return;
    expect(invalidStatus.code).toBe("work.status");
    const unknown = resolveFeature(graph, "0006-unknown");
    expect(isFeatureDiagnostic(unknown)).toBeTrue();
    if (!isFeatureDiagnostic(unknown)) return;
    expect(unknown.code).toBe("feature.unknown");
    const malformedId = resolveFeature(graph, "0005-invalid id");
    expect(isFeatureDiagnostic(malformedId)).toBeTrue();
    if (!isFeatureDiagnostic(malformedId)) return;
    expect(malformedId.code).toBe("feature.id");
  });

  test("requires typed evidence for complete and replacement metadata for superseded work", () => {
    const root = "/fixture";
    const incomplete = entity(root, "0005-incomplete", "complete");
    const superseded = entity(root, "0006-superseded", "superseded");
    const graph = project(root, [incomplete, superseded]);
    const results = resolveFeatures(graph).filter(isFeatureDiagnostic);
    expect(results.map((result) => result.code)).toEqual([
      "work.completion.missing",
      "work.replacement.missing",
    ]);
    const complete = entity(root, "0005-complete", "complete", { completion });
    const resolved = resolveFeature(project(root, [complete]), "0005-complete");
    expect(isFeatureDiagnostic(resolved)).toBeFalse();
    if (isFeatureDiagnostic(resolved)) return;
    expect(resolved.lifecycle).toBe("completed");
  });

  test("accepts only the four frozen pre-loop IDs", () => {
    const root = "/fixture";
    const allowed = entity(root, "0001-inventory-resolution-tracer", "planned", {
      feature_loop: "pre_loop",
    });
    const rejected = entity(root, "0005-not-pre-loop", "planned", {
      feature_loop: "pre_loop",
    });
    expect(
      isFeatureDiagnostic(
        resolveFeature(project(root, [allowed]), "0001-inventory-resolution-tracer"),
      ),
    ).toBeFalse();
    const diagnostic = resolveFeature(project(root, [rejected]), "0005-not-pre-loop");
    expect(isFeatureDiagnostic(diagnostic)).toBeTrue();
    if (!isFeatureDiagnostic(diagnostic)) throw new Error("expected a feature diagnostic");
    expect(diagnostic.code).toBe("feature.loop");
  });

  test("keeps feature 0012 owned only by the actor runtime", () => {
    const root = "/fixture";
    const rejected = entity(root, "0012-minimal-actor-runtime", "ready");
    const diagnostic = resolveFeature(project(root, [rejected]), "0012-minimal-actor-runtime");
    expect(isFeatureDiagnostic(diagnostic)).toBeTrue();
    if (!isFeatureDiagnostic(diagnostic)) throw new Error("expected a feature diagnostic");
    expect(diagnostic.code).toBe("feature.id");
    expect(diagnostic.message).toContain("work.actor-runtime");

    const accepted = { ...rejected, id: "work.actor-runtime" };
    expect(
      isFeatureDiagnostic(resolveFeature(project(root, [accepted]), "0012-minimal-actor-runtime")),
    ).toBeFalse();
  });

  test("validates missing, non-regular, and non-executable artifacts without failing the Effect", async () => {
    const root = await mkdtemp(join("/tmp", "semantic-lifecycle-"));
    temporaryRoots.push(root);
    const record = entity(root, "0005-artifact-check", "in_progress");
    await writeText(root, "design-specs/0005-artifact-check.md");
    await mkdir(join(root, "plans/0005-artifact-check.md"), { recursive: true });
    await writeText(root, "scripts/accept/0005-artifact-check.ts");
    await writeFeatureArtifacts(root, "0006-orphan", false);
    const unrelated: Entity = {
      id: "work.unrelated",
      kind: "work_item",
      name: "Unrelated work",
      summary: "Must not share a feature model source.",
      status: "planned",
      tags: [],
      attributes: {},
      source: record.source,
    };
    const diagnostics = await runBun(
      validateFeatureRepository(project(root, [record, unrelated]), root),
    );
    expect(diagnostics.some((item) => item.code === "feature.artifact.type")).toBeTrue();
    expect(diagnostics.some((item) => item.code === "feature.artifact.missing")).toBeTrue();
    expect(diagnostics.some((item) => item.code === "feature.acceptance.executable")).toBeTrue();
    expect(diagnostics.some((item) => item.code === "feature.orphan.acceptance")).toBeTrue();
    expect(diagnostics.some((item) => item.code === "feature.source.contents")).toBeTrue();
  });

  test("rejects lifecycle-dependent plan prose and directories", async () => {
    const root = await mkdtemp(join("/tmp", "semantic-lifecycle-plan-"));
    temporaryRoots.push(root);
    const featureId = "0005-plan-drift";
    await writeFeatureArtifacts(root, featureId);
    await writeText(
      root,
      `plans/${featureId}.md`,
      `# Plan ${featureId}: active fixture\n\nStatus: in_progress\n\n## Work\n`,
    );
    await mkdir(join(root, "plans", "active"), { recursive: true });
    const diagnostics = await runBun(
      validateFeatureRepository(project(root, [entity(root, featureId, "ready")]), root),
    );
    expect(diagnostics.some((item) => item.code === "feature.plan.heading")).toBeTrue();
    expect(diagnostics.some((item) => item.code === "feature.plan.status")).toBeTrue();
    expect(diagnostics.some((item) => item.code === "feature.lifecycle.path")).toBeTrue();

    await writeText(
      root,
      `plans/${featureId}.md`,
      `# Plan ${featureId}: neutral fixture\n\n__Status__: in_progress\n\n## Work\n`,
    );
    const emphasized = await runBun(
      validateFeatureRepository(project(root, [entity(root, featureId, "ready")]), root),
    );
    expect(emphasized.some((item) => item.code === "feature.plan.status")).toBeTrue();

    await writeText(root, `plans/${featureId}.md`, `Plan ${featureId}\n=================\n`);
    const setext = await runBun(
      validateFeatureRepository(project(root, [entity(root, featureId, "ready")]), root),
    );
    expect(setext.some((item) => item.code === "feature.plan.heading")).toBeTrue();
  });

  test("renders lifecycle sections and remains invariant under graph insertion order", () => {
    const root = "/fixture";
    const active = entity(root, "0005-active", "ready");
    const complete = entity(root, "0006-complete", "complete", { completion });
    const first = renderFeatureLifecycle(project(root, [complete, active]));
    const second = renderFeatureLifecycle(project(root, [active, complete]));
    expect(first).toBe(second);
    expect(first.indexOf("## Active")).toBeLessThan(first.indexOf("## Completed"));
    expect(first).toContain("../model/work/features/0005-active.json");
    expect(first).toContain("../plans/0006-complete.md");
  });

  test("keeps diagnostic and artifact unions explicit for release callers", () => {
    const root = "/fixture";
    const records = resolveFeatures(project(root, [entity(root, "0005-valid", "ready")]));
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record).toBeDefined();
    expect(isFeatureDiagnostic(record)).toBeFalse();
    if (record === undefined || isFeatureDiagnostic(record)) return;
    const artifact: FeatureArtifacts = record;
    expect(artifact.featureId).toBe("0005-valid");
    const diagnostic = resolveFeature(project(root, []), "0005-valid");
    expect(isFeatureDiagnostic(diagnostic)).toBeTrue();
  });
});
