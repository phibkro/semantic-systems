#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."
agent_map=${REUSE_FIRST_AGENT_MAP:-AGENTS.md}

if ! command -v grep >/dev/null 2>&1; then
  echo "accept/0007: required tool 'grep' is missing; run inside 'nix develop'." >&2
  exit 1
fi

require_clause() {
  clause=$1
  if ! grep -F --quiet -- "$clause" "$agent_map"; then
    echo "accept/0007: required delegation clause is missing: $clause" >&2
    exit 1
  fi
}

require_clause "Work like a lazy senior engineer"
require_clause "Reuse or adapt license-compatible upstream code and techniques"
require_clause "Automate deterministic, bounded, repeatable work"
require_clause "Stop automating when it becomes an unbounded side quest"
require_clause "Report which scaffold, command, dependency, or prior art was evaluated"

echo "accept/0007: all reuse-first delegation clauses are present"
