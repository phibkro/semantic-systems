# Active plan 0041: surface effect-driver CLI

Canonical frozen contract:
[`design-specs/0041-surface-effect-driver-cli.md`](../../design-specs/0041-surface-effect-driver-cli.md).
This execution record cannot redefine that contract.

Status: contract frozen; implementation pending

Owner: primary Semantic Systems language lead

## Dependencies

- accepted surface compiler 0026;
- accepted affine external effect replay 0037;
- accepted surface runner process boundary 0040; and
- merged main `238dc97421d1e60fc08aba54cc49497e9a1fd502`.

## Owned paths

- this design spec, plan, work item, and exact acceptance script;
- additive/refactoring changes under `src/surface-cli/**`;
- `tests/surface-effect-driver-cli*.test.ts` and narrow inherited 0040 tests;
- narrow package command documentation if required; and
- derived project-model views.

Forbidden: changing surface syntax, kernel representation, checking or
execution semantics, bytecode behavior, deployment, unrelated work, or adding
committed Python/shell programs.

## Implementation posture

- Extract the frozen 0040 source-byte compilation boundary for exact reuse.
- Use `scanJson`, Effect Schema, the accepted script decoder, canonical kernel
  encoding, and `interpretKernelJsonBytesWithObservationScript`.
- Keep host I/O injected and sequence source admission before script reading.
- Share the command and process host across Bun and genuine Node.

## Execution sequence

1. Commit this frozen contract and red acceptance.
2. Extract and regression-test shared source compilation without changing 0040.
3. Implement strict observation bytes and the new output schema.
4. Add command dispatch, source-first custody, exit classification, and process
   journeys.
5. Run exact acceptance and the full clean-head gate.
6. Commission independent Fable 5 high review, correct findings, and integrate.

## Acceptance command

```bash
just accept 0041-surface-effect-driver-cli
```

## Evidence ledger

- 2026-08-01: capability audit found accepted readable-source compilation and
  affine kernel replay, but no interpreter-first process composition.
- 2026-08-01: changing `semantic.surface-run/v1`, exposing bytecode selection,
  and reading two semantic inputs from stdin were rejected before freeze.
- 2026-08-01: installed Effect v4 includes an experimental CLI, but migrating
  the already frozen 0040 usage/error surface was separated from this semantic
  feature rather than silently changing its process contract.
