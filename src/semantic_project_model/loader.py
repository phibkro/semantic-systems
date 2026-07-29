"""Strict JSON loading."""

from __future__ import annotations

import json
from pathlib import Path
from typing import cast

from semantic_project_model.model import Attributes, Entity, JsonValue, ProjectGraph, Relation


class ProjectLoadError(ValueError):
    pass


def _mapping(value: object, context: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ProjectLoadError(f"{context} must be an object")
    return cast(dict[str, object], value)


def _string(value: object, context: str) -> str:
    if not isinstance(value, str):
        raise ProjectLoadError(f"{context} must be a string")
    return value


def _attributes(value: object, context: str) -> Attributes:
    if value is None:
        return {}
    return cast(dict[str, JsonValue], _mapping(value, context))


def _tags(value: object, context: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ProjectLoadError(f"{context} must be a list")
    return tuple(_string(item, f"{context} item") for item in value)


def load_project(root: Path) -> ProjectGraph:
    model_root = root / "model"
    if not model_root.exists():
        raise ProjectLoadError(f"missing model directory: {model_root}")

    entities: dict[str, Entity] = {}
    relations: list[Relation] = []

    for source in sorted(model_root.rglob("*.json")):
        document = _mapping(json.loads(source.read_text(encoding="utf-8")), str(source))
        raw_entities = document.get("entities", [])
        raw_relations = document.get("relations", [])
        if not isinstance(raw_entities, list) or not isinstance(raw_relations, list):
            raise ProjectLoadError(f"{source}: entities and relations must be lists")

        for index, raw in enumerate(raw_entities):
            item = _mapping(raw, f"{source}: entities[{index}]")
            entity_id = _string(item.get("id"), f"{source}: entity id")
            if entity_id in entities:
                raise ProjectLoadError(f"duplicate entity ID: {entity_id}")
            status_raw = item.get("status")
            status = None if status_raw is None else _string(status_raw, f"{entity_id}.status")
            entities[entity_id] = Entity(
                id=entity_id,
                kind=_string(item.get("kind"), f"{entity_id}.kind"),
                name=_string(item.get("name"), f"{entity_id}.name"),
                summary=_string(item.get("summary", ""), f"{entity_id}.summary"),
                status=status,
                tags=_tags(item.get("tags"), f"{entity_id}.tags"),
                attributes=_attributes(item.get("attributes"), f"{entity_id}.attributes"),
                source=source,
            )

        for index, raw in enumerate(raw_relations):
            item = _mapping(raw, f"{source}: relations[{index}]")
            relations.append(
                Relation(
                    source_id=_string(item.get("source"), f"{source}: relation source"),
                    target_id=_string(item.get("target"), f"{source}: relation target"),
                    kind=_string(item.get("kind"), f"{source}: relation kind"),
                    summary=_string(item.get("summary", ""), f"{source}: relation summary"),
                    attributes=_attributes(
                        item.get("attributes"), f"{source}: relation attributes"
                    ),
                    source=source,
                )
            )

    return ProjectGraph(entities=entities, relations=tuple(relations), root=root)
