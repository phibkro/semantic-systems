# Design spec 0013: bounded actor trace retention

Status: frozen for corrected implementation (revision 2)

Date: 2026-07-30

Problem owner: main research and integration agent

Revision 1: the actor journey schema version advances from 1 to 2 because the
trace field changes from a lifetime array to a bounded snapshot object. Keeping
version 1 would make an externally observable incompatible shape change
indistinguishable from the accepted 0012 document.

Revision 2: exact lifetime counters are represented in actor-private state as
native `bigint` and projected at the public snapshot boundary as canonical
non-negative base-10 strings. The initial implementation used JavaScript
`number`, which contradicts this contract's unbounded-lifetime exactness claim
after `Number.MAX_SAFE_INTEGER`. This corrects the still-unaccepted version-2
journey rather than allocating another schema version: schema version 1 is the
accepted 0012 append-only shape, while version 2 is the bounded shape defined
by this feature. The realization identity revision advances from `v1` to `v2`
because the counter representation is externally observable.

Supersedes one representation choice in design spec 0012: actor lifecycle
observations are retained in a declared bounded window rather than an
append-only lifetime array. It does not change mailbox ordering, delivery,
state ownership, transition, failure-stop, or inventory semantics.

## Problem and observed counterexample

The accepted actor runtime stores its trace in
`Ref<ReadonlyArray<ActorTrace>>` and appends with
`[...entries, entry]`. Every successful message retains `accepted`, `started`,
and `committed` entries until close. A long-lived actor therefore retains
three additional entries per successful reaction and repeatedly copies the
growing array.

The counterexample was found while exercising a resource-analysis tracer, then
independently confirmed by direct source inspection. The analyzer output is
discovery evidence, not authority for this contract.

## User journey

A developer runs a long-lived actor through many more successful messages than
its configured trace capacity. Delivery and final domain state remain
unchanged. Closing returns a chronological trace snapshot whose retained entry
count never exceeds the declared capacity, plus exact counters that disclose
how much earlier observation history was evicted.

The developer can distinguish bounded retained observations from complete
history. No output calls a bounded window a durable log, replay source, or
complete audit trail.

## Falsifiable claim

For an actor with declared trace capacity `C > 0`, the actor retains at most
`C` lifecycle entries at every suspension point. Appending one observation
atomically retains the newest `min(C, totalObserved)` entries in chronological
order and increments exact total and eviction counters.

Processing `N` successful messages may increase cumulative work, but cannot
increase retained trace stock beyond `C`. This is runtime validation of the
implementation and does not prove host memory bounds, garbage-collector
behavior, or asymptotic complexity.

## Frozen deep-module contract

### Explicit retention budget

`ActorDefinition` gains one required `traceCapacity` field. It is independent
of `mailboxCapacity`: mailbox capacity bounds accepted work awaiting
completion, while trace capacity bounds retained observations. Deriving one
silently from the other would conflate separate resource contracts.

Spawn snapshots and validates `traceCapacity` with the other definition
fields. It must be a positive safe integer. Invalid capacity fails with
`InvalidActorDefinition` before a worker or mutable actor resource is created.
Later mutation of the caller's definition object cannot change the budget.

The first bounded realization does not choose a universal safe capacity.
Configuration owns that operational choice; the runtime owns faithful
enforcement and disclosure.

### Snapshot vocabulary

`ActorRef.close` returns an immutable `ActorTraceSnapshot` rather than a bare
array:

- `capacity` — the validated declared trace capacity;
- `entries` — retained lifecycle entries, oldest to newest;
- `totalObserved` — canonical non-negative base-10 string containing the exact
  number of lifecycle observations ever appended;
- `evicted` — canonical non-negative base-10 string containing the exact count
  removed from the retained window;
- `acceptedCount` — canonical non-negative base-10 string containing the exact
  number of accepted envelopes; and
- `completeHistory` — true exactly when `evicted === 0`.

The invariant is:

```text
entries.length = min(capacity, integer(totalObserved))
integer(evicted) = integer(totalObserved) - entries.length
completeHistory = (integer(evicted) = 0)
```

`integer` above denotes exact mathematical interpretation of the canonical
decimal string, not conversion through JavaScript `number`. The `closed`
trace entry uses the same canonical string representation for its
`acceptedCount`. Native `bigint` does not cross the public boundary because
ordinary `JSON.stringify` rejects it; a JSON number does not cross the boundary
because it would silently round at sufficiently long lifetimes.

The public TypeScript counter type is opaque and only actor-owned construction
can produce it; plain authored strings, including negative strings, are not
assignable. This is API custody rather than a cryptographic or runtime proof:
untyped consumers observe ordinary JSON strings and must validate external
documents at their own boundary.

The final `closed` observation participates in the same retention policy and
is the newest retained entry. Capacity one therefore returns only `closed`,
with earlier observations represented by counters rather than fabricated
entries.

Repeated close returns the same settled snapshot. Scope finalization uses the
same close path. Callers receive immutable values and cannot mutate the
actor-owned retention state.

`acceptedCount` is held in the same actor-private trace state as
`totalObserved`. Acceptance performs one pure atomic state transition that
appends exactly one `accepted` observation, increments `totalObserved` once,
and increments `acceptedCount` once. Generic lifecycle observation transitions
increment `totalObserved` but never `acceptedCount`. The final `closed` entry
and public snapshot both derive their accepted count from that state; neither
receives a separately authored counter.

### Retention semantics

The private representation may be an immutable bounded sequence or ring
buffer. It must:

1. preserve chronological order of retained entries;
2. evict exactly the oldest entry when full;
3. update entries and counters atomically;
4. perform no operation proportional to lifetime observation count after the
   window is full; and
5. import no ambient runtime or platform authority into the portable actor
   closure.

Copying at most the configured capacity is acceptable for this first
correction. Benchmark or formal complexity claims are not.

### Existing semantics remain fixed

The following design-spec 0012 contracts remain unchanged:

- bounded mailbox acceptance and interruptible backpressure;
- receiver-local sequence order;
- actor-private structured-clone state ownership without shared memory;
- exactly one transition execution per started envelope;
- commit-before-receipt ordering;
- failure-stop linearization and visible failure of preaccepted work;
- graceful close and post-close rejection;
- inventory event and replay equivalence; and
- Bun/Node normalized observation equivalence.

Existing bounded journeys configure a capacity large enough to retain their
complete expected trace. Tests that need full history must assert
`completeHistory`; they may not assume it from the absence of an error.

Message and receipt `sequence` remains the JavaScript safe-integer-limited
representation accepted in design spec 0012. It is distinct from the exact
lifetime counters corrected here. This feature neither claims that a single
actor can process more than `Number.MAX_SAFE_INTEGER` messages while preserving
0012 sequence uniqueness nor silently upgrades that separate representation;
the counter boundary oracle injects state rather than fabricating such a run.

### Identity and evidence

The actor realization identity changes because retention, close result shape,
and observation completeness are meaning-bearing representation contracts.
Its identity input gains:

```json
{
  "trace_retention": "declared_bounded_window_with_exact_eviction_counters.v2"
}
```

The observable actor journey includes the declared capacity, snapshot
counters, and `completeHistory`. Runtime identity normalization remains
presentation-only. Its `schema_version` is 2; version 1 remains the accepted
0012 append-only observation shape and is not emitted by this realization.

Tests and bounded executions are not upgraded to proof. A future accepted
resource analyzer may report the corrected steady state as runtime-checked or
derived from authenticated model inputs, but this feature does not make that
an authority for actor semantics.

## Oracle-first counterexamples

Before implementation, retain executable red observations for:

1. the existing append-only trace exceeding a small declared capacity;
2. negative, zero, fractional, unsafe-integer, missing, or later-mutated trace
   capacity;
3. eviction of the newest rather than oldest entry;
4. retained entries returned out of chronological order;
5. counters claiming complete history after eviction;
6. capacity one failing to retain the final close observation;
7. repeated close returning different counters or entries;
8. caller mutation of a returned snapshot affecting a later observation;
9. transition failure, interruption, or preaccepted pending failure breaking
   retention invariants;
10. a bounded-retention change altering delivery receipts, domain events,
    replayed state, or mailbox sequence;
11. a lifetime-sized operation remaining on the post-warm-up append path; and
12. Bun and Node producing different normalized snapshots;
13. exact counters silently rounding when incremented across
    `Number.MAX_SAFE_INTEGER`; and
14. a public snapshot requiring nonstandard JSON handling for native `bigint`.

## Acceptance

The feature is accepted only when:

1. trace capacity is required, snapshotted, and fail-closed validated;
2. retained entries never exceed capacity across success, failure, close, and
   scope finalization;
3. a run substantially longer than capacity reports exact total and eviction
   counters and retains the newest chronological window;
4. the final close observation is retained, including at capacity one;
5. repeated close is idempotent and returns one settled snapshot;
6. `completeHistory` is true exactly when no entry was evicted;
7. returned data cannot mutate actor-owned retention state;
8. the post-warm-up append path contains no lifetime-sized trace operation;
9. all design-spec 0012 ownership, delivery, failure-stop, and inventory
   equivalence gates remain green;
10. the actor realization identity binds the new retention contract;
11. Bun and genuine Node produce byte-equivalent normalized bounded journeys;
12. the portable actor import closure remains free of concrete runtime and
    ambient platform authority; and
13. a bounded injected-state oracle crosses the safe-integer boundary through
    the same pure accepted-envelope transition used exactly once per production
    acceptance, distinguishes generic observation from acceptance, and makes a
    missing or double accepted-count increment fail; and
14. reports distinguish test, static analysis, runtime validation, analyzer
    output, review, and assumption.

## Executable acceptance commands

```bash
bun test tests/actor-trace-retention.test.ts tests/actor-runtime.test.ts
node --test tests/actor-runtime-node.test.ts
bun run typecheck
bun run lint
bunx oxfmt --check src/actor tests/actor-trace-retention.test.ts scripts/accept/0013-bounded-actor-trace-retention.ts
bun scripts/accept/0013-bounded-actor-trace-retention.ts
git diff --check
```

The exact acceptance program also runs the established 0012 acceptance,
inventory regressions, model validation, and generated-view drift check.
Missing required tooling fails.

## Kill criteria

- Bounded retention requires exposing actor-private mutable state.
- Correct delivery or failure-stop semantics require complete lifetime trace
  retention.
- The runtime cannot disclose eviction without presenting a bounded window as
  complete history.
- The correction changes inventory theory or event semantics.
- Portable actor code requires platform-specific memory or process APIs.

## Non-goals

- Durable audit logging, event sourcing, replay recovery, or remote export.
- Dynamically resizing a live actor's trace budget.
- Per-entry byte accounting or a whole-process memory limit.
- Global trace aggregation across actors.
- Compression, sampling, telemetry backends, or OpenTelemetry integration.
- Benchmark, big-O proof, heap profiling, fuzzing, or model checking.
- Revising the design-spec 0012 numeric message/receipt sequence
  representation.

## Semantic diff

This feature replaces unbounded actor-local observation retention with an
explicit bounded capability contract and honest eviction evidence. It changes
the actor realization identity and close observation shape, but no theory,
domain transition, mailbox order, state ownership, delivery, or failure-stop
claim.
