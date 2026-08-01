# Active plan 0036: storage-independent explorer query contract

Canonical frozen contract:
[`design-specs/0036-explorer-query-contract.md`](../../design-specs/0036-explorer-query-contract.md).
This execution record cannot redefine that contract.

Status: contract frozen; implementation in progress

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
