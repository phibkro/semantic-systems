# Active plan 0044: resource lifecycle law tracer

Canonical frozen contract:
[`design-specs/0044-resource-lifecycle-law-tracer.md`](../../design-specs/0044-resource-lifecycle-law-tracer.md).
This execution record cannot redefine that contract.

Status: exact implementation candidate `a6548ff3fa01f6931503eb8b3634a61a856f831f`
accepted locally; independent exact-head review and publication pending

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
- 2026-08-01: independent contract review removed unsupported handle-use and
  escape claims, made live resources explicit for scripts that leave scopes
  open, defined transfer as appending to the target cleanup order, and scoped
  exit completeness to resources owned at the accepted exit.
- 2026-08-01: implementation `5c76e986` reused repository Effect Schema,
  tagged-failure, canonical JSON, Unicode-ordering, immutable-custody, and
  genuine Node parity patterns without a new dependency or copied upstream
  source. The delegated exact-head checks passed 10 Bun tests with 184
  assertions, 64 seeded generated cases, genuine Node 1/1, TypeScript 7,
  Oxlint, Oxfmt, model validation, generated views, and commit policy.
- 2026-08-01: integration audit found that a live same-scope transfer could
  reorder cleanup without moving ownership. Candidate `a6548ff3` rejects that
  transition, adds the regression, advances the 0042 resource candidate only
  to an available userland model, and leaves both surface and kernel promotion
  deferred.
- 2026-08-01: exact 0044 acceptance on `a6548ff3` passed 10 focused lifecycle
  tests with 185 assertions, genuine Node 1/1, all nine 0042 frontier tests,
  TypeScript 7 Effect diagnostics, Oxlint, Oxfmt, strict project validation,
  deterministic generated views, and the complete repository suite with 879
  passes, one configured external-oracle skip, zero failures, and 20,674
  assertions.
- 2026-08-01: no provider, network, deployment, external resource, or adjacent
  repository effect occurred during contract freeze.
