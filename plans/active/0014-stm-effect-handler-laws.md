# Active plan 0014: STM effect and handler laws

Canonical frozen contract:
[`design-specs/0014-stm-effect-handler-laws.md`](../../design-specs/0014-stm-effect-handler-laws.md).
This mutable execution record cannot redefine that contract.

Status: tracer implemented; exact acceptance green; full integration gate and independent review pending

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
- 2026-07-30: inspected the pinned
  `effect@4.0.0-beta.102` sources at `node_modules/effect/src/Effect.ts` and
  `node_modules/effect/src/TxRef.ts` under the package's MIT license. Adapted
  the abstract journal/validate/rerun and same-journal nesting techniques; no
  upstream source was copied. Rejected Effect's transaction surface as theory
  authority because retryable bodies admit arbitrary Effect operations and its
  realization uses ordinary JavaScript number versions.
- 2026-07-30: evaluated Harris, Marlow, Peyton Jones, and Herlihy,
  “Composable Memory Transactions,” PPoPP 2005,
  DOI `10.1145/1065944.1065952`, for compositional transaction and alternative
  semantics. This publication supplied conceptual prior art only; no text or
  code was copied.
- 2026-07-30: evaluated Haskell `stm`'s `retry`, `orElse`, and typed exception
  distinction through `Control.Monad.STM` (Hackage `stm-2.5.3.1`,
  BSD-3-Clause). Adapted the dependency-union and retry-only alternative
  concepts into the frozen contract's closed data AST; no Haskell source was
  copied.
- 2026-07-30: evaluated the transactional outbox pattern documented at
  `microservices.io/patterns/data/transactional-outbox.html`. Retained only the
  separation between committed state and later action interpretation. Durable
  delivery was rejected from this tracer as an explicit non-goal.
- 2026-07-30: reused the repository's portable Bun/Node entrypoint split,
  canonical JSON projection, exact decimal-string counter convention, and
  oracle-first test naming. Rejected a generic scheduler/model-checker scaffold
  as an unbounded side quest; the model enumerates only the declared two-record
  serial orderings.
- 2026-07-30: implemented a closed pure transaction-description AST, immutable
  store snapshots, exact bigint versions, handler-owned journals, retry
  registration/wake-up, branch isolation, inert commit/abort values,
  same-domain nesting, pre-attempt cross-domain rejection, and bounded serial
  history checking in `src/stm/`.
- 2026-07-30: added 17 dedicated law tests with all 15 named counterexamples,
  101 assertions, empty-dependency suspension, and exact-version rollover.
  `nix develop --command bun scripts/accept/0014-stm-effect-handler-laws.ts`
  passed, including genuine Bun/Node canonical report parity, typecheck, lint,
  format, portable closure, 82 neighboring inventory/actor tests, seven
  semantic-rule tests, model validation, and generated-view checking.
- 2026-07-30: mutation-negative checks disabled all stale-version detection;
  CE05 and CE06 both failed by observing an invalid commit. A separate mutation
  retained the left `orElse` branch journal; CE09 failed by observing value 99
  instead of the right branch's value 2. Both mutations were reverted, and the
  three focused tests passed again with 17 assertions.
- 2026-07-30: `nix develop --command bun scripts/check.ts` passed the full
  integration loop: 338 Bun tests with 1,727 assertions, 68 transitional Python
  custody checks, commit-policy conformance, formatting, lint, TypeScript plus
  Effect diagnostics, Bun/Node probes, model validation, and generated views.
