import { adjacency, findCycle } from "./graph.ts";
import {
  byKind,
  ENTITY_KINDS,
  incoming,
  RELATION_KINDS,
  type Entity,
  type ProjectGraph,
} from "./types.ts";

export type Severity = "error" | "warning";

export interface ValidationIssue {
  readonly severity: Severity;
  readonly code: string;
  readonly message: string;
  readonly entityId?: string;
}

const listOfStrings = (entity: Entity, key: string): ReadonlyArray<string> => {
  const value = entity.attributes[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as ReadonlyArray<string>)
    : [];
};

export const validateProject = (project: ProjectGraph): ReadonlyArray<ValidationIssue> => {
  const issues: Array<ValidationIssue> = [];
  const phases = new Set([
    "research",
    "design",
    "implementation",
    "validation",
    "optimization",
    "maintenance",
  ]);
  const evidenceTypes = new Set([
    "proof",
    "derived",
    "analysis",
    "model_check",
    "test",
    "example_test",
    "property_test",
    "benchmark",
    "runtime_check",
    "assertion",
    "assumption",
  ]);

  for (const entity of project.entities.values()) {
    if (!ENTITY_KINDS.has(entity.kind)) {
      issues.push({
        severity: "error",
        code: "entity.kind",
        message: `unsupported kind ${entity.kind}`,
        entityId: entity.id,
      });
    }
    if (entity.id.length === 0 || /\s/.test(entity.id)) {
      issues.push({
        severity: "error",
        code: "entity.id",
        message: "ID contains whitespace",
        entityId: entity.id,
      });
    }
    if (entity.kind === "work_item") {
      const phase = entity.attributes.phase;
      if (typeof phase !== "string" || !phases.has(phase)) {
        issues.push({
          severity: "error",
          code: "work.phase",
          message: `invalid phase ${JSON.stringify(phase)}`,
          entityId: entity.id,
        });
      }
      if (listOfStrings(entity, "acceptance").length === 0) {
        issues.push({
          severity: "error",
          code: "work.acceptance",
          message: "missing acceptance criteria",
          entityId: entity.id,
        });
      }
      const delegation = entity.attributes.delegation;
      if (delegation === null || typeof delegation !== "object" || Array.isArray(delegation)) {
        issues.push({
          severity: "error",
          code: "work.delegation",
          message: "missing delegation metadata",
          entityId: entity.id,
        });
      }
    }
    if (
      entity.kind === "evidence" &&
      (typeof entity.attributes.evidence_type !== "string" ||
        !evidenceTypes.has(entity.attributes.evidence_type))
    ) {
      issues.push({
        severity: "error",
        code: "evidence.type",
        message: `invalid evidence type ${JSON.stringify(entity.attributes.evidence_type)}`,
        entityId: entity.id,
      });
    }
  }

  for (const relation of project.relations) {
    if (!RELATION_KINDS.has(relation.kind)) {
      issues.push({
        severity: "error",
        code: "relation.kind",
        message: `unsupported kind ${relation.kind}`,
      });
    }
    if (!project.entities.has(relation.sourceId)) {
      issues.push({
        severity: "error",
        code: "relation.source",
        message: `missing source ${relation.sourceId}`,
      });
    }
    if (!project.entities.has(relation.targetId)) {
      issues.push({
        severity: "error",
        code: "relation.target",
        message: `missing target ${relation.targetId}`,
      });
    }
  }

  const containment = project.relations
    .filter(
      (relation) =>
        relation.kind === "contains" &&
        project.entities.has(relation.sourceId) &&
        project.entities.has(relation.targetId),
    )
    .map((relation) => [relation.sourceId, relation.targetId] as const);
  const containmentCycle = findCycle(adjacency(project.entities.keys(), containment));
  if (containmentCycle !== undefined) {
    issues.push({
      severity: "error",
      code: "containment.cycle",
      message: containmentCycle.join(" -> "),
    });
  }

  const workIds = new Set(byKind(project, "work_item").map((entity) => entity.id));
  const hardDependencies = project.relations
    .filter(
      (relation) =>
        relation.kind === "blocks" &&
        workIds.has(relation.sourceId) &&
        workIds.has(relation.targetId),
    )
    .map((relation) => [relation.targetId, relation.sourceId] as const);
  const workCycle = findCycle(adjacency(workIds, hardDependencies));
  if (workCycle !== undefined) {
    issues.push({
      severity: "error",
      code: "work.cycle",
      message: workCycle.join(" -> "),
    });
  }

  for (const claim of byKind(project, "claim")) {
    if (incoming(project, claim.id, new Set(["supports", "discharges"])).length === 0) {
      issues.push({
        severity: "warning",
        code: "claim.unsupported",
        message: "claim has no evidence",
        entityId: claim.id,
      });
    }
  }
  return issues;
};
