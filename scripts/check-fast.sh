#!/usr/bin/env sh
# Fast loop (design spec 0005): formatting/lint, focused parse/type checks,
# model validation, and generated-view drift. Seconds, not minutes. A missing
# required tool is a hard failure here, never a silent warning — only the
# pinned Nix environment can authorize this gate.
set -eu
cd "$(dirname "$0")/.."

cache_root="${TMPDIR:-/tmp}/semantic-systems-check-fast"
mkdir -p "${cache_root}"
export PYTHONPYCACHEPREFIX="${cache_root}/pycache"
export RUFF_CACHE_DIR="${cache_root}/ruff"
export XDG_CACHE_HOME="${cache_root}/xdg"
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
require_tool python
require_tool actionlint

if [ ! -x node_modules/.bin/oxfmt ] ||
  [ ! -x node_modules/.bin/oxlint ] ||
  [ ! -x node_modules/.bin/tsc ] ||
  [ ! -x node_modules/.bin/commitlint ]; then
  echo "check-fast: node_modules is missing; run 'bun install --frozen-lockfile' first (scripts/check.sh does this for you)." >&2
  exit 1
fi

python -m semantic_project_model validate
python -m semantic_project_model generate --check

ruff check .
ruff format --check .
actionlint .github/workflows/*.yml

bun run format:check
bun run lint
bun run typecheck
bun run check-commit-policy
