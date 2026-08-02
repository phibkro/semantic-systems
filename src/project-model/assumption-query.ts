import { Data, Result } from "effect";
import type { Entity, ProjectGraph, Relation, RelationKind } from "./types.ts";

export const OPAQUE_PRIMITIVE_REGISTER_ID =
  "artifact.project-model.opaque-primitive-register" as const;
export const ASSUMPTION_REPORT_SCHEMA = "semantic-assumption-report-v1" as const;
export const ASSUMPTION_REPORT_SCOPE = "recorded_graph_plus_supplied_opaque_registry" as const;

export type AssumptionTraversalDirection = "forward" | "reverse";

export interface AssumptionTraversalEdge {
  readonly kind: RelationKind;
  readonly direction: AssumptionTraversalDirection;
}

/**
 * The only relation-direction table used by the assumption query.
 *
 * `assumes` and recorded dependency/derivation edges retain their authored
 * source-to-target direction. Evidence edges are authored evidence-to-claim
 * (or evidence-to-obligation), so a dependency trace walks `supports` and
 * `discharges` from their semantic target back to the evidentiary source.
 */
export const ASSUMPTION_TRAVERSAL_TABLE: ReadonlyArray<AssumptionTraversalEdge> = Object.freeze([
  Object.freeze({ kind: "assumes", direction: "forward" }),
  Object.freeze({ kind: "supports", direction: "reverse" }),
  Object.freeze({ kind: "discharges", direction: "reverse" }),
  Object.freeze({ kind: "requires", direction: "forward" }),
  Object.freeze({ kind: "derives", direction: "forward" }),
]);

export type AssumptionMarkerKind = "stub" | "incomplete" | "known_opaque";
export type AssumptionCompleteness = "recorded_complete" | "incomplete";

export interface AssumptionEntityIdentity {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly summary: string;
  readonly status: string | null;
}

export interface AssumptionRelationWitness {
  /** Stable identity for the authored relation in this report. */
  readonly identity: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: string;
  readonly summary: string;
  readonly direction: AssumptionTraversalDirection;
}

export interface AssumptionPath {
  readonly entityIds: ReadonlyArray<string>;
  readonly relations: ReadonlyArray<AssumptionRelationWitness>;
}

export interface AssumptionFinding {
  readonly entity: AssumptionEntityIdentity;
  readonly path: AssumptionPath;
}

export interface AssumptionMarker {
  readonly kind: AssumptionMarkerKind;
  readonly entityId: string;
  readonly path: AssumptionPath;
}

export interface AssumptionReportScope {
  readonly meaning: typeof ASSUMPTION_REPORT_SCOPE;
  readonly opaqueRegistry: "supplied" | "not_supplied";
  readonly opaqueRegisterId: string | null;
  readonly opaqueRelationClasses: ReadonlyArray<string>;
  readonly traversalRelationKinds: ReadonlyArray<string>;
}

export interface AssumptionReport {
  readonly schema: typeof ASSUMPTION_REPORT_SCHEMA;
  readonly artifact: AssumptionEntityIdentity;
  readonly assumptions: ReadonlyArray<AssumptionFinding>;
  readonly markers: ReadonlyArray<AssumptionMarker>;
  readonly completeness: AssumptionCompleteness;
  readonly scope: AssumptionReportScope;
}

export class AssumptionQueryError extends Data.TaggedError("AssumptionQueryError")<{
  readonly artifactId: string;
  readonly reason: "missing_entity";
  readonly message: string;
}> {}

export interface OpaquePrimitive {
  readonly id: string;
  readonly class: string;
  readonly source?: string;
}

export interface OpaquePrimitiveRegistry {
  readonly sourceArtifactId: string | null;
  readonly primitives: ReadonlyArray<OpaquePrimitive>;
  readonly manuallyAssertedRelationClasses: ReadonlyArray<string>;
  readonly negativeFixture: string | null;
}

const compareCodeUnits = (left: string, right: string): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
};

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const asOpaquePrimitive = (value: unknown): OpaquePrimitive | undefined => {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = asString(record.id);
  const primitiveClass = asString(record.class);
  if (id === undefined || primitiveClass === undefined) return undefined;
  const source = asString(record.source);
  return source === undefined
    ? Object.freeze({ id, class: primitiveClass })
    : Object.freeze({ id, class: primitiveClass, source });
};

const freezeRegistry = (registry: OpaquePrimitiveRegistry): OpaquePrimitiveRegistry =>
  Object.freeze({
    sourceArtifactId: registry.sourceArtifactId,
    primitives: Object.freeze([...registry.primitives]),
    manuallyAssertedRelationClasses: Object.freeze([...registry.manuallyAssertedRelationClasses]),
    negativeFixture: registry.negativeFixture,
  });

/**
 * Decodes the register from a canonical model entity loaded by `loadProject`.
 * No second filesystem/configuration boundary is introduced for opaque data.
 */
export const decodeOpaquePrimitiveRegistry = (project: ProjectGraph): OpaquePrimitiveRegistry => {
  const register = project.entities.get(OPAQUE_PRIMITIVE_REGISTER_ID);
  if (register === undefined) {
    return freezeRegistry({
      sourceArtifactId: null,
      primitives: [],
      manuallyAssertedRelationClasses: [],
      negativeFixture: null,
    });
  }

  const primitiveValues = register.attributes.opaque_primitives;
  const primitives = Array.isArray(primitiveValues)
    ? primitiveValues.flatMap((value) => {
        const primitive = asOpaquePrimitive(value);
        return primitive === undefined ? [] : [primitive];
      })
    : [];
  const relationValues = register.attributes.manually_asserted_relation_classes;
  const manuallyAssertedRelationClasses = Array.isArray(relationValues)
    ? relationValues.flatMap((value) => (typeof value === "string" ? [value] : []))
    : [];
  const negativeFixture = asString(register.attributes.negative_fixture) ?? null;

  return freezeRegistry({
    sourceArtifactId: register.id,
    primitives: primitives.sort(
      (left, right) =>
        compareCodeUnits(left.id, right.id) || compareCodeUnits(left.class, right.class),
    ),
    manuallyAssertedRelationClasses: manuallyAssertedRelationClasses.sort(compareCodeUnits),
    negativeFixture,
  });
};

const entityIdentity = (entity: Entity): AssumptionEntityIdentity =>
  Object.freeze({
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    summary: entity.summary,
    status: entity.status,
  });

const relationIdentity = (relation: Relation): string =>
  `${relation.sourceId}->${relation.targetId}|${relation.kind}|${relation.summary}`;

const relationWitness = (
  relation: Relation,
  direction: AssumptionTraversalDirection,
): AssumptionRelationWitness =>
  Object.freeze({
    identity: relationIdentity(relation),
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    kind: relation.kind,
    summary: relation.summary,
    direction,
  });

const markerFor = (entity: Entity): ReadonlyArray<AssumptionMarkerKind> => {
  const markers: Array<AssumptionMarkerKind> = [];
  const status = entity.status?.toLowerCase();
  const tags = new Set(entity.tags.map((tag) => tag.toLowerCase()));
  const stubAttribute = entity.attributes.stub;
  const incompleteAttribute = entity.attributes.incomplete;
  if (status === "stub" || tags.has("stub") || stubAttribute === true) markers.push("stub");
  if (
    status === "incomplete" ||
    tags.has("incomplete") ||
    incompleteAttribute === true ||
    entity.attributes.completeness === "incomplete"
  ) {
    markers.push("incomplete");
  }
  return markers;
};

interface TraversalNeighbor {
  readonly nextId: string;
  readonly witness: AssumptionRelationWitness;
  readonly orderKey: string;
}

interface PathState {
  readonly nodeId: string;
  readonly distance: number;
  readonly orderKey: string;
  readonly parent?: PathState;
  readonly step?: AssumptionRelationWitness;
}

const pathStateOrder = (left: PathState, right: PathState): number =>
  left.distance - right.distance ||
  compareCodeUnits(left.orderKey, right.orderKey) ||
  compareCodeUnits(left.nodeId, right.nodeId);

const neighborOrder = (left: TraversalNeighbor, right: TraversalNeighbor): number =>
  compareCodeUnits(left.orderKey, right.orderKey) || compareCodeUnits(left.nextId, right.nextId);

const pathFor = (state: PathState): AssumptionPath => {
  const states: Array<PathState> = [];
  let cursor: PathState | undefined = state;
  while (cursor !== undefined) {
    states.push(cursor);
    cursor = cursor.parent;
  }
  states.reverse();
  return Object.freeze({
    entityIds: Object.freeze(states.map((item) => item.nodeId)),
    relations: Object.freeze(
      states.flatMap((item) => (item.step === undefined ? [] : [item.step])),
    ),
  });
};

const buildNeighbors = (
  project: ProjectGraph,
): ReadonlyMap<string, ReadonlyArray<TraversalNeighbor>> => {
  const neighbors = new Map<string, Array<TraversalNeighbor>>();
  for (const relation of project.relations) {
    const traversal = ASSUMPTION_TRAVERSAL_TABLE.find((item) => item.kind === relation.kind);
    if (traversal === undefined) continue;
    const fromId = traversal.direction === "forward" ? relation.sourceId : relation.targetId;
    const nextId = traversal.direction === "forward" ? relation.targetId : relation.sourceId;
    if (!project.entities.has(fromId) || !project.entities.has(nextId)) continue;
    const witness = relationWitness(relation, traversal.direction);
    const neighbor: TraversalNeighbor = {
      nextId,
      witness,
      orderKey: `${nextId}\u0000${relation.kind}\u0000${relation.sourceId}\u0000${relation.targetId}\u0000${relation.summary}`,
    };
    const outgoing = neighbors.get(fromId);
    if (outgoing === undefined) neighbors.set(fromId, [neighbor]);
    else outgoing.push(neighbor);
  }
  for (const outgoing of neighbors.values()) outgoing.sort(neighborOrder);
  return neighbors;
};

const freezeReport = (report: AssumptionReport): AssumptionReport => Object.freeze(report);

export const assumptions = (
  project: ProjectGraph,
  artifactId: string,
  opaqueRegistry?: OpaquePrimitiveRegistry,
): Result.Result<AssumptionReport, AssumptionQueryError> => {
  const artifact = project.entities.get(artifactId);
  if (artifact === undefined) {
    return Result.fail(
      new AssumptionQueryError({
        artifactId,
        reason: "missing_entity",
        message: `assumption query start entity is missing: ${artifactId}`,
      }),
    );
  }

  const neighbors = buildNeighbors(project);
  const root: PathState = { nodeId: artifactId, distance: 0, orderKey: "" };
  const best = new Map<string, PathState>([[artifactId, root]]);
  const queue: Array<PathState> = [root];

  while (queue.length > 0) {
    queue.sort(pathStateOrder);
    const state = queue.shift()!;
    if (best.get(state.nodeId) !== state) continue;
    for (const neighbor of neighbors.get(state.nodeId) ?? []) {
      const candidate: PathState = {
        nodeId: neighbor.nextId,
        distance: state.distance + 1,
        orderKey: `${state.orderKey}\u0000${neighbor.orderKey}`,
        parent: state,
        step: neighbor.witness,
      };
      const previous = best.get(candidate.nodeId);
      if (
        previous !== undefined &&
        (previous.distance < candidate.distance ||
          (previous.distance === candidate.distance &&
            compareCodeUnits(previous.orderKey, candidate.orderKey) <= 0))
      ) {
        continue;
      }
      best.set(candidate.nodeId, candidate);
      queue.push(candidate);
    }
  }

  const primitiveIds = new Set((opaqueRegistry?.primitives ?? []).map((primitive) => primitive.id));
  const findings: Array<AssumptionFinding> = [];
  const markers: Array<AssumptionMarker> = [];
  for (const [entityId, state] of best) {
    const entity = project.entities.get(entityId);
    if (entity === undefined) continue;
    const path = pathFor(state);
    if (entity.kind === "assumption") {
      findings.push(Object.freeze({ entity: entityIdentity(entity), path }));
    }
    for (const markerKind of markerFor(entity)) {
      markers.push(Object.freeze({ kind: markerKind, entityId, path }));
    }
    if (primitiveIds.has(entityId)) {
      markers.push(Object.freeze({ kind: "known_opaque", entityId, path }));
    }
  }

  findings.sort(
    (left, right) =>
      compareCodeUnits(left.entity.id, right.entity.id) ||
      compareCodeUnits(left.path.entityIds.join("\u0000"), right.path.entityIds.join("\u0000")),
  );
  markers.sort(
    (left, right) =>
      compareCodeUnits(left.entityId, right.entityId) ||
      compareCodeUnits(left.kind, right.kind) ||
      compareCodeUnits(left.path.entityIds.join("\u0000"), right.path.entityIds.join("\u0000")),
  );

  const scope: AssumptionReportScope = Object.freeze({
    meaning: ASSUMPTION_REPORT_SCOPE,
    opaqueRegistry: opaqueRegistry === undefined ? "not_supplied" : "supplied",
    opaqueRegisterId: opaqueRegistry?.sourceArtifactId ?? null,
    opaqueRelationClasses: Object.freeze(
      [...(opaqueRegistry?.manuallyAssertedRelationClasses ?? [])].sort(compareCodeUnits),
    ),
    traversalRelationKinds: Object.freeze(ASSUMPTION_TRAVERSAL_TABLE.map((edge) => edge.kind)),
  });
  return Result.succeed(
    freezeReport({
      schema: ASSUMPTION_REPORT_SCHEMA,
      artifact: entityIdentity(artifact),
      assumptions: Object.freeze(findings),
      markers: Object.freeze(markers),
      completeness: markers.length === 0 ? "recorded_complete" : "incomplete",
      scope,
    }),
  );
};
