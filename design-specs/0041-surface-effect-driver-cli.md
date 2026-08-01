# Design spec 0041: surface effect-driver CLI

Status: frozen for implementation

Date: 2026-08-01

Depends-On-Feature-IDs: 0026-semantic-surface-language,
0037-one-shot-external-effect-replay, 0040-surface-runner-cli

Design-Lens-Version: open-semantic-system-v1

## Problem

Agents can run readable source until its first unhandled operation and can
drive kernel JSON with a bounded observation script, but there is no process
journey that composes those accepted capabilities. Requiring an agent to
compile source, extract kernel JSON, and invoke a second command introduces an
unnecessary intermediate artifact and invites the wrong backend or script
boundary to be selected.

Feature 0041 adds the interpreter-first composition as one stateless command.
It does not add language syntax, install an ambient handler, expose a
continuation, or invoke the bytecode backend.

## Felt journey

An agent runs
`semantic drive program.semantic observations.json`. The command compiles the
readable source once. Only after successful compilation does it read and
strictly decode one bounded JSON observation stream, apply each observation to
the current affine suspension in order, and emit one canonical
`semantic.surface-effect-run/v1` observation. A script prefix visibly suspends
at the next request; a wrong-typed value remains unapplied.

## Open semantic system design lens

### Boundary and warranted state

The command owns only composition and process classification:

- one bounded source read and one accepted surface compilation;
- on compilation success, one bounded observation-script read and strict JSON
  decode;
- one canonical encoding of the accepted kernel document;
- one invocation of the reference interpreter's accepted affine driver; and
- one canonical outer observation.

The surface compiler remains the source authority. The kernel checker remains
the type, effect, grade, and usage authority. The 0037 driver owns ordered
observation admission and one-shot continuation custody. The command warrants
neither the provenance of supplied values nor compiler equivalence.

### Semantic inputs

The command family is exactly
`drive SOURCE_FILE|- OBSERVATIONS_FILE|-`. Both operands cannot be `-`: one
stdin byte stream cannot warrant two distinct semantic inputs. That invocation
rejects before any input read.

Source bytes retain the frozen 0040 bound and decoding behavior. Source
compilation completes before the observation path is read; a rejected source
therefore cannot observe a missing, changing, or effectful script input.

The observation stream is at most 1,048,576 bytes plus one detectable excess
byte, strict UTF-8, and one JSON value. A bounded JSON scan rejects duplicate
keys, invalid grammar, more than 128 nesting levels, or more than 65,536 JSON
nodes before Effect Schema decoding. The value must then satisfy the accepted
`semantic.kernel-observation-script/v1` schema, including its 256-observation
limit and first-order value restriction. No raw `JSON.parse` boundary is
introduced.

### Semantic outputs

Every semantic attempt writes exactly one immutable canonical observation:

```json
{
  "format": "semantic.surface-effect-run",
  "version": 1,
  "surface": "semantic.surface-language/0026/v1",
  "kernel": "semantic.kernel-calculus/0018/v1",
  "observation": {
    "tag": "effect-observed",
    "effect_run": {
      "format": "semantic.kernel-effect-run",
      "version": 1,
      "kernel": "semantic.kernel-calculus/0018/v1",
      "observation": {
        "tag": "executed",
        "provided_observations": 0,
        "applied_observations": 0,
        "requests": [],
        "result": { "tag": "returned", "value": { "kind": "unit" } }
      }
    }
  }
}
```

The outer observation is either `source-rejected` with the existing 0040
diagnostic or `effect-observed` with the existing 0037 effect-run observation.
Byte, JSON, and schema failures are `script-rejected` effect observations;
they are not host failures and do not execute the kernel.

Exit status is 0 for an executed return or suspension, 1 for source, script,
representation, check, runtime, or inconclusive rejection, and 2 for usage or
host I/O failure. Usage and host failures write no semantic stdout.

### Effect protocols and uncertainty

The command performs a fixed sequence:

1. validate the command shape and distinct stdin ownership;
2. read and compile source exactly once;
3. stop with a source observation if compilation rejects;
4. read and decode the script exactly once;
5. stop with a script observation if decoding rejects;
6. encode the accepted kernel and invoke only the reference affine driver;
7. encode and write exactly one outer observation; and
8. classify its exit status.

There is no retry, fallback, parallel read, clock, network, queue, background
fiber, ambient effect implementation, or implicit backend selection. Repeated
operations may create repeated fresh affine suspensions; no suspension may be
resumed twice.

### Components and orthogonal structures

```text
source bytes -> strict UTF-8 -> surface compile -> accepted kernel
                                                |
script path (unread until compile succeeds)     v
     -> bounded bytes -> JSON scan -> Schema -> affine reference driver
                                                |
                                                v
                                  canonical surface-effect observation
```

Source text, surface AST, kernel document, script value, request trace,
continuation custody, and process observation remain distinct structures.

### Bounded autonomy and resources

- source: accepted 1,048,576-byte, token, declaration, identifier, and depth
  bounds;
- script: 1,048,576 bytes, 128 JSON levels, 65,536 nodes, 256 observations,
  and existing portable-fact depth/node bounds;
- execution: existing reference fuel and trace bounds on each affine segment;
- at most one source read, one script read, one compile, one kernel encoding,
  and one reference drive; and
- no filesystem authority beyond the two explicit reads and output writes.

### Evidence, assumptions, and unsupported claims

Focused and genuine-process tests observe full multi-request completion,
prefix suspension, wrong-type non-consumption, source-first custody, exact
bounds, duplicate-key and malformed JSON rejection, invalid UTF-8, stdin
ambiguity rejection, host failures, canonical output, architecture custody,
and byte-identical Bun/Node behavior.

These observations do not prove language soundness or equivalence to a future
compiler. Script values remain claims supplied by the caller, not evidence of
real-world effects.

## Deep-module contract

```text
semantic drive SOURCE_FILE|- OBSERVATIONS_FILE|-
  -> semantic.surface-effect-run/v1 bytes + exit status

compileSurfaceSourceBytes(bytes)
  -> compiled SurfaceCompilation | source diagnostic

driveSurfaceSourceBytes(sourceBytes, observationBytes)
  -> Effect<SurfaceEffectRunObservation>
```

The frozen `semantic run FILE|-` command and
`semantic.surface-run/v1` bytes do not change. Effect v4's experimental CLI is
not adopted in this slice because replacing the accepted two-argument parser
would also change established help, usage, and error behavior; that migration
requires its own process contract when the command family warrants it.

## Oracle-first counterexamples

1. A rejected source cannot cause the script path to be read.
2. Both semantic inputs cannot alias one stdin stream.
3. Duplicate JSON keys cannot be collapsed by a decoder.
4. Invalid UTF-8 cannot be interpreted with replacement characters.
5. An over-limit prefix cannot wait for end-of-file.
6. A malformed script cannot masquerade as a source or host failure.
7. A wrong-typed observation cannot be reported as applied.
8. A script prefix cannot be reported as a completed return.
9. The command cannot invoke the bytecode backend or surface replay pair.
10. Existing `semantic run` canonical bytes cannot change.

## Acceptance

Feature 0041 is accepted when one clean head passes its exact acceptance
script, focused injected-host and genuine Bun/Node journeys, inherited surface
runner and affine replay suites, TypeScript 7 Effect diagnostics, Oxlint,
Oxfmt, project-model validation, generated-view equality, the complete
repository gate, and independent Claude-family review of the exact candidate.

## Kill or redesign criteria

Recut if the command must read the script before source admission, duplicates
parsing/checking/replay semantics, invokes both backends, exposes or clones a
continuation, accepts two stdin operands, changes 0040 canonical bytes, or
needs an unbounded/background process.

## Non-goals

No new syntax, inference, handler form, true multishot continuation, live
handler service, continuation serialization, bytecode execution, differential
claim, optimizer, package system, deployment, or Effect CLI migration.

## Semantic diff

Agents gain one bounded command from readable named Semantic source and strict
JSON observations to the accepted reference interpreter's affine effect trace,
without manually materializing kernel JSON or changing any existing semantic
boundary.
