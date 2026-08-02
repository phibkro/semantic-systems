import type { Attributes, Entity, ProjectGraph, Relation } from "./types.ts";
import {
  OPAQUE_PRIMITIVE_REGISTER_ID,
  type OpaquePrimitiveRegistry,
} from "./assumption-query.ts";

const fixtureSource = "fixtures/rx2-assumption-query.json";

const entity = (
  id: string,
  kind: Entity["kind"],
  name: string,
  status: string | null = "current",
  attributes: Attributes = {},
): Entity => ({
  id,
  kind,
  name,
  summary: name,
  status,
  tags: [],
  attributes,
  source: fixtureSource,
});

const relation = (
  sourceId: string,
  targetId: string,
  kind: Relation["kind"],
  summary = "",
): Relation => ({
  sourceId,
  targetId,
  kind,
  summary,
  attributes: {},
  source: fixtureSource,
});

const graph = (entities: ReadonlyArray<Entity>, relations: ReadonlyArray<Relation>): ProjectGraph => ({
  entities: new Map(entities.map((item) => [item.id, item] as const)),
  relations,
  root: fixtureSource,
});

/** Positive RX2 fixture: three derivation intermediates lead to a seeded stub assumption. */
export const positiveAssumptionFixture = (): ProjectGraph => {
  const start = entity("artifact.rx2.positive.start", "artifact", "RX2 positive start");
  const stageOne = entity("artifact.rx2.positive.stage-1", "artifact", "RX2 positive stage one");
  const stageTwo = entity("artifact.rx2.positive.stage-2", "artifact", "RX2 positive stage two");
  const stageThree = entity("artifact.rx2.positive.stage-3", "artifact", "RX2 positive stage three");
  const seededStub = entity(
    "assumption.rx2.seeded-stub",
    "assumption",
    "RX2 seeded stub assumption",
    "stub",
  );
  return graph(
    [start, stageOne, stageTwo, stageThree, seededStub],
    [
      relation(start.id, stageOne.id, "derives"),
      relation(stageOne.id, stageTwo.id, "derives"),
      relation(stageTwo.id, stageThree.id, "derives"),
      relation(stageThree.id, seededStub.id, "assumes"),
    ],
  );
};

/** Duplicate-path fixture: the one-hop path wins over a lexically later longer route. */
export const duplicatePathAssumptionFixture = (): ProjectGraph => {
  const start = entity("artifact.rx2.duplicate.start", "artifact", "RX2 duplicate start");
  const direct = entity("assumption.rx2.duplicate-direct", "assumption", "RX2 direct assumption");
  const detour = entity("artifact.rx2.duplicate.detour", "artifact", "RX2 duplicate detour");
  return graph(
    [start, direct, detour],
    [
      relation(start.id, detour.id, "derives"),
      relation(detour.id, direct.id, "assumes"),
      relation(start.id, direct.id, "assumes"),
    ],
  );
};

/** Cycle fixture: a derivation cycle terminates while retaining the shortest exit witness. */
export const cyclicAssumptionFixture = (): ProjectGraph => {
  const start = entity("artifact.rx2.cycle.start", "artifact", "RX2 cycle start");
  const first = entity("artifact.rx2.cycle.first", "artifact", "RX2 cycle first");
  const second = entity("artifact.rx2.cycle.second", "artifact", "RX2 cycle second");
  const target = entity("assumption.rx2.cycle", "assumption", "RX2 cycle assumption");
  return graph(
    [start, first, second, target],
    [
      relation(start.id, first.id, "derives"),
      relation(first.id, second.id, "derives"),
      relation(second.id, first.id, "derives"),
      relation(second.id, target.id, "assumes"),
    ],
  );
};

/** Reverse evidence fixture: supports is authored evidence-to-claim but traced claim-to-evidence. */
export const reverseEvidenceAssumptionFixture = (): ProjectGraph => {
  const start = entity("artifact.rx2.reverse.start", "artifact", "RX2 reverse start");
  const claim = entity("claim.rx2.reverse", "claim", "RX2 reverse claim");
  const evidence = entity("evidence.rx2.reverse", "evidence", "RX2 reverse evidence");
  const target = entity("assumption.rx2.reverse", "assumption", "RX2 reverse assumption");
  return graph(
    [start, claim, evidence, target],
    [
      relation(start.id, claim.id, "derives"),
      relation(evidence.id, claim.id, "supports"),
      relation(evidence.id, target.id, "assumes"),
    ],
  );
};

export const incompleteAssumptionFixture = (): ProjectGraph => {
  const start = entity("artifact.rx2.incomplete.start", "artifact", "RX2 incomplete start");
  const incomplete = entity(
    "artifact.rx2.incomplete.node",
    "artifact",
    "RX2 incomplete node",
    "incomplete",
  );
  return graph([start, incomplete], [relation(start.id, incomplete.id, "requires")]);
};

/** Known-opaque fixture used to prove register entries add markers without assumptions. */
export const knownOpaqueAssumptionFixture = (): ProjectGraph => {
  const start = entity("artifact.rx2.known-opaque.start", "artifact", "RX2 known opaque start");
  const adapter = entity(
    "runtime.rx2.known-opaque-adapter",
    "runtime",
    "RX2 known opaque adapter",
    "current",
    { primitive_class: "runtime_adapter" },
  );
  return graph([start, adapter], [relation(start.id, adapter.id, "requires")]);
};

/** Permanent negative fixture: the opaque adapter is disconnected and omitted from the register. */
export const negativeOpaqueAdapterFixture = (): ProjectGraph => {
  const start = entity("artifact.rx2.negative.start", "artifact", "RX2 negative start");
  const adapter = entity(
    "runtime.rx2.negative-opaque-adapter",
    "runtime",
    "RX2 unmodeled opaque adapter",
    "current",
    { primitive_class: "runtime_adapter" },
  );
  return graph([start, adapter], []);
};

export const fixtureOpaqueRegistry = (): OpaquePrimitiveRegistry =>
  Object.freeze({
    sourceArtifactId: OPAQUE_PRIMITIVE_REGISTER_ID,
    primitives: Object.freeze([
      Object.freeze({
        id: "runtime.rx2.known-opaque-adapter",
        class: "runtime_adapter",
        source: fixtureSource,
      }),
    ]),
    manuallyAssertedRelationClasses: Object.freeze(["assumes", "supports", "discharges"]),
    negativeFixture: "src/project-model/assumption-fixtures.ts#negativeOpaqueAdapterFixture",
  });
