#!/usr/bin/env sh
# Feature acceptance script for design spec 0004 (reference-source custody).
#
# Convention (design spec 0005): one acceptance script per nontrivial
# feature, named scripts/accept/<id>-<slug>.sh, where <id>-<slug> matches
# both design-specs/<id>-<slug>.md and plans/active/<id>-<slug>.md. This
# script's ID is 0004, matching design-specs/0004-reference-source-custody.md
# and plans/active/0004-reference-source-custody.md, so it can act as the
# custody pilot's exact-head gate once the feature lands.
#
# The custody implementation (src/semantic_references, the semrefs CLI) is
# being developed on a separate branch/worktree and is not yet integrated
# here (see plans/active/0004-reference-source-custody.md's progress log).
# Until it lands, this script fails loudly with an explicit, actionable
# reason instead of a bare ModuleNotFoundError, so a missing feature cannot
# be silently mistaken for a passing gate.
#
# Server-gate scope: this script must be a non-mutating, reproducible,
# machine-independent CI check, so it exercises only design-specs/0004's
# oracle-first fixture suite (temporary local Git repositories the spec
# requires anyway; no network, no shared state) and `catalog-check`, which
# the spec defines as network-free and read-only against the checked-in
# `references/sources.toml`. It never runs `lock` or `materialize` here,
# because those mutate `references/sources.lock.json` and `.references/`,
# and the catalog's `local.lang-bang` source depends on a workstation-local
# sibling checkout that does not exist in CI or in a fresh clone.
#
# The design spec's documented "visible command" (status against a locked,
# materialized `local.lang-bang`) is a separate, operator-run preview, not
# this server gate. It requires that local sibling and an explicit prior
# `lock`/`materialize`, so it only runs here when explicitly opted into:
#
#   ACCEPT_0004_RUN_LOCAL_PREVIEW=1 ./scripts/accept/0004-reference-source-custody.sh
set -eu
cd "$(dirname "$0")/../.."
export PYTHONPATH="${PYTHONPATH:-}:src"

if ! python -c "import semantic_references" >/dev/null 2>&1; then
  echo "accept/0004: semantic_references is not integrated into this worktree yet." >&2
  echo "accept/0004: design-specs/0004-reference-source-custody.md's custody pilot cannot pass until it lands." >&2
  exit 1
fi

pytest -q -k "reference" tests

python -m semantic_references catalog-check

if [ "${ACCEPT_0004_RUN_LOCAL_PREVIEW:-0}" = "1" ]; then
  echo "accept/0004: running the operator-only local.lang-bang preview (not part of the CI gate)." >&2
  python -m semantic_references lock local.lang-bang --offline
  python -m semantic_references materialize local.lang-bang --offline
  python -m semantic_references status local.lang-bang
fi
