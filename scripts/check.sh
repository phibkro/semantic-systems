#!/usr/bin/env sh
# Integration loop (design spec 0005): the fast loop plus every static check,
# the full test suite, and lockfile custody, all in the pinned Nix
# environment. Missing required tools fail this gate; they are never
# downgraded to a warning, because a warning here would let an unverified
# commit reach a PR.
set -eu
cd "$(dirname "$0")/.."

require_tool() {
  tool_name="$1"
  if ! command -v "${tool_name}" >/dev/null 2>&1; then
    echo "check: required tool '${tool_name}' is not installed. Run inside 'nix develop'." >&2
    exit 1
  fi
}

require_tool pyright
require_tool bun

bun install --frozen-lockfile --ignore-scripts

./scripts/check-fast.sh

pyright
pytest
