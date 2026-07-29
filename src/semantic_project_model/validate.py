"""Project graph validation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from semantic_project_model.graph import adjacency, find_cycle
from semantic_project_model.model import ENTITY_KINDS, RELATION_KINDS, Entity, ProjectGraph

Severity = Literal["error", "warning"]


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    severity: Severity
    code: str
    message: str
    entity_id: str | None = None


def _list_of_strings(entity: Entity, key: str) -> tuple[str, ...]:
    value = entity.attributes.get(key)
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return tuple(value)
    return ()


def validate_project(project: ProjectGraph) -> tuple[ValidationIssue, ...]:
    issues: list[ValidationIssue] = []
    phases = {
        "research", "design", "implementation", "validation",
        "optimization", "maintenance",
    }
    evidence_types = {
        "proof", "derived", "analysis", "model_check", "test", "benchmark",
        "runtime_check", "assertion", "assumption",
    }

    for entity in project.entities.values():
        if entity.kind not in ENTITY_KINDS:
            issues.append(
                ValidationIssue("error", "entity.kind", f"unsupported kind {entity.kind}", entity.id)
            )
        if not entity.id or any(char.isspace() for char in entity.id):
            issues.append(
                ValidationIssue("error", "entity.id", "ID contains whitespace", entity.id)
            )
        if entity.kind == "work_item":
            phase = entity.attributes.get("phase")
            if phase not in phases:
                issues.append(
                    ValidationIssue("error", "work.phase", f"invalid phase {phase!r}", entity.id)
                )
            if not _list_of_strings(entity, "acceptance"):
                issues.append(
                    ValidationIssue(
                        "error", "work.acceptance", "missing acceptance criteria", entity.id
                    )
                )
            if not isinstance(entity.attributes.get("delegation"), dict):
                issues.append(
                    ValidationIssue(
                        "error", "work.delegation", "missing delegation metadata", entity.id
                    )
                )
        if entity.kind == "evidence":
            evidence_type = entity.attributes.get("evidence_type")
            if evidence_type not in evidence_types:
                issues.append(
                    ValidationIssue(
                        "error",
                        "evidence.type",
                        f"invalid evidence type {evidence_type!r}",
                        entity.id,
                    )
                )

    for relation in project.relations:
        if relation.kind not in RELATION_KINDS:
            issues.append(
                ValidationIssue("error", "relation.kind", f"unsupported kind {relation.kind}")
            )
        if relation.source_id not in project.entities:
            issues.append(
                ValidationIssue(
                    "error", "relation.source", f"missing source {relation.source_id}"
                )
            )
        if relation.target_id not in project.entities:
            issues.append(
                ValidationIssue(
                    "error", "relation.target", f"missing target {relation.target_id}"
                )
            )

    containment = [
        (relation.source_id, relation.target_id)
        for relation in project.relations
        if relation.kind == "contains"
        and relation.source_id in project.entities
        and relation.target_id in project.entities
    ]
    cycle = find_cycle(adjacency(project.entities, containment))
    if cycle is not None:
        issues.append(
            ValidationIssue(
                "error", "containment.cycle", " -> ".join(cycle)
            )
        )

    work_ids = {entity.id for entity in project.by_kind("work_item")}
    hard_dependencies = [
        (relation.target_id, relation.source_id)
        for relation in project.relations
        if relation.kind == "blocks"
        and relation.source_id in work_ids
        and relation.target_id in work_ids
    ]
    cycle = find_cycle(adjacency(work_ids, hard_dependencies))
    if cycle is not None:
        issues.append(
            ValidationIssue("error", "work.cycle", " -> ".join(cycle))
        )

    for claim in project.by_kind("claim"):
        if not project.incoming(claim.id, {"supports", "discharges"}):
            issues.append(
                ValidationIssue(
                    "warning", "claim.unsupported", "claim has no evidence", claim.id
                )
            )

    return tuple(issues)
