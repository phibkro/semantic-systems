"""Realization identity: theory identity plus binding contract."""

from __future__ import annotations

from dataclasses import dataclass

from semantic_tracer.canonical import content_identity
from semantic_tracer.jsonutil import require_key, require_object, require_str
from semantic_tracer.theory import Theory
from semantic_tracer.types import JsonObject

IDENTITY_FIELDS = (
    "representation",
    "operations",
    "handled_effects",
    "platform_requirements",
    "assumptions",
)


@dataclass(frozen=True, slots=True)
class Realization:
    document: JsonObject
    identity: str

    @property
    def realization_id(self) -> str:
        return require_str(require_key(self.document, "id", "realization"), "realization.id")

    @property
    def assumptions(self) -> list[str]:
        raw = self.document.get("assumptions", [])
        if not isinstance(raw, list):
            return []
        return [item for item in raw if isinstance(item, str)]


def normalize_realization(document: JsonObject, theory: Theory) -> Realization:
    payload: JsonObject = {"theory_identity": theory.identity}
    for field in IDENTITY_FIELDS:
        payload[field] = require_key(document, field, "realization")
    return Realization(document=document, identity=content_identity(payload))


def operation_binding(document: JsonObject, name: str) -> str:
    operations = require_object(
        require_key(document, "operations", "realization"), "realization.operations"
    )
    return require_str(
        require_key(operations, name, "realization.operations"), f"realization.operations.{name}"
    )
