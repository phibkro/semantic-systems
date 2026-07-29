"""Canonical JSON encoding and content identities.

Shared by theory-norm-v0 and the realization-identity projection: UTF-8
canonical JSON with sorted object keys, compact separators, preserved
Unicode, and rejected non-finite numbers, hashed with SHA-256.
"""

from __future__ import annotations

import hashlib
import json

from semantic_tracer.types import JsonValue


def canonical_json_bytes(value: JsonValue) -> bytes:
    text = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )
    return text.encode("utf-8")


def content_identity(value: JsonValue) -> str:
    digest = hashlib.sha256(canonical_json_bytes(value)).hexdigest()
    return f"sha256:{digest}"
