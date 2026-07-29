"""Strict accessors for loosely typed JSON documents."""

from __future__ import annotations

from typing import cast

from semantic_tracer.types import JsonObject, JsonValue


class DocumentError(ValueError):
    pass


def require_object(value: JsonValue, context: str) -> JsonObject:
    if not isinstance(value, dict):
        raise DocumentError(f"{context} must be an object")
    return cast(JsonObject, value)


def require_list(value: JsonValue, context: str) -> list[JsonValue]:
    if not isinstance(value, list):
        raise DocumentError(f"{context} must be a list")
    return value


def require_str(value: JsonValue, context: str) -> str:
    if not isinstance(value, str):
        raise DocumentError(f"{context} must be a string")
    return value


def require_int(value: JsonValue, context: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise DocumentError(f"{context} must be an integer")
    return value


def require_key(document: JsonObject, key: str, context: str) -> JsonValue:
    if key not in document:
        raise DocumentError(f"{context} is missing required key {key!r}")
    return document[key]


def require_object_list(value: JsonValue, context: str) -> list[JsonObject]:
    items = require_list(value, context)
    return [require_object(item, f"{context}[{index}]") for index, item in enumerate(items)]
