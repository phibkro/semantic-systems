# Active plan 0044: resource lifecycle law tracer

Canonical frozen contract:
[`design-specs/0044-resource-lifecycle-law-tracer.md`](../../design-specs/0044-resource-lifecycle-law-tracer.md).
This execution record cannot redefine that contract.

Status: contract frozen; implementation intentionally absent

Owner: primary Semantic Systems language lead

## Dependencies

- accepted 0042 user-defined algebra frontier;
- current TypeScript 7, Bun, Effect v4, Oxfmt, and Oxlint environment; and
- the existing canonical JSON and portable-module patterns.

## Owned paths

- `design-specs/0044-resource-lifecycle-law-tracer.md`
- `plans/active/0044-resource-lifecycle-law-tracer.md`
- `model/work/resource-lifecycle-law-tracer.json`
- `src/resource-lifecycle/**`
- `tests/resource-lifecycle-law-tracer.test.ts`
- `tests/resource-lifecycle-law-tracer-node.test.ts`
- `scripts/accept/0044-resource-lifecycle-law-tracer.ts`
- derived generated project views

Forbidden: changing kernel or surface syntax, STM semantics, actor runtime,
deployment, operator-owned `AGENTS.md`, or adding committed Python/shell
programs.

## Implementation posture

- Reuse strict Effect Schema, canonical JSON, immutable custody, portable Node
  parity, and acceptance patterns already present in the repository.
- Implement one finite pure reference interpreter; do not build a scheduler or
  external resource adapter.
- Keep scripted outcomes visibly distinct from external observations.
- Preserve acquisition history when finalization consumes ownership; do not
  encode release as a mathematical inverse.

## Execution sequence

1. Freeze this contract, plan, work item, and intentionally red acceptance.
2. Implement strict schemas, tagged failures, the iterative lifecycle reducer,
   immutable reports, and canonical encoding.
3. Add law properties and adversarial counterexamples under Bun and Node.
4. Update the 0042 resource candidate observation only after the executable
   evidence passes.
5. Run exact acceptance and the complete clean-head gate.
6. Commission independent review, correct findings, and integrate the exact
   accepted head.

## Acceptance command

```bash
bun scripts/accept/0044-resource-lifecycle-law-tracer.ts
```

## Evidence ledger

- 2026-08-01: 0042 records recurring resource-scope ergonomics but no accepted
  local lifecycle law tracer or region elaboration.
- 2026-08-01: the contract deliberately models scripted outcomes and cleanup
  ownership before choosing syntax, runtime capabilities, or kernel forms.
- 2026-08-01: no provider, network, deployment, external resource, or adjacent
  repository effect occurred during contract freeze.
