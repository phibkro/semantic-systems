"""Readiness, delegation, and critical path."""

from __future__ import annotations

from dataclasses import dataclass
from typing import cast

from semantic_project_model.graph import adjacency, find_cycle, longest_path
from semantic_project_model.model import Entity, ProjectGraph

DIRECT_DELEGATION_SCORE = 75
REVIEW_DELEGATION_SCORE = 60
BOUNDED_SPIKE_SCORE = 40


@dataclass(frozen=True, slots=True)
class WorkAssessment:
    entity: Entity
    ready: bool
    blockers: tuple[str, ...]
    agentability: int
    recommendation: str


def _integer(value: object, default: int) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else default


def _score(entity: Entity) -> int:
    raw = entity.attributes.get("delegation")
    if not isinstance(raw, dict):
        return 0
    delegation = cast(dict[str, object], raw)
    positive = sum(
        _integer(delegation.get(key), 0)
        for key in (
            "specification_completeness",
            "context_locality",
            "testability",
            "reversibility",
            "integration_independence",
        )
    )
    blast = _integer(delegation.get("blast_radius"), 5)
    return max(0, min(100, positive * 4 - blast * 3))


def _recommendation(entity: Entity, score: int) -> str:
    raw = entity.attributes.get("delegation")
    review = True
    if isinstance(raw, dict) and isinstance(raw.get("human_review"), bool):
        review = raw["human_review"]

    if score >= DIRECT_DELEGATION_SCORE and not review:
        return "delegate directly"
    if score >= REVIEW_DELEGATION_SCORE:
        return "delegate with review"
    if score >= BOUNDED_SPIKE_SCORE:
        return "bounded spike"
    return "human-led design"


def assess_work(project: ProjectGraph) -> tuple[WorkAssessment, ...]:
    work = {entity.id: entity for entity in project.by_kind("work_item")}
    complete = {"complete", "accepted", "superseded"}
    results: list[WorkAssessment] = []

    for entity_id, entity in sorted(work.items()):
        blockers = {
            relation.target_id
            for relation in project.outgoing(entity_id, {"blocks"})
            if relation.target_id in work and work[relation.target_id].status not in complete
        }
        blockers.update(
            relation.target_id
            for relation in project.outgoing(entity_id, {"requires"})
            if relation.target_id in project.entities
            and project.entities[relation.target_id].kind == "decision"
            and project.entities[relation.target_id].status not in complete
        )
        score = _score(entity)
        results.append(
            WorkAssessment(
                entity=entity,
                ready=entity.status in {"ready", "planned", "in_progress"} and not blockers,
                blockers=tuple(sorted(blockers)),
                agentability=score,
                recommendation=_recommendation(entity, score),
            )
        )
    return tuple(results)


def critical_path(project: ProjectGraph) -> tuple[str, ...]:
    work = {entity.id: entity for entity in project.by_kind("work_item")}
    edges = [
        (relation.target_id, relation.source_id)
        for relation in project.relations
        if relation.kind == "blocks" and relation.source_id in work and relation.target_id in work
    ]
    graph = adjacency(work, edges)
    if find_cycle(graph) is not None:
        return ()
    weights = {
        entity_id: _integer(entity.attributes.get("effort"), 1)
        for entity_id, entity in work.items()
    }
    return longest_path(graph, weights)
