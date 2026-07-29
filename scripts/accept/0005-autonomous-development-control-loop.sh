#!/usr/bin/env sh
# Non-mutating repository acceptance for design spec 0005.
set -eu
cd "$(dirname "$0")/../.."

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "accept/0005: required tool '$1' is missing; run inside 'nix develop'." >&2
    exit 1
  fi
}

require_tool actionlint
require_tool bun
require_tool git
require_tool pytest

cache_root="${TMPDIR:-/tmp}/semantic-systems-accept-0005"
mkdir -p "${cache_root}"
export PYTHONPYCACHEPREFIX="${cache_root}/pycache"
export RUFF_CACHE_DIR="${cache_root}/ruff"
export XDG_CACHE_HOME="${cache_root}/xdg"
export PYTHONPATH="${PYTHONPATH:-}:src"

pytest -p no:cacheprovider -q tests/test_development_control_loop.py
actionlint .github/workflows/check.yml
bun run check-commit-policy

head="$(git rev-parse HEAD)"
printf 'accept/0005: commit %s; feature-contract fixtures, Actionlint, and policy conformance passed.\n' "${head}"
