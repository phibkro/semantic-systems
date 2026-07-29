#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$root"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: acceptance requires a committed tracked tree" >&2
  exit 1
fi

commit=$(git rev-parse HEAD)
observed_at=${CONTROL_ROOM_OBSERVED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}

echo "control-room acceptance commit: $commit"
bun install --frozen-lockfile
./scripts/check.sh

CONTROL_ROOM_COMMIT="$commit" \
  CONTROL_ROOM_OBSERVED_AT="$observed_at" \
  sh scripts/export-public-model.sh

bun run --cwd apps/control-room format:check
bun run --cwd apps/control-room lint
bun run --cwd apps/control-room typecheck
bun run --cwd apps/control-room test
CONTROL_ROOM_BASE=/semantic-systems/ bun run --cwd apps/control-room build
PYTHONPATH=src python scripts/check-public-artifact.py apps/control-room/dist

apps/control-room/node_modules/.bin/playwright test \
  --config apps/control-room/playwright.config.mjs

PYTHONPATH=src python scripts/check-public-artifact.py apps/control-room/dist

if [ -n "${CONTROL_ROOM_DEPLOYED_URL:-}" ]; then
  curl --fail --silent --show-error --location "$CONTROL_ROOM_DEPLOYED_URL" >/dev/null
  echo "deployed URL responded: $CONTROL_ROOM_DEPLOYED_URL"
else
  echo "external Pages/default URL and semantic.phibkro.org probes not run"
fi

echo "control-room local acceptance passed: $commit"
