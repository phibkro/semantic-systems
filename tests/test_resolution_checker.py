from __future__ import annotations

import ast
import copy
import json
import subprocess
import sys
import tokenize
from pathlib import Path
from typing import Any

import pytest

from semantic_tracer.checker import check_resolution
from semantic_tracer.inventory_binding import check_inventory_model_binding
from semantic_tracer.verify import verify_resolution

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "examples" / "inventory"
SRC = ROOT / "src" / "semantic_tracer"


def _positive() -> tuple[
    dict[str, Any], list[dict[str, Any]], dict[str, Any], list[dict[str, Any]], dict[str, Any]
]:
    """The committed positive resolution: (theory, realizations, policy, outcomes, claim)."""
    result = verify_resolution(INVENTORY, policy="development", model_root=ROOT / "model")
    assert result.checker_report.valid, result.checker_report.to_dict()
    assert result.resolution.status == "selected"

    theory_document = json.loads(
        (INVENTORY / "contracts" / "inventory-v0.json").read_text(encoding="utf-8")
    )
    realization_documents = [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted((INVENTORY / "realizations").glob("*.json"))
    ]
    policy_document = json.loads(
        (INVENTORY / "policies" / "development.json").read_text(encoding="utf-8")
    )

    producer_outcomes = [
        candidate.evidence.to_dict()
        for candidate in result.resolution.candidates
        if candidate.evidence is not None
    ]
    claim = copy.deepcopy(result.claim)
    return theory_document, realization_documents, policy_document, producer_outcomes, claim


def _check(
    theory_document: dict[str, Any],
    realization_documents: list[dict[str, Any]],
    policy_document: dict[str, Any],
    producer_outcomes: list[Any],
    claim: dict[str, Any],
) -> Any:
    return check_resolution(
        theory_document=theory_document,
        realization_documents=realization_documents,
        policy_document=policy_document,
        producer_outcomes=producer_outcomes,
        claim=claim,
    )


def _violation_codes(report: Any) -> set[str]:
    return {violation.code for violation in report.violations}


# --- positive oracle -------------------------------------------------------


def test_positive_development_resolution_is_valid() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    report = _check(theory, realizations, policy, producer_outcomes, claim)
    assert report.valid, report.to_dict()
    assert report.recomputed_status == "selected"
    assert report.recomputed_selected == {
        "id": "realization.inventory.pure",
        "identity": claim["selected"]["identity"],
    }


def test_visible_verify_resolution_command_accepts_the_positive_claim() -> None:
    completed = subprocess.run(
        [sys.executable, "-m", "semantic_tracer", "verify-resolution", str(INVENTORY)],
        cwd=ROOT,
        env={"PYTHONPATH": str(ROOT / "src"), "PATH": "/usr/bin:/bin"},
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert "Checker: valid" in completed.stdout
    assert "Model binding: valid" in completed.stdout
    assert "Result: oracle matched" in completed.stdout


def test_high_assurance_policy_is_correctly_rejected_and_still_valid() -> None:
    result = verify_resolution(INVENTORY, policy="high-assurance", model_root=ROOT / "model")
    assert result.checker_report.valid, result.checker_report.to_dict()
    assert result.resolution.status == "rejected"
    assert result.execution is None


# --- minimal/adversarial mutation oracle -----------------------------------


def test_recipe_supplied_as_evidence_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    recipe = json.loads(
        (INVENTORY / "evidence" / "conformance-v0.json").read_text(encoding="utf-8")
    )
    mutated = [*producer_outcomes, recipe]
    report = _check(theory, realizations, policy, mutated, claim)
    assert not report.valid
    assert "producer_outcome_malformed" in _violation_codes(report)


def test_example_test_result_relabeled_as_proof_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    mutated = copy.deepcopy(producer_outcomes)
    mutated[0]["category"] = "proof"
    report = _check(theory, realizations, policy, mutated, claim)
    assert not report.valid
    assert "claim_field_mismatch" in _violation_codes(report)


def test_failing_case_stored_as_passed_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    mutated = copy.deepcopy(producer_outcomes)
    broken = next(
        packet
        for packet in mutated
        if packet["realization_identity"] != claim["selected"]["identity"]
    )
    failing_case = next(case for case in broken["case_results"] if not case["passed"])
    failing_case["passed"] = True
    report = _check(theory, realizations, policy, mutated, claim)
    assert not report.valid
    assert "claim_field_mismatch" in _violation_codes(report)


def test_pure_result_copied_and_rebound_to_broken_realization_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    pure = next(
        packet
        for packet in producer_outcomes
        if packet["realization_identity"] == claim["selected"]["identity"]
    )
    broken = next(
        packet
        for packet in producer_outcomes
        if packet["realization_identity"] != claim["selected"]["identity"]
    )
    forged = copy.deepcopy(pure)
    forged["realization_identity"] = broken["realization_identity"]
    mutated = [*producer_outcomes, forged]
    report = _check(theory, realizations, policy, mutated, claim)
    assert not report.valid
    assert "multiple_producer_outcomes_for_subject" in _violation_codes(report)


def test_eligible_bit_changed_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    mutated = copy.deepcopy(claim)
    broken = next(
        c for c in mutated["candidates"] if c["realization_id"] != mutated["selected"]["id"]
    )
    broken["eligible"] = True
    report = _check(theory, realizations, policy, producer_outcomes, mutated)
    assert not report.valid
    assert "claim_field_mismatch" in _violation_codes(report)


def test_reason_set_changed_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    mutated = copy.deepcopy(claim)
    broken = next(
        c for c in mutated["candidates"] if c["realization_id"] != mutated["selected"]["id"]
    )
    broken["reason_codes"] = []
    report = _check(theory, realizations, policy, producer_outcomes, mutated)
    assert not report.valid
    assert "claim_field_mismatch" in _violation_codes(report)


def test_selected_identity_changed_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    mutated = copy.deepcopy(claim)
    mutated["selected"]["identity"] = "sha256:" + "0" * 64
    report = _check(theory, realizations, policy, producer_outcomes, mutated)
    assert not report.valid
    assert "claim_field_mismatch" in _violation_codes(report)


def test_selected_omitted_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    mutated = copy.deepcopy(claim)
    mutated["selected"] = None
    mutated["status"] = "rejected"
    report = _check(theory, realizations, policy, producer_outcomes, mutated)
    assert not report.valid
    assert "claim_field_mismatch" in _violation_codes(report)


def test_candidate_omitted_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    mutated = copy.deepcopy(claim)
    mutated["candidates"] = mutated["candidates"][:1]
    report = _check(theory, realizations, policy, producer_outcomes, mutated)
    assert not report.valid
    assert "candidate_missing" in _violation_codes(report)


def test_candidate_duplicated_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    mutated = copy.deepcopy(claim)
    mutated["candidates"].append(copy.deepcopy(mutated["candidates"][0]))
    report = _check(theory, realizations, policy, producer_outcomes, mutated)
    assert not report.valid
    assert "candidate_duplicate" in _violation_codes(report)


def test_selected_assumption_omitted_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    mutated = copy.deepcopy(claim)
    assert mutated["selected_assumptions"]
    mutated["selected_assumptions"] = mutated["selected_assumptions"][1:]
    report = _check(theory, realizations, policy, producer_outcomes, mutated)
    assert not report.valid
    assert "claim_field_mismatch" in _violation_codes(report)


def test_policy_content_changed_without_recomputing_the_claim_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, claim = _positive()
    mutated_policy = copy.deepcopy(policy)
    mutated_policy["requirements"]["obligation.inventory.conformance"]["allow_assumptions"] = False
    report = _check(theory, realizations, mutated_policy, producer_outcomes, claim)
    assert not report.valid
    assert "claim_field_mismatch" in _violation_codes(report)


def test_canonical_model_identity_changed_by_one_character_fails_binding_gate(
    tmp_path: Path,
) -> None:
    model_root = tmp_path / "model"
    for name in ("semantic", "evidence", "execution"):
        (model_root / name).mkdir(parents=True)
        (model_root / name / "inventory-tracer.json").write_text(
            (ROOT / "model" / name / "inventory-tracer.json").read_text(encoding="utf-8"),
            encoding="utf-8",
        )

    _theory, _realizations, _policy, _producer_outcomes, claim = _positive()
    pure = next(c for c in claim["candidates"] if c["realization_id"] == claim["selected"]["id"])
    broken = next(c for c in claim["candidates"] if c["realization_id"] != claim["selected"]["id"])

    baseline = check_inventory_model_binding(
        model_root,
        policy_id="policy.inventory.development",
        theory_identity=claim["theory"]["identity"],
        pure_realization_identity=pure["realization_identity"],
        broken_realization_identity=broken["realization_identity"],
        pure_case_count=(9, 9),
        broken_case_count=(7, 9),
        selected_realization_id=claim["selected"]["id"],
    )
    assert baseline.valid, baseline.to_dict()

    document = json.loads(
        (model_root / "semantic" / "inventory-tracer.json").read_text(encoding="utf-8")
    )
    theory_entity = next(e for e in document["entities"] if e["id"] == "theory.inventory")
    theory_entity["attributes"]["identity"] = theory_entity["attributes"]["identity"][:-1] + (
        "0" if theory_entity["attributes"]["identity"][-1] != "0" else "1"
    )
    (model_root / "semantic" / "inventory-tracer.json").write_text(
        json.dumps(document), encoding="utf-8"
    )

    mutated = check_inventory_model_binding(
        model_root,
        policy_id="policy.inventory.development",
        theory_identity=claim["theory"]["identity"],
        pure_realization_identity=pure["realization_identity"],
        broken_realization_identity=broken["realization_identity"],
        pure_case_count=(9, 9),
        broken_case_count=(7, 9),
        selected_realization_id=claim["selected"]["id"],
    )
    assert not mutated.valid
    assert any(v.code == "theory_identity_drift" for v in mutated.violations)


# --- malformed / structural cases ------------------------------------------


def test_malformed_claim_shape_is_rejected() -> None:
    theory, realizations, policy, producer_outcomes, _claim = _positive()
    report = _check(theory, realizations, policy, producer_outcomes, {"candidates": "not-a-list"})
    assert not report.valid
    assert "malformed_claim" in _violation_codes(report)


def test_invalid_checking_reports_no_execution() -> None:
    """`verify-resolution` never executes when the checker or binding is invalid."""
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "semantic_tracer",
            "verify-resolution",
            str(INVENTORY),
            "--policy",
            "high-assurance",
        ],
        cwd=ROOT,
        env={"PYTHONPATH": str(ROOT / "src"), "PATH": "/usr/bin:/bin"},
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 1
    assert "no execution" in completed.stdout


# --- forbidden imports / capability restrictions ---------------------------


def _direct_imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            modules.add(node.module)
    return modules


@pytest.mark.parametrize(
    ("module_path", "forbidden"),
    [
        (
            "resolver.py",
            {
                "semantic_tracer.evidence",
                "semantic_tracer.operations",
                "semantic_tracer.domain",
                "semantic_tracer.execution",
            },
        ),
        (
            "checker.py",
            {
                "semantic_tracer.resolver",
                "semantic_tracer.demo",
                "semantic_tracer.evidence",
                "semantic_tracer.operations",
                "semantic_tracer.domain",
                "semantic_tracer.execution",
            },
        ),
    ],
)
def test_module_does_not_directly_import_forbidden_modules(
    module_path: str, forbidden: set[str]
) -> None:
    imports = _direct_imports(SRC / module_path)
    assert not (imports & forbidden), imports & forbidden


@pytest.mark.parametrize(
    ("module", "forbidden_substrings"),
    [
        (
            "semantic_tracer.resolver",
            (
                "semantic_tracer.evidence",
                "semantic_tracer.operations",
                "semantic_tracer.domain",
                "semantic_tracer.execution",
            ),
        ),
        (
            "semantic_tracer.checker",
            (
                "semantic_tracer.resolver",
                "semantic_tracer.demo",
                "semantic_tracer.evidence",
                "semantic_tracer.operations",
                "semantic_tracer.domain",
                "semantic_tracer.execution",
            ),
        ),
    ],
)
def test_module_does_not_transitively_import_forbidden_modules(
    module: str, forbidden_substrings: tuple[str, ...]
) -> None:
    script = f"import sys\nimport {module}\nprint(','.join(sorted(sys.modules)))\n"
    completed = subprocess.run(
        [sys.executable, "-c", script],
        cwd=ROOT,
        env={"PYTHONPATH": str(ROOT / "src"), "PATH": "/usr/bin:/bin"},
        check=True,
        capture_output=True,
        text=True,
    )
    loaded = set(completed.stdout.strip().split(","))
    for forbidden in forbidden_substrings:
        assert forbidden not in loaded, f"{module} transitively loaded {forbidden}"


# --- independence/size gate -------------------------------------------------


def _nonblank_noncomment_line_count(path: Path) -> int:
    """Physical lines containing at least one non-comment, non-whitespace token."""
    with path.open("rb") as handle:
        tokens = tokenize.tokenize(handle.readline)
        skip = {
            tokenize.COMMENT,
            tokenize.NL,
            tokenize.NEWLINE,
            tokenize.INDENT,
            tokenize.DEDENT,
            tokenize.ENCODING,
            tokenize.ENDMARKER,
        }
        lines = {token.start[0] for token in tokens if token.type not in skip}
    return len(lines)


SIZE_GATE_MAX_RATIO = 0.70


def test_checker_size_report_relative_to_resolver() -> None:
    """Report design spec 0003's independence/size gate.

    Measurement: whole-file nonblank, noncomment source lines of
    `checker.py` versus `resolver.py` (design spec 0003's "production
    adjudication decision surface"), with no per-line exclusions -- every
    line in both files, including dataclasses, `to_dict` projections, and
    docstrings, is counted identically on both sides.
    """
    checker_lines = _nonblank_noncomment_line_count(SRC / "checker.py")
    resolver_lines = _nonblank_noncomment_line_count(SRC / "resolver.py")
    ratio = checker_lines / resolver_lines
    sizes = f"checker.py: {checker_lines} lines; resolver.py: {resolver_lines} lines"
    report = f"{sizes}; ratio: {ratio:.3f}"
    print("\n" + report)
    assert ratio <= SIZE_GATE_MAX_RATIO, (
        f"{report}; design spec 0003's independence/size gate requires <= {SIZE_GATE_MAX_RATIO}. "
        "See the implementation note for the independence/size finding."
    )
