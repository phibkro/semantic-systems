#!/usr/bin/env sh
set -eu
export PYTHONPATH="${PYTHONPATH:-}:src"

python -m compileall -q src tests
python -m semantic_project_model validate
python -m semantic_project_model generate --check

if command -v ruff >/dev/null 2>&1; then
  ruff check .
  ruff format --check .
else
  echo "warning: ruff is not installed" >&2
fi

if command -v pyright >/dev/null 2>&1; then
  pyright
else
  echo "warning: pyright is not installed" >&2
fi

pytest
