# Active plan 0046: Effect Graph execution index

Canonical frozen contract:
[`design-specs/0046-effect-graph-execution-index.md`](../../design-specs/0046-effect-graph-execution-index.md).
This execution record cannot redefine that contract.

Status: implementation accepted locally; exact-head review and integration pending

Owner: Semantic Systems portfolio-model engineer

## Dependencies

- accepted 0021 PBK portfolio model;
- pinned `effect@4.0.0-beta.102`, TypeScript 7, Bun, Oxfmt, and Oxlint; and
- existing strict portfolio decoding and deterministic project-view generation.

## Owned paths

- `design-specs/0046-effect-graph-execution-index.md`
- `plans/active/0046-effect-graph-execution-index.md`
- `model/work/effect-graph-execution-index.json`
- `src/portfolio-model/graph-index.ts`
- minimal edits in `src/portfolio-model/project.ts`
- `tests/pbk-portfolio-model.test.ts`
- `scripts/accept/0046-effect-graph-execution-index.ts`
- derived generated project-model views

Forbidden: 0045 files, canonical portfolio schemas, query algebra, project-model
weighted paths or cycle witnesses, relational-fact traversal, custom Mermaid,
Control Room code, and the primary checkout.

## Implementation posture

- Reuse the pinned official `effect/Graph` module rather than hand-writing
  generic traversal infrastructure.
- Wrap the beta API behind one internal stable-ID adapter.
- Treat numeric indices as disposable implementation details.
- Preserve authored relation direction and parallel relation identity.
- Keep the domain-specific depth fold small, total after acyclicity, and iterative.

## Execution sequence

1. Freeze the contract, plan, work item, and acceptance journey.
2. Implement deterministic stable-ID construction and typed Graph failures.
3. Replace only portfolio boolean cycle/dependency-depth mechanics.
4. Add permutation, parallel-edge, cycle, snapshot, and long-chain regressions.
5. Regenerate derived project views and run exact acceptance/full gates.
6. Review the diff, commit conventionally, and return exact-head evidence.

## Acceptance command

```bash
bun scripts/accept/0046-effect-graph-execution-index.ts
```

## Evidence ledger

- 2026-08-01: installed Effect Graph inspection found numeric, insertion-ordered
  indices; parallel edges are retained; structural serialization and stable-ID
  rendering are absent. The contract therefore limits adoption to a rebuilt
  execution index.
- 2026-08-01: no canonical schema, persistence, query, renderer, Control Room,
  provider, network, deployment, or adjacent-repository mutation is authorized.
- 2026-08-01: implementation reused the pinned official Effect Graph module
  behind one internal adapter. No copied upstream source or new dependency was
  introduced. Numeric indices remain absent from portfolio schemas, public
  projections, generated views, and durable model rows.
- 2026-08-01: exact acceptance observed 15 focused portfolio tests with 8,235
  assertions, genuine Node stable-order and parallel-edge parity, TypeScript 7
  Effect diagnostics, Oxlint, Oxfmt, strict model validation, deterministic
  generated views, and the complete repository suite with 885 passes, one
  configured external-oracle skip, zero failures, and 20,689 assertions.
