"""Load examples/inventory fixture documents by authored role.

Role separation mirrors examples/inventory/README.md: contracts, realizations,
evidence, policies, scenarios.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from semantic_tracer.jsonutil import DocumentError, require_object
from semantic_tracer.types import JsonObject


def _read_json(path: Path) -> JsonObject:
    return require_object(json.loads(path.read_text(encoding="utf-8")), str(path))


def _read_json_files(directory: Path) -> list[JsonObject]:
    if not directory.exists():
        return []
    return [_read_json(path) for path in sorted(directory.glob("*.json"))]


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
