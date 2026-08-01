# Active plan 0036: storage-independent explorer query contract

Canonical frozen contract:
[`design-specs/0036-explorer-query-contract.md`](../../design-specs/0036-explorer-query-contract.md).
This execution record cannot redefine that contract.

Status: implementation complete; integration review pending

Owner: explorer-query Feature 0036 worker

## Dependencies

- accepted TypeScript 7 and Effect v4 repository runtime;
- canonical project identities and typed relation distinctions; and
- Feature 0034's advisory fact vocabulary, without a code or branch dependency.

## Owned paths

- `design-specs/0036-explorer-query-contract.md`
- `plans/active/0036-explorer-query-contract.md`
- `model/work/realization-roadmap.json`
- generated project-model projections
- `src/explorer-query/**`
- `tests/explorer-query.test.ts`
- `scripts/accept/0036-explorer-query-contract.ts`

Forbidden: storage adapters, browser UI, Control Room changes, Feature 0034
files, provider effects, deployment, or edits outside this worktree.

## Implementation posture

- Reuse Effect v4 Schema, Match, existing bounded JSON/value conventions, and
  repository project-model projection commands.
- Keep total indexing and traversal as a pure library after Schema admission.
- Use iterative breadth-first traversal and deterministic code-unit ordering.
- Reject resource-limit overflow rather than presenting an unlabeled partial
  result.
- No upstream code is copied; the graph traversal is a direct bounded
  implementation of the frozen contract.

## Execution sequence

1. Freeze the observable source, query, traversal, projection, and failure contract.
2. Implement strict schemas, normalized immutable custody, and typed errors.
3. Implement direction/family indexes and bounded recursive expansion.
4. Implement deterministic list, tree, and mosaic projections with provenance.
5. Add examples, counterexamples, permutation properties, and exact acceptance.
6. Regenerate project views, run focused and full gates, and commit one clean head.

## Acceptance command

```bash
bun scripts/accept/0036-explorer-query-contract.ts
```

## Evidence ledger

- 2026-08-01: operator prioritized a storage-independent explorer query contract.
- 2026-08-01: Feature 0034 supplied its intended canonical fact-key, explicit
  family, subject/object identity, and source-document provenance vocabulary.
- 2026-08-01: contract frozen with no storage, UI, or Feature 0034 code dependency.
- 2026-08-01: advisory 0034 implementation review exposed that document-only
  provenance is ambiguous for multi-record files; the contract now retains the
  exact source record kind and key.
- 2026-08-01: focused Bun observed 8 passing journeys with 117 assertions and
  80 generated fact-order permutations; genuine Node observed the same portable
  API journey. TypeScript 7, Effect diagnostics, Oxlint, Oxfmt, model validation,
  and generated-view equality pass.
- 2026-08-01: the first full repository replay observed 754 passes and two
  unrelated five-second reference-custody timeouts at 5.03 seconds. Both exact
  journeys passed alone at 3.38 and 4.35 seconds; this is timing evidence, not a
  waiver of the required final clean-head replay.
- 2026-08-01: exact rebased acceptance at `adf3848` observed 785 passes, one
  declared skip, zero failures, 19,319 assertions, and 68 reference tests.
- 2026-08-01: the first Fable 5 high review exceeded its declared 30-minute
  turn deadline without durable output. Its owned tab was reconciled and closed;
  silence was not counted as review evidence.
- 2026-08-01: independent correction review of `adf3848` reproduced three
  blockers: live Schema traversal before array caps, 257 admitted relation kinds
  escaping the result schema, and a narrower value domain than accepted 0034
  facts. The correction captures bounded descriptor snapshots before Schema,
  separates selected and available kind bounds, and exercises an actual 0034
  Unicode/empty-display artifact through a lossless discriminator adapter.
- 2026-08-01: follow-up review confirmed those three corrections and exposed one
  remaining admission-order defect: per-kind fact quotas were counted only after
  complete capture. The boundary now counts each fact from its cached own data
  discriminator and rejects the first excess entity or relation before observing
  its record body; symmetric limit-plus-one counterexamples observe zero body
  properties on the rejected record.
