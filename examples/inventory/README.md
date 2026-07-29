# Inventory tracer bullet

The inventory machine exercises the project architecture without requiring the
whole language first. Design spec 0001 makes the pure realization the reference
oracle and keeps a deliberately broken realization as a permanent
counterexample.

```text
InventoryMachine =
    State
    + Reserve | Release messages
    + Reserved | Released | ReservationRejected | ReleaseRejected events
    + update
    + NonNegativeStock invariant
```

Realization sequence:

1. **Pure reference** — deterministic transition and replay; current tracer.
2. **Broken fixture** — violates the stock guard and must fail conformance.
3. **Actor** — one actor serializes authority over inventory state; next.
4. **STM** — composable operations over TVars with commit-only event emission.

The same domain contract and invariant should be reused across all three.

Authored artifacts are separated by role:

- `contracts/` — theory contract;
- `realizations/` — operation bindings and assumptions;
- `evidence/` — conformance-suite recipe;
- `policies/` — accepted evidence categories;
- `scenarios/` — user-visible execution input and oracle.

After implementation, run:

```bash
PYTHONPATH=src python -m semantic_tracer demo examples/inventory
```
