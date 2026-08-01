# Design spec 0047: structured-concurrency law tracer

Status: frozen for one bounded executable law tracer

Date: 2026-08-01

Depends-On-Feature-IDs: 0042-user-defined-algebra-frontier

Design-Lens-Version: open-semantic-system-v1

## Problem

Feature 0042 names structured-concurrency laws but supplies no local executable
model. In particular, Semantic Systems cannot yet falsify claims that task
ownership is singular, a scope may disappear while its child is live, a join
can invent multiple outcomes, a cancellation request terminates immediately,
or a scheduler choice is interchangeable with an external observation.

0047 freezes the smallest useful comparison: one finite script is interpreted
by a pure reference oracle and independently replayed through a thin Effect v4
adapter. It establishes a bounded userland law model. It does not add a generic
scheduler, actor protocol, surface syntax, kernel form, or production runtime.

## Felt journey

A caller opens a child scope, spawns two finite tasks, and dispatches their
one-shot steps in an explicit order. One task yields before succeeding. The
other receives the same cancellation request twice but remains live until
cancellation is explicitly delivered. Joins report blocked while a task is
live and repeat the same terminal outcome after it settles. A scope-exit
request asks every directly owned live task to cancel and cannot close until
its child scopes and tasks settle.

The pure oracle and Effect realization return identical canonical runs under
Bun and genuine Node. Duplicate identities, invalid ownership changes,
dispatch after termination, cancellation delivery without a request, and
excess work reject with stable typed diagnostics.

## Open semantic system design lens

### Boundary and warranted state

0047 owns a closed version-one script algebra, a finite pure oracle, a thin
Effect v4 realization, strict schemas, typed diagnostics, canonical reports,
and comparison fields derived from both runs.

The tracer warrants only the behavior of its admitted scripts. A successful
comparison is test evidence for this bounded model, not proof of fairness,
deadlock freedom, host cancellation behavior, production equivalence, faithful
surface elaboration, or kernel encodability.

For the 0042 promotion classifier, `lawful_userland_model: true` records only
that this finite executable law-model candidate now exists. “Lawful” is the
classifier field's historical name; it does not upgrade bounded comparison
evidence into proof of production semantics, fairness, deadlock freedom,
surface elaboration, or kernel sufficiency.

### Semantic inputs

`traceStructuredConcurrency(input)` strictly decodes:

```text
semantic.structured-concurrency-script/v1 {
  root_scope,
  events:
    open_scope
  | spawn(task, scope, finite_program)
  | transfer(task, from_scope, to_scope)
  | dispatch(task)
  | request_cancel(task)
  | deliver_cancel(task)
  | join(task)
  | exit_scope(scope)
}
```

The root scope exists before the first event. A spawned task begins suspended,
owned by exactly one open scope, with a finite list of authored yield labels
and one authored success or failure outcome. Each `dispatch` is an explicit
scheduler choice and consumes exactly one remaining task step: it either
observes the next yield or settles the authored terminal outcome. Cancellation
delivery is distinct from request and settles the task as cancelled.

Transfer is the only ownership-changing operation. It moves one live task from
one open scope to another open scope. A scope-exit request monotonically asks
all directly owned live tasks to cancel and closes only when it has no open
child scope and no live owned task. A blocked request may be repeated.

Identities and labels are bounded opaque text. There are no callbacks,
promises, clocks, random values, external observations, actor messages, or
executable user programs.

### Semantic outputs

Success returns one `semantic.structured-concurrency-report/v1` containing:

- the normalized script;
- the pure reference observation;
- the independent Effect v4 observation;
- explicit schedule decisions and per-task happens-before edges;
- final scope and task ledgers, joins, cancellation observations, and laws;
- literal comparison fields derived from the two observations; and
- a fixed list of unsupported claims.

Each task retains one terminal outcome. Repeated terminal joins observe that
same outcome. The report distinguishes script dispatch replay from external
observation replay by declaring the latter unsupported.

Canonical JSON uses stable code-point ordering where identity order matters.
Report decoding strictly rederives both runs from the embedded script and
rejects forged comparisons, laws, ledgers, observations, or unsupported
claims. Returned values are deeply frozen and caller-owned input is detached.

### Effect protocols and uncertainty

The reference oracle is total deterministic plain TypeScript behind the strict
Schema boundary. The independent adapter uses the pinned Effect v4 Scope,
Fiber, FiberSet, Deferred, bounded Queue, Ref, and Exit implementations through
one feature-local module. Effect owns child-fiber lifetime and interruption at
adapter-scope close; PBK owns only the finite task/scope transitions and the
canonical projection.

The adapter queue carries at most one script event at a time to a scoped driver
fiber. Spawned task fibers are owned by one scoped FiberSet and wait on their
terminal Deferred. Each event acknowledgement is raced against driver
termination; an unexpected exit becomes a bounded typed failure, so no event
can wait after losing its sole acknowledgement producer. The adapter duplicates
the transition semantics rather than calling the pure oracle. It does not wrap
Effect in a generic promise queue, scheduler, cancellation library, fiber
registry, or shrinker.

Effect-scope cleanup of still-live adapter fibers is host cleanup only. It does
not fabricate a semantic cancellation-delivery observation in the report.

### Components and orthogonal structures

```text
strict script ----> pure oracle ------------------\
       |                                             > canonical comparison
       `----> Effect v4 scoped realization --------/
                    |       |       |
                 task set  mailbox terminal gates
```

Scope containment, task ownership, script order, scheduler choice,
happens-before, cancellation request, cancellation delivery, terminal outcome,
join observation, and host fiber lifetime remain distinct relations.

### Bounded autonomy and resources

- at most 64 events, 16 scopes, 16 tasks, and 32 yields across all tasks;
- identities, labels, and failure text are at most 128, 256, and 1,024 UTF-16
  code units respectively;
- every event is interpreted once by each realization;
- one bounded Effect queue has capacity one;
- every dispatch consumes one finite step and each task settles at most once;
- task and scope collections are bounded domain ledgers, not generic runtime
  registries;
- all adapter fibers belong to one Effect scope and are interrupted when that
  scope closes; and
- there are no retries, timers, network, filesystem, process, console, STM,
  background lifetime, true multishot continuations, or unbounded recursion.

### Evidence, assumptions, and unsupported claims

Strict Effect Schema decoding, typed Effect failures, exact comparison, and
scoped adapter cleanup provide boundary evidence. Example and fast-check tests
exercise explicit schedules, one-shot dispatch, transfer conservation,
idempotent request, delayed delivery, repeated joins, blocked exit, bounds,
immutability, report rederivation, and Bun/Node parity.

The tracer assumes the authored finite program and dispatch order are the
semantic inputs to compare. It explicitly does not establish fairness,
immediate cancellation, production-runtime equivalence, external-observation
replay, deadlock freedom, faithful surface elaboration, or that 0018 can store
resumptions in a scheduler data structure.

## Deep-module contract

```text
traceStructuredConcurrency(input)
runStructuredConcurrencyOracle(script)
runStructuredConcurrencyEffect(script)
encodeStructuredConcurrencyReport(report)
decodeStructuredConcurrencyReport(input)
```

The public boundary exposes strict schemas, immutable observations, fixed
bounds, and typed expected failures. No ambient capability is required.

## Oracle-first counterexamples

1. Different dispatch orders remain explicit and can yield different traces.
2. A dispatch consumes one yield or one terminal step exactly once.
3. Every live task has exactly one open owning scope unless transfer moves it.
4. Repeating a cancellation request is observable and does not settle a task.
5. Cancellation delivery without a prior request rejects; valid delivery
   creates one cancelled terminal outcome.
6. Join is blocked while live and repeats the same observation after terminal.
7. Scope exit requests cancellation for every directly owned live task and
   remains blocked while a child scope or owned task is live.
8. Duplicate identities, invalid transfer, dispatch after terminal, and use of
   a closed scope reject.
9. Excess events, scopes, tasks, yields, strings, and properties reject.
10. Pure and Effect runs compare exactly; forged reports reject; Bun and Node
    emit equal canonical JSON.

## Acceptance

`bun scripts/accept/0047-structured-concurrency-law-tracer.ts` must run focused
Bun tests, genuine Node parity, the 0042 frontier seam, TypeScript 7 with Effect
diagnostics, Oxlint, Oxfmt, project-model validation, deterministic generated
views, and the complete repository gate on one clean head.

## Kill or redesign criteria

Redesign if the tracer requires implicit scheduling, hidden cancellation,
unbounded tasks or steps, a generic fiber registry, executable user callbacks,
external time, true multishot continuations, or kernel changes merely to state
the bounded laws.

## Non-goals

No surface grammar, type inference, kernel primitive, resumptions stored in
language data, production executor, fairness, priorities, deadlines, timeout,
deadlock detection, actor messaging, channels between user tasks, STM, resource
finalization ordering, external observations, host cancellation guarantee,
true multishot continuation, deployment, or performance claim.

## Semantic diff

Structured concurrency advances from a prose candidate to a bounded executable
userland law model. Surface, kernel, production runtime, actor, STM, and
resource-lifecycle decisions remain unchanged and explicitly unsupported.
