from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, cast

import pytest

from semantic_tracer import normalize_theory, run_demo
from semantic_tracer.jsonutil import DocumentError

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "examples" / "inventory"
CONFORMANCE_CASE_COUNT = 9


def _json(path: Path) -> dict[str, Any]:
    value: object = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return cast(dict[str, Any], value)


def _copy_inventory(tmp_path: Path) -> Path:
    target = tmp_path / "inventory"
    shutil.copytree(INVENTORY, target)
    return target


def _candidate(document: dict[str, Any], realization_id: str) -> dict[str, Any]:
    resolution = cast(dict[str, Any], document["resolution"])
    candidates = cast(list[dict[str, Any]], resolution["candidates"])
    return next(item for item in candidates if item["realization_id"] == realization_id)


def _entity(document: dict[str, Any], entity_id: str) -> dict[str, Any]:
    entities = cast(list[dict[str, Any]], document["entities"])
    return next(item for item in entities if item["id"] == entity_id)


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


def test_theory_identity_ignores_nested_display_metadata() -> None:
    theory = _json(INVENTORY / "contracts" / "inventory-v0.json")
    decorated = deepcopy(theory)
    decorated["laws"][0]["documentation"] = "A longer explanation."
    decorated["operations"][0]["display_name"] = "Friendly transition"
    decorated["types"][0]["source_path"] = "elsewhere/inventory.semantic"

    assert normalize_theory(theory).identity == normalize_theory(decorated).identity


def test_duplicate_declaration_ids_are_rejected() -> None:
    theory = _json(INVENTORY / "contracts" / "inventory-v0.json")
    theory["laws"].append(deepcopy(theory["laws"][0]))

    with pytest.raises(DocumentError, match="duplicate declaration IDs"):
        normalize_theory(theory)


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
    assert document["assumptions"] == [
        "Operation binding names are interpreted by the in-process Python builtin registry.",
        "Python integer arithmetic is exact for fixture quantities.",
        "The nine authored cases adequately sample the v0 contract for development selection.",
    ]

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


def test_realization_for_another_theory_is_rejected(tmp_path: Path) -> None:
    inventory = _copy_inventory(tmp_path)
    pure_path = inventory / "realizations" / "pure.json"
    pure = _json(pure_path)
    pure["theory"] = "theory.some-other-contract"
    pure_path.write_text(json.dumps(pure, indent=2) + "\n", encoding="utf-8")

    document = run_demo(inventory, policy="development").to_dict()

    assert document["resolution"]["status"] == "rejected"
    candidate = _candidate(document, "realization.inventory.pure")
    assert candidate["targets_theory"] is False
    assert candidate["evidence"] is None
    assert candidate["reason_codes"] == ["theory_mismatch"]


def test_rejected_candidate_assumptions_do_not_enter_deployment(tmp_path: Path) -> None:
    inventory = _copy_inventory(tmp_path)
    broken_path = inventory / "realizations" / "broken.json"
    broken = _json(broken_path)
    broken["assumptions"] = ["Rejected candidate only"]
    broken_path.write_text(json.dumps(broken, indent=2) + "\n", encoding="utf-8")

    document = run_demo(inventory, policy="development").to_dict()

    assert document["resolution"]["status"] == "selected"
    assert "Rejected candidate only" not in document["assumptions"]


def test_duplicate_realization_ids_are_rejected_before_selection(tmp_path: Path) -> None:
    inventory = _copy_inventory(tmp_path)
    broken_path = inventory / "realizations" / "broken.json"
    broken = _json(broken_path)
    broken["id"] = "realization.inventory.pure"
    broken_path.write_text(json.dumps(broken, indent=2) + "\n", encoding="utf-8")

    with pytest.raises(DocumentError, match="duplicate IDs"):
        run_demo(inventory, policy="development")


def test_unbound_candidate_is_rejected_without_aborting_lawful_candidate(
    tmp_path: Path,
) -> None:
    inventory = _copy_inventory(tmp_path)
    candidate = _json(inventory / "realizations" / "pure.json")
    candidate["id"] = "realization.inventory.unbound"
    candidate["operations"]["transition"] = "inventory.unavailable.v0"
    (inventory / "realizations" / "unbound.json").write_text(
        json.dumps(candidate, indent=2) + "\n",
        encoding="utf-8",
    )

    document = run_demo(inventory, policy="development").to_dict()

    assert document["resolution"]["status"] == "selected"
    assert document["resolution"]["selected_realization"] == "realization.inventory.pure"
    unbound = _candidate(document, "realization.inventory.unbound")
    assert unbound["eligible"] is False
    assert unbound["reason_codes"] == ["unbound_operation"]


@pytest.mark.parametrize("artifact", ["realization", "suite"])
def test_malformed_assumptions_cannot_bypass_policy(tmp_path: Path, artifact: str) -> None:
    inventory = _copy_inventory(tmp_path)
    policy_path = inventory / "policies" / "development.json"
    policy = _json(policy_path)
    policy["requirements"]["obligation.inventory.conformance"]["accepted_categories"] = [
        "example_test"
    ]
    policy["requirements"]["obligation.inventory.conformance"]["allow_assumptions"] = False
    policy_path.write_text(json.dumps(policy, indent=2) + "\n", encoding="utf-8")

    if artifact == "realization":
        target = inventory / "realizations" / "pure.json"
    else:
        target = inventory / "evidence" / "conformance-v0.json"
    document = _json(target)
    document["assumptions"] = [{"hidden": "assumption"}]
    target.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")

    with pytest.raises(DocumentError, match="assumptions"):
        run_demo(inventory, policy="development")


def test_example_runner_cannot_relabel_its_result_as_proof(tmp_path: Path) -> None:
    inventory = _copy_inventory(tmp_path)
    suite_path = inventory / "evidence" / "conformance-v0.json"
    suite = _json(suite_path)
    suite["category"] = "proof"
    suite_path.write_text(json.dumps(suite, indent=2) + "\n", encoding="utf-8")

    with pytest.raises(DocumentError, match="cannot relabel"):
        run_demo(inventory, policy="high-assurance")


def test_law_change_makes_authored_suite_stale(tmp_path: Path) -> None:
    inventory = _copy_inventory(tmp_path)
    theory_path = inventory / "contracts" / "inventory-v0.json"
    theory = _json(theory_path)
    theory["laws"][0]["statement"] += " except under load"
    theory_path.write_text(json.dumps(theory, indent=2) + "\n", encoding="utf-8")

    document = run_demo(inventory, policy="development").to_dict()

    assert document["resolution"]["status"] == "rejected"
    for candidate in document["resolution"]["candidates"]:
        assert candidate["reason_codes"] == ["stale_evidence_recipe"]


def test_suite_for_another_obligation_is_rejected(tmp_path: Path) -> None:
    inventory = _copy_inventory(tmp_path)
    suite_path = inventory / "evidence" / "conformance-v0.json"
    suite = _json(suite_path)
    suite["obligation"] = "obligation.inventory.unrelated"
    suite_path.write_text(json.dumps(suite, indent=2) + "\n", encoding="utf-8")

    document = run_demo(inventory, policy="development").to_dict()

    assert document["resolution"]["status"] == "rejected"
    for candidate in document["resolution"]["candidates"]:
        assert candidate["reason_codes"] == ["evidence_obligation_mismatch"]


def test_duplicate_suites_are_rejected_instead_of_ordered(tmp_path: Path) -> None:
    inventory = _copy_inventory(tmp_path)
    suite = _json(inventory / "evidence" / "conformance-v0.json")
    (inventory / "evidence" / "duplicate.json").write_text(
        json.dumps(suite, indent=2) + "\n",
        encoding="utf-8",
    )

    document = run_demo(inventory, policy="development").to_dict()

    assert document["resolution"]["status"] == "rejected"
    for candidate in document["resolution"]["candidates"]:
        assert candidate["reason_codes"] == ["ambiguous_evidence"]


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
    assert "Evidence: example_test (9/9 cases passed)" in completed.stdout
    assert "Python integer arithmetic is exact" in completed.stdout
    assert '"change_options":' in completed.stdout
    assert "Result: oracle matched" in completed.stdout


def test_oracle_mismatch_makes_demo_command_fail(tmp_path: Path) -> None:
    inventory = _copy_inventory(tmp_path)
    scenario_path = inventory / "scenarios" / "demo.json"
    scenario = _json(scenario_path)
    scenario["expected_final_state"]["stock"]["apple"] = 999
    scenario_path.write_text(json.dumps(scenario, indent=2) + "\n", encoding="utf-8")

    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(ROOT / "src")
    completed = subprocess.run(
        [sys.executable, "-m", "semantic_tracer", "demo", str(inventory)],
        cwd=ROOT,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 1
    assert "Result: oracle mismatch" in completed.stdout


def test_canonical_graph_exact_bindings_match_executable_result() -> None:
    result = run_demo(INVENTORY, policy="development").to_dict()
    theory_identity = cast(dict[str, Any], result["theory"])["identity"]
    pure = _candidate(result, "realization.inventory.pure")
    broken = _candidate(result, "realization.inventory.broken")

    semantic = _json(ROOT / "model" / "semantic" / "inventory-tracer.json")
    components = _json(ROOT / "model" / "architecture" / "components.json")
    architecture = _json(ROOT / "model" / "architecture" / "inventory-tracer.json")
    evidence = _json(ROOT / "model" / "evidence" / "inventory-tracer.json")
    execution = _json(ROOT / "model" / "execution" / "inventory-tracer.json")
    recipe = _json(INVENTORY / "evidence" / "conformance-v0.json")

    theory_entity = _entity(semantic, "theory.inventory")
    pure_entity = _entity(components, "realization.inventory.pure")
    broken_entity = _entity(architecture, "realization.inventory.broken")
    recipe_entity = _entity(evidence, "artifact.inventory.conformance-recipe-v0")
    pure_evidence = _entity(evidence, "evidence.inventory.pure-conformance-v0")
    broken_evidence = _entity(evidence, "evidence.inventory.broken-conformance-v0")
    lock = _entity(execution, "artifact.lock.inventory.reference")

    assert theory_entity["attributes"]["identity"] == theory_identity
    assert recipe["theory_identity"] == theory_identity
    assert recipe_entity["attributes"]["theory_identity"] == theory_identity
    assert pure_entity["attributes"]["identity"] == pure["realization_identity"]
    assert broken_entity["attributes"]["identity"] == broken["realization_identity"]
    assert pure_evidence["attributes"]["theory_identity"] == theory_identity
    assert broken_evidence["attributes"]["theory_identity"] == theory_identity
    assert pure_evidence["attributes"]["realization_identity"] == pure["realization_identity"]
    assert broken_evidence["attributes"]["realization_identity"] == broken["realization_identity"]
    assert pure_evidence["attributes"]["cases"] == "9/9"
    assert broken_evidence["attributes"]["cases"] == "7/9"
    assert lock["attributes"]["theory_identity"] == theory_identity
    assert lock["attributes"]["realization_identity"] == pure["realization_identity"]
