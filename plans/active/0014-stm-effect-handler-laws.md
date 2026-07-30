# Active plan 0014: STM effect and handler laws

Canonical frozen contract:
[`design-specs/0014-stm-effect-handler-laws.md`](../../design-specs/0014-stm-effect-handler-laws.md).
This mutable execution record cannot redefine that contract.

Status: contract frozen; dedicated oracle and reference model pending

Owner: main research and integration agent

## Discovery evidence

- `docs/runtime-concurrency-spec.md` already separates speculative work,
  successful commit actions, permanent abort actions, and affine capture.
- The canonical work graph makes `work.stm-laws` the blocker for the STM
  runtime, inventory STM realization, deterministic simulator, and bounded
  interleaving checker.
- The pre-existing graph incorrectly made this experiment require the
  still-design `decision.stm-library`, creating a circular evidence edge. This
  contract changes that relation to `informs`: the experiment may proceed, and
  only its accepted or rejected completion may change the decision status.
- Pinned Effect v4 beta.102 implements transactions through `Effect.tx`,
  `Effect.txRetry`, a versioned `TxRef` journal, outer-boundary validation, and
  rerun. Ordinary Effect operations can still occur inside the retryable body,
  so the installed API is candidate realization evidence rather than the
  semantic theory.
- No current `src/stm/` reference model or dedicated STM law suite exists. The
  initial acceptance harness must therefore fail before implementation.

## Owned paths

- `design-specs/0014-stm-effect-handler-laws.md`
- `plans/active/0014-stm-effect-handler-laws.md`
- `scripts/accept/0014-stm-effect-handler-laws.ts`
- `src/stm/**`
- `tests/stm-laws.test.ts`
- STM-specific examples and canonical observations
- `model/work/work.json` status/contract link and deterministic projections

Forbidden paths and meanings include inventory theory/domain changes, actor
semantics, resolver/checker/reference custody, `theory-norm-v0`, optimized STM,
distributed transactions, deployment, and unrelated migration work.

## Required implementation posture

- Search the installed Effect v4 source, existing deterministic model patterns,
  and cited STM prior art before hand-writing.
- Keep the pure instruction/model core free of runtime authority. Effect owns
  composition and typed failure around it, not the semantic facts themselves.
- Model typed action values; never execute an opaque callback during an
  attempt.
- Implement the smallest finite scheduler needed to falsify the frozen laws.
  Do not build a generic model checker or runtime scheduler.
- Record what was evaluated, reused, adapted, or rejected with source and
  license provenance.

## Execution sequence

1. Commit this frozen contract, red acceptance harness, active plan, work-graph
   binding, and regenerated projections after observing the missing-oracle
   failure.
2. Implement named oracle-first counterexamples for attempt rollback,
   validation, retry dependencies, alternatives, action custody, domain
   isolation, and serial histories.
3. Implement the pure transaction description and deterministic reference
   model.
4. Emit a bounded canonical report with evidence and unsupported claims.
5. Add genuine Bun/Node parity and portable-closure gates.
6. Run exact 0014 acceptance and the repository integration loop.
7. Commission independent exact-head semantic/concurrency review.
8. Integrate only an accepted clean head, then move this plan to completed.

## Acceptance command

```bash
bun scripts/accept/0014-stm-effect-handler-laws.ts
```

The exact harness expands this into focused tests, Bun/Node report parity,
typecheck, lint, formatting, neighboring regressions, model validation, and
generated-view checks. Missing required tools or artifacts fail.

## Evidence ledger

- 2026-07-30: contract drafted from canonical project semantics and direct
  inspection of the installed Effect v4 beta.102 transaction source. No
  upstream code was copied.
- 2026-07-30: corrected the canonical dependency from
  `work.stm-laws requires decision.stm-library` to `work.stm-laws informs
  decision.stm-library`; generated readiness must derive from that source edge.
