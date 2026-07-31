# Design spec 0016: executable semantic system kernel

Status: frozen for the first library tracer

Date: 2026-07-30

Depends-On-Feature-IDs: 0015-open-semantic-system-design-lens

Design-Lens-Version: open-semantic-system-v1

## Problem

Semantic Systems has several executable fragments of the intended programming
model, but no reusable library boundary for authoring a domain as an open
semantic system:

- inventory declares one undifferentiated `Message` union and returns one
  `Event`;
- the actor runtime accepts an arbitrary Effectful transition and therefore
  cannot inspect which values are commands, observations, queries, artifacts,
  domain events, or outward requests;
- effect capabilities can be invoked inside a transition without first
  becoming explicit protocol data;
- schemas, provenance, ownership, projections, and effect interpreters are
  assembled separately by each tracer; and
- a future surface language has no executable semantic IR to elaborate into.

Documentation and lint rules can require an authored account, but they do not
let a domain engineer run the account, derive its graph, compare realizations,
or retain law tests while the language is still being designed.

The project needs a small TypeScript library that makes the semantic categories
and boundaries executable without pretending that TypeScript proves their
meaning. It must be useful now and serve as a provisional authoring language
for a later dedicated language, not become an unrelated framework whose hidden
runtime semantics must later be discarded.

## Felt journey

A domain engineer defines an inventory reservation component with schema-backed
state, commands, observations, queries, domain events, artifacts, and effect
requests. The `Reserve` command does not call a random or fresh-identifier
service. It returns a typed `FreshIdentifierRequested` value. A deterministic
Effect interpreter attempts that request and returns a provenance-bearing
observation. Feeding that observation back into the same pure component
produces the accepted `Reserved` event and state.

The engineer asks an `InventoryStatus` query and receives a derived artifact
without changing state or issuing an effect. The same component description can
run through a direct bounded driver and an adapter over the accepted actor
runtime. Both produce the same normalized message journey and final semantic
state. A generated graph shows the component, input/output categories, effect
interpreter, and the explicit request/observation cycle.

Invalid and insufficient reservations never request a fresh identifier. A
duplicate or mismatched observation cannot reserve stock twice. Effect
timeout/unknown remains explicit rather than being interpreted as
non-execution.

## Open semantic system design lens

### Boundary and warranted state

The feature boundary is a portable semantic-system library, one inventory
component authored through it, one deterministic effect interpreter, a bounded
direct driver, and an adapter to the already accepted actor runtime.

The library owns:

- validation and immutable custody of a component description;
- exact separation of declared semantic input/output categories;
- validation and snapshotting at public execution boundaries;
- pure reaction and query dispatch;
- bounded routing of returned observations;
- interpreter registration and exact request/observation pairing;
- derived structural metadata; and
- normalized observation of the tracer journey.

The inventory component owns stock, reservations, pending identifier requests,
processed observation identities, and their invariants. It warrants only state
derived from accepted commands and attributed observations.

Effect execution, actor scheduling, process survival, clocks, randomness,
machine resources, and the truth of external observations remain
environmental. The accepted actor runtime remains a realization dependency and
is not redefined by this feature.

### Semantic inputs

The public semantic categories are:

- **Command** — requests a domain decision; inventory uses `Reserve` and
  `Release`;
- **Observation** — reports an effect-protocol outcome with observation
  identity, source/provenance, schema identity, correlation/action identity,
  and payload; inventory observes allocated, unavailable, or unknown fresh
  identifier outcomes; and
- **Query** — requests a derived artifact without changing canonical state or
  issuing an effect; inventory uses `InventoryStatus`.

External unknown values enter only through schema-backed constructors or
decode functions. Domain rejection is not a decode error. An acknowledgement
is modeled as an observation whose name and provenance state exactly what was
acknowledged.

Cross-component communication must translate an output into a declared command
or observation at the receiving boundary. A generic `Message` envelope may
carry these values operationally, but must not erase their semantic force.

### Semantic outputs

A reaction returns immutable data containing:

- the next maintained state;
- zero or more domain events;
- zero or more derived artifacts;
- zero or more effect requests; and
- diagnostics that do not masquerade as domain events.

A query returns artifacts only. It cannot return next state or effect requests.

An effect interpreter returns observations or a typed interpreter failure. It
does not mutate component state directly. Generated graphs and normalized
journey documents are derived artifacts, never canonical model sources.

### Effect protocols and uncertainty

Effect requests are explicit tagged data with a stable action identity and
correlation identity. The portable component cannot invoke ambient clock,
random, crypto, network, filesystem, process, console, or Effect execution
authority.

The first inventory protocol is:

```text
FreshIdentifierRequested(actionId, reservation)
  -> FreshIdentifierAllocatedObserved(observationId, actionId, identifier)
   | FreshIdentifierUnavailableObserved(observationId, actionId, reason)
   | FreshIdentifierUnknownObserved(observationId, actionId)
```

An unknown or timed-out attempt does not establish that allocation did not
occur. Retry is not automatic. A later command may request reconciliation or a
new action according to domain policy. Duplicate observation identities and
outcomes for nonexistent or different actions are rejected or ignored through
an explicit diagnostic without applying stock mutation.

The deterministic interpreter is test/runtime-validation evidence only. It
does not claim external exactly-once behavior.

### Components and orthogonal structures

A semantic component description defines local state, typed protocols,
reaction/query functions, effect declarations, and derived structural
metadata. It does not own a thread or process.

The direct driver owns one bounded message/effect queue for a tracer run. The
actor adapter gives one accepted actor exclusive state/mailbox ownership. The
existing actor scope owns temporary fiber lifetime. A future supervisor may own
restart and recovery; this feature does not claim OTP semantics.

The following remain separate:

- component state authority;
- actor mailbox ownership and ordering;
- structured task/fiber scope;
- effect-handler capability authority;
- message communication topology;
- artifact derivation;
- deployment/runtime selection; and
- evidence custody.

The request-to-observation edge is a semantic boundary because an attempted
capability interaction becomes attributed evidence. Encoding/decoding the same
declared value is a representation boundary within that semantic layer.

The inventory tracer's request/observation cycle terminates under a declared
finite driver fuel bound and a deterministic interpreter that produces at most
one observation per request. Exhausted fuel yields an explicit suspended
result with pending messages/actions; it never claims successful termination.

### Bounded autonomy and resources

Component reaction and query functions must return synchronously and emit
finite arrays. The v0 driver accepts positive safe-integer bounds for processed
inputs, interpreted effects, queue stock, and retained observations. Exceeding
a bound returns a typed suspended/exhausted result containing the remaining
work; it does not silently drop work or loop.

The actor adapter inherits bounded mailbox, bounded retained trace,
receiver-local acceptance order, structured-clone transfer, and scoped close
semantics from design specs 0012 and 0013. It makes no fairness, durable
delivery, crash recovery, or host memory claim.

Description registries, schemas, handler tables, and derived graph metadata are
finite and snapshotted when the component is defined. Domain payload size and
actual interpreter resource use remain realization policies.

### Evidence, assumptions, and unsupported claims

Contract-shape validation establishes only that this account exists. TypeScript
and the public module boundary establish declared generic separation for typed
consumers, not semantic truth or unforgeability against `as unknown as`.
Runtime Schema decoding, private construction custody, defensive snapshots,
and adversarial values provide bounded runtime validation.

Type-aware lint and import-closure checks establish that portable component and
kernel modules do not directly import or invoke forbidden ambient authority.
Law/counterexample tests establish only their selected cases. Direct/actor and
Bun/Node comparisons are differential runtime evidence, not proof. The graph
artifact establishes what the accepted description declared, not that the
world follows it.

This feature does not establish:

- a sound or complete programming language;
- a trusted semantic kernel or proof checker;
- termination of arbitrary authored TypeScript functions;
- truth of observations;
- exactly-once external consequences;
- general actor, OTP, STM, distributed, or persistence correctness;
- automatic semantic inference from names; or
- stability of the provisional API beyond the declared version.

## Frozen deep-module contract

### Library posture and strata

The first library lives under `src/semantic-system/` with one documented public
entrypoint. It is internal to the monorepo while semantics are changing. No
decorators, reflection metadata, dependency-injection container, global
registry, code generation at import time, or platform-specific module may
define domain meaning.

The strata are:

```text
schema-backed authored description
  -> immutable canonical component description
  -> pure reaction/query kernel
  -> bounded direct or actor realization
  -> Effect request interpreter
  -> returned observation
```

Effect v4 supplies schemas, typed interpreter effects, scopes, layers, and
runtime realizations. An `Effect` value is not substituted for a declared
domain `EffectRequest`: portable reactions return protocol data.

A future source language must be able to elaborate into the canonical
description and reaction IR or a versioned successor. The TypeScript builder is
therefore an authoring carrier, not semantic authority.

### Canonical semantic vocabulary

The public surface distinguishes at least:

- `CommandEnvelope<C>`;
- `ObservationEnvelope<O, Provenance>`;
- `QueryEnvelope<Q>`;
- `DomainEventEnvelope<E>`;
- `ArtifactEnvelope<A>`;
- `EffectRequestEnvelope<F>`;
- `Diagnostic`;
- `Reaction<State, Event, Artifact, Request>`;
- `Answer<Artifact>`; and
- `SemanticComponent<...>`.

Envelopes carry stable schema/type identity. Runtime message metadata carries
message, correlation, causation, owner/component, and action identities where
applicable. Payload types remain domain-owned.

Definitions provide Effect Schema decoders for state and every external
payload family plus total reaction/query functions. Definition-time validation
rejects empty or duplicate identities, overlapping semantic tags, missing
handlers, undeclared emitted tags observed by the tracer, and malformed
resource bounds.

The component object is privately constructed and registered. Definition
metadata and schema/handler tables are snapshotted. Public introspection returns
deeply immutable data without function or mutable schema-table aliases. An
unregistered structural lookalike cannot execute through the kernel.

Authored functions can close over mutable values; TypeScript cannot prove
otherwise. The portable code domain and adversarial tests narrow this risk, and
the remaining closure-purity premise is explicit.

### Pure reaction and query kernel

`react` accepts a registered component, current unknown state, and a command or
observation. It:

1. decodes/snapshots state and input;
2. dispatches exactly one declared handler;
3. obtains a candidate `Reaction`;
4. decodes/snapshots its next state and every emitted value;
5. rejects undeclared categories/tags and duplicate action identities inside
   one reaction; and
6. returns an immutable reaction value.

It does not interpret effect requests.

`answer` decodes/snapshots state and query, dispatches one query handler,
validates artifacts, and returns an immutable answer with no next-state or
effect field. Mutation attempts against input/state/output aliases must not
alter component-owned or previously returned values.

Thrown JavaScript exceptions and malformed handler output become typed kernel
failures. They are not domain rejection events. The v0 kernel does not claim
arbitrary exception recovery is total against hostile process termination.

### Interpreter and bounded driver

An interpreter is registered for exact declared effect-request tags and returns
an Effect that succeeds with a schema-valid observation envelope or fails with
a typed interpreter error. Registration cannot silently accept an unhandled
request or return an observation belonging to a different protocol/action.

The bounded direct driver:

- owns FIFO work queues for accepted commands/observations and emitted effect
  requests;
- applies at most the configured input/effect/stock bounds;
- records commands, observations, events, artifacts, requests, diagnostics,
  interpreter outcomes, and final state in causal order;
- feeds successful interpreter observations back through `react`;
- returns `completed` only when both queues are quiescent; and
- otherwise returns `suspended` with an exact reason and remaining work.

The driver is a deterministic tracer under deterministic handlers. It is not a
production scheduler.

### Component graph and realization adapters

The library derives a stable graph artifact from the registered description:

- component and state nodes;
- semantic category/type nodes;
- handler and interpreter nodes;
- consumes, emits, derives, interprets, observes, owns, and realizes edges;
- declared cycle/fuel annotations; and
- unsupported realization claims.

No edge is inferred from a string-like type name.

An adapter maps the same component reaction/query semantics into the accepted
actor runtime without copying inventory rules. Its operational actor output
may wrap either a reaction or answer, but retains their category tags. Actor
mailbox/order/lifecycle claims remain those of design specs 0012/0013.

The direct and actor journeys compare normalized semantic observations. Runtime
metadata may differ and is normalized only when explicitly presentation-only.

### Inventory open-protocol tracer

The tracer adapts, rather than duplicates, the accepted inventory guards,
events, replay, and final-state projection where their semantics apply.

For an eligible `Reserve` command it records one pending reservation action and
emits one `FreshIdentifierRequested`. It does not decrement stock yet. An
allocated observation correlated to that action applies the accepted
reservation transition exactly once. Invalid or insufficient commands produce
the accepted rejection event without a request. `Release` retains accepted
semantics.

The component adds pending-action and processed-observation state needed by the
open protocol. Its projection to the accepted inventory `State`, after a
quiescent successful journey, must equal the existing pure reference result.
This projection equality does not assert that intermediate states are
identical.

`InventoryStatus` derives stock, reservations, and explicit pending/unknown
actions as an artifact. Querying cannot consume a fresh identifier or change
any state.

## Oracle-first counterexamples

Before conforming implementation, retain executable red observations for:

1. one generic `Message`/output union erasing semantic-force categories;
2. a query mutating state or emitting/interpreting an effect;
3. a command directly invoking freshness, random, crypto, clock, filesystem,
   network, process, console, or an Effect runtime;
4. a structural lookalike component executing without private registration;
5. later mutation of a definition, schema/handler table, state, input,
   reaction, artifact, or graph alias changing an accepted observation;
6. malformed external input or handler output bypassing its declared schema;
7. duplicate/empty identities, overlapping tags, or undeclared emitted tags
   being accepted;
8. an invalid/insufficient reservation requesting or consuming a fresh ID;
9. an eligible reservation decrementing stock before an allocated
   observation;
10. a duplicate, foreign-action, or mismatched observation applying a
    reservation;
11. timeout/unknown being reported as non-execution or automatic safe retry;
12. an interpreter returning an observation for the wrong request/action;
13. exhausted driver fuel or queue stock being reported as completion;
14. replay or query repeating an external effect;
15. direct and actor realizations producing different normalized semantic
    results;
16. the quiescent inventory projection diverging from the accepted pure
    reference result;
17. graph output inventing an edge from naming convention or omitting the
    explicit request/observation cycle;
18. runtime-specific authority entering the portable semantic-system closure;
19. Bun and genuine Node producing different normalized direct results; and
20. any gate claiming proof, language soundness, OTP semantics, external
    exactly-once behavior, or observation truth.

## Acceptance

The first semantic-system library tracer is accepted only when:

1. the public entrypoint exposes the frozen semantic categories while hiding
   constructors and runtime internals;
2. component definition, input/output decoding, immutable custody, and
   structural-lookalike rejection pass adversarial tests;
3. pure reaction and query kernels keep effect requests as data and keep
   queries state/effect free;
4. the exact interpreter registry and bounded driver preserve causality,
   uncertainty, quiescence, and suspension;
5. all twenty counterexample families are represented by focused tests;
6. eligible, invalid, insufficient, duplicate-observation, unavailable, and
   unknown inventory journeys behave as frozen;
7. a quiescent successful journey projects to the accepted inventory events
   and final state;
8. direct and accepted-actor realizations use one component description and
   produce equal normalized semantic results;
9. the derived graph contains only declared component/category/handler and
   request-observation-cycle edges;
10. the portable closure passes type-aware Effect/domain lint and imports no
    Bun, Node, filesystem, process, clock, random, crypto, network, ambient
    console, or Effect execution authority;
11. Bun and genuine Node normalized direct results are byte-identical;
12. exact 0001 inventory and 0012/0013 actor regression acceptance remains
    green;
13. typecheck, strict lint, formatting, project-model validation, generated
    view drift, and the full integration suite pass; and
14. every report states actual evidence categories and unsupported claims.

## Kill or redesign criteria

Stop or recut the feature if:

- the library must copy inventory semantics rather than adapt the accepted
  oracle;
- Effect types force effect execution to become invisible inside portable
  reactions;
- schema generics make ordinary domain authoring substantially less legible
  than the semantic categories they protect;
- actor adaptation requires weakening accepted actor ownership or failure
  semantics;
- private registration cannot prevent structural execution without a global
  mutable registry;
- the bounded driver grows into a production scheduler, broker, workflow
  engine, or OTP clone;
- the API prevents a plausible future language from elaborating into a small
  data-oriented IR; or
- conformance requires a claim stronger than available evidence.

## Non-goals

- Surface-language syntax, parser, elaborator, compiler, or LSP.
- A stable public npm package or ecosystem compatibility promise.
- General workflow orchestration or distributed messaging.
- Production persistence, event store, outbox, broker, or exactly-once effects.
- OTP-compatible supervision or actor crash recovery.
- General model checking, theorem proving, or termination checking.
- Automatic domain discovery from TypeScript names or decorators.
- Replacing Effect, the accepted actor runtime, or existing inventory theory.

## Semantic diff

The project gains a reusable executable description and kernel for the
open-semantic-system theory. Commands, observations, queries, events,
artifacts, and effect requests become first-class executable categories.
Effect requests are inspectable protocol data before Effect interpreters run
them. Direct and actor realizations can consume one authored description, and a
future language receives a concrete versioned elaboration target.

Inventory rules, accepted actor guarantees, evidence categories, trusted-kernel
claims, `theory-norm-v0`, and deployment resolution remain unchanged.
