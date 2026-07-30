# Active plan 0013: bounded actor trace retention

Canonical frozen contract:
[`design-specs/0013-bounded-actor-trace-retention.md`](../../design-specs/0013-bounded-actor-trace-retention.md).
This mutable plan records execution state and cannot redefine that contract.

Status: contract frozen; oracle and implementation pending

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

## Owned paths

- `design-specs/0013-bounded-actor-trace-retention.md`
- `plans/active/0013-bounded-actor-trace-retention.md`
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
