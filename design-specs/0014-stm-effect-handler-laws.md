# Design spec 0014: STM effect and handler laws

Status: frozen for tracer implementation

Date: 2026-07-30

Design-Lens-Version: open-semantic-system-v1

## Open semantic system design lens

### Boundary and warranted state

The model owns transaction-local journals, read and write sets, retry
dependencies, staged commit actions, deterministic schedules, and verdicts.
Effect's runtime, clocks, storage, threads, and optimized STM remain
environmental.

### Semantic inputs

Programs supply typed reads, writes, alternatives, retry, and staged action
values over one transaction domain. A deterministic schedule supplies
conflict, wake-up, and commit observations.

### Semantic outputs

The model derives commit, retry, conflict, rollback, rejection, and staged
action results. Publishing writes and executing commit-only actions are
distinct effects admitted only after successful validation.

### Effect protocols and uncertainty

Attempt failure, explicit retry, validation conflict, commit failure, and
post-commit action failure remain distinct outcomes. A schedule timeout does
not prove deadlock or absence of another valid execution.

### Components and orthogonal structures

Journal semantics, retry dependency tracking, alternatives, validation,
publication, staged actions, schedule exploration, and runtime realization are
independent structures. The reference model does not inherit semantics from
an implementation API surface.

### Bounded autonomy and resources

Cells, transactions, attempts, schedules, retry dependencies, and staged
actions are bounded by each scenario. Exploration terminates at explicit
bounds and reports uncovered schedules rather than upgrading them to proofs.

### Evidence, assumptions, and unsupported claims

Executable laws, counterexamples, property tests, and bounded schedules retain
their evidence categories. They do not prove serializability for arbitrary
programs, fairness, or equivalence with an optimized runtime.

## Problem

Semantic Systems names STM as a library effect, but the current design does not
yet give retry, rollback, alternatives, publication, or commit-only effects a
small executable law boundary. Without that boundary, a realization can call
an operation "transactional" while repeating irreversible effects, publishing
part of a write set, waking on unrelated state, or upgrading a bounded schedule
probe into a serializability proof.

Effect v4 beta.102 already supplies `Effect.tx`, `Effect.txRetry`, and `TxRef`.
Its installed implementation is useful realization prior art: the outer
transaction owns a versioned journal, nested `tx` reuses it, conflicts rerun the
body, and explicit retry waits on observed references. It also accepts ordinary
Effect operations in the retryable body. Semantic Systems therefore cannot
adopt the API surface as its theory: arbitrary attempt effects may repeat even
when transactional writes remain atomic.

This feature freezes the semantic contract and builds a deterministic
executable model. It does not implement the optimized STM runtime or inventory
realization. Its accepted or rejected result informs the still-design
`decision.stm-library`; it does not require that decision to be accepted before
the experiment that supplies its evidence.

## Felt journey

A developer describes two inventory transactions over one local transaction
domain. Each transaction reads two cells, stages writes, and emits typed action
values to run only after commit.

The deterministic model:

1. runs a non-conflicting transaction and atomically publishes its complete
   write set;
2. forces a conflict after an attempt reads but before it validates;
3. discards that attempt's writes and actions, reruns it, and commits once;
4. suspends an explicit retry on exactly the references it observed;
5. ignores an unrelated reference change and wakes after a relevant change;
6. evaluates a retry alternative without retaining the failed branch's writes
   or actions;
7. returns one ordered commit-action log after successful publication; and
8. reports the exact schedule bound, assumptions, claims, and unsupported
   guarantees.

The same message, state, event, and action values must remain suitable for the
later inventory STM realization. This tracer does not silently redefine the
inventory theory.

## Deep-module boundary

The semantic surface is a pure transaction description parameterized by one
transaction-domain identity:

```text
Txn<Domain, Error, Value, CommitAction, AbortAction>

read(TVar<Domain, A>) -> Txn<Domain, never, A, never, never>
write(TVar<Domain, A>, A) -> Txn<Domain, never, Unit, never, never>
retry() -> Txn<Domain, never, Never, never, never>
abort(error, actions) -> Txn<Domain, Error, Never, never, AbortAction>
afterCommit(action) -> Txn<Domain, never, Unit, CommitAction, never>
orElse(left, right) -> Txn<Domain, Error, Value, CommitAction, AbortAction>
```

The exact TypeScript encoding is implementation freedom. The following
properties are not:

- a transaction description contains data and pure composition, not an opaque
  Effect or native Promise;
- a `TVar` belongs to exactly one transaction domain;
- crossing transaction domains is rejected before an attempt;
- public constructors cannot manufacture a committed outcome or evidence
  category;
- the handler, not the transaction body, owns attempt journals, validation,
  publication, retry registration, and lifecycle classification; and
- commit and abort actions are inert typed values. A separate interpreter owns
  their external effects.

## Canonical attempt state

One attempt owns:

```text
startVersions : TVar -> Version
readSet       : TVar -> Version
writeSet      : TVar -> Value
commitActions : ordered list of values
abortActions  : ordered list of values
result        : success | retry | typed abort
```

Reads observe the attempt's staged write first, otherwise the store value and
version. Writes change only the attempt journal. Action append changes only the
corresponding inert action log.

`Version` is an exact non-negative logical counter in the reference model.
Public deterministic reports project exact counters without JSON rounding.

## Handler laws

### L1. Attempt isolation and rollback

Before successful publication, no staged write is visible outside its attempt.
Retry, conflict, typed abort, interruption before publication, or defect
discards the complete write set and commit-action log. No partial store update
is observable.

### L2. Validation and atomic publication

An attempt validates every observed version against one atomic store state. If
any differs, it publishes nothing and starts a fresh attempt from the original
transaction description. If all agree, the complete write set becomes visible
as one publication and each changed cell receives a fresh exact version.

A read-only successful transaction still validates its read set. Writes to an
unread cell record the version needed to prevent blind-write lost updates.

### L3. Explicit retry and dependency wake-up

`retry` publishes nothing and suspends on the distinct TVars read by that
attempt. A change to none of those dependencies does not make the transaction
ready. A change to any one makes it ready to start a fresh attempt.

Retry with an empty dependency set is a visible indefinite suspension. The
model does not fabricate a timer, poll, fairness, or progress guarantee.

### L4. Re-execution

Conflict and dependency wake-up rerun the transaction description. They never
resume a captured callback continuation containing affine or irreversible
state. Attempt count is observable diagnostic data, not part of the domain
result.

### L5. Retry alternatives

`orElse(left, right)` handles retry only:

- left success or typed abort is the result; right is not evaluated;
- left retry discards its staged writes and actions before right starts from
  the branch input journal;
- right success or typed abort discards the left retry dependency set; and
- when both branches retry, the suspension dependency set is the union of both
  branch read sets.

Typed abort is not retry and is not caught by `orElse`.

### L6. Commit-only and permanent-abort actions

Commit actions accumulated by the successful validated attempt are returned in
program order only after atomic publication. Failed attempts contribute none.
Abort actions are returned only for one permanent typed abort; retry and
conflict contribute none.

The reference handler returns action values and does not execute them. This
establishes separation and exact log membership, not crash-safe exactly-once
external delivery. Durable execution requires an outbox or stronger
realization and explicit evidence.

### L7. Nesting

Nested atomic interpretation in the same domain composes into the outer
journal and has no independently visible commit. A nested transaction in
another domain is rejected rather than approximated as distributed STM.

### L8. Resource capture

A retryable description may observe immutable values and logical transactional
tokens. It may not directly acquire, consume, release, or close affine
resources. Ownership transfer is represented as a staged state change plus a
post-commit action value. TypeScript cannot prove general linearity; the tracer
must expose that limitation instead of claiming an ownership proof.

### L9. History claim

For bounded model schedules, each emitted committed history must be equivalent
to at least one serial ordering of the same committed transactions and must
contain no aborted or retried attempt as a commit. This is bounded
model-checking/runtime-validation evidence. It is not a proof that an arbitrary
runtime is serializable.

### L10. Progress and fairness

Atomicity and serializability do not imply lock freedom, starvation freedom,
bounded retries, or fairness. The reference model reports no progress claim.

## Evidence vocabulary

The tracer report keeps these distinct:

- `derived` — pure consequences of the authenticated model input;
- `bounded_model_checked` — all schedules within the declared finite bound;
- `runtime_validated` — an executable realization probe;
- `static_analysis` — import, type, or authority restrictions;
- `assertion` — reviewer or operator statement;
- `assumption` — store atomicity, scheduler, or platform premise; and
- `unsupported` — claim the tracer does not establish.

No category may relabel itself as another. Effect v4 behavior observed from the
pinned source or a live probe is realization evidence, not authority for these
laws.

## Deterministic model boundary

The first executable model has exactly one local transaction domain, at least
two typed cells, two transactions, and an explicit finite scheduler trace. It
models:

- begin attempt;
- read and stage write;
- append inert action;
- validate;
- publish or conflict;
- explicit retry registration;
- dependency change and wake-up; and
- `orElse` branch isolation.

The scheduler does not use ambient time or randomness. An exploration report
declares maximum transactions, attempts, cells, and steps. Schedules and
counterexamples are byte-stable under Bun and Node after runtime-label
normalization.

## Oracle-first counterexamples

Retain executable red observations for:

1. one transaction exposing its first write before its second;
2. a conflicted attempt leaking a staged write;
3. a conflicted or retrying attempt leaking a commit action;
4. a successful transaction emitting one commit action twice;
5. validation ignoring a stale read;
6. a blind write overwriting a concurrent write without conflict;
7. retry waking after only an unrelated cell changes;
8. retry failing to wake after an observed cell changes;
9. `orElse` retaining the left retry branch's writes or actions;
10. two retrying alternatives waiting on only one branch's dependencies;
11. typed abort being treated as retry;
12. cross-domain composition reaching an attempt;
13. a non-serializable committed history being accepted;
14. an opaque Effect, Promise, clock, random source, console, network, or
    filesystem authority entering the portable semantic closure; and
15. a report hiding the schedule bound or upgrading bounded exploration to
    proof.

## Acceptance

`bun scripts/accept/0014-stm-effect-handler-laws.ts` must deterministically
establish:

1. a dedicated STM law suite and pure reference model exist;
2. all laws L1–L10 have named positive and negative observations;
3. two-cell/two-transaction conflicts never partially publish;
4. the exact same transaction description is rerun after conflict and wake-up;
5. retry dependency and `orElse` union behavior match this contract;
6. commit and abort action logs contain values from exactly one terminal
   attempt and are not executed by the model;
7. nested same-domain transactions share one journal and cross-domain nesting
   rejects;
8. bounded histories are checked against serial orderings and a deliberately
   non-serializable history is rejected;
9. model bounds, assumptions, evidence categories, and unsupported progress
   guarantees are present in the canonical report;
10. Bun and genuine Node produce byte-identical normalized reports;
11. the portable STM closure imports only Effect and local portable modules and
    reaches no ambient runtime authority;
12. existing inventory, actor, resolver, and project-model gates remain green;
    and
13. the generated project graph records this frozen contract without treating
    its future runtime or inventory realization as complete.

## Kill or redesign criteria

Stop before implementing the runtime if any holds:

- commit-only actions require executing arbitrary callbacks during an attempt;
- retry dependencies cannot be observed without ambient polling;
- the model cannot distinguish typed abort, retry, conflict, and defect;
- common two-cell composition requires an unbounded or representation-specific
  API;
- bounded schedule results cannot be reproduced from a canonical input trace;
- the only useful result is equivalent to a direct syntax lint; or
- the Effect v4 candidate cannot expose its assumptions and repeated-attempt
  effect boundary without falsely claiming semantic conformance.

## Non-goals

- optimized parallel STM;
- distributed transactions or cross-domain atomicity;
- the inventory STM realization;
- durable outbox delivery;
- automatic source analysis of arbitrary Effect programs;
- general affine/linear proof in TypeScript;
- starvation freedom, lock freedom, fairness, or termination;
- exhaustive model checking beyond declared finite bounds; and
- changing inventory theory, actor semantics, or `theory-norm-v0`.

## Prior art and provenance posture

Evaluate the pinned Effect v4 transaction implementation and its MIT license,
Harris et al.'s composable memory transactions, Haskell STM retry/`orElse`,
transactional outbox techniques, and existing deterministic-simulation
patterns before hand-writing infrastructure. Reuse only license-compatible
code or techniques with exact source and license provenance. No prior art
defines Semantic Systems transaction meaning.
