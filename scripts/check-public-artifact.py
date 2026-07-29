#!/usr/bin/env python3
"""Validate and scan a built public Control Room payload."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from semantic_project_model.public_export import ExportError, verify_public_artifact

FORBIDDEN = {
    "absolute home path": re.compile(rb"(?:/home/|/Users/|[A-Za-z]:\\\\Users\\\\)"),
    "private key": re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "GitHub token": re.compile(rb"(?:gh[pousr]_[A-Za-z0-9_]{12,})"),
    "secret sentinel": re.compile(
        rb"(?:SECRET_SHAPED_SENTINEL|CI_CONTEXT_SENTINEL|PRIVATE_TRANSCRIPT_SENTINEL|"
        rb"INJECTION_SENTINEL)"
    ),
    "agent transcript": re.compile(rb"(?:<system>|<developer>|tool_call_id|agent transcript)"),
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("payload", type=Path)
    args = parser.parse_args()
    payload = args.payload.resolve()
    version_documents = list(payload.rglob("version.json"))
    versions = list(payload.rglob("snapshot.*.json"))
    if len(version_documents) != 1 or len(versions) != 1:
        raise ExportError(
            "expected exactly one version document and one content-addressed snapshot, "
            f"found {len(version_documents)} and {len(versions)}"
        )
    verify_public_artifact(versions[0], version_documents[0])
    for path in sorted(item for item in payload.rglob("*") if item.is_file()):
        data = path.read_bytes()
        for label, pattern in FORBIDDEN.items():
            if pattern.search(data):
                raise ExportError(f"{path.relative_to(payload)} contains forbidden {label}")
    print(f"verified and scanned {sum(1 for item in payload.rglob('*') if item.is_file())} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
