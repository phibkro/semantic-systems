"""Command line interface: `python -m semantic_tracer demo <root>`."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from semantic_tracer.demo import DemoResult, run_demo
from semantic_tracer.explanation import ExplanationNode


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


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="semantic_tracer")
    commands = result.add_subparsers(dest="command", required=True)
    demo = commands.add_parser("demo")
    demo.add_argument("root")
    demo.add_argument("--policy", default="development")
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)

    if args.command == "demo":
        root = Path(args.root).resolve()
        result = run_demo(root, policy=args.policy)
        _print_report(result)
        if (
            result.resolution.status != "selected"
            or result.execution is None
            or not result.execution.matches_oracle
        ):
            return 1
        return 0

    return 2
