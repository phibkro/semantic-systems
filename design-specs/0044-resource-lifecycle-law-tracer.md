# Design spec 0044: resource lifecycle law tracer

Status: frozen for one bounded executable law tracer

Date: 2026-08-01

Depends-On-Feature-IDs: 0042-user-defined-algebra-frontier

Design-Lens-Version: open-semantic-system-v1

## Problem

Feature 0042 identifies resource lifecycle as the first unresolved user-algebra
candidate, but its laws are still prose. Semantic Systems therefore cannot yet
falsify claims that release inverts acquisition, that cleanup happens at most
once on every exit, that ownership transfer conserves one finalizer owner, or
that a parent may begin cleanup while a descendant scope remains open.

The smallest useful next capability is a finite reference tracer. It models
scopes and affine cleanup ownership, executes a closed lifecycle script, and
returns an immutable observation or a typed rejection. It establishes a
law-model candidate; it does not add surface syntax, kernel forms, or external
resource authority.

## Felt journey

A caller opens a root and child scope, acquires two simulated resources,
explicitly transfers one resource to the child, and asks the parent to exit.
The parent close is visibly blocked while the child is open. After the child
exits, its resources are finalized in reverse registration order. The parent
then exits after a typed failure and finalizes its remaining resources exactly
once. A failing finalizer is retained in the observation and does not skip the
rest.

Running the same script under Bun and genuine Node produces the same canonical
JSON. Duplicate identities, implicit cleanup-owner transfer, double release,
use of a closed scope, and excess work reject with stable typed diagnostics.

## Open semantic system design lens

### Boundary and warranted state

0044 owns a closed version-one script algebra, a pure finite interpreter,
scope/resource state, cleanup-order derivation, typed diagnostics, immutable
reports, and canonical report JSON.

The tracer warrants only the behavior of its finite reference model. Scripted
acquisition and finalizer outcomes are test inputs, not observations of files,
sockets, processes, devices, or provider state. A successful trace is evidence
for the declared lifecycle laws, not a proof that the current kernel can encode
regions or cancellation safely.

### Semantic inputs

`traceResourceLifecycle(input)` strictly decodes:

```text
semantic.resource-lifecycle-script/v1 {
  root_scope,
  events: open_scope | acquire | transfer | release | exit_scope
}
```

The root scope exists before the first event. `open_scope` creates one child of
an open scope. `acquire` contains a caller-authored attempt identity and a
scripted success or failure observation. Success alone introduces a fresh
resource identity and registers one cleanup owner plus one scripted finalizer
outcome. `transfer` explicitly moves cleanup ownership to another open scope
and appends the resource to that target's cleanup order at transfer time.
`release` requests early cleanup. `exit_scope` carries `normal`,
`typed-failure`, or `cancellation` and closes only a scope with no open child.

Every identity is a bounded opaque token. Presentation labels, clocks, random
values, host paths, callbacks, functions, and executable finalizers are absent.

### Semantic outputs

Success returns one `semantic.resource-lifecycle-report/v1` containing:

- the normalized input script;
- chronological acquisition, transfer, blocked-close, and finalization
  observations;
- final open/closed scope state;
- every successful acquisition and its current lifecycle state: either one
  live cleanup owner or one terminal cleanup observation;
- accumulated finalizer failures; and
- a derived law summary.

Canonical JSON uses stable field and identity ordering. The law summary is
derived rather than caller-authored. It states whether successful acquisitions
have at most one finalization, whether ownership remains singular, and whether
every resource owned by a scope at its accepted exit was finalized. Acquisition
origin does not make a transferred resource part of the source scope's exit.

### Effect protocols and uncertainty

An acquisition failure creates no resource. Explicit release and scope exit
both consume cleanup ownership before recording the scripted finalizer outcome;
a failed finalizer therefore cannot be retried implicitly. Scope exit continues
through all resources it owns at accepted exit in reverse current registration
order and accumulates every failure. Acquisition appends to its owner's order;
transfer removes the source entry and appends to the target order at transfer
time.

A parent exit while any descendant is open produces a `scope-close-blocked`
observation and leaves state unchanged; a later exit may succeed. Invalid state
transitions fail the Effect with an indexed `ResourceLifecycleFailure`; they
are not silently normalized into blocked progress.

Interruption is represented by the authored `cancellation` exit cause. The
tracer does not claim to observe host interruption timing or masking.

### Components and orthogonal structures

```text
strict script -> lifecycle interpreter -> immutable report -> canonical JSON
                     |       |                  |
                 scope tree  ownership      law summary
```

Scope containment, resource cleanup ownership, event order, effect outcome,
and report derivation remain separate relations. Transfer changes ownership
but not resource identity. Finalization consumes ownership but is not an
inverse that erases acquisition history.

### Bounded autonomy and resources

- at most 256 events, 64 scopes, and 256 successful resources;
- identities and diagnostic text are at most 128 and 1,024 UTF-16 code units;
- every event is interpreted once;
- each resource is finalized at most once;
- scope cleanup visits resources owned at accepted exit once in reverse current
  registration order;
- the interpreter is iterative and has no fibers, queues, retries, timers,
  network, filesystem, process, console, or background lifetime; and
- canonical output is bounded by the admitted input and fixed observations.

### Evidence, assumptions, and unsupported claims

Effect Schema strict decoding and tagged failures provide boundary evidence.
Example and property tests exercise exit-cause equivalence, reverse cleanup,
transfer conservation, finalizer-failure accumulation, identity freshness,
boundedness, immutability, and Bun/Node canonical parity.

The tracer assumes its scripted outcomes are the environment observations to
model. It does not establish external exactly-once cleanup, non-escaping types,
safe asynchronous cancellation, child-task termination, fairness, kernel
encodability, or soundness of a future surface type system.

## Deep-module contract

```text
traceResourceLifecycle(input)
encodeResourceLifecycleReport(report)
decodeResourceLifecycleReport(input)
```

The functions expose strict schemas, immutable data, fixed resource bounds,
and typed expected failures. No ambient capability is required.

## Oracle-first counterexamples

1. Normal, typed-failure, and cancellation exits produce the same cleanup
   order for equal live ownership.
2. Explicit release prevents a later scope exit from finalizing twice.
3. A failing finalizer is terminal and does not skip later finalizers.
4. Transfer removes the source owner before installing the target owner and
   appends the resource to the target's cleanup order at transfer time.
5. Parent exit is blocked while a child is open and performs no cleanup.
6. Failed acquisition introduces no resource or finalizer.
7. Duplicate scope, attempt, or resource identities reject.
8. Double release, transfer after cleanup, transfer to a closed scope, closing
   the root before children, and reopening a closed identity reject.
9. Excess events/scopes/resources and excess properties reject.
10. Reports are deeply immutable, law fields cannot be forged, and Bun/Node
    emit equal canonical JSON.

## Acceptance

`bun scripts/accept/0044-resource-lifecycle-law-tracer.ts` must run focused Bun
tests, genuine Node parity, the 0042 frontier seam, TypeScript 7 with Effect
diagnostics, Oxlint, Oxfmt, project-model validation, deterministic generated
views, and the complete repository gate on one clean head.

## Kill or redesign criteria

Redesign if the tracer needs executable callbacks, ambient identity, hidden
retry, unbounded task state, or a special kernel form merely to state its
laws. A future runtime effect must use explicit requests and observations
rather than relabeling scripted outcomes as external truth.

## Non-goals

No surface grammar, type inference, region checker, resource-handle use or
escape semantics, kernel primitive, task scheduler, actor realization, STM
runtime, real acquisition, host cancellation, multishot continuation,
compensation, persistence, deployment, or performance claim.

## Semantic diff

Resource lifecycle advances from a prose candidate to a bounded executable
userland law model. Kernel, surface, runtime-capability, STM, and structured
concurrency decisions remain unchanged and explicitly unsupported.
