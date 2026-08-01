# Active plan 0040: surface runner CLI

Canonical frozen contract:
[`design-specs/0040-surface-runner-cli.md`](../../design-specs/0040-surface-runner-cli.md).
This execution record cannot redefine that contract.

Status: frozen; implementation pending

Owner: primary Semantic Systems language lead

## Dependencies

- accepted surface compiler 0026;
- accepted reference interpreter 0022; and
- merged main `e5902f9d13778587b0f0651b6be2d7cbf519580d`.

## Owned paths

- this design spec, plan, work item, and exact acceptance script;
- `src/surface-cli/**`;
- `tests/surface-runner-cli*.test.ts`;
- narrow `package.json` command additions; and
- derived project-model views.

Forbidden: changing the surface grammar, elaborator, kernel representation,
checker, interpreter, observations, bytecode backend, deployment, unrelated
work, or adding committed Python/shell programs.

## Implementation posture

- Reuse `compileSurfaceDocument`, `encodeCanonicalKernelDocument`, and
  `interpretKernelJsonBytes`; derive no semantic machinery.
- Use Effect Schema and canonical JSON at the new output boundary.
- Keep host I/O behind one narrow injected Effect capability.
- Share one core command between Bun and genuine Node.

## Execution sequence

1. Commit this frozen contract and red acceptance.
2. Implement the observation schema and pure source-to-observation program.
3. Implement the bounded process host and Bun/Node entry points.
4. Add custody, rejection, bounds, architecture, and cross-runtime journeys.
5. Run exact acceptance and the full clean-head gate.
6. Commission independent Fable 5 high review, correct findings, and integrate.

## Acceptance command

```bash
just accept 0040-surface-runner-cli
```

## Evidence ledger

- 2026-08-01: capability audit found a complete accepted surface compiler,
  strict kernel encoder, and reference interpreter, but no readable-source
  process command.
- 2026-08-01: a compile-only command was rejected as a weaker first user
  journey. The runner keeps source failures and kernel observations explicit in
  one new outer envelope without changing either accepted inner contract.
