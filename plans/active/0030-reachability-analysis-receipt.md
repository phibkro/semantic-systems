# Active plan 0030: declared reachability analysis receipt

Canonical frozen contract:
[`design-specs/0030-reachability-analysis-receipt.md`](../../design-specs/0030-reachability-analysis-receipt.md).
This execution record cannot redefine that contract.

Status: accepted on exact local head; publication pending

Owner: primary Semantic Systems language lead

## Dependencies

- merged 0027 semantic artifact store at main `600f1df`;
- accepted 0019 semantic identities behind the store boundary; and
- installed Effect 4.0.0-beta.102, TypeScript 7.0.2, and Bun 1.3.13.

## Owned paths

- `design-specs/0030-reachability-analysis-receipt.md`
- `plans/active/0030-reachability-analysis-receipt.md`
- `model/work/reachability-analysis-receipt.json`
- `src/language-build/reachability.ts`
- `src/language-build/index.ts`
- `tests/language-build-reachability.test.ts`
- `tests/language-build-reachability-node.test.ts`
- `scripts/accept/0030-reachability-analysis-receipt.ts`
- derived generated project views

Forbidden: changing 0019 or 0027 identity semantics; inferring dependency
edges; implementing dead-code removal, optimization, persistence, package
resolution, or provider effects; editing operator-owned `AGENTS.md`.

## Implementation posture

- Treat the JSON graph as a declared input and label its authority honestly.
- Read one immutable store snapshot and never retain or mutate caller input.
- Use Effect Schema at the decoded JSON boundary and typed Effect failures.
- Keep Crypto explicit until the composition root.
- Normalize order before graph and receipt identity derivation.
- Use an iterative visited-set traversal within frozen node and edge bounds.
- Reuse the 0027 service and normalized-core canonical encoding helpers; add no
  dependency or general graph framework.

## Execution sequence

1. Freeze the contract, plan, model item, and initially red acceptance.
2. Implement strict JSON decoding, store membership, normalization, and typed
   failure taxonomy.
3. Implement domain-separated graph and receipt identity derivation.
4. Add chain, branch, island, cycle, permutation, hostile-boundary, bounds,
   digest-failure, immutability, and genuine Node parity journeys.
5. Run focused tests, TypeScript 7, lint, formatting, project projections, and
   full repository acceptance.
6. Commission revision-pinned independent review and correct findings at their
   owning boundary.
7. Publish one completion PR and merge only after exact GitHub replay passes.

## Acceptance command

```bash
bun scripts/accept/0030-reachability-analysis-receipt.ts
```

## Evidence ledger

- 2026-08-01: 0027 merged through PR 11 and established accepted semantic
  values, exact artifact variants, authored-name projection, and deterministic
  replay.
- 2026-08-01: inspection confirmed that 0019 version 1 represents one checked
  kernel program and imported assumptions but no cross-value declaration graph.
  Feature 0030 therefore freezes an explicit declared graph boundary and makes
  the weaker authority visible instead of inventing dependency extraction.
- 2026-08-01: independent contract review confirmed the representation gap and
  narrowed the universe to one explicit closed graph subset of the store. The
  receipt now labels edge authority as caller-declared, embeds its canonical
  graph, and has a strict byte-validation boundary. Omitted stored values are
  outside the graph rather than being mislabeled unreachable.
- 2026-08-01: exact implementation head `6619778` passed 13 focused Bun tests
  with 202 assertions, including 64 fixed-seed generated graph-oracle runs,
  plus one genuine Node parity test. Exact full acceptance passed 692 Bun tests
  with one intentional optional-oracle skip, 68 Python tests, TypeScript 7,
  Oxlint, Oxfmt, project-model validation, and generated projection checks.
- 2026-08-01: revision-pinned review of `052bade` found no blocker or major and
  identified two minor evidence/order gaps. Head `6619778` admits malformed
  representations before observing the store and pins the generated oracle;
  independent delta review approved it with no remaining finding.

## Review disposition

- The declared closed graph is the smallest honest complement universe until a
  compiler-owned dependency extractor exists.
- Primitive JSON and receipt bytes are captured before the store observation;
  malformed representations consume no snapshot.
- Generated closure oracles, explicit permutations, cycles, duplicates, and
  changing-root journeys enforce the stated identity and termination laws.
- `edge_authority: caller-declared` keeps compiler-derived authority explicitly
  out of the receipt.
