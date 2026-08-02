# Plan 0052-stm-schedule-explorer: bounded STM schedule explorer

Canonical frozen contract:
[`design-specs/0052-stm-schedule-explorer.md`](../../design-specs/0052-stm-schedule-explorer.md).
This mutable plan records execution state and cannot redefine that contract.

Feature base: `7caebb0546b9e9f1412de006158e1decd8d5f46c`

Owner: primary Semantic Systems lead

## Discovery evidence

- The accepted 0014 model in `src/stm/model.ts` exposes authenticated `Store`
  and `Txn` values plus `beginAttempt`, `settleAttempt`, `rerunAttempt`,
  `changedDependencies`, `wakeAndRerun`, `projectStore`, and serial-history
  observations. Attempts and suspensions are one-shot custody values.
- The accepted 0050 runtime interprets the model under Effect scheduling but
  does not expose a host scheduler or model-checking seam. The explorer must
  therefore remain a synchronous pure adapter and must not modify runtime
  publication or transaction meaning.
- No existing explorer, model-checking database, callback predicate, or
  schedule-search helper exists. The new deep module owns the queue and
  projection while keeping model custody in 0014.
- Canonical JSON from `src/tracer/canonical.ts` supplies the deterministic UTF-8
  report identity used for exact state deduplication and Bun/Node comparison.

## Owned paths

- `src/stm-explorer/**`
- `tests/stm-schedule-explorer.test.ts`
- `examples/stm-schedule-explorer/**`
- `scripts/accept/0052-stm-schedule-explorer.ts`
- `plans/active/0052-stm-schedule-explorer.md`
- `model/work/features/0052-stm-schedule-explorer.json`

Do not modify `src/stm/**`, `src/tracer/**`, predecessor tests, other plans or
records, frozen design specifications, `generated/**`, dependencies, or
operator-owned `AGENTS.md`.

## Required implementation posture

- Keep `src/stm-explorer/index.ts` synchronous, deterministic, and free of
  clock, random, filesystem, network, console, process, and host-concurrency
  authority.
- Recreate every schedule prefix from authenticated initial custody. Never copy
  an attempt or suspension between branches.
- Sort transaction IDs and closed actions with platform-independent code points;
  deduplicate complete canonical machine projections, not hashes alone.
- Bound transaction count, schedule depth, and retained states at the frozen
  ceilings. A crossed limit yields `bounded` and unknown findings rather than a
  completeness, liveness, or proof claim.
- Preserve commit, conflict, retry/suspension, wake, and abort observations in
  immutable traces and terminal projections. Only a committed settlement may
  replace the store or append history.
- Keep the four built-in properties closed. Do not accept callback predicates or
  production scheduler hooks.
- Make invalid scenario and replay inputs typed, including duplicate IDs,
  cross-domain descriptions, invalid bounds, disabled actions, unknown actions,
  unknown transaction IDs, and trailing choices.
- Keep Bun and genuine Node entrypoints on the same pure report path.

## Execution sequence

1. Reuse the accepted STM model API and freeze the scenario, bounds, schedule,
   trace, machine-projection, report, and typed diagnostic shapes.
2. Implement prefix replay and deterministic enabled-choice ordering. Keep live
   attempt custody local to one replay and discard it before another branch.
3. Implement breadth-first traversal, complete observable projection bytes,
   state/depth bounds, deadlock counting, and shortest property counterexamples.
4. Implement serial-history, publication-isolation, dependency wake, and
   terminal-progress observations without upgrading bounded evidence.
5. Add exact replay, canonical UTF-8 encoding, Bun/Node report entrypoints,
   focused positive/negative tests, and the frozen example golden.
6. Add the exact 0052 acceptance program. It runs the focused test command,
   predecessor 0014 and 0050 gates, invalid-input journeys, replay identity,
   wake distinction, bounded status, and Bun/Node byte parity.
7. Run no formatter, linter, typecheck, build, test, acceptance, or project-wide
   validation in this delegated worktree. The integrating lead runs the exact
   gates at the committed head.
8. Commission independent exact-head review and correct Critical/Important
   findings before changing this plan's evidence ledger or feature status.

## Acceptance commands

```bash
nix develop -c bun scripts/accept/0052-stm-schedule-explorer.ts
bun test tests/stm-schedule-explorer.test.ts
```

The exact acceptance program invokes the focused test command and predecessor
acceptance scripts. It also compares `src/stm-explorer/main-bun.ts` with genuine
Node `src/stm-explorer/main-node.ts` output and checks the checked-in example
golden.

## Evidence ledger

- 2026-08-02: frozen spec and accepted predecessor modules inspected at the
  exact base. The public model operations are sufficient; no private custody
  access or runtime changes are required.
- 2026-08-02: implementation, focused tests, example golden, and acceptance
  journey authored in the owned paths. Integration validation, independent
  review, and exact-head evidence remain pending.
- 2026-08-02: delegated worker intentionally did not run validation commands;
  the integrating lead owns those evidence categories.
- 2026-08-02: the integrating lead ran the exact acceptance program at integration head `6536fbe03fe2d25bc7e0776312092a04508c5c24`; it completed successfully. The gate exercised focused explorer behavior, predecessor contracts, canonical goldens, genuine Bun/Node parity, typecheck, strict lint, format, project-model validation, and generated-view checks.
- 2026-08-02: independent exact-head review accepted bounded-status honesty, snapshot custody, portable lint coverage, breadth-first shortest counterexamples, complete state projections, replay diagnostics, and committed-settlement isolation. Review is an authored assertion, not proof or runtime validation.

## Evidence boundaries

This feature emits bounded-model-check observations for the exact scenario,
properties, source revision, and bounds. It does not establish serializability
outside the explored state space, production scheduler behavior, liveness,
fairness, starvation freedom, lock freedom, host memory safety, or Effect
primitive correctness.

Status: accepted at integration head `6536fbe03fe2d25bc7e0776312092a04508c5c24`.
