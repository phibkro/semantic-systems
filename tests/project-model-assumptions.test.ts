import { describe, expect, test } from "bun:test";
import {
  ASSUMPTION_REPORT_SCOPE,
  AssumptionQueryError,
  assumptions,
  decodeOpaquePrimitiveRegistry,
} from "../src/project-model/assumption-query.ts";
import {
  cyclicAssumptionFixture,
  duplicatePathAssumptionFixture,
  fixtureOpaqueRegistry,
  incompleteAssumptionFixture,
  knownOpaqueAssumptionFixture,
  negativeOpaqueAdapterFixture,
  positiveAssumptionFixture,
  reverseEvidenceAssumptionFixture,
} from "../src/project-model/assumption-fixtures.ts";
import type { Entity, ProjectGraph } from "../src/project-model/types.ts";

const registerProject = (): ProjectGraph => {
  const register: Entity = {
    id: "artifact.project-model.opaque-primitive-register",
    kind: "artifact",
    name: "Opaque register",
    summary: "Opaque register",
    status: "current",
    tags: [],
    attributes: {
      opaque_primitives: [
        { id: "runtime.adapter.bun", class: "runtime_adapter", source: "src/project-model/main-bun.ts" },
        { id: "component.project-model", class: "project_model_generator", source: "src/project-model/views.ts" },
      ],
      manually_asserted_relation_classes: ["assumes", "supports", "discharges"],
      negative_fixture: "src/project-model/assumption-fixtures.ts#negativeOpaqueAdapterFixture",
    },
    source: "model/architecture/assumption-register.json",
  };
  return { entities: new Map([[register.id, register]]), relations: [], root: "fixture" };
};

describe("project-model assumptions query", () => {
  test("surfaces a three-hop stub assumption with a deterministic witness", () => {
    const report = assumptions(positiveAssumptionFixture(), "artifact.rx2.positive.start");
    expect(report.schema).toBe("semantic-assumption-report-v1");
    expect(report.artifact.id).toBe("artifact.rx2.positive.start");
    expect(report.assumptions.map((item) => item.entity.id)).toEqual(["assumption.rx2.seeded-stub"]);
    expect(report.assumptions[0]?.path.entityIds).toEqual([
      "artifact.rx2.positive.start",
      "artifact.rx2.positive.stage-1",
      "artifact.rx2.positive.stage-2",
      "artifact.rx2.positive.stage-3",
      "assumption.rx2.seeded-stub",
    ]);
    expect(report.assumptions[0]?.path.relations.map((item) => item.kind)).toEqual([
      "derives",
      "derives",
      "derives",
      "assumes",
    ]);
    expect(report.completeness).toBe("incomplete");
    expect(report.markers).toEqual([
      expect.objectContaining({ kind: "stub", entityId: "assumption.rx2.seeded-stub" }),
    ]);
    expect(report.scope.meaning).toBe(ASSUMPTION_REPORT_SCOPE);
    expect(report.scope.opaqueRegistry).toBe("not_supplied");
    expect(Object.isFrozen(report)).toBeTrue();
    expect(Object.isFrozen(report.assumptions)).toBeTrue();
    expect(Object.isFrozen(report.assumptions[0]?.path)).toBeTrue();
  });

  test("walks supports and discharges from semantic target to evidence source", () => {
    const report = assumptions(reverseEvidenceAssumptionFixture(), "artifact.rx2.reverse.start");
    expect(report.assumptions.map((item) => item.entity.id)).toEqual(["assumption.rx2.reverse"]);
    expect(report.assumptions[0]?.path.entityIds).toEqual([
      "artifact.rx2.reverse.start",
      "claim.rx2.reverse",
      "evidence.rx2.reverse",
      "assumption.rx2.reverse",
    ]);
    expect(report.assumptions[0]?.path.relations.map((item) => [item.kind, item.direction])).toEqual([
      ["derives", "forward"],
      ["supports", "reverse"],
      ["assumes", "forward"],
    ]);
  });

  test("chooses the shortest path before applying deterministic tie ordering", () => {
    const report = assumptions(duplicatePathAssumptionFixture(), "artifact.rx2.duplicate.start");
    expect(report.assumptions[0]?.path.entityIds).toEqual([
      "artifact.rx2.duplicate.start",
      "assumption.rx2.duplicate-direct",
    ]);
    expect(report.assumptions[0]?.path.relations).toHaveLength(1);
  });

  test("terminates on cycles and retains the shortest witnessed exit", () => {
    const report = assumptions(cyclicAssumptionFixture(), "artifact.rx2.cycle.start");
    expect(report.assumptions.map((item) => item.entity.id)).toEqual(["assumption.rx2.cycle"]);
    expect(report.assumptions[0]?.path.entityIds).toEqual([
      "artifact.rx2.cycle.start",
      "artifact.rx2.cycle.first",
      "artifact.rx2.cycle.second",
      "assumption.rx2.cycle",
    ]);
  });

  test("renders an explicit incomplete marker for a reachable incomplete entity", () => {
    const report = assumptions(incompleteAssumptionFixture(), "artifact.rx2.incomplete.start");
    expect(report.completeness).toBe("incomplete");
    expect(report.markers).toEqual([
      expect.objectContaining({ kind: "incomplete", entityId: "artifact.rx2.incomplete.node" }),
    ]);
    expect(report.assumptions).toEqual([]);
  });

  test("renders a known opaque marker without synthesizing an assumption", () => {
    const report = assumptions(
      knownOpaqueAssumptionFixture(),
      "artifact.rx2.known-opaque.start",
      fixtureOpaqueRegistry(),
    );
    expect(report.completeness).toBe("incomplete");
    expect(report.assumptions).toEqual([]);
    expect(report.markers).toEqual([
      expect.objectContaining({ kind: "known_opaque", entityId: "runtime.rx2.known-opaque-adapter" }),
    ]);
    expect(report.scope.opaqueRegistry).toBe("supplied");
  });

  test("returns a typed error for a missing start entity", () => {
    try {
      assumptions(positiveAssumptionFixture(), "artifact.rx2.missing");
      throw new Error("missing start unexpectedly succeeded");
    } catch (error) {
      expect(error).toBeInstanceOf(AssumptionQueryError);
      expect((error as AssumptionQueryError).artifactId).toBe("artifact.rx2.missing");
      expect((error as AssumptionQueryError).reason).toBe("missing_entity");
    }
  });

  test("keeps the disconnected opaque adapter as a stable clean-but-wrong report", () => {
    const registry = fixtureOpaqueRegistry();
    const first = assumptions(negativeOpaqueAdapterFixture(), "artifact.rx2.negative.start", registry);
    const second = assumptions(negativeOpaqueAdapterFixture(), "artifact.rx2.negative.start", registry);
    expect(first).toEqual(second);
    expect(first.assumptions).toEqual([]);
    expect(first.markers).toEqual([]);
    expect(first.completeness).toBe("recorded_complete");
    expect(first.scope.meaning).toBe(ASSUMPTION_REPORT_SCOPE);
    expect(registry.negativeFixture).toBe(
      "src/project-model/assumption-fixtures.ts#negativeOpaqueAdapterFixture",
    );
  });

  test("decodes the opaque register through the project graph entity boundary", () => {
    const registry = decodeOpaquePrimitiveRegistry(registerProject());
    expect(registry.sourceArtifactId).toBe("artifact.project-model.opaque-primitive-register");
    expect(registry.primitives.map((item) => item.id)).toEqual([
      "component.project-model",
      "runtime.adapter.bun",
    ]);
    expect(registry.manuallyAssertedRelationClasses).toEqual(["assumes", "discharges", "supports"]);
    expect(registry.negativeFixture).toContain("negativeOpaqueAdapterFixture");
  });
});
