# Active plan 0047: structured-concurrency law tracer

Canonical frozen contract:
[`design-specs/0047-structured-concurrency-law-tracer.md`](../../design-specs/0047-structured-concurrency-law-tracer.md).
This execution record cannot redefine that contract.

Status: independent-review corrections pass focused gates; final full acceptance pending

Owner: delegated structured-concurrency engineer in isolated worktree

## Dependencies

- accepted 0042 user-defined algebra frontier;
- pinned Effect v4 beta.102, TypeScript 7.0.2, Bun 1.3.13, Oxfmt, and Oxlint;
- existing strict Schema, canonical JSON, immutable custody, Node parity, and
  fast-check patterns; and
- 0044 scope vocabulary as design evidence only, not an implementation import.

## Owned paths

- `design-specs/0047-structured-concurrency-law-tracer.md`
- `plans/active/0047-structured-concurrency-law-tracer.md`
- `model/work/structured-concurrency-law-tracer.json`
- `src/structured-concurrency/**`
- `tests/structured-concurrency-law-tracer.test.ts`
- `tests/structured-concurrency-law-tracer-node.test.ts`
- `scripts/accept/0047-structured-concurrency-law-tracer.ts`
- minimal 0042 algebra-frontier fact and focused test update
- derived generated project views

Forbidden: kernel or surface syntax, actor messaging, STM, resource-lifecycle
semantics, generic scheduler or fiber registry, external time/network, true
multishot continuations, deployment, operator-owned `AGENTS.md`, or committed
Python/shell programs.

## Implementation posture

- Reuse pinned Effect Scope/Fiber/FiberSet/Deferred/Queue/Ref/Exit through one
  thin local adapter and reuse installed fast-check.
- Keep the pure oracle independent from the Effect realization.
- Make dispatch, cancellation delivery, and replay boundaries explicit.
- Prefer the smallest direct implementation; do not create a scheduler,
  promise queue, cancellation library, task runtime framework, or shrinker.

## Execution sequence

1. Freeze the narrow contract, plan, and work item.
2. Implement schemas, pure oracle, Effect realization, comparison, rederivation,
   immutable custody, and canonical encoding.
3. Add example, property, adversarial, and genuine Node parity tests.
4. Update only the 0042 concurrency observation supported by accepted evidence.
5. Run exact acceptance and the clean complete repository gate.
6. Commit the exact candidate and return it for independent review.

## Acceptance command

```bash
bun scripts/accept/0047-structured-concurrency-law-tracer.ts
```

## Evidence ledger

- 2026-08-01: 0042 records structured-concurrency laws and an unresolved
  resumption-storage obstruction but no accepted local law tracer.
- 2026-08-01: 0044 informed shared scope vocabulary; 0047 deliberately does
  not import its resource transitions or conflate task and cleanup ownership.
- 2026-08-01: installed Effect v4 beta.102 exposes the required scoped FiberSet,
  Deferred, bounded Queue, Ref, Fiber, and Exit APIs; no dependency is needed.
- 2026-08-01: implementation reused repository strict Schema, canonical JSON,
  immutable-custody, Node parity, algebra-frontier, and fast-check patterns. The
  pinned Effect primitives supply lifecycle and coordination; a generic
  scheduler, promise queue, cancellation library, fiber registry, or custom
  shrinker would enlarge the feature without improving its frozen laws and was
  intentionally rejected.
- 2026-08-01: initial candidate `87546ba` exact acceptance passed 8 focused Bun tests with 225
  assertions, 64 seeded generated programs, genuine Node 1/1, all nine 0042
  frontier tests, TypeScript 7 Effect diagnostics, Oxlint, Oxfmt, strict model
  validation, deterministic generated views, and the complete repository suite
  with 902 passes, one configured external-oracle skip, zero failures, and
  20,969 assertions.
- 2026-08-01: the 0042 fact advances only the structured-concurrency userland
  model to available. Surface and kernel remain deferred; production scheduler,
  fairness, external replay, and resumption-storage claims remain unsupported.
- 2026-08-01: independent review found that an event acknowledgement could wait
  after an unexpected driver exit. The correction races acknowledgement against
  driver completion, gives an already-completed acknowledgement tie precedence,
  and maps loss of the sole producer to `adapter.driver-exited`; focused tests
  cover both the exit and live-driver paths. Review also tightened the 0042
  disclosure and removed transient null writes during ownership transfer.
- 2026-08-01: the bounded correction candidate passed nine 0047 Bun tests and
  nine 0042 seam tests (18 total, 674 assertions), genuine Node parity 1/1,
  TypeScript 7 Effect diagnostics, Oxlint, focused Oxfmt, strict model
  validation, and deterministic generated views. The full repository suite was
  intentionally not rerun at this correction stage under the integration
  lead's instruction.
