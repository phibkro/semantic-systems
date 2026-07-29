# Inventory Tracer Bullet

The inventory machine exercises the project architecture without requiring the
whole language first.

```text
InventoryMachine =
    State
    + Reserve | Release messages
    + Reserved | Released | Rejected events
    + update
    + NonNegativeStock invariant
```

Planned realizations:

1. **Pure** — deterministic transition and replay.
2. **Actor** — one actor serializes authority over inventory state.
3. **STM** — composable operations over TVars with commit-only event emission.

The same domain contract and invariant should be reused across all three.
