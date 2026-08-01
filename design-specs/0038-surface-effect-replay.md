# Design spec 0038: surface effect replay

Status: frozen for implementation

Date: 2026-08-01

Depends-On-Feature-IDs: 0026-semantic-surface-language,
0037-one-shot-external-effect-replay

Design-Lens-Version: open-semantic-system-v1

## Problem

The readable Semantic surface language compiles named source through the strict
kernel boundary, while the new affine replay interface accepts only kernel JSON
bytes. An agent can use both pieces manually, but there is no single supported
journey from readable source plus an observation script to both reference and
compiled effect-run observations.

Feature 0038 adds that missing composition seam. It does not add syntax or
effect semantics. One source compilation and one inert script capture feed the
independent accepted backends, whose existing observations remain separately
visible.

## Felt journey

An agent writes source that performs `fresh.allocate`, then `confirm.accept`,
and supplies JSON observations `42` and `true`. One Effect program parses and
elaborates the source, records the authoritative kernel check, captures the
script once, and returns the reference and compiled effect-run observations.
Both record the same two requests and return `true`. With one observation, both
stop at the named source program's second request. A wrong-typed value remains
unapplied.

## Open semantic system design lens

### Boundary and warranted state

Feature 0038 owns only orchestration between accepted boundaries:

- one call to the 0026 surface compiler;
- one canonical encoding of its strictly decoded kernel document;
- one bounded inert decode of the 0037 observation script;
- independent invocation of the reference and bytecode replay entry points;
  and
- one immutable container retaining the compilation and both observations.

The surface parser owns source representation and names. The kernel checker
owns types, effects, grades, and usage. The reference interpreter and bytecode
VM own their distinct execution states and continuation custody. This layer
warrants only that all three outputs derive from the same captured inputs; it
does not warrant backend equivalence.

### Semantic inputs

The inputs are `unknown` surface source and `unknown` versioned observation
script. Surface compilation occurs first. If it rejects, the Effect fails with
the existing phase-specific `SurfaceLanguageError` and neither backend runs.

After successful compilation, the script crosses
`decodeExternalObservationScript` exactly once. An invalid or non-inert script
is a successful replay observation with identical `script-rejected` results
for the two backend fields; neither backend executes. A decoded immutable
script is then supplied to both backends. Stateful accessors, aliases, exotic
objects, and other non-inert inputs cannot be observed separately by the two
paths.

### Semantic outputs

The Effect returns a deeply immutable `SurfaceEffectReplay`:

```ts
interface SurfaceEffectReplay {
  readonly compilation: SurfaceCompilation;
  readonly reference: KernelEffectRunObservation;
  readonly compiled: KernelEffectRunObservation;
}
```

`compilation` retains the named AST, strict kernel document, and authoritative
check observation. `reference` and `compiled` retain the complete existing
0037 counts, request trace, and result. They remain separate evidence. The
container adds no `equal`, `verified`, or `correct` flag; callers may compare
canonical bytes while retaining the possibility of mismatch or inconclusive
execution.

### Effect protocols and uncertainty

The program is finite and local:

1. compile source once through 0026;
2. encode the accepted kernel document once;
3. capture and decode the script once;
4. if rejected, return the same rejection observation for both fields;
5. otherwise give defensive kernel-byte copies and the decoded script to each
   backend in a fixed reference-then-compiled order; and
6. freeze and return the three observations.

Expected surface failures remain in the typed Effect error channel. Script,
kernel, checking, runtime, suspension, and inconclusive outcomes remain in
their existing observation values. There is no retry, fallback, cancellation,
parallel race, or implicit selection of a winning backend.

### Components and orthogonal structures

```text
unknown source -> 0026 parser/elaborator/check -> SurfaceCompilation
                                                    |
                                                    v
                                           canonical kernel bytes
unknown script -> one inert 0037 decode              |
                         |                           |
                         +------------+--------------+
                                      |
                         +------------+-------------+
                         v                          v
                reference affine replay    bytecode affine replay
                         |                          |
                         +------------+-------------+
                                      v
                     immutable SurfaceEffectReplay
```

Source syntax, kernel terms, observation values, continuation custody,
execution traces, and differential comparison are distinct structures. The
new module is a composition root outside `src/surface-language`; the portable
parser/elaborator closure gains no execution dependency.

### Bounded autonomy and resources

- existing 0026 source, token, identifier, declaration, and depth bounds;
- existing 0037 limit of 256 observations and 257 requests;
- existing reference and bytecode default fuel, trace, stack, and graph bounds;
- one surface compilation, one canonical kernel encoding, and one script
  capture per call;
- two sequential backend executions with defensive kernel-byte copies; and
- no filesystem, network, clock, random, process, queue, fiber, or background
  authority.

Version 1 intentionally exposes no custom execution bounds. Advanced callers
can compose the accepted lower-level APIs when distinct bounds are required.

### Evidence, assumptions, and unsupported claims

Example and generated tests observe full two-request completion, prefix
suspension, wrong-type non-consumption, script rejection, checker rejection,
single capture of hostile/moving input, canonical backend agreement, and Bun /
genuine Node parity. Architecture tests keep backend imports out of the
surface-language closure and keep the bytecode path independent of the
reference machine.

These observations do not prove compiler equivalence. The implementation
assumes accepted lower layers preserve their contracts. It does not establish
that script values came from real environmental effects or that equal bounded
observations imply equality for all programs.

## Deep-module contract

```ts
replaySurfaceDocumentEffects(source, observationScript)
  -> Effect<SurfaceEffectReplay, SurfaceLanguageError>
```

The existing 0026 and 0037 public interfaces do not change. The function lives
in `src/surface-execution/index.ts`, not the portable surface-language module.

## Oracle-first counterexamples

1. An invalid source cannot execute either backend.
2. A stateful or accessor script cannot present different values to the two
   backends; it rejects during the one inert capture.
3. A malformed script cannot be mislabeled as a source failure.
4. A wrong-typed observation cannot be reported as applied.
5. A script prefix cannot be reported as a completed return.
6. A kernel check rejection remains a check rejection in both backend fields.
7. Different binder spellings, whitespace, comments, or source spans cannot
   change backend observations.
8. One backend cannot call or import the other.
9. An inconclusive equal pair cannot acquire an automatic agreement claim.
10. Existing surface compilation and kernel replay observations cannot change.

## Acceptance

Feature 0038 is accepted when one clean head passes its exact executable
acceptance, focused Bun and genuine Node journeys, fixed-seed generated source
and script comparisons, canonical byte comparison, TypeScript 7 with Effect
diagnostics, Oxlint, Oxfmt, project-model validation, generated-view equality,
the complete repository gate, and independent review of the exact head.

## Kill or redesign criteria

Recut if the composition layer needs to duplicate parsing, checking, replay,
or VM semantics; if it imports the reference machine into the compiled path;
if it reads caller source or script more than once; if it invents an agreement
claim; or if it adds execution authority to `src/surface-language`.

## Non-goals

No syntax change, inference, new handler form, custom execution bounds,
asynchronous live handler service, multishot continuation, continuation
serialization, formatter, optimizer, package system, CLI, deployment, or proof
of equivalence is included.

## Semantic diff

Agents gain one supported Effect composition from readable named Semantic
source and strict JSON observations to the existing reference and compiled
affine effect traces. Every lower-layer semantic authority and observation
format remains unchanged.
