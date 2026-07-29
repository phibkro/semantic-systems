"""Thin inventory-specific canonical project-model binding (design spec 0003).

Compares a checked resolution result against the canonical inventory model
entities: theory identity, evidence subjects and case counts, policy path,
deployment lock, and selected realization. This is a test/runtime
validation rung, not a proof that the canonical graph is correct; it only
detects drift between the executable result and the hand-maintained graph.

The generic checker (`checker.py`) contains no project-graph knowledge; this
module is the one place inventory-specific entity IDs and paths live.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from semantic_tracer.jsonutil import DocumentError, require_object
from semantic_tracer.types import JsonObject, JsonValue

THEORY_ENTITY_ID = "theory.inventory"
PURE_REALIZATION_ID = "realization.inventory.pure"
PURE_EVIDENCE_ENTITY_ID = "evidence.inventory.pure-conformance-v0"
BROKEN_EVIDENCE_ENTITY_ID = "evidence.inventory.broken-conformance-v0"
DEVELOPMENT_POLICY_ID = "policy.inventory.development"
LOCK_ENTITY_ID = "artifact.lock.inventory.reference"


@dataclass(frozen=True, slots=True)
class BindingViolation:
    code: str
    subject: str
    detail: JsonObject

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "subject": self.subject, "detail": self.detail}


@dataclass(frozen=True, slots=True)
class BindingReport:
    valid: bool
    violations: tuple[BindingViolation, ...]

    def to_dict(self) -> dict[str, Any]:
        return {"valid": self.valid, "violations": [v.to_dict() for v in self.violations]}


def _read_json(path: Path) -> JsonObject:
    return require_object(json.loads(path.read_text(encoding="utf-8")), str(path))


def _attributes(document: JsonObject, entity_id: str) -> JsonObject | None:
    entities = document.get("entities")
    if not isinstance(entities, list):
        return None
    for entity in entities:
        if isinstance(entity, dict) and entity.get("id") == entity_id:
            return require_object(entity.get("attributes", {}), f"{entity_id}.attributes")
    return None


def _compare(
    violations: list[BindingViolation],
    entity_id: str,
    code: str,
    model: JsonValue,
    checked: JsonValue,
) -> None:
    if model != checked:
        violations.append(BindingViolation(code, entity_id, {"model": model, "checked": checked}))


def _compare_entity(
    violations: list[BindingViolation],
    document: JsonObject,
    entity_id: str,
    fields: tuple[tuple[str, str, JsonValue], ...],
) -> None:
    """Compare `(model field, violation code, checked value)` for one entity's attributes."""
    attributes = _attributes(document, entity_id)
    if attributes is None:
        violations.append(BindingViolation("model_entity_missing", entity_id, {}))
        return
    for field, code, checked in fields:
        _compare(violations, entity_id, code, attributes.get(field), checked)


def check_inventory_model_binding(
    model_root: Path,
    *,
    policy_id: str,
    theory_identity: str,
    pure_realization_identity: str,
    broken_realization_identity: str,
    pure_case_count: tuple[int, int],
    broken_case_count: tuple[int, int],
    selected_realization_id: str | None,
) -> BindingReport:
    """Compare a checked result against the canonical inventory model.

    `pure_case_count`/`broken_case_count` are `(passed, total)`, recomputed
    from evidence packets rather than trusted from the checked result.
    """
    try:
        semantic = _read_json(model_root / "semantic" / "inventory-tracer.json")
        evidence = _read_json(model_root / "evidence" / "inventory-tracer.json")
        execution = _read_json(model_root / "execution" / "inventory-tracer.json")
    except (OSError, DocumentError, ValueError) as error:
        violation = BindingViolation("model_unreadable", str(model_root), {"error": str(error)})
        return BindingReport(valid=False, violations=(violation,))

    violations: list[BindingViolation] = []
    _compare_entity(
        violations,
        semantic,
        THEORY_ENTITY_ID,
        (("identity", "theory_identity_drift", theory_identity),),
    )

    for evidence_id, realization_identity, (passed, total) in (
        (PURE_EVIDENCE_ENTITY_ID, pure_realization_identity, pure_case_count),
        (BROKEN_EVIDENCE_ENTITY_ID, broken_realization_identity, broken_case_count),
    ):
        _compare_entity(
            violations,
            evidence,
            evidence_id,
            (
                ("theory_identity", "evidence_theory_identity_drift", theory_identity),
                (
                    "realization_identity",
                    "evidence_realization_identity_drift",
                    realization_identity,
                ),
                ("cases", "evidence_case_count_drift", f"{passed}/{total}"),
            ),
        )

    _compare_entity(
        violations,
        execution,
        LOCK_ENTITY_ID,
        (
            ("theory_identity", "lock_theory_identity_drift", theory_identity),
            ("realization_identity", "lock_realization_identity_drift", pure_realization_identity),
        ),
    )

    if policy_id == DEVELOPMENT_POLICY_ID:
        _compare(
            violations,
            str(selected_realization_id),
            "selected_realization_drift",
            selected_realization_id,
            PURE_REALIZATION_ID,
        )

    return BindingReport(valid=not violations, violations=tuple(violations))
