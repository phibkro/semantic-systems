#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
head=$(git -C "$root" rev-parse HEAD)
commit=${CONTROL_ROOM_COMMIT:-$head}
observed_at=${CONTROL_ROOM_OBSERVED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
output=${CONTROL_ROOM_OUTPUT:-"$root/apps/control-room/public/data"}
observation_source=${CONTROL_ROOM_OBSERVATION_SOURCE:-local_preview}

if [ "$commit" != "$head" ]; then
  echo "error: public export commit must equal the checked-out HEAD ($head)" >&2
  exit 1
fi

if [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "error: public export requires a clean committed tree" >&2
  exit 1
fi

if [ "$observation_source" = "accepted_main" ] &&
  { [ "${GITHUB_ACTIONS:-}" != "true" ] ||
    [ "${GITHUB_REF:-}" != "refs/heads/main" ] ||
    [ "${GITHUB_SHA:-}" != "$commit" ]; }; then
  echo "error: accepted_main requires the exact main GitHub Actions context" >&2
  exit 1
fi

PYTHONPATH="$root/src" python "$root/scripts/export-public-model.py" \
  --root "$root" \
  --output "$output" \
  --commit "$commit" \
  --observed-at "$observed_at" \
  --observation-source "$observation_source" \
  --deployed-check-status "${CONTROL_ROOM_DEPLOYED_CHECK_STATUS:-not_checked}"
