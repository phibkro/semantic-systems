"""Command line interface: `python -m semantic_tracer demo <root>`."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from semantic_tracer.demo import DemoResult, run_demo
from semantic_tracer.explanation import ExplanationNode
from semantic_tracer.verify import VerifyResult, verify_resolution


def _print_explanation(node: ExplanationNode, indent: int = 0) -> None:
    prefix = "  " * indent
    print(f"{prefix}- {node.rule}: {node.outcome} ({node.subject})")
    print(f"{prefix}  details: {json.dumps(node.details, sort_keys=True)}")
    for child in node.children:
        _print_explanation(child, indent + 1)


def _print_report(result: DemoResult) -> None:
    print(f"Theory: {result.theory_id} ({result.theory.identity})")

    resolution = result.resolution
    if resolution.status == "selected":
        print(f"Selected: {resolution.selected_realization}")
    else:
        print(f"Selected: none ({', '.join(resolution.reason_codes)})")

    for candidate in resolution.candidates:
        if candidate.eligible:
            continue
        reasons = ", ".join(candidate.reason_codes) or "excluded"
        print(f"Rejected: {candidate.realization.realization_id} ({reasons})")

    for candidate in resolution.candidates:
        if candidate.evidence is None:
            continue
        evidence = candidate.evidence
        print(
            f"Evidence: {evidence.category} "
            f"({evidence.passed_cases}/{evidence.total_cases} cases passed) "
            f"for {candidate.realization.realization_id}"
        )

    assumptions = "; ".join(result.assumptions) if result.assumptions else "none"
    print(f"Assumptions: {assumptions}")

    if result.execution is not None:
        outcome = "oracle matched" if result.execution.matches_oracle else "oracle mismatch"
        print(f"Result: {outcome}")
        print(f"Events: {result.execution.events}")
        print(f"Final state: {result.execution.final_state}")
    else:
        print("Result: no execution (resolution rejected)")

    print("Explanation:")
    _print_explanation(result.explanation, indent=1)


def _print_violations(label: str, violations: list[dict[str, object]]) -> None:
    if not violations:
        print(f"{label}: none")
        return
    print(f"{label}:")
    for violation in violations:
        print(
            f"  - {violation['code']} ({violation['subject']}): {json.dumps(violation['detail'])}"
        )


def _print_verify_report(result: VerifyResult) -> None:
    print(f"Theory: {result.theory_id} ({result.theory.identity})")
    print(f"Policy: {result.policy_id}")

    resolution = result.resolution
    if resolution.status == "selected":
        print(f"Claimed selection: {resolution.selected_realization}")
    else:
        print(f"Claimed selection: none ({', '.join(resolution.reason_codes)})")

    checker = result.checker_report.to_dict()
    print(f"Checker: {'valid' if checker['valid'] else 'invalid'}")
    print(f"Recomputed status: {checker['recomputed_status']}")
    print(f"Recomputed selection: {checker['recomputed_selected']}")
    _print_violations("Checker violations", checker["violations"])  # type: ignore[arg-type]

    if result.binding_report is not None:
        binding = result.binding_report.to_dict()
        print(f"Model binding: {'valid' if binding['valid'] else 'invalid'}")
        _print_violations("Model-binding violations", binding["violations"])  # type: ignore[arg-type]
    else:
        print("Model binding: not checked (no canonical model available or checker invalid)")

    if result.execution is not None:
        outcome = "oracle matched" if result.execution.matches_oracle else "oracle mismatch"
        print(f"Result: {outcome}")
    else:
        print("Result: no execution (invalid checking or unresolved candidate blocks execution)")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="semantic_tracer")
    commands = result.add_subparsers(dest="command", required=True)
    demo = commands.add_parser("demo")
    demo.add_argument("root")
    demo.add_argument("--policy", default="development")
    verify = commands.add_parser("verify-resolution")
    verify.add_argument("root")
    verify.add_argument("--policy", default="development")
    return result


def _run_demo(root: Path, policy: str) -> int:
    result = run_demo(root, policy=policy)
    _print_report(result)
    ok = (
        result.resolution.status == "selected"
        and result.execution is not None
        and result.execution.matches_oracle
    )
    return 0 if ok else 1


def _run_verify(root: Path, policy: str) -> int:
    model_root = Path("model").resolve()
    result = verify_resolution(
        root, policy=policy, model_root=model_root if model_root.is_dir() else None
    )
    _print_verify_report(result)
    ok = (
        result.valid
        and result.resolution.status == "selected"
        and result.execution is not None
        and result.execution.matches_oracle
    )
    return 0 if ok else 1


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    root = Path(args.root).resolve()

    if args.command == "demo":
        return _run_demo(root, args.policy)
    if args.command == "verify-resolution":
        return _run_verify(root, args.policy)
    return 2
