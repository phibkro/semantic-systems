"""Core graph types."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final, TypeAlias

JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
Attributes: TypeAlias = dict[str, JsonValue]

ENTITY_KINDS: Final = frozenset(
    {
        "agent", "artifact", "assumption", "claim", "component", "decision",
        "deployment", "domain_machine", "effect", "environment", "evidence",
        "gate", "handler", "human", "invariant", "law", "milestone",
        "obligation", "operation", "package", "protocol", "question",
        "realization", "responsibility", "runtime", "theory", "type",
        "work_item",
    }
)

RELATION_KINDS: Final = frozenset(
    {
        "accountable_for", "assigned_to", "assumes", "blocks", "changes",
        "conflicts_with", "contains", "covers", "derives", "discharges",
        "extends", "handles", "hosts", "implements", "informs", "invalidates",
        "preserves", "provides", "publishes", "reads", "realizes", "refines",
        "requires", "reviewed_by", "selects", "sends", "supports",
        "validates", "writes",
    }
)


@dataclass(frozen=True, slots=True)
class Entity:
    id: str
    kind: str
    name: str
    summary: str
    status: str | None
    tags: tuple[str, ...]
    attributes: Attributes
    source: Path


@dataclass(frozen=True, slots=True)
class Relation:
    source_id: str
    target_id: str
    kind: str
    summary: str
    attributes: Attributes
    source: Path


@dataclass(frozen=True, slots=True)
class ProjectGraph:
    entities: dict[str, Entity]
    relations: tuple[Relation, ...]
    root: Path

    def by_kind(self, kind: str) -> tuple[Entity, ...]:
        return tuple(
            entity for _, entity in sorted(self.entities.items())
            if entity.kind == kind
        )

    def outgoing(self, entity_id: str, kinds: set[str] | None = None) -> tuple[Relation, ...]:
        return tuple(
            relation for relation in self.relations
            if relation.source_id == entity_id
            and (kinds is None or relation.kind in kinds)
        )

    def incoming(self, entity_id: str, kinds: set[str] | None = None) -> tuple[Relation, ...]:
        return tuple(
            relation for relation in self.relations
            if relation.target_id == entity_id
            and (kinds is None or relation.kind in kinds)
        )
