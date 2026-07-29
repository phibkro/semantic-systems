"""Command line interface."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from semantic_project_model.loader import load_project
from semantic_project_model.schedule import assess_work, critical_path
from semantic_project_model.validate import validate_project
from semantic_project_model.views import generate_views, write_views


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="semproj")
    result.add_argument("--root", default=".")
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("validate")
    commands.add_parser("report")
    generate = commands.add_parser("generate")
    generate.add_argument("--output", default="generated")
    generate.add_argument("--check", action="store_true")
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    project_root = Path(args.root).resolve()
    project = load_project(project_root)

    if args.command == "validate":
        issues = validate_project(project)
        for issue in issues:
            location = f" [{issue.entity_id}]" if issue.entity_id else ""
            print(f"{issue.severity}: {issue.code}{location}: {issue.message}")
        errors = sum(issue.severity == "error" for issue in issues)
        warnings = sum(issue.severity == "warning" for issue in issues)
        print(
            f"validated {len(project.entities)} entities and {len(project.relations)} "
            f"relations: {errors} error(s), {warnings} warning(s)"
        )
        return 1 if errors else 0

    if args.command == "report":
        assessments = assess_work(project)
        ready = [item for item in assessments if item.ready]
        print(f"entities: {len(project.entities)}")
        print(f"relations: {len(project.relations)}")
        print(f"work items: {len(assessments)}")
        print(f"ready frontier: {len(ready)}")
        for item in ready:
            print(f"  - {item.entity.name}: {item.recommendation} ({item.agentability}/100)")
        path = critical_path(project)
        if path:
            print("critical path: " + " -> ".join(project.entities[item].name for item in path))
        return 0

    if args.command == "generate":
        output = project_root / args.output
        views = generate_views(project)
        changed = write_views(output, views, check=args.check)
        if args.check and changed:
            print("generated views are stale:", file=sys.stderr)
            for path in changed:
                print(f"  {path}", file=sys.stderr)
            return 1
        print(f"{'checked' if args.check else 'generated'} {len(views)} views")
        return 0

    return 2
