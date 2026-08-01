# Design spec 0037: one-shot external effect replay

Status: frozen for implementation

Date: 2026-08-01

Depends-On-Feature-IDs: 0020-agent-facing-kernel-json,
0022-kernel-reference-interpreter, 0032-baseline-bytecode-backend

Design-Lens-Version: open-semantic-system-v1

## Problem

The reference and compiled entry points stop at the first unhandled operation.
The reference machine privately retains a one-shot continuation, but the
compiled VM discards its continuation when projecting the suspension. An agent
therefore cannot supply external observations, finish an effectful program, or
compare the two backends across an effect/resume sequence.

Feature 0037 establishes one bounded, deterministic replay journey. It does
not install ambient handlers or expose continuations. A strict JSON observation
script supplies first-order values; each value may answer exactly one observed
request, and each backend privately resumes a fresh affine continuation.

## Felt journey

An agent submits kernel JSON that requests an integer and then a boolean,
together with a versioned observation script containing those two values. The
reference interpreter and independent bytecode VM each record the same two
requests, apply the observations once in order, and return the same pair. With
only the first value, both stop visibly at the second request. A wrong-typed
value rejects before consuming the continuation.

## Open semantic system design lens

### Boundary and warranted state

Feature 0037 owns:

- the strict `semantic.kernel-observation-script` version 1 JSON value;
- the canonical `semantic.kernel-effect-run` version 1 observation;
- one backend-neutral bounded driver over opaque one-shot suspension custody;
- reference-machine adaptation through the existing custodied external token;
- compiled-VM external suspension custody and affine resume; and
- exact differential sequence evidence.

The kernel checker remains the only typing authority. A script is an ordered
list of claimed environmental observations, not evidence that an external
effect happened and not authority to execute one. The driver validates each
value against the current checked operation result type before the backend may
consume its private continuation.

### Semantic inputs

The observation script is strict inert JSON:

```json
{
  "format": "semantic.kernel-observation-script",
  "version": 1,
  "observations": [{ "kind": "int", "value": 42 }]
}
```

Version 1 observation values are recursively first-order: `unit`, `bool`,
safe-integer `int`, and `pair`. There is no `thunk` constructor because an
opaque `{ "kind": "thunk" }` carries neither executable body nor custody. A
script contains at most 256 observations and crosses a strict Effect Schema
boundary after bounded inert snapshotting. Accessors, aliases, cycles, exotic
objects, excess fields, unsafe integers, and unsupported tags reject as script
representation failures.

The kernel bytes and existing backend bounds are unchanged. Script validation
precedes kernel preparation. Observation order is semantic input; no request is
matched by name, label, or search.

### Semantic outputs

Every call returns one immutable `semantic.kernel-effect-run` envelope. Its
observation is either:

- `script-rejected` with stable diagnostics; or
- `executed` with `provided_observations`, `applied_observations`, every
  encountered operation request in order, and the existing closed
  `KernelRunResult` as `result`.

An extra supplied observation is not silently claimed to have happened:
`provided_observations` remains greater than `applied_observations`. If the
script ends first, the final result is the next `suspended` request and that
request also appears in the request trace.

No continuation identity, VM block, stack, trace rule, clock, or host identity
crosses the public boundary. Canonical encoding of the whole effect-run
observation is the differential comparator.

### Effect protocols and uncertainty

At a suspension:

1. append the request observation;
2. return suspended if the script has no next value;
3. reject unsupported thunk-containing result types or type mismatch without
   consuming the continuation;
4. otherwise snapshot the value, consume the private continuation once, and
   resume; and
5. repeat until return, rejection, inconclusive execution, or the next
   unanswered request.

The reference and compiled implementations retain distinct continuation
representations. A backend token is known, live, and process-local. Foreign,
forged, or already-used tokens reject. True multi-shot cloning is absent.
Repeated effects create fresh one-shot suspensions.

### Components and orthogonal structures

```text
unknown script -> bounded inert snapshot -> strict Schema -> observation list
kernel bytes   -> shared preparation      -> checked program
                                             |             |
                                             v             v
                                      reference machine  compiler + VM
                                             |             |
                                             +------v------+
                                           one-shot replay driver
                                                    |
                                                    v
                                     canonical effect-run observation
```

The script sequence, request trace, continuation custody, source term graph,
compiled graph, and public observation remain distinct. The shared driver owns
ordering and type admission; each backend owns execution and continuation
state.

### Bounded autonomy and resources

- at most 256 supplied observations and 257 recorded requests;
- first-order values remain within the existing portable-fact depth and node
  limits;
- existing evaluator/VM fuel and trace bounds apply to every execution segment,
  with cumulative trace limits retained by suspension custody;
- no queue, retry, network, filesystem, clock, random, or background process;
- iterative script driving; and
- every continuation has one successful resume at most.

### Evidence, assumptions, and unsupported claims

Example and generated tests observe full two-request return, prefix suspension,
extra-input visibility, wrong-type rejection, thunk-result rejection, token
forgery and double-use rejection, fresh repeated suspensions, canonical output,
and exact reference/compiled agreement. Injected compiled divergence must still
be detected.

These tests are observations, not proof of compiler equivalence. Version 1 does
not establish that supplied values came from real effects, does not support
host-created executable thunks, and does not expose a live asynchronous handler
service. Those are explicit future extensions of the same request/observation
protocol.

## Deep-module contract

```text
interpretKernelJsonBytesWithObservationScript(kernel, script, bounds?)
  -> KernelEffectRunObservation

runCompiledKernelJsonBytesWithObservationScript(kernel, script, bounds?)
  -> KernelEffectRunObservation

encodeCanonicalKernelEffectRunObservation(observation) -> Uint8Array
```

The existing first-suspension entry points and `semantic.kernel-run` schema do
not change.

## Oracle-first counterexamples

1. A wrong-typed observation cannot consume a continuation.
2. The same compiled or reference token cannot resume twice.
3. A forged or foreign token cannot acquire execution custody.
4. A script prefix cannot be reported as a completed return.
5. Extra observations cannot be reported as applied.
6. A thunk-shaped JSON value cannot masquerade as executable custody.
7. Repeating an operation cannot reuse an earlier continuation.
8. An inconclusive backend pair cannot count as differential agreement.
9. A request trace cannot omit the final unanswered request.
10. Existing first-suspension canonical bytes cannot change.

## Acceptance

Feature 0037 is accepted when one clean head passes its exact acceptance script,
focused Bun and genuine Node journeys, deterministic generated sequence
properties, canonical differential comparison, TypeScript 7, Effect diagnostics,
Oxlint, Oxfmt, project-model validation, generated-view equality, and the full
repository gate. Independent review must approve the exact candidate head.

## Kill or redesign criteria

Recut before integration if compiled resume must expose or serialize VM state,
if the driver needs to clone a continuation, if a JSON thunk is treated as
executable, if either backend calls the other, or if replay changes the existing
first-suspension observation bytes.

## Non-goals

No true multi-shot continuation, async live handler service, Effect Layer for
host capabilities, durable continuation, network protocol, bytecode format,
thunk-valued external observation, optimizer, or deployment is included.

## Semantic diff

Agents gain a strict JSON replay interface that can finish first-order
effectful kernel programs and compare reference and compiled execution across
multiple affine resumptions. Existing kernel syntax, checking, evaluation,
first-suspension interfaces, and bytecode representation remain unchanged.
