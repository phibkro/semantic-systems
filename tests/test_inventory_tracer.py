from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

from semantic_tracer import normalize_theory, run_demo

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "examples" / "inventory"
CONFORMANCE_CASE_COUNT = 6


def _json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def _copy_inventory(tmp_path: Path) -> Path:
    target = tmp_path / "inventory"
    shutil.copytree(INVENTORY, target)
    return target


def _candidate(document: dict[str, Any], realization_id: str) -> dict[str, Any]:
    candidates = document["resolution"]["candidates"]
    assert isinstance(candidates, list)
    return next(item for item in candidates if item["realization_id"] == realization_id)


def test_theory_identity_ignores_formatting_and_declaration_order() -> None:
    theory = _json(INVENTORY / "contracts" / "inventory-v0.json")
    reordered = deepcopy(theory)
    reordered["types"] = list(reversed(reordered["types"]))
    reordered["operations"] = list(reversed(reordered["operations"]))
    reordered["laws"] = list(reversed(reordered["laws"]))

    original = normalize_theory(theory)
    equivalent = normalize_theory(json.loads(json.dumps(reordered, indent=7, ensure_ascii=False)))

    assert original.identity == equivalent.identity
    assert original.payload == equivalent.payload


def test_theory_identity_changes_when_a_law_changes() -> None:
    theory = _json(INVENTORY / "contracts" / "inventory-v0.json")
    changed = deepcopy(theory)
    changed["laws"][0]["statement"] += " except under load"

    assert normalize_theory(theory).identity != normalize_theory(changed).identity


def test_development_policy_selects_reference_and_rejects_broken() -> None:
    document = run_demo(INVENTORY, policy="development").to_dict()

    assert document["resolution"]["status"] == "selected"
    assert document["resolution"]["selected_realization"] == "realization.inventory.pure"

    pure = _candidate(document, "realization.inventory.pure")
    broken = _candidate(document, "realization.inventory.broken")
    assert pure["eligible"] is True
    assert broken["eligible"] is False
    assert "conformance_failed" in broken["reason_codes"]
    assert broken["counterexamples"]

    evidence = pure["evidence"]
    assert evidence["category"] == "example_test"
    assert evidence["passed"] is True
    assert evidence["theory_identity"] == document["theory"]["identity"]
    assert evidence["realization_identity"] == pure["realization_identity"]
    assert evidence["passed_cases"] == evidence["total_cases"] == CONFORMANCE_CASE_COUNT

    assert document["execution"]["events"] == [
        {
            "kind": "Reserved",
            "reservation_id": "r-demo",
            "item": "apple",
            "quantity": 2,
        },
        {"kind": "Released", "reservation_id": "r-demo"},
    ]
    assert document["execution"]["final_state"] == {
        "stock": {"apple": 5},
        "reservations": {},
    }
    assert document["execution"]["matches_oracle"] is True
    assert document["assumptions"] == ["Python integer arithmetic is exact for fixture quantities."]

    explanation = document["explanation"]
    assert explanation["rule"] == "resolve_inventory_deployment"
    assert explanation["outcome"] == "selected"
    assert explanation["children"]


def test_missing_conformance_evidence_rejects_all_candidates(tmp_path: Path) -> None:
    inventory = _copy_inventory(tmp_path)
    (inventory / "evidence" / "conformance-v0.json").unlink()

    document = run_demo(inventory, policy="development").to_dict()

    assert document["resolution"]["status"] == "rejected"
    assert document["resolution"]["selected_realization"] is None
    for candidate in document["resolution"]["candidates"]:
        assert candidate["eligible"] is False
        assert "missing_evidence" in candidate["reason_codes"]
    assert document["execution"] is None


def test_proof_only_policy_does_not_upgrade_test_evidence() -> None:
    document = run_demo(INVENTORY, policy="high-assurance").to_dict()

    assert document["resolution"]["status"] == "rejected"
    assert document["resolution"]["selected_realization"] is None
    pure = _candidate(document, "realization.inventory.pure")
    assert pure["evidence"]["category"] == "example_test"
    assert "evidence_category_not_accepted" in pure["reason_codes"]
    assert document["execution"] is None


def test_multiple_eligible_realizations_are_ambiguous(tmp_path: Path) -> None:
    inventory = _copy_inventory(tmp_path)
    duplicate = _json(inventory / "realizations" / "pure.json")
    duplicate["id"] = "realization.inventory.pure-copy"
    duplicate["name"] = "Second lawful pure realization"
    (inventory / "realizations" / "pure-copy.json").write_text(
        json.dumps(duplicate, indent=2) + "\n",
        encoding="utf-8",
    )

    document = run_demo(inventory, policy="development").to_dict()

    assert document["resolution"]["status"] == "rejected"
    assert document["resolution"]["selected_realization"] is None
    assert document["resolution"]["reason_codes"] == ["ambiguous_candidates"]
    assert document["execution"] is None


def test_demo_command_reports_selection_evidence_assumptions_and_trace() -> None:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(ROOT / "src")
    completed = subprocess.run(
        [sys.executable, "-m", "semantic_tracer", "demo", str(INVENTORY)],
        cwd=ROOT,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr
    assert "Theory: theory.inventory (sha256:" in completed.stdout
    assert "Selected: realization.inventory.pure" in completed.stdout
    assert "Rejected: realization.inventory.broken" in completed.stdout
    assert "Evidence: example_test (6/6 cases passed)" in completed.stdout
    assert "Assumptions: Python integer arithmetic is exact" in completed.stdout
    assert "Result: oracle matched" in completed.stdout
