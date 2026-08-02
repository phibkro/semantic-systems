# Plan 0050-bounded-stm-runtime: bounded STM runtime

Canonical frozen contract:
[`design-specs/0050-bounded-stm-runtime.md`](../design-specs/0050-bounded-stm-runtime.md).
This mutable plan records execution state and cannot redefine that contract.

Feature base: `8ad791db932d0fda93083dce3074a3149b438bbf`

Owner: primary Semantic Systems lead

## Discovery evidence

- Feature 0014 is complete at integration head
  `b51f375dcf75284d1415d6aee8e60edf6f7edc39`.
- `work.stm-runtime` is ready only as a derived schedule item. It has no managed
  feature record, runtime contract, acceptance program, or source module.
- The accepted `src/stm/model.ts` already owns pure transaction descriptions,
  store lineage, attempts, conflict validation, retry suspensions, wake-up, and
  terminal action logs.
- Effect 4.0.0-beta.102 is pinned and MIT licensed. Its `Effect.tx`,
  `Effect.txRetry`, and `TxRef` implementation permits arbitrary retry-body
  effects and has a callback-registration window after retry detection.
- On 2026-08-02, a disposable Bun probe forced a dependency change in that
  window. The waiting transaction did not wake within one second. This is one
  runtime observation, not proof over all schedules.
- The selected runtime therefore reuses Effect coordination primitives but not
  Effect transactions. It reuses the accepted 0014 semantic model instead of
  copying another STM implementation.

## Owned paths

The implementing lead owns:

- `design-specs/0050-bounded-stm-runtime.md` only for an explicit reviewed contract correction;
- `plans/0050-bounded-stm-runtime.md`;
- `model/work/features/0050-bounded-stm-runtime.json`;
- the `work.stm-runtime` entity and its existing relations in `model/work/work.json`;
- deterministic generated lifecycle and roadmap projections;
- `scripts/accept/0050-bounded-stm-runtime.ts`;
- `src/stm/runtime.ts`;
- `src/stm/runtime-report.ts`;
- bounded Bun and Node runtime-report entry points under `src/stm/`;
- `tests/stm-runtime.test.ts`; and
- one genuine Node runtime ownership or report test if the repository pattern requires it.

Forbidden paths include:

- the accepted 0014 semantic language and laws in `src/stm/model.ts`;
- inventory theory or its actor realization;
- `work.stm-model-check` implementation;
- kernel calculus, kernel JSON, and interpreter sources;
- resolver and reference-custody sources;
- Control Room sources; and
- operator-owned `AGENTS.md`.

## Required implementation posture

- Use TypeScript 7, Bun, Effect 4.0.0-beta.102, Oxfmt, and Oxlint.
- Use the installed Effect declarations and source as API authority.
- Reuse `Ref`, `Deferred`, `Semaphore`, `Scope`, and structured interruption.
- Reuse 0014 `beginAttempt`, `settleAttempt`, `rerunAttempt`,
  `changedDependencies`, `wakeAndRerun`, and `projectStore`.
- Do not wrap `Effect.tx`, `Effect.txRetry`, or `TxRef`.
- Keep transaction descriptions pure. Do not admit callbacks or opaque Effects.
- Keep publication and retry registration under one exclusive gate.
- Bound in-flight calls and attempts with required configuration.
- Return inert action values. Do not add an external action interpreter.
- Keep the public seam smaller than the owned coordination implementation.
- Record exact prior-art and license provenance. Copy no upstream source.
- Stop broader scheduler, telemetry, optimization, and model-checking work.

## Execution sequence

1. Add the managed feature record and move `work.stm-runtime` from the shared work file without duplicating its entity ID.
2. Add an exact acceptance program that fails while the runtime tracer is absent.
3. Add red focused tests for conflict actions, partial publication, retry wake-up, the pre-registration race, interruption, bounds, nesting, abort, and close.
4. Implement the scoped runtime through the frozen public seam.
5. Add a deterministic report and genuine Bun/Node parity journey.
6. Regenerate deterministic project views.
7. Run focused tests, exact 0050 acceptance, exact 0014 regression acceptance, and the repository integration gate.
8. Commission independent exact-head implementation review.
9. Correct all Critical and Important findings.
10. Record typed completion evidence only after exact-head acceptance and review pass.

## Acceptance commands

```bash
bun test tests/stm-runtime.test.ts tests/stm-laws.test.ts
bun run typecheck
bun run lint
bun run format:check
bun scripts/accept/0050-bounded-stm-runtime.ts
bun scripts/accept/0014-stm-effect-handler-laws.ts
bun run semproj -- validate
bun run semproj -- generate --check
just check
git diff --check
```

## Evidence ledger

- 2026-08-02: direct model, contract, lifecycle, and source inspection found no
  existing runtime contract or implementation. Feature 0014 is sufficient
  semantic authority but does not freeze an operational runtime interface.
- 2026-08-02: the primary lead evaluated the pinned Effect transaction source.
  A forced runtime schedule reproduced a lost retry wake. The runtime contract
  therefore selects a project-owned adapter over the accepted 0014 model. It
  retains Effect only for maintained coordination primitives.
- 2026-08-02: contract frozen at primary base
  `8ad791db932d0fda93083dce3074a3149b438bbf`. Implementation, acceptance,
  integration, and independent review remain pending.
- 2026-08-02: the bounded runtime was integrated at
  `02c316cab1b428bf9d1464cd572aea677081f215`. It retains the accepted 0014
  transaction model and adds Effect-owned bounded coordination, retry
  registration and wake-up, interruption cleanup, close, immutable snapshots,
  exact counters, and deterministic Bun/Node reports.
- 2026-08-02: initial independent review found a publish-before-wake ordering
  defect, retry-wake attempt-bound gaps, untyped model exceptions, and an
  interruption window around pending-wait cleanup. The correction publishes
  before waking, completes waiters independently, checks all three retry paths,
  converts model exceptions to typed `evaluation_rejected` failures, and keeps
  the loop uninterruptible except at the explicit scheduling and pending-wait
  sites.
- 2026-08-02: exact feature acceptance at committed descendant
  `582ec7a70161e6da2663a96147c7e4838e54a270` passed 46 STM tests/343
  expectations, 33 portable-model tests/276 expectations, 82 runtime closure
  tests/483 expectations, 12 report tests/30 expectations, typecheck, strict
  lint, formatting, project-model validation, and nine generated-view checks.
  This is runtime-validation, test, and static-analysis evidence, not proof of
  fairness, starvation freedom, lock freedom, or durable action delivery.
- 2026-08-02: full `just check` passed on a clean detached worktree at
  `582ec7a` with 689 tests/17,267 expectations, typecheck, strict lint,
  formatting, commit-policy checks, model validation at 138 entities/194
  relations with one pre-existing unsupported-claim warning, and nine checked
  generated views. The primary working tree was not cleaned because its
  operator-owned `AGENTS.md` change is preserved.
- 2026-08-02: independent exact-head static review of `582ec7a` returned
  `ACCEPTED` with no Critical or Important defect. It confirmed the
  post-review interruption hardening and every prior correction. The reviewer
  ran no tests; the runtime and integration observations above remain separate
  evidence.
- 2026-08-02: Status: complete — implementation and integration head
  `02c316c`, exact committed-descendant acceptance, full clean-tree
  integration, and independent review are recorded with typed evidence.
