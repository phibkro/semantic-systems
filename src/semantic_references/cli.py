"""``semrefs`` command line interface.

```
semrefs catalog-check
semrefs lock <id>|--all [--offline]
semrefs materialize <id>|--all [--offline] [--allow-history-fallback]
semrefs status <id>|--all [--lock-only] [--json]
```

``catalog-check`` and ``status`` are network-free and never mutate. ``lock``
alone mutates the checked-in lock; ``materialize`` alone mutates
``.references/``. Tool output never grants semantic or legal validity to any
observed source (design spec 0004).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from semantic_references import __version__, acquire
from semantic_references import materialize as materialize_mod
from semantic_references.catalog import Catalog, load_catalog
from semantic_references.curator import curator_lock
from semantic_references.errors import ReferenceCustodyError
from semantic_references.lockfile import Lock, load_lock, write_lock
from semantic_references.status import compute_status

_GENERATOR = f"semantic_references/{__version__}"
EXIT_USAGE_ERROR = 2


def _catalog_path(root: Path) -> Path:
    return root / "references" / "sources.toml"


def _lock_path(root: Path) -> Path:
    return root / "references" / "sources.lock.json"


def _references_root(root: Path) -> Path:
    return root / ".references"


def _select_ids(catalog: Catalog, source_id: str | None, all_sources: bool) -> list[str]:
    if all_sources:
        return sorted(catalog.sources)
    if source_id is None:
        raise ReferenceCustodyError("an explicit source id or --all is required")
    if source_id not in catalog.sources:
        raise ReferenceCustodyError(f"unknown source id {source_id!r}")
    return [source_id]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="semrefs")
    parser.add_argument("--root", default=".", help="project root (default: current directory)")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("catalog-check")

    lock_cmd = commands.add_parser("lock")
    lock_cmd.add_argument("id", nargs="?", default=None)
    lock_cmd.add_argument("--all", action="store_true", dest="all_sources")
    lock_cmd.add_argument("--offline", action="store_true")

    materialize_cmd = commands.add_parser("materialize")
    materialize_cmd.add_argument("id", nargs="?", default=None)
    materialize_cmd.add_argument("--all", action="store_true", dest="all_sources")
    materialize_cmd.add_argument("--offline", action="store_true")
    materialize_cmd.add_argument("--allow-history-fallback", action="store_true")

    status_cmd = commands.add_parser("status")
    status_cmd.add_argument("id", nargs="?", default=None)
    status_cmd.add_argument("--all", action="store_true", dest="all_sources")
    status_cmd.add_argument("--lock-only", action="store_true")
    status_cmd.add_argument("--json", action="store_true", dest="as_json")

    return parser


def _cmd_catalog_check(root: Path) -> int:
    catalog = load_catalog(_catalog_path(root))
    for source_id in sorted(catalog.sources):
        source = catalog.sources[source_id]
        state = "lockable" if source.lockable else "queued (unlocked)"
        print(f"{source_id}: {state}")
    print(f"{len(catalog.sources)} source(s) validated")
    return 0


def _cmd_lock(root: Path, source_id: str | None, all_sources: bool, offline: bool) -> int:
    catalog = load_catalog(_catalog_path(root))
    ids = _select_ids(catalog, source_id, all_sources)
    lockable_ids = [i for i in ids if catalog.sources[i].lockable]
    skipped = [i for i in ids if i not in lockable_ids]
    for i in skipped:
        print(f"{i}: skipped (not lockable, missing track/license_paths)", file=sys.stderr)

    references_root = _references_root(root)
    lock_path = _lock_path(root)
    failures = 0
    with curator_lock(references_root):
        lock = load_lock(lock_path)
        entries = dict(lock.sources)
        # One transaction for the whole command: caches are staged while the
        # sources are observed and published only together with the lock, so
        # a later failure cannot leave an earlier source's cache advanced
        # past the commit its lock entry still names.
        publication = acquire.CachePublication()
        try:
            for i in lockable_ids:
                source = catalog.sources[i]
                try:
                    entry = acquire.lock_source(
                        source,
                        project_root=root,
                        references_root=references_root,
                        generator=_GENERATOR,
                        offline=offline,
                        existing_entry=lock.sources.get(i),
                        publication=publication,
                    )
                except ReferenceCustodyError as exc:
                    print(f"{i}: lock failed: {exc}", file=sys.stderr)
                    failures += 1
                    continue
                entries[i] = entry
                print(f"{i}: locked at {entry.commit}")
            if failures:
                publication.abort()
                print(
                    "lock: one or more requested sources failed; writing no lock or cache changes",
                    file=sys.stderr,
                )
            else:
                with publication.publish():
                    write_lock(lock_path, Lock(generator=_GENERATOR, sources=entries))
        except BaseException:
            publication.abort()
            raise
    return 1 if failures else 0


def _cmd_materialize(
    root: Path,
    source_id: str | None,
    all_sources: bool,
    offline: bool,
    allow_history_fallback: bool,
) -> int:
    catalog = load_catalog(_catalog_path(root))
    ids = _select_ids(catalog, source_id, all_sources)
    references_root = _references_root(root)
    lock = load_lock(_lock_path(root))

    failures = 0
    with curator_lock(references_root):
        for i in ids:
            source = catalog.sources[i]
            entry = lock.sources.get(i)
            if entry is None:
                print(f"{i}: materialize failed: no lock entry (run 'lock' first)", file=sys.stderr)
                failures += 1
                continue
            try:
                target = materialize_mod.materialize_source(
                    source,
                    entry,
                    project_root=root,
                    references_root=references_root,
                    offline=offline,
                    allow_history_fallback=allow_history_fallback,
                )
            except ReferenceCustodyError as exc:
                print(f"{i}: materialize failed: {exc}", file=sys.stderr)
                failures += 1
                continue
            print(f"{i}: materialized at {target}")
    return 1 if failures else 0


def _cmd_status(
    root: Path, source_id: str | None, all_sources: bool, lock_only: bool, as_json: bool
) -> int:
    catalog = load_catalog(_catalog_path(root))
    ids = _select_ids(catalog, source_id, all_sources)
    references_root = _references_root(root)
    lock = load_lock(_lock_path(root))

    reports = [
        compute_status(catalog.sources[i], lock, references_root, lock_only=lock_only) for i in ids
    ]

    if as_json:
        print(json.dumps([report.to_json() for report in reports], indent=2, sort_keys=True))
    else:
        for report in reports:
            print(f"{report.source_id}: {report.state}")
            if report.origin is not None:
                print(f"  origin: {report.origin}")
            if report.track is not None:
                print(f"  track: {report.track} -> resolved {report.resolved_ref}")
            if report.commit is not None:
                print(f"  commit: {report.commit}")
                print(f"  tree: {report.tree}")
            if report.acquisition is not None:
                verified = report.origin_verified
                print(f"  acquisition: {report.acquisition} (origin_verified={verified})")
            if report.licenses:
                print("  licenses:")
                for path, digest in report.licenses.items():
                    print(f"    {path}: {digest}")
            for reason in report.reasons:
                print(f"  reason: {reason}")

    return 0 if all(report.strict_ok for report in reports) else 1


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    root = Path(args.root).resolve()
    try:
        if args.command == "catalog-check":
            return _cmd_catalog_check(root)
        if args.command == "lock":
            return _cmd_lock(root, args.id, args.all_sources, args.offline)
        if args.command == "materialize":
            return _cmd_materialize(
                root, args.id, args.all_sources, args.offline, args.allow_history_fallback
            )
        if args.command == "status":
            return _cmd_status(root, args.id, args.all_sources, args.lock_only, args.as_json)
    except ReferenceCustodyError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_USAGE_ERROR
    raise AssertionError(f"unhandled command {args.command!r}")


if __name__ == "__main__":
    sys.exit(main())
