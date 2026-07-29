#!/usr/bin/env python3
"""Export the public Control Room snapshot from the canonical graph."""

from __future__ import annotations

import argparse
from pathlib import Path

from semantic_project_model.loader import load_project
from semantic_project_model.public_export import ExportObservation, export_public_snapshot


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--observed-at", required=True)
    parser.add_argument("--freshness-seconds", type=int, default=86_400)
    parser.add_argument(
        "--deployed-check-status",
        choices=("not_checked", "passed", "failed"),
        default="not_checked",
    )
    args = parser.parse_args()
    observation = ExportObservation(
        commit=args.commit,
        observed_at=args.observed_at,
        freshness_seconds=args.freshness_seconds,
        deployed_check_status=args.deployed_check_status,
    )
    artifact = export_public_snapshot(load_project(args.root), observation, args.output)
    print(f"{artifact.digest} {artifact.snapshot_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
