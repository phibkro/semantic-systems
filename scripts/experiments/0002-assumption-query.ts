#!/usr/bin/env bun
import { resolve } from "node:path";
import { Effect, Result } from "effect";
import {
  ASSUMPTION_REPORT_SCHEMA,
  OPAQUE_PRIMITIVE_REGISTER_ID,
  assumptions,
  decodeOpaquePrimitiveRegistry,
} from "../../src/project-model/assumption-query.ts";
import {
  negativeOpaqueAdapterFixture,
  positiveAssumptionFixture,
} from "../../src/project-model/assumption-fixtures.ts";
import { loadProject } from "../../src/project-model/loader.ts";

type RuntimeIdentity = {
  readonly selected: "bun" | "node";
  readonly version: string;
  readonly platformLayer: "@effect/platform-bun" | "@effect/platform-node";
};

const EXPECTED_REGISTER_PRIMITIVE_IDS = Object.freeze([
  "component.project-model",
  "runtime.adapter.bun",
  "runtime.adapter.node",
  "tool.bun",
  "tool.effect-v4",
  "tool.node",
  "tool.oxfmt",
  "tool.oxlint",
  "tool.typescript",
]);

const NEGATIVE_FIXTURE = "src/project-model/assumption-fixtures.ts#negativeOpaqueAdapterFixture";
const root = resolve(import.meta.dirname, "../..");

const fail = (message: string): never => {
  throw new Error(`RX2 assumption query failed: ${message}`);
};

const loadRegister = async () => {
  const projectEffect = loadProject(root);
  // Runtime-selected imports keep each command on its native Effect platform layer.
  const bunSelected = typeof globalThis.Bun !== "undefined";
  if (!bunSelected) {
    if (process.release.name !== "node") {
      fail("unsupported runtime: expected genuine Node when Bun is absent");
    }
    const { NodeFileSystem, NodePath } = await import("@effect/platform-node");
    const project = await Effect.runPromise(
      projectEffect.pipe(Effect.provide([NodeFileSystem.layer, NodePath.layer])),
    );
    return {
      project,
      runtime: {
        selected: "node",
        version: process.version,
        platformLayer: "@effect/platform-node",
      } satisfies RuntimeIdentity,
    };
  }
  const bunVersion = process.versions.bun;
  if (typeof bunVersion !== "string") fail("Bun global is present without a Bun version");
  const { BunFileSystem, BunPath } = await import("@effect/platform-bun");
  const project = await Effect.runPromise(
    projectEffect.pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])),
  );
  return {
    project,
    runtime: {
      selected: "bun",
      version: bunVersion,
      platformLayer: "@effect/platform-bun",
    } satisfies RuntimeIdentity,
  };
};

const main = async (): Promise<void> => {
  const loaded = await loadRegister();
  const project = loaded.project;
  const registry = decodeOpaquePrimitiveRegistry(project);
  const primitiveIds = registry.primitives.map((primitive) => primitive.id);
  if (
    registry.sourceArtifactId !== OPAQUE_PRIMITIVE_REGISTER_ID ||
    primitiveIds.length !== EXPECTED_REGISTER_PRIMITIVE_IDS.length ||
    primitiveIds.some((id, index) => id !== EXPECTED_REGISTER_PRIMITIVE_IDS[index]) ||
    registry.negativeFixture !== NEGATIVE_FIXTURE
  ) {
    fail("canonical opaque register provenance, entries, or negative fixture linkage changed");
  }
  if (EXPECTED_REGISTER_PRIMITIVE_IDS.some((id) => !project.entities.has(id))) {
    fail("canonical opaque register contains an unbound primitive ID");
  }

  const registerProbe = Result.getOrThrow(
    assumptions(project, OPAQUE_PRIMITIVE_REGISTER_ID, registry),
  );
  const knownOpaqueIds = registerProbe.markers
    .filter((marker) => marker.kind === "known_opaque")
    .map((marker) => marker.entityId);
  if (
    registerProbe.completeness !== "incomplete" ||
    knownOpaqueIds.length !== EXPECTED_REGISTER_PRIMITIVE_IDS.length ||
    EXPECTED_REGISTER_PRIMITIVE_IDS.some((id) => !knownOpaqueIds.includes(id))
  ) {
    fail("real-graph register probe did not surface every registered opaque primitive");
  }

  const positive = Result.getOrThrow(
    assumptions(positiveAssumptionFixture(), "artifact.rx2.positive.start", registry),
  );
  const negative = Result.getOrThrow(
    assumptions(negativeOpaqueAdapterFixture(), "artifact.rx2.negative.start", registry),
  );

  if (
    positive.schema !== ASSUMPTION_REPORT_SCHEMA ||
    positive.completeness !== "incomplete" ||
    !positive.assumptions.some((item) => item.entity.id === "assumption.rx2.seeded-stub") ||
    !positive.markers.some(
      (marker) => marker.kind === "stub" && marker.entityId === "assumption.rx2.seeded-stub",
    )
  ) {
    fail("positive fixture did not surface the seeded stub as an incomplete assumption report");
  }
  if (
    negative.completeness !== "recorded_complete" ||
    negative.assumptions.length !== 0 ||
    negative.markers.length !== 0
  ) {
    fail("negative fixture was not the expected clean-but-wrong recorded-complete report");
  }

  const observation = {
    schema: ASSUMPTION_REPORT_SCHEMA,
    runtime: loaded.runtime,
    register: {
      id: registry.sourceArtifactId,
      primitiveIds,
      manuallyAssertedRelationClasses: registry.manuallyAssertedRelationClasses,
      negativeFixture: registry.negativeFixture,
    },
    registerProbe,
    positive,
    negative,
  };
  process.stdout.write(`${JSON.stringify(observation)}\n`);
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
