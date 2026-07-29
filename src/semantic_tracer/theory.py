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


@dataclass(frozen=True, slots=True)
class Theory:
    identity: str
    payload: JsonObject


def _declaration_id(declaration: JsonObject, key: str) -> str:
    return require_str(require_key(declaration, "id", f"theory.{key} entry"), f"theory.{key}.id")


def _sorted_by_id(document: JsonObject, key: str) -> list[JsonValue]:
    declarations = require_object_list(require_key(document, key, "theory"), f"theory.{key}")
    keyed = [(_declaration_id(declaration, key), declaration) for declaration in declarations]
    keyed.sort(key=lambda pair: pair[0])
    ordered: list[JsonValue] = [declaration for _, declaration in keyed]
    return ordered


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
