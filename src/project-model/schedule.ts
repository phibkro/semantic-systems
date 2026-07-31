import { adjacency, findCycle, longestPath } from "./graph.ts";
import { byKind, outgoing, type Entity, type ProjectGraph } from "./types.ts";

const DIRECT_DELEGATION_SCORE = 75;
const REVIEW_DELEGATION_SCORE = 60;
const BOUNDED_SPIKE_SCORE = 40;

export interface WorkAssessment {
  readonly entity: Entity;
  readonly ready: boolean;
  readonly blockers: ReadonlyArray<string>;
  readonly agentability: number;
  readonly recommendation: string;
}

const integer = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isInteger(value) ? value : fallback;

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const score = (entity: Entity): number => {
  const delegation = record(entity.attributes.delegation);
  if (delegation === undefined) return 0;
  const positive = [
    "specification_completeness",
    "context_locality",
    "testability",
    "reversibility",
    "integration_independence",
  ].reduce((total, key) => total + integer(delegation[key], 0), 0);
  const blast = integer(delegation.blast_radius, 5);
  return Math.max(0, Math.min(100, positive * 4 - blast * 3));
};

const recommendation = (entity: Entity, value: number): string => {
  const delegation = record(entity.attributes.delegation);
  const review =
    delegation !== undefined && typeof delegation.human_review === "boolean"
      ? delegation.human_review
      : true;
  if (value >= DIRECT_DELEGATION_SCORE && !review) return "delegate directly";
  if (value >= REVIEW_DELEGATION_SCORE) return "delegate with review";
  if (value >= BOUNDED_SPIKE_SCORE) return "bounded spike";
  return "human-led design";
};

export const assessWork = (project: ProjectGraph): ReadonlyArray<WorkAssessment> => {
  const work = new Map(byKind(project, "work_item").map((entity) => [entity.id, entity]));
  const complete = new Set(["complete", "accepted", "superseded"]);
  return [...work]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([entityId, entity]) => {
      const blockers = new Set(
        outgoing(project, entityId, new Set(["blocks"]))
          .filter(
            (relation) =>
              work.has(relation.targetId) &&
              !complete.has(work.get(relation.targetId)!.status ?? ""),
          )
          .map((relation) => relation.targetId),
      );
      for (const relation of outgoing(project, entityId, new Set(["requires"]))) {
        const target = project.entities.get(relation.targetId);
        if (target?.kind === "decision" && !complete.has(target.status ?? "")) {
          blockers.add(relation.targetId);
        }
      }
      const agentability = score(entity);
      return {
        entity,
        ready:
          new Set(["ready", "planned", "in_progress"]).has(entity.status ?? "") &&
          blockers.size === 0,
        blockers: [...blockers].sort(),
        agentability,
        recommendation: recommendation(entity, agentability),
      };
    });
};

export const criticalPath = (project: ProjectGraph): ReadonlyArray<string> => {
  const work = new Map(byKind(project, "work_item").map((entity) => [entity.id, entity]));
  const edges = project.relations
    .filter(
      (relation) =>
        relation.kind === "blocks" && work.has(relation.sourceId) && work.has(relation.targetId),
    )
    .map((relation) => [relation.targetId, relation.sourceId] as const);
  const graph = adjacency(work.keys(), edges);
  if (findCycle(graph) !== undefined) return [];
  const weights = new Map(
    [...work].map(([entityId, entity]) => [entityId, integer(entity.attributes.effort, 1)]),
  );
  return longestPath(graph, weights);
};
