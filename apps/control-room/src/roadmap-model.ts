/** Pure, deterministic roadmap derivation over an already-decoded portfolio value. */
import { Data, Effect } from "effect";
import type { PortfolioDocument, WorkDefinition } from "../../../src/portfolio-model/decode.ts";
import {
  projectWork,
  type GraphProjection,
  type MosaicProjection,
} from "../../../src/portfolio-model/project.ts";
import { queryWork, type QueryDiagnostics } from "../../../src/portfolio-model/query.ts";

const GRAPH_VIEW_ID = "view.roadmap";
const MOSAIC_VIEW_ID = "view.roadmap-mosaic";
const MINOR_WIDTH = 232;
const MAJOR_WIDTH = 280;
const LANE_GAP = 56;
const DEPTH_GAP = 188;

export interface RoadmapPosition {
  readonly x: number;
  readonly y: number;
}

export interface RoadmapNode {
  readonly id: string;
  readonly project_id: string;
  readonly kind: WorkDefinition["kind"];
  readonly title: string;
  readonly summary: string;
  readonly status: WorkDefinition["status"];
  readonly depth: number;
  readonly lane: number;
  readonly position: RoadmapPosition;
  readonly prerequisite_ids: ReadonlyArray<string>;
  readonly unlock_ids: ReadonlyArray<string>;
  readonly container_ids: ReadonlyArray<string>;
  readonly contained_ids: ReadonlyArray<string>;
  readonly scale: "major" | "minor";
}

export interface RoadmapDependencyEdge {
  readonly id: string;
  readonly dependent_id: string;
  readonly prerequisite_id: string;
  readonly visual_source_id: string;
  readonly visual_target_id: string;
}

export interface RoadmapContainmentEdge {
  readonly id: string;
  readonly container_id: string;
  readonly contained_id: string;
}

export interface RoadmapProject {
  readonly project_id: string;
  readonly name: string;
  readonly summary: string;
  readonly status: PortfolioDocument["projects"][number]["status"];
  readonly identity_ids: ReadonlyArray<string>;
  readonly milestone_ids: ReadonlyArray<string>;
  readonly standalone_feature_ids: ReadonlyArray<string>;
}

export type RoadmapAccessibleTarget =
  | { readonly kind: "project"; readonly project_id: string }
  | { readonly kind: "milestone" | "feature"; readonly work_id: string }
  | {
      readonly kind: "dependency";
      readonly relation_id: string;
      readonly prerequisite_id: string;
      readonly dependent_id: string;
    };

export interface RoadmapModel {
  readonly projection_sources: {
    readonly graph: {
      readonly view_id: typeof GRAPH_VIEW_ID;
      readonly identity_ids: ReadonlyArray<string>;
      readonly diagnostics: QueryDiagnostics;
    };
    readonly mosaic: {
      readonly view_id: typeof MOSAIC_VIEW_ID;
      readonly identity_ids: ReadonlyArray<string>;
      readonly diagnostics: QueryDiagnostics;
    };
  };
  readonly work_identities: ReadonlyArray<string>;
  readonly nodes: ReadonlyArray<RoadmapNode>;
  readonly dependency_edges: ReadonlyArray<RoadmapDependencyEdge>;
  readonly containment_edges: ReadonlyArray<RoadmapContainmentEdge>;
  readonly projects: ReadonlyArray<RoadmapProject>;
  readonly accessible_targets: ReadonlyArray<RoadmapAccessibleTarget>;
}

export class RoadmapModelFailure extends Data.TaggedError("RoadmapModelFailure")<{
  readonly message: string;
}> {}

export class InvalidContainmentTopology extends Data.TaggedError("InvalidContainmentTopology")<{
  readonly reason: "cycle" | "non-milestone-container" | "non-feature-contained" | "cross-project";
  readonly relation_id: string;
  readonly message: string;
}> {}

const compareCodeUnits = (left: string, right: string): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
};

const sorted = (values: Iterable<string>): ReadonlyArray<string> =>
  [...values].sort(compareCodeUnits);

const deepFreeze = <A>(value: A): A => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const sameIdentities = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean => {
  const leftSorted = sorted(left);
  const rightSorted = sorted(right);
  return (
    leftSorted.length === rightSorted.length &&
    leftSorted.every((identity, index) => identity === rightSorted[index])
  );
};

const oneSavedView = (
  document: PortfolioDocument,
  id: string,
): Effect.Effect<PortfolioDocument["views"][number], RoadmapModelFailure> => {
  const matches = document.views.filter((view) => view.id === id);
  return matches.length === 1
    ? Effect.succeed(matches[0]!)
    : Effect.fail(new RoadmapModelFailure({ message: `expected exactly one saved view ${id}` }));
};

const addAdjacent = (adjacency: Map<string, Array<string>>, from: string, to: string): void => {
  adjacency.get(from)?.push(to);
};

const dependencyDepths = (
  identities: ReadonlyArray<string>,
  edges: ReadonlyArray<RoadmapDependencyEdge>,
): Effect.Effect<ReadonlyMap<string, number>, RoadmapModelFailure> => {
  const dependents = new Map(identities.map((id) => [id, new Array<string>()]));
  const remaining = new Map(identities.map((id) => [id, 0]));
  const depths = new Map(identities.map((id) => [id, 0]));
  for (const edge of edges) {
    dependents.get(edge.prerequisite_id)?.push(edge.dependent_id);
    remaining.set(edge.dependent_id, (remaining.get(edge.dependent_id) ?? 0) + 1);
  }
  const available = identities.filter((id) => remaining.get(id) === 0).sort(compareCodeUnits);
  let visited = 0;
  while (available.length > 0) {
    const prerequisite = available.shift()!;
    visited += 1;
    for (const dependent of sorted(dependents.get(prerequisite) ?? [])) {
      depths.set(
        dependent,
        Math.max(depths.get(dependent) ?? 0, (depths.get(prerequisite) ?? 0) + 1),
      );
      const next = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, next);
      if (next === 0) {
        available.push(dependent);
        available.sort(compareCodeUnits);
      }
    }
  }
  return visited === identities.length
    ? Effect.succeed(depths)
    : Effect.fail(new RoadmapModelFailure({ message: "selected requires topology is cyclic" }));
};

const containmentCycleRelation = (
  identities: ReadonlyArray<string>,
  edges: ReadonlyArray<RoadmapContainmentEdge>,
): string | undefined => {
  const outgoing = new Map(identities.map((id) => [id, new Array<RoadmapContainmentEdge>()]));
  const remaining = new Map(identities.map((id) => [id, 0]));
  for (const edge of edges) {
    outgoing.get(edge.container_id)?.push(edge);
    remaining.set(edge.contained_id, (remaining.get(edge.contained_id) ?? 0) + 1);
  }
  const available = identities.filter((id) => remaining.get(id) === 0);
  let visited = 0;
  while (available.length > 0) {
    const container = available.pop()!;
    visited += 1;
    for (const edge of outgoing.get(container) ?? []) {
      const next = (remaining.get(edge.contained_id) ?? 0) - 1;
      remaining.set(edge.contained_id, next);
      if (next === 0) available.push(edge.contained_id);
    }
  }
  return visited === identities.length
    ? undefined
    : edges.find((edge) => (remaining.get(edge.contained_id) ?? 0) > 0)?.id;
};

export const deriveRoadmapModel = (
  document: PortfolioDocument,
): Effect.Effect<RoadmapModel, RoadmapModelFailure | InvalidContainmentTopology> =>
  Effect.gen(function* () {
    const graphView = yield* oneSavedView(document, GRAPH_VIEW_ID);
    const mosaicView = yield* oneSavedView(document, MOSAIC_VIEW_ID);
    if (graphView.presentation !== "dag") {
      return yield* Effect.fail(
        new RoadmapModelFailure({ message: `${GRAPH_VIEW_ID} must use dag presentation` }),
      );
    }
    if (mosaicView.presentation !== "mosaic") {
      return yield* Effect.fail(
        new RoadmapModelFailure({ message: `${MOSAIC_VIEW_ID} must use mosaic presentation` }),
      );
    }

    const graphSelection = queryWork(document, graphView.query);
    const mosaicProjection = yield* projectWork(document, mosaicView).pipe(
      Effect.mapError(
        (failure) =>
          new RoadmapModelFailure({ message: `mosaic projection failed: ${failure.message}` }),
      ),
    );
    if (mosaicProjection.presentation !== "mosaic") {
      return yield* Effect.fail(
        new RoadmapModelFailure({ message: `${MOSAIC_VIEW_ID} did not produce a mosaic` }),
      );
    }
    const mosaic: MosaicProjection = mosaicProjection;
    if (!sameIdentities(graphSelection.identities, mosaic.identities)) {
      return yield* Effect.fail(
        new RoadmapModelFailure({
          message: "roadmap DAG and Mosaic saved views must select the same identities",
        }),
      );
    }

    const identities = sorted(graphSelection.identities);
    const selected = new Set(identities);
    const byId = new Map(document.work.map((work) => [work.id, work]));
    const prerequisites = new Map(identities.map((id) => [id, new Array<string>()]));
    const unlocks = new Map(identities.map((id) => [id, new Array<string>()]));
    const containers = new Map(identities.map((id) => [id, new Array<string>()]));
    const contained = new Map(identities.map((id) => [id, new Array<string>()]));
    const traversedKinds = new Set(graphView.traverse);
    const selectedRelations = document.relations.filter(
      ({ kind, source_id, target_id }) =>
        traversedKinds.has(kind) && selected.has(source_id) && selected.has(target_id),
    );
    const dependencyEdges = selectedRelations
      .filter(({ kind }) => kind === "requires")
      .sort((left, right) => compareCodeUnits(left.id, right.id))
      .map((relation): RoadmapDependencyEdge => {
        addAdjacent(prerequisites, relation.source_id, relation.target_id);
        addAdjacent(unlocks, relation.target_id, relation.source_id);
        return {
          id: relation.id,
          dependent_id: relation.source_id,
          prerequisite_id: relation.target_id,
          visual_source_id: relation.target_id,
          visual_target_id: relation.source_id,
        };
      });
    const containmentEdges = selectedRelations
      .filter(({ kind }) => kind === "contains")
      .sort((left, right) => compareCodeUnits(left.id, right.id))
      .map((relation): RoadmapContainmentEdge => {
        addAdjacent(containers, relation.target_id, relation.source_id);
        addAdjacent(contained, relation.source_id, relation.target_id);
        return {
          id: relation.id,
          container_id: relation.source_id,
          contained_id: relation.target_id,
        };
      });

    const containmentCycle = containmentCycleRelation(identities, containmentEdges);
    if (containmentCycle !== undefined) {
      return yield* Effect.fail(
        new InvalidContainmentTopology({
          reason: "cycle",
          relation_id: containmentCycle,
          message: `selected containment topology is cyclic at ${containmentCycle}`,
        }),
      );
    }
    for (const edge of containmentEdges) {
      const container = byId.get(edge.container_id)!;
      const containedWork = byId.get(edge.contained_id)!;
      if (container.project_id !== containedWork.project_id) {
        return yield* Effect.fail(
          new InvalidContainmentTopology({
            reason: "cross-project",
            relation_id: edge.id,
            message: `containment ${edge.id} crosses project membership`,
          }),
        );
      }
      if (container.kind !== "milestone") {
        return yield* Effect.fail(
          new InvalidContainmentTopology({
            reason: "non-milestone-container",
            relation_id: edge.id,
            message: `containment ${edge.id} has a non-milestone container`,
          }),
        );
      }
      if (containedWork.kind !== "feature") {
        return yield* Effect.fail(
          new InvalidContainmentTopology({
            reason: "non-feature-contained",
            relation_id: edge.id,
            message: `containment ${edge.id} has a non-feature contained work item`,
          }),
        );
      }
    }
    const graphProjection = yield* projectWork(document, graphView).pipe(
      Effect.mapError(
        (failure) =>
          new RoadmapModelFailure({ message: `roadmap projection failed: ${failure.message}` }),
      ),
    );
    if (graphProjection.presentation !== "dag") {
      return yield* Effect.fail(
        new RoadmapModelFailure({ message: `${GRAPH_VIEW_ID} did not produce a DAG` }),
      );
    }
    const graph: GraphProjection = graphProjection;
    if (
      !sameIdentities(graph.identities, identities) ||
      !sameIdentities(
        graph.edges.map(({ id }) => id),
        selectedRelations.map(({ id }) => id),
      )
    ) {
      return yield* Effect.fail(
        new RoadmapModelFailure({
          message: `${GRAPH_VIEW_ID} projection changed during derivation`,
        }),
      );
    }
    const depths = yield* dependencyDepths(identities, dependencyEdges);
    const lanes = new Map<string, number>();
    const byDepth = new Map<number, Array<string>>();
    for (const identity of identities) {
      const depth = depths.get(identity);
      if (depth === undefined || byId.get(identity) === undefined) {
        return yield* Effect.fail(
          new RoadmapModelFailure({ message: `roadmap identity ${identity} has no graph node` }),
        );
      }
      const row = byDepth.get(depth) ?? [];
      row.push(identity);
      byDepth.set(depth, row);
    }
    for (const row of byDepth.values()) {
      row.sort(compareCodeUnits).forEach((identity, lane) => lanes.set(identity, lane));
    }

    const nodes = identities.map((identity): RoadmapNode => {
      const work = byId.get(identity)!;
      const depth = depths.get(identity)!;
      const lane = lanes.get(identity)!;
      const width = work.kind === "milestone" ? MAJOR_WIDTH : MINOR_WIDTH;
      return {
        id: identity,
        project_id: work.project_id,
        kind: work.kind,
        title: work.title,
        summary: work.summary,
        status: work.status,
        depth,
        lane,
        position: {
          x: lane * (MAJOR_WIDTH + LANE_GAP) + (MAJOR_WIDTH - width) / 2,
          y: depth * DEPTH_GAP,
        },
        prerequisite_ids: sorted(prerequisites.get(identity) ?? []),
        unlock_ids: sorted(unlocks.get(identity) ?? []),
        container_ids: sorted(containers.get(identity) ?? []),
        contained_ids: sorted(contained.get(identity) ?? []),
        scale: work.kind === "milestone" ? "major" : "minor",
      };
    });
    const accessibleOrder = [...nodes]
      .sort((left, right) => left.depth - right.depth || compareCodeUnits(left.id, right.id))
      .map(({ id }) => id);

    const projects = mosaic.projects
      .map(({ project_id, identities: projectIdentities }): RoadmapProject => {
        const identityIds = sorted(projectIdentities);
        const project = document.projects.find(({ id }) => id === project_id)!;
        return {
          project_id,
          name: project.name,
          summary: project.summary,
          status: project.status,
          identity_ids: identityIds,
          milestone_ids: identityIds.filter((id) => byId.get(id)?.kind === "milestone"),
          standalone_feature_ids: identityIds.filter(
            (id) => byId.get(id)?.kind === "feature" && (containers.get(id)?.length ?? 0) === 0,
          ),
        };
      })
      .sort((left, right) => compareCodeUnits(left.project_id, right.project_id));
    const accessibleTargets: ReadonlyArray<RoadmapAccessibleTarget> = [
      ...projects.map(({ project_id }) => ({ kind: "project" as const, project_id })),
      ...accessibleOrder.map((work_id) => ({
        kind: byId.get(work_id)!.kind,
        work_id,
      })),
      ...dependencyEdges.map(({ id, prerequisite_id, dependent_id }) => ({
        kind: "dependency" as const,
        relation_id: id,
        prerequisite_id,
        dependent_id,
      })),
    ];

    return deepFreeze({
      projection_sources: {
        graph: {
          view_id: GRAPH_VIEW_ID,
          identity_ids: sorted(graph.identities),
          diagnostics: graph.diagnostics,
        },
        mosaic: {
          view_id: MOSAIC_VIEW_ID,
          identity_ids: sorted(mosaic.identities),
          diagnostics: mosaic.diagnostics,
        },
      },
      work_identities: identities,
      nodes,
      dependency_edges: dependencyEdges,
      containment_edges: containmentEdges,
      projects,
      accessible_targets: accessibleTargets,
    });
  });
