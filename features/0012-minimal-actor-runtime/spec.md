---
format: semantic.feature-artifact/v1
feature_id: 0012-minimal-actor-runtime
kind: specification
legacy_entity_id: work.actor-runtime
---
# Design spec 0012: minimal actor runtime

Status: frozen for the first actor tracer

Date: 2026-07-30

Problem owner: main research and integration agent

Revision 1: ownership counterexamples invalidated the original assumption that
an opaque `ActorRef` alone prevents mutable aliases. The frozen boundary now
requires structured-clone transfer for initial state, accepted messages,
committed state, and receipt events. This strengthens the stated ownership
claim without changing inventory semantics, mailbox order, or runtime support.

Revision 2: exact-head review invalidated unrestricted structured-clone
transfer because Node preserves `SharedArrayBuffer` backing while Bun copies it.
Shared-memory values are now outside the v0 value subset. Spawn also snapshots
the validated definition fields instead of retaining the caller's definition
container. Scenario freshness inputs are derived from the prepared transition
seam, not from every authored step.

Revision 3: exact-head review found that rendering a caller-controlled clone or
traversal failure could itself throw and escape the typed channel. Ownership
boundary diagnostics now use total cause rendering; even hostile Proxy and
error accessors must produce the declared typed failure rather than an Effect
defect.

Revision 4: exact-head review found the realization identity underbound after
the ownership revisions. The identity input now includes the value-transfer
subset, definition-field custody, and typed failure-rendering contracts so an
observably different ownership representation cannot retain the old identity.

Revision 5: concurrency review found transition-failure shutdown was exposed
after the current failed receipt. The actor now linearizes its failed state
under the acceptance gate before completing that receipt or releasing
capacity. A send begun after observing the failure is rejected as
`ActorClosed`; only envelopes genuinely accepted earlier fail as pending work.

Semantic frontier: isolated state ownership, typed actor messaging, mailbox
ordering, and inventory-realization equivalence

## User journey

A developer runs one bounded inventory scenario through a single actor under
both Bun and Node. The output identifies the actor realization, records the
accepted mailbox order, returns one typed delivery receipt and domain event per
message, reconstructs the final inventory state by replaying those events, and
compares the observation with the accepted pure inventory oracle.

The actor reference exposes messaging and lifecycle operations, but never the
actor's mutable state. Closing the actor rejects later sends with a typed error.

## Falsifiable semantic claim

For one scoped actor, every message accepted into its mailbox receives a stable
monotonic sequence number and is processed at most once in that acceptance
order. Exactly one transition runs at a time over actor-private state. A
successful transition commits its next state and returns its domain event in
one delivery receipt. The inventory actor produces the same domain-event
sequence and replayed final state as the pure reference realization for the
same initial state, messages, and deterministic fresh-identifier inputs.

This first tracer does not claim durable delivery, crash recovery, fairness,
distributed ordering, exactly-once external effects, or formal proof of
ownership.

## Values

- The actor runtime realizes an existing semantic program; it does not redefine
  inventory rules.
- Mutable state has one owner and does not cross the actor boundary.
- Messages and events remain ordinary typed values.
- Mailbox and lifecycle guarantees are stated narrowly and observed directly.
- Runtime failures remain distinct from domain rejection events.
- Bun and Node are live-layer choices around one portable actor core.
- An execution trace is runtime validation, not proof of actor laws.

## Frozen deep-module contract

### Portable actor vocabulary

The first tracer exposes a small portable module:

- `ActorDefinition<Message, State, Event, Requirements>` — initial state plus
  a transition from one message and private state to an Effect producing the
  next state and one event;
- `ActorRef<Message, Event>` — an opaque capability supporting `send` and
  graceful `close`, with no state getter, state reference, or unsafe escape;
- `DeliveryReceipt<Event>` — actor identity, mailbox sequence, and emitted
  event;
- `ActorRuntime` — a scoped capability that spawns actors and supervises their
  mailbox workers;
- typed `ActorClosed`, `ActorMessageNotTransferable`,
  `ActorTransitionFailed`, and invalid-definition errors; and
- a machine-readable trace vocabulary for accepted, started, committed,
  transition-failed, and closed lifecycle observations.

TypeScript structural typing is not treated as a formal uniqueness proof.
State confinement is established for this implementation by the public API,
module closure, adversarial tests, and review.

The v0 transfer boundary is the host's standard structured-clone algorithm.
Initial state is cloned before worker creation. Each message is cloned before
mailbox acceptance, so a clone failure consumes no capacity or sequence and
fails with `ActorMessageNotTransferable`. The transition receives a disposable
clone of current state rather than the actor's stored state. Successful
transition state and event values are cloned separately before commit,
preventing either the transition closure or receipt holder from retaining a
mutable alias to actor state.
Non-cloneable or shared-memory initial state is an invalid definition.
Non-cloneable or shared-memory messages fail before acceptance. Equivalent
transition output is a typed transition failure and stops that actor. This
deliberately limits v0 values to the structured-cloneable subset excluding
`SharedArrayBuffer` and views backed by it; it is runtime validation of
confinement, not proof of affine ownership.

Spawn reads and validates actor identity, mailbox capacity, transition
function, and initial state once before its first suspension. The worker keeps
those actor-owned field snapshots and never rereads the mutable definition
container. The runtime cannot prevent a transition function from closing over
external mutable values; such captures are explicit actor-definition
assumptions rather than actor-state ownership.

### Mailbox semantics

`send` has two distinct moments:

1. acceptance assigns the next receiver-local sequence and enqueues one
   envelope; and
2. completion resolves only after the transition commits and its event is
   available in the receipt.

The actor processes accepted envelopes in ascending sequence order. Sequential
call order therefore produces receiver FIFO. Concurrent callers are ordered by
the runtime's atomic mailbox-acceptance operation; the tracer records that
chosen order and makes no stronger global or per-sender scheduling claim.

Backpressure is explicit. The first tracer uses a declared bounded mailbox.
When capacity is unavailable, `send` suspends interruptibly rather than
dropping or duplicating a message. Interruption before acceptance produces no
sequence or transition. Interruption after acceptance does not cancel the
actor-owned envelope; the actor still processes it, while the caller may stop
observing the receipt.

### Transition and commit boundary

Only the mailbox worker may hold or replace actor state. For each accepted
envelope it:

1. copies the current private state into a transition-owned snapshot;
2. interprets the typed transition Effect once;
3. obtains one candidate next state and one domain event;
4. commits the state and event together in actor memory;
5. appends a committed trace observation; and
6. completes the delivery receipt.

Domain rejection is an ordinary inventory event and still commits the
unchanged state. A typed transition failure is not a domain rejection: it
records failure, stops that actor, fails the current receipt, and rejects
future sends. Already accepted but unprocessed envelopes fail visibly; they
are never reported as processed.

Entering the failed state is linearized before the current failed receipt is
made observable. Therefore, observing `ActorTransitionFailed` establishes that
subsequent `send` calls cannot be accepted. This failure-stop ordering is part
of the actor realization identity.

External publication is outside this commit boundary. The first tracer returns
events as values and reconstructs state through the accepted replay function.
It does not claim transactional delivery to a database, broker, log, or other
actor.

### Lifecycle and scope

Actors are resources owned by an Effect scope. Graceful `close` stops accepting
new messages, drains envelopes already accepted, records one close observation,
and waits for worker termination. Repeated close is idempotent. Scope release
performs the same bounded cleanup. A post-close send fails with `ActorClosed`;
it cannot hang or enter history.

The runtime may use Effect's portable queue, deferred, fiber, scope, and
ref primitives. Direct Bun, Node, filesystem, process, clock, random, network,
or environment authority is forbidden from the portable actor modules.

### Inventory actor adapter

The adapter reuses the accepted inventory `Message`, `State`, `Event`,
`referenceTransition`, and `replay` contracts.

Fresh reservation identifiers are supplied through a replaceable
`FreshIdentifier` Effect capability. An identifier is requested only after the
inventory guards establish that a reservation could otherwise succeed, matching
the frozen inventory rule that invalid quantities do not request freshness.
The bounded scenario supplies a deterministic identifier sequence derived in
step order by `prepareReferenceTransition`. An authored `fresh_id` attached to
a guarded invalid or insufficient reservation is ignored because that step
cannot request freshness; the next eligible reservation receives its own
authored identifier.

The adapter must not copy the inventory transition rules into the actor
runtime. A small refactor may expose the existing transition's
fresh-identifier request seam, but the pure realization and all existing
oracles must remain byte-equivalent.

### Observable result

The tracer emits canonical JSON containing:

- schema and observation version;
- actor-runtime realization identity;
- exact inventory theory and pure-reference realization identities;
- declared mailbox capacity and guarantee labels;
- accepted and completed sequence order;
- delivery receipts and domain events;
- replayed final state;
- pure-reference events and final state;
- equality booleans for events and final state;
- Bun or Node live-layer identity;
- runtime-validation evidence limits; and
- explicit unsupported guarantees.

Runtime identity is presentation metadata and does not change the bounded
semantic result. After normalizing that field, Bun and Node observations must
be byte-equivalent.

The realization identity binds ordering, delivery, backpressure, lifecycle,
failure-stop ordering, inventory transition, value transfer excluding shared
memory, definition snapshot custody, and total typed transfer-failure
rendering. A change to any of those representation contracts requires a new
identity even when the bounded inventory events remain equal.

## Oracle-first counterexamples

Before implementation, executable tests must observe red for:

1. two sends completing without a real mailbox worker;
2. reversed, duplicated, or skipped accepted sequence numbers;
3. a public state getter, retained mutable definition container, or retained
   alias to initial state, accepted messages, committed state, or returned
   events;
4. shared-memory, hostile Proxy, or otherwise non-transferable actor values
   crossing a boundary without the declared typed failure, including a defect
   thrown while rendering their failure cause;
5. post-close send acceptance or nontermination;
6. close discarding an already accepted envelope;
7. transition failure being rendered as a domain rejection or observed before
   future mailbox acceptance is disabled;
8. an envelope accepted before failure being reported as processed rather than
   failed pending work;
9. a caller interruption after acceptance cancelling actor-owned work;
10. requesting a fresh identifier for an invalid reservation;
11. invalid or insufficient scenario steps shifting the deterministic
    identifier received by a later eligible reservation;
12. actor events or replayed state diverging from the pure oracle;
13. runtime-specific authority imported by the portable actor closure; and
14. Bun and Node producing different normalized observations.

Each oracle must fail for its intended semantic reason before the conforming
implementation is accepted.

## Acceptance

The first actor tracer is accepted only when:

1. the public actor reference exposes no actor-state value or mutable alias;
2. one scoped worker is the only state transition owner;
3. sequential sends are accepted and completed in receiver-FIFO order;
4. every successful accepted message has exactly one sequence, transition,
   event, and receipt;
5. bounded-mailbox backpressure suspends without drop or duplication;
6. interruption before acceptance leaves no trace, while interruption after
   acceptance cannot cancel actor-owned work;
7. graceful close drains accepted work, is idempotent, and rejects later sends;
8. typed transition failure stops only the failing actor and remains distinct
   from domain rejection; failed state is established before the current
   failed receipt, future sends reject as closed, and genuinely preaccepted
   envelopes fail visibly without starting;
9. invalid inventory reservations do not consume a fresh identifier;
10. initial state, accepted messages, committed state, and returned events do
    not share caller-mutable aliases;
11. actor definition fields are captured once and later container mutation
    cannot change identity, capacity, or transition behavior;
12. shared-memory, hostile Proxy, and otherwise non-transferable values fail at
    their declared typed boundaries under both Bun and Node; rendering an
    ownership-boundary cause is total and cannot upgrade the failure to a
    defect;
13. the inventory actor event sequence equals the pure reference sequence,
    including a guarded-reservation freshness-alignment counterexample;
14. the actor realization identity binds every meaning-bearing ownership,
    transfer, and failure-stop representation contract;
15. replay of actor events equals both actor and pure final observations;
16. the trace states only the frozen ordering, delivery, and lifecycle
    guarantees;
17. Bun and Node live layers produce byte-equivalent normalized bounded
    observations;
18. the portable actor core's transitive imports contain no concrete runtime
    or ambient platform authority;
19. existing inventory resolution, evidence, execution, and generated-view
    oracles remain green; and
20. no output upgrades tests, runtime validation, static analysis, or review
    into proof.

## Executable acceptance commands

```bash
bun test tests/actor-runtime.test.ts
node --test tests/actor-runtime-node.test.ts
bun run typecheck
bun run lint
bunx oxfmt --check src/actor tests/actor-runtime.test.ts scripts/accept/0012-minimal-actor-runtime.ts
bun scripts/accept/0012-minimal-actor-runtime.ts
node src/actor/main-node.ts examples/inventory/scenarios/demo.json
git diff --check
```

The feature acceptance program owns the full bounded journey, portable-import
closure, Bun/Node comparison, existing inventory regression, and
counterexample manifest. A missing required runtime or tool fails.

## Evidence claim and limits

Focused tests are `test`; lint, type checking, and import-closure inspection
are `static_analysis`; the Bun/Node scenario is `runtime_validation`;
independent review is `assertion`. Together they establish that one exact
implementation head produced the recorded bounded observations.

They do not prove affine ownership, race freedom, fairness, scheduler
correctness, crash recovery, durable delivery, or operational suitability.
Those remain explicit assumptions or future proof/model-checking/stress
frontiers.

## Falsifiers and kill criteria

- State is reachable from `ActorRef` without sending a typed protocol message.
- More than one worker can transition one actor's state.
- An accepted envelope can disappear without a typed failure observation.
- Actor and pure inventory traces diverge under identical declared inputs.
- A runtime adapter changes actor semantics rather than interpreting the same
  portable capability.
- The implementation claims stronger delivery or ordering than the trace
  establishes.
- Actor mechanics require changing the inventory theory identity.

## Non-goals

- Durable or distributed actors.
- Location transparency, remoting, clustering, or actor discovery.
- Supervision trees, restart strategies, persistence, snapshots, or replay
  recovery.
- Priority mailboxes, selective receive, timers, or dead-letter queues.
- Exactly-once external effects.
- STM, CRDT, saga, escrow, or consensus realization.
- Parallel throughput, fairness, latency, or benchmark claims.
- Formal proof or model checking of the actor runtime.

## Semantic diff

This feature adds one executable single-owner actor realization of the accepted
inventory semantics. It changes no inventory rule, theory identity, evidence
category, resolver policy, platform trust, or deployment claim. It introduces
receiver-local mailbox order, scoped actor lifecycle, and actor-private state
as explicit runtime contracts with bounded test and runtime-validation
evidence.

Revision 1 makes the previously implicit value-transfer assumption explicit:
v0 accepts only structured-cloneable actor values and copies them at every
ownership boundary. The initial opaque-reference contract and its earlier
tests are invalidated as sufficient ownership evidence; the mutable-alias
counterexamples and exact-head review must be rerun.

Revision 2 narrows that subset to exclude shared memory, snapshots the actor
definition container, and aligns deterministic freshness with the same
prepared transition seam used by the actor adapter. The reviewed `e67686d`
implementation and its demo-only parity result are invalidated; a fresh exact
head must demonstrate the shared-memory and guarded-freshness counterexamples
under the declared runtimes.

Revision 3 makes total failure rendering part of the typed transfer boundary.
The reviewed `af5c398` head is invalidated because hostile caller-controlled
causes could defect while being stringified. A fresh exact head must retain
initial-state, message, and transition-output transfer failures in their typed
channels under Bun and Node.

Revision 4 binds revisions 1–3 into the realization identity. The reviewed
`b20be6b` head is invalidated because it emitted the pre-ownership-revision
identity. A fresh exact head must demonstrate that the identity input contains
the complete value-transfer, definition-custody, and typed-failure contracts.

Revision 5 binds transition-failure shutdown to the acceptance boundary. The
same reviewed `b20be6b` head is independently invalidated because a send begun
after observing failure could still enter accepted history. A fresh exact head
must distinguish future sends from envelopes accepted before failure.
