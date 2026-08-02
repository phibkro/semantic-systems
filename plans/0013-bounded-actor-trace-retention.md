# Plan 0013-bounded-actor-trace-retention: bounded actor trace retention

Canonical frozen contract:
[`design-specs/0013-bounded-actor-trace-retention.md`](../design-specs/0013-bounded-actor-trace-retention.md).
This mutable plan records execution state and cannot redefine that contract.


Owner: main research and integration agent

## Discovery evidence

- Direct source inspection at `05bd60f0362425e179c3df4b92a15ca01037f895`
  confirmed that `appendTrace` copies and retains the complete lifetime array.
- Each successful message appends `accepted`, `started`, and `committed`.
- The nominally unbounded implementation queue is a separate mechanism whose
  accepted stock is bounded by the mailbox semaphore. This feature must not
  rewrite that already accepted admission contract.
- A QEffect candidate located the same trace path, but its first exact-head
  review rejected its own evidence custody. The source counterexample stands
  independently; no QEffect claim is treated as authority.
- Contract revision 1 advances the actor journey schema to version 2 rather
  than silently changing the version 1 trace field shape.

## Owned paths

- `design-specs/0013-bounded-actor-trace-retention.md`
- `plans/completed/0013-bounded-actor-trace-retention.md`
- `scripts/accept/0013-bounded-actor-trace-retention.ts`
- `src/actor/**`
- `tests/actor-runtime.test.ts`
- `tests/actor-runtime-node.test.ts`
- `tests/actor-trace-retention.test.ts`
- actor-specific examples and generated observations
- `model/work/work.json` and deterministic generated projections

Forbidden paths include inventory theory/domain semantics, reference custody,
resolver semantics, unrelated scripts, and paused migration work.

## Required implementation posture

- Search Effect v4 collections and the existing actor/runtime patterns before
  hand-writing a container.
- Prefer the smallest portable bounded representation that preserves the
  frozen observation semantics.
- Record evaluated prior art and license provenance when code or a technique
  is reused; do not copy unattributed snippets.
- Automate only deterministic bounded checks cheaper to own than repeated
  manual inspection.
- Stop any broader telemetry, profiling, or generic analyzer side quest.

## Execution sequence

1. Commit the frozen contract, active plan, model work item, and acceptance
   harness after observing the missing-dedicated-test gate fail.
2. Implement oracle-first counterexamples for capacity validation, eviction,
   chronology, idempotent close, immutability, failure, and runtime parity.
3. Implement the bounded trace state and snapshot contract without changing
   mailbox or transition semantics.
4. Update the actor journey and realization identity.
5. Run focused gates, exact 0013 acceptance, exact 0012 regression acceptance,
   then the repository integration loop.
6. Commission independent exact-head review.
7. Integrate only a clean accepted head; record completion evidence and move
   this plan to `plans/completed/`.

## Acceptance commands

```bash
bun test tests/actor-trace-retention.test.ts tests/actor-runtime.test.ts
node --test tests/actor-runtime-node.test.ts
bun run typecheck
bun run lint
bun scripts/accept/0013-bounded-actor-trace-retention.ts
bun scripts/accept/0012-minimal-actor-runtime.ts
git diff --check
```

## Evidence ledger

- 2026-07-30: source counterexample independently confirmed; contract frozen
  for a representation-only correction.
- 2026-07-30: evaluated Effect v4 `Chunk` append/drop and the existing
  immutable-array actor pattern. No upstream code was copied. A capacity-capped
  immutable array is smaller for this tracer, keeps the portable dependency
  surface unchanged, and limits post-warm-up copying to the declared capacity
  rather than lifetime history; a specialized ring remains a measured future
  optimization, not a prerequisite.
- 2026-07-30: implemented a required snapshotted trace capacity, deeply
  immutable version-2 snapshots, exact total/eviction/completeness counters,
  and a revised realization identity. The focused result is 23 Bun tests (182
  expectations) plus two genuine-Node ownership tests.
- 2026-07-30: exact 0013 acceptance passed, including the full exact 0012
  acceptance, 64 inventory tests (429 expectations), seven semantic Effect
  lint-rule tests, type checking, lint, formatting, model validation,
  generated-view drift, portable-import inspection, and normalized Bun/Node
  actor journey parity. These remain test, static-analysis, and
  runtime-validation evidence; independent exact-head review is still
  required.
- 2026-07-30: the repository integration loop passed 320 Bun tests (1,618
  expectations), Effect diagnostics with zero findings, and 68 Python
  compatibility tests. The compatibility suite is retained migration
  evidence, not new Python source or authority.
- 2026-07-30: exact head `3db9ce0cbacc3f73c377c6db0221f9609f0d21b3`
  derives complete journey acceptance order from bounded receipts rather than
  the intentionally partial retained trace. On that exact head, the repository
  integration loop again passed 320 Bun tests (1,618 expectations), Effect
  diagnostics with zero findings, and 68 compatibility tests; exact 0013
  acceptance then passed 23 actor tests (182 expectations), two genuine-Node
  ownership tests, exact 0012 acceptance, inventory and semantic lint
  regressions, model validation, generated-view drift, and Bun/Node journey
  parity. Independent review remains the only completion gate.
- 2026-07-30: independent review rejected JavaScript `number` for
  `totalObserved`, `evicted`, and `acceptedCount`: it rounds after the
  safe-integer boundary and therefore contradicted the frozen exact-lifetime
  claim. Evaluated native `bigint`, a JSON number/string union, and the existing
  repository's arbitrary-integer custody patterns. Native `bigint` is the
  smallest exact private representation, while one canonical opaque decimal
  string is the smallest stable ordinary-JSON projection; a union would make
  representation depend on magnitude. No upstream code was copied. Effect
  collection abstractions do not add value to primitive exact arithmetic.
- 2026-07-30: revision 2 keeps the pure retention transition in an internal
  non-entrypoint module so a bounded oracle can inject
  `Number.MAX_SAFE_INTEGER` state and execute the same transition as the live
  runtime. It does not expose a counter-state mutation capability through
  `ActorRuntime`. The inherited numeric message sequence limit remains explicit
  and out of scope.
- 2026-07-30: corrected exact 0013 acceptance passed 24 focused Bun tests (187
  expectations), two genuine-Node ownership tests, exact 0012 regression
  acceptance, 64 inventory tests (429 expectations), seven semantic Effect
  lint-rule tests, type checking, strict lint, formatting, model validation,
  generated-view drift, portable import inspection, and normalized Bun/Node
  version-2 journey parity.
- 2026-07-30: the corrected repository integration loop passed 321 Bun tests
  (1,623 expectations), Effect diagnostics with zero findings, and 68
  compatibility tests. The boundary oracle performs two increments from
  `Number.MAX_SAFE_INTEGER` through the live pure retention transition and
  observes exact `9007199254740993` counters plus an ordinary-JSON round trip.
  This is bounded test/runtime-validation evidence, not proof of an unbounded
  actor execution.
- 2026-07-30: independent exact-head review rejected `c7997cb` because
  production held `acceptedCount` in a separate local bigint while the boundary
  oracle supplied an independently manufactured value to snapshot projection.
  The result was exact arithmetic but not evidence that production acceptance
  increments the count exactly once. Correction moves the count into the pure
  trace state: the live `Ref` and boundary oracle now share one
  accepted-envelope transition, while generic observations cannot increment
  accepted count and close/snapshot receive no separately authored count.
- 2026-07-30: corrected exact 0013 acceptance passed 24 focused Bun tests (190
  expectations), two genuine-Node ownership tests, exact 0012 regression
  acceptance, inventory and semantic-lint regressions, type checking, strict
  lint, formatting, model validation, generated-view drift, portable import
  inspection, and normalized Bun/Node journey parity. The full integration loop
  passed 321 Bun tests (1,626 expectations), Effect diagnostics with zero
  findings, and 68 compatibility tests. This is bounded test,
  static-analysis, and runtime-validation evidence; fresh independent
  exact-head review remains required.
- 2026-07-30: final independent exact-head review accepted
  `460d2b88993116d01d3901fc4f5a73c9ab671511`. The reviewer mutated production
  to remove and duplicate the shared accepted-envelope transition; both
  mutants failed focused counter assertions, establishing that the oracle
  detects missing and double accepted-count updates rather than merely
  projecting a precomputed value. The reviewer reproduced the full integration
  and exact 0013 acceptance loops on a clean tree: 321 Bun tests (1,626
  expectations), 24 focused actor tests (190 expectations), two genuine-Node
  tests, zero Effect diagnostics, 68 compatibility tests, exact 0012,
  inventory, semantic lint, model/view, import-closure, and Bun/Node parity
  gates. This remains bounded test, runtime-validation, static-analysis, and
  independent-assertion evidence—not proof of an unbounded execution.
- 2026-08-02: Historical leading status migrated verbatim from the pre-migration plan:
  Status: complete; accepted implementation integrated at `460d2b8`
