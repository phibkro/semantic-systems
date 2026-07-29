"""theory-norm-v0: the frozen data-level theory normalization.

Normalization keeps top-level declaration collections (types, operations,
effects, laws, invariants, observations, obligations), reorders each by its
stable declaration ID, and drops documentation, display names, source paths,
and authoring order. Binder spelling stays identity-significant; see
uncertainties/0001-theory-normalization-binders.md.
"""

from __future__ import annotations

from dataclasses import dataclass

from semantic_tracer.canonical import content_identity
from semantic_tracer.jsonutil import (
    DocumentError,
    require_key,
    require_object,
    require_object_list,
    require_str,
)
from semantic_tracer.types import JsonObject, JsonValue

NORMALIZATION_VERSION = "theory-norm-v0"

DECLARATION_COLLECTIONS = (
    "types",
    "operations",
    "effects",
    "laws",
    "invariants",
    "observations",
    "obligations",
)

NON_SEMANTIC_FIELDS = frozenset({"documentation", "display_name", "name", "source_path"})


@dataclass(frozen=True, slots=True)
class Theory:
    identity: str
    payload: JsonObject


def _declaration_id(declaration: JsonObject, key: str) -> str:
    return require_str(require_key(declaration, "id", f"theory.{key} entry"), f"theory.{key}.id")


def _sorted_by_id(document: JsonObject, key: str) -> list[JsonValue]:
    declarations = require_object_list(require_key(document, key, "theory"), f"theory.{key}")
    keyed = [
        (_declaration_id(declaration, key), _semantic_declaration(declaration))
        for declaration in declarations
    ]
    keyed.sort(key=lambda pair: pair[0])
    ids = [declaration_id for declaration_id, _ in keyed]
    if len(ids) != len(set(ids)):
        raise DocumentError(f"theory.{key} contains duplicate declaration IDs")
    ordered: list[JsonValue] = [declaration for _, declaration in keyed]
    return ordered


def _semantic_declaration(declaration: JsonObject) -> JsonObject:
    return {key: value for key, value in declaration.items() if key not in NON_SEMANTIC_FIELDS}


def normalize_theory(document: JsonObject) -> Theory:
    require_object(document, "theory")
    normalization = require_str(
        require_key(document, "normalization", "theory"), "theory.normalization"
    )
    if normalization != NORMALIZATION_VERSION:
        raise DocumentError(
            f"unsupported theory normalization {normalization!r}, "
            f"expected {NORMALIZATION_VERSION!r}"
        )

    payload: JsonObject = {"normalization": normalization}
    for collection in DECLARATION_COLLECTIONS:
        payload[collection] = _sorted_by_id(document, collection)

    return Theory(identity=content_identity(payload), payload=payload)


def required_obligation_id(theory: Theory) -> str | None:
    """The single obligation this v0 contract governs, or ``None`` if unsupported.

    Shared by evidence production, the production resolver, and the
    independent checker so the three never disagree about which obligation a
    realization must satisfy (design spec 0003).
    """
    raw = theory.payload.get("obligations")
    if not isinstance(raw, list) or len(raw) != 1 or not isinstance(raw[0], dict):
        return None
    value = raw[0].get("id")
    return value if isinstance(value, str) else None
