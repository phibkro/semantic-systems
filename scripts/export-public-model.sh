#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
commit=${CONTROL_ROOM_COMMIT:-$(git -C "$root" rev-parse HEAD)}
observed_at=${CONTROL_ROOM_OBSERVED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
output=${CONTROL_ROOM_OUTPUT:-"$root/apps/control-room/public/data"}

PYTHONPATH="$root/src" python "$root/scripts/export-public-model.py" \
  --root "$root" \
  --output "$output" \
  --commit "$commit" \
  --observed-at "$observed_at" \
  --deployed-check-status "${CONTROL_ROOM_DEPLOYED_CHECK_STATUS:-not_checked}"
