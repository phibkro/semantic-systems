#!/usr/bin/env sh
# Fast loop (design spec 0005): formatting/lint, focused parse/type checks,
# model validation, and generated-view drift. Seconds, not minutes. A missing
# required tool is a hard failure here, never a silent warning — only the
# pinned Nix environment can authorize this gate.
set -eu
export PYTHONPATH="${PYTHONPATH:-}:src"

require_tool() {
  tool_name="$1"
  if ! command -v "${tool_name}" >/dev/null 2>&1; then
    echo "check-fast: required tool '${tool_name}' is not installed. Run inside 'nix develop'." >&2
    exit 1
  fi
}

require_tool ruff
require_tool bun

if [ ! -d node_modules ]; then
  echo "check-fast: node_modules is missing; run 'bun install --frozen-lockfile' first (scripts/check.sh does this for you)." >&2
  exit 1
fi

python -m compileall -q src tests
python -m semantic_project_model validate
python -m semantic_project_model generate --check

ruff check .
ruff format --check .

bun run format:check
bun run lint
bun run typecheck
bun run check-commit-policy
