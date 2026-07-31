# Design spec 0022: kernel reference interpreter

Status: frozen for the first executable agent-facing kernel journey

Date: 2026-07-31

Depends-On-Feature-IDs: 0018-minimal-kernel-calculus,
0019-normalized-core-format, 0020-agent-facing-kernel-json

Design-Lens-Version: open-semantic-system-v1

## Problem

The accepted kernel has a checker and bounded CBPV abstract machine. The frozen
agent-facing interface has a strict recursive JSON document and a detailed
check observation. They are not yet one product journey: an agent cannot pass
kernel JSON to one documented interpreter entry point and receive one stable,
implementation-neutral pipeline observation.

The next step must establish the interpreter before an optimized compiler.
Otherwise the first compiler would define both the intended language meaning
and its implementation, leaving no executable oracle against which to find
miscompilations.

## Felt journey

An agent submits canonical bytes for a closed kernel program. The reference
interpreter decodes the bytes, checks the document, and runs the accepted 0018
machine. A pure program returns an exact runtime value. A program with an
unhandled operation returns the exact operation request. A semantic mistake
returns the existing 0020 check rejection. Malformed bytes return the existing
0020 representation diagnostics. No phase silently reclassifies another
phase's result.

Later, an optimized compiler implements the same pipeline observation. A
property generator produces valid and invalid bounded programs, runs both
backends, and compares canonical observations. fast-check shrinks any mismatch
to a small replayable program and reports its seed and path.

## Open semantic system design lens

### Boundary and warranted state

Feature 0022 owns:

- one reference interpreter that composes the accepted 0020 decoder and check
  view with the accepted 0018 checker and machine;
- one closed `semantic.kernel-run` observation that removes
  implementation-specific reduction details;
- canonical bytes for that observation;
- a backend contract for future differential testing; and
- bounded valid and invalid program arbitraries used as evidence producers.

The 0020 decoder alone warrants representation validity. The 0018 checker
alone warrants semantic acceptance. A checked program in private custody alone
authorizes evaluation. The 0018 machine defines reference operational meaning.
The interpreter wrapper mints none of those facts; it only composes and
projects their observations.

### Semantic inputs

The public interpreter accepts unknown bytes and optional bounds no wider than
the existing 0018 and 0020 defaults. A decoded-document entry point accepts
only a genuine privately decoded `KernelDocument`.

The future differential harness accepts two `KernelBackend` values, one
generated case, and one deterministic test configuration. The reference
backend is mandatory. A compiled backend cannot claim conformance merely by
sharing a name or output shape.

### Semantic outputs

Every attempt returns one closed `KernelRunObservation`:

```text
RepresentationRejected(diagnostics)
CheckRejected(checkObservation)
Returned(value)
Suspended(request)
RuntimeRejected(diagnostic)
Inconclusive(reason)
```

`Inconclusive` records an interpreter fuel or trace-bound exhaustion. It is
not a language result and cannot count as compiler agreement. The canonical
observation deliberately excludes machine frames, continuation identities,
resumption object identity, allocation counters, reduction-rule traces,
compiler IR, cache keys, and timing.

### Effect protocols and uncertainty

Version 1 runs until return, first unhandled operation, runtime rejection, or
resource exhaustion. It does not interpret an external effect. A suspension
is an explicit request observation, not completion and not failure.

All work is finite and local. The interpreter requests no filesystem, network,
clock, random, process, or console capability. Property generation is seeded
and replayable. Sampling is evidence, not proof.

### Components and orthogonal structures

```text
unknown bytes
  -> 0020 strict decoder
  -> KernelDocument
  -> 0020 projection
  -> 0018 checker
  -> privately custodied CheckedProgram
  -> 0018 bounded abstract machine
  -> implementation-neutral semantic observation
  -> canonical bytes
```

The check view and checked program are derived from the same decoded document.
The agent-facing check observation remains separate from execution authority.
The machine trace is retained for focused machine debugging but is not part of
backend equivalence. The future compiler may lower to bytecode, SSA, Wasm, or
another representation without changing the interpreter contract.

### Bounded autonomy and resources

The existing JSON byte, depth, node, string, and collection limits remain in
force. The existing checker bounds remain in force. The interpreter narrows or
uses the existing evaluation fuel and trace limits; it cannot widen them.

Property tests use an explicit seed, run count, maximum generated depth, and
maximum generated collection size. A failing counterexample must retain the
seed and shrink path reported by fast-check. Test infrastructure timeout or
resource exhaustion is a failed or inconclusive test run, never a successful
semantic comparison.

### Evidence, assumptions, and unsupported claims

Example tests cover every pipeline outcome. Property tests cover canonical
round trips, valid-program determinism, invalid-program phase separation, and
generated programs staying within their stated grammar. Bun and genuine Node
must emit byte-identical observations for the selected corpus.

When the optimized compiler arrives, its acceptance must add differential
properties over both valid and invalid generated documents. This feature does
not claim a compiler exists, that random sampling proves equivalence, or that
the kernel is type sound. It does not claim equal performance or equal
internal traces.

## Deep-module contract

### Stable run observation

Version 1 freezes this top-level envelope:

```text
KernelRunObservation := {
  "format": "semantic.kernel-run",
  "version": 1,
  "kernel": "semantic.kernel-calculus/0018/v1",
  "observation": RunObservation
}
```

`RunObservation` is a closed tagged union:

```text
{"tag":"representation-rejected","diagnostics":[RepresentationDiagnostic...]}
{"tag":"check-rejected","check":KernelCheckObservation}
{"tag":"returned","value":ObservableRuntimeValue}
{"tag":"suspended","request":ObservableOperationRequest}
{"tag":"runtime-rejected","diagnostic":ObservableRuntimeDiagnostic}
{"tag":"inconclusive","reason":"fuel"|"trace"}
```

Runtime unit, boolean, integer, and pair values retain their recursive value.
Thunks and functions are opaque `{"kind":"thunk"}` and
`{"kind":"function"}` observations. Their meaning is tested by placing them
in generated consuming contexts, not by inspecting their host closure.

A suspension includes label, operation, observable argument, and declared
result type. It excludes the one-shot token and interpreter allocation ID. A
runtime rejection includes stable code, occurrence path, and structured
expected/actual facts when present. It excludes host stack and internal rule
names.

Canonical encoding uses the accepted 0019 JSON rules and one final line feed.
Canonical byte equality is the default backend comparator.

### Reference interpreter

The reference interpreter must:

1. snapshot and strictly decode unknown bytes through 0020;
2. project the decoded document through 0020;
3. call the 0018 checker;
4. evaluate only the genuine accepted `CheckedProgram` returned by that call;
5. project the 0018 machine outcome without re-evaluating it; and
6. return a deeply immutable run observation.

It must not optimize terms, constant-fold, pre-handle effects, reconstruct a
checked-program lookalike, parse JSON directly, or use a second typing rule.

### Differential compiler contract

A future compiler is accepted only if one property suite runs the same
generated case through the reference and compiled backends.

For representation-invalid programs, both pipelines must return the same
canonical representation rejection. For representation-valid but
semantically invalid programs, both must return the same canonical check
rejection. For valid programs, both must return the same canonical returned,
suspended, or runtime-rejected semantic observation.

The property suite must:

- generate by grammar and type where possible instead of discarding most
  samples;
- include deliberate invalid mutations at representation, scope, type, effect,
  and affine-usage boundaries;
- retain deterministic seeds and shrinking;
- cover every term constructor and grade;
- test consuming contexts for returned functions and thunks;
- reject `inconclusive` as evidence of agreement; and
- preserve every minimized mismatch as a named regression fixture.

Optimization begins only after the reference interpreter and generator corpus
are stable. Compiler-specific traces may be tested separately but cannot
replace semantic observation equality.

## Acceptance

Feature 0022 is accepted when:

1. the public JSON-to-run entry point is documented and host-neutral;
2. the interpreter uses the accepted decoder, checker, and machine directly;
3. every run observation variant is closed, strict, immutable, and canonical;
4. implementation-specific trace and token identities are absent;
5. valid generated pure and fully handled programs return deterministically;
6. invalid generated programs remain in the correct rejection phase;
7. fast-check seeds and shrinks failures;
8. Bun and genuine Node produce byte-identical selected observations;
9. architecture tests reject ambient authority and unchecked evaluation;
10. 0018, 0019, and 0020 acceptance remain green; and
11. exact feature acceptance and full repository gates pass at one clean head.

The exact acceptance command is:

```bash
bun scripts/accept/0022-kernel-reference-interpreter.ts
```

## Kill or redesign criteria

Stop or recut if the interpreter duplicates typing rules, an optimized path is
introduced before the reference path is accepted, compiler agreement depends
on identical internal traces, invalid programs can reach evaluation, or a
property test treats exhaustion as equivalence.

## Non-goals

- An optimized compiler, bytecode, SSA, Wasm, or native backend.
- Surface syntax, elaboration, modules, packages, or build caching.
- External effect handlers beyond first suspension.
- Benchmarking or performance claims.
- Proof of compiler correctness, progress, preservation, or type soundness.

## Further reading

- [fast-check: what property-based testing is](https://fast-check.dev/docs/introduction/what-is-property-based-testing/)
- [fast-check properties](https://fast-check.dev/docs/core-blocks/properties/)
- [Effect v4 documentation](https://effect-ts.github.io/effect/)
- [Stable TypeScript 7 release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
