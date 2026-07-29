"""Load examples/inventory fixture documents by authored role.

Role separation mirrors examples/inventory/README.md: contracts, realizations,
evidence, policies, scenarios.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from semantic_tracer.jsonutil import DocumentError, require_key, require_object, require_str
from semantic_tracer.types import JsonObject


def _read_json(path: Path) -> JsonObject:
    return require_object(json.loads(path.read_text(encoding="utf-8")), str(path))


def _read_json_files(directory: Path) -> list[JsonObject]:
    if not directory.exists():
        return []
    return [_read_json(path) for path in sorted(directory.glob("*.json"))]


def _require_unique_ids(documents: list[JsonObject], context: str) -> None:
    ids = [
        require_str(require_key(document, "id", context), f"{context}.id") for document in documents
    ]
    if len(ids) != len(set(ids)):
        raise DocumentError(f"{context} contains duplicate IDs")


@dataclass(frozen=True, slots=True)
class InventoryFixture:
    theory: JsonObject
    realizations: list[JsonObject]
    evidence_suites: list[JsonObject]
    policy: JsonObject
    scenario: JsonObject


def load_inventory(root: Path, policy_name: str) -> InventoryFixture:
    theories = _read_json_files(root / "contracts")
    if len(theories) != 1:
        raise DocumentError(f"expected exactly one theory contract under {root / 'contracts'}")

    realizations = _read_json_files(root / "realizations")
    if not realizations:
        raise DocumentError(f"no realizations found under {root / 'realizations'}")
    _require_unique_ids(realizations, "realizations")

    evidence_suites = _read_json_files(root / "evidence")

    policy_path = root / "policies" / f"{policy_name}.json"
    if not policy_path.exists():
        raise DocumentError(f"unknown policy {policy_name!r}: missing {policy_path}")
    policy = _read_json(policy_path)

    scenarios = _read_json_files(root / "scenarios")
    if len(scenarios) != 1:
        raise DocumentError(f"expected exactly one scenario under {root / 'scenarios'}")

    return InventoryFixture(
        theory=theories[0],
        realizations=realizations,
        evidence_suites=evidence_suites,
        policy=policy,
        scenario=scenarios[0],
    )
