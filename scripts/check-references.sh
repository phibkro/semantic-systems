#!/usr/bin/env sh
# Network-free validation for the reference-source custody tool.
# Does not touch references/sources.lock.json or .references/ in the real
# working tree: it only validates the catalog and runs the isolated test
# corpus, which builds its own temporary Git repositories.
set -eu
export PYTHONPATH="${PYTHONPATH:-}:src"

python -m compileall -q src/semantic_references tests/test_reference_custody.py
python -m semantic_references catalog-check

if command -v ruff >/dev/null 2>&1; then
  ruff check src/semantic_references tests/test_reference_custody.py
  ruff format --check src/semantic_references tests/test_reference_custody.py
else
  echo "warning: ruff is not installed" >&2
fi

if command -v pyright >/dev/null 2>&1; then
  pyright src/semantic_references tests/test_reference_custody.py
else
  echo "warning: pyright is not installed" >&2
fi

pytest -q tests/test_reference_custody.py
