#!/usr/bin/env bun
import { resolve } from "node:path";
import { Effect } from "effect";
import {
  ASSUMPTION_REPORT_SCHEMA,
  assumptions,
  decodeOpaquePrimitiveRegistry,
} from "../../src/project-model/assumption-query.ts";
import {
  negativeOpaqueAdapterFixture,
  positiveAssumptionFixture,
} from "../../src/project-model/assumption-fixtures.ts";
import { loadProject } from "../../src/project-model/loader.ts";

const root = resolve(import.meta.dirname, "../..");

const fail = (message: string): never => {
  throw new Error(`RX2 assumption query failed: ${message}`);
};

const loadRegister = async () => {
  const projectEffect = loadProject(root);
  // The native Bun and Node layers are selected by runtime so one script exercises both boundaries.
  if (process.release.name === "node") {
    const { NodeFileSystem, NodePath } = await import("@effect/platform-node");
    return Effect.runPromise(
      projectEffect.pipe(Effect.provide([NodeFileSystem.layer, NodePath.layer])),
    );
  }
  const { BunFileSystem, BunPath } = await import("@effect/platform-bun");
  return Effect.runPromise(
    projectEffect.pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])),
  );
};

const main = async (): Promise<void> => {
  const project = await loadRegister();
  const registry = decodeOpaquePrimitiveRegistry(project);
  const positive = assumptions(
    positiveAssumptionFixture(),
    "artifact.rx2.positive.start",
    registry,
  );
  const negative = assumptions(
    negativeOpaqueAdapterFixture(),
    "artifact.rx2.negative.start",
    registry,
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
    register: {
      id: registry.sourceArtifactId,
      primitiveIds: registry.primitives.map((primitive) => primitive.id),
      manuallyAssertedRelationClasses: registry.manuallyAssertedRelationClasses,
      negativeFixture: registry.negativeFixture,
    },
    positive,
    negative,
  };
  process.stdout.write(`${JSON.stringify(observation)}\n`);
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
