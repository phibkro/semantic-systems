# Design spec 0032: baseline bytecode backend

Status: frozen for implementation

Date: 2026-08-01

Depends-On-Feature-IDs: 0018-minimal-kernel-calculus,
0020-agent-facing-kernel-json, 0022-kernel-reference-interpreter

Design-Lens-Version: open-semantic-system-v1

## Problem

The accepted reference interpreter defines the executable meaning of one
agent-facing kernel program, but there is no independent compiled backend with
which to test that meaning. An implementation that reuses the 0018 abstract
machine would only replay the same evaluator through another name. A compiler
that exposes its representation as a stable byte format would prematurely
freeze an optimization and persistence boundary before the instruction set has
earned that stability.

Feature 0032 establishes the smallest genuinely independent compiler journey:
strict kernel bytes cross one shared representation-and-check boundary, an
accepted program is compiled into opaque immutable process custody, and a
separate finite bytecode machine returns the exact accepted
`semantic.kernel-run` observation. Differential properties compare that
observation with the 0022 reference interpreter.

“Portable” means that the compiler, VM, and observation bytes run identically
under the repository's supported Bun and Node hosts without host-specific
machine facilities. It does not mean that compiled custody is a portable or
durable interchange representation.

This is a baseline bytecode backend. It is not “CBPV lowering”: 0018 already is
the CBPV-style kernel. It is not an optimized compiler.

## Felt journey

An agent submits one bounded `semantic.kernel-json` byte sequence. The shared
boundary returns the same representation or check rejection used by the
reference interpreter, or privately warrants a checked program. The compiler
turns that warranted program into a finite instruction/block graph and mints
opaque compiled custody. The independent VM executes only that graph. The
agent receives the same canonical returned, suspended, runtime-rejected, or
inconclusive `semantic.kernel-run` observation that the reference path returns.

A fixed-seed grammar-directed generator supplies valid programs covering every
0018 term constructor and grade, plus deliberate invalid mutations. When the
two paths disagree, fast-check shrinks the case and the minimized canonical
kernel bytes become a named fixture. A deliberately perturbed test backend must
be detected, proving that the oracle can find a real semantic difference
instead of merely confirming shared structure.

## Open semantic system design lens

### Boundary and warranted state

Feature 0032 owns:

- one shared, strict bytes-to-check preparation seam used by both reference and
  compiled execution;
- one baseline compiler from genuine checked-program custody to a finite
  instruction/block graph;
- one opaque, deeply immutable compiled-program custody value whose constructor
  is not public;
- one independent bounded VM that executes that graph without inspecting a
  kernel AST;
- one bytes-only compiled backend entry point that returns the frozen 0022
  `KernelRunObservation`; and
- one differential corpus and comparison harness.

The 0020 decoder alone warrants representation validity. The 0018 checker alone
warrants semantic acceptance. The shared preparation seam composes those
authorities but mints no new typing judgment. The compiler may consume only the
genuine checked custody returned by that seam. Only the compiler can mint
compiled custody, and only the bytecode VM can execute it.

Compiled custody is an opaque process-local capability, not external data. Its
instruction and block arrays, constants, labels, types, and branch targets are
snapshotted and deeply immutable. A structural lookalike, caller mutation,
subclass, proxy, or object produced by decoding bytes cannot acquire execution
authority.

### Semantic inputs

The public compiled backend accepts unknown bytes and optional bounds. Its JSON
and checking bounds are exactly the shared 0020/0022 bounds and may be narrowed,
never widened. Its compilation and VM bounds are new finite positive integers
with exact version 1 defaults. Malformed, missing, wrongly typed, accessor-backed,
or throwing bound fields are read at most once and resolve component-wise to
those exact defaults without a host exception.

The differential harness accepts the reference backend, the compiled backend,
one generated canonical byte sequence, and explicit seed/run/size bounds. A
backend identity or output TypeScript shape is not evidence of conformance.

Generated valid inputs are grammar-directed and construction-valid rather than
filtered from arbitrary JSON. Across the deterministic corpus they cover every
value term (`variable`, `unit`, `bool`, `int`, `pair`, `thunk`, `resumption`),
every computation term (`return`, `let`, `force`, `lambda`, `apply`,
`operation`, `handle`, `resume`), every value/computation type constructor, and
grades `0`, `1`, and `omega` at every grade-bearing grammar position.
Binder- and resumption-only constructors appear inside contexts that warrant
them. Returned thunks and functions are compared through generated consuming
contexts.

Deliberate invalid mutations begin from a known valid canonical document and
cross exactly one named boundary: representation, scope, type, effect, or
affine resumption use. A mutation that accidentally becomes invalid at an
earlier boundary does not count as evidence for the intended later boundary.

### Semantic outputs

The bytes-only compiled entry point returns the exact closed
`KernelRunObservation` frozen by 0022:

```text
RepresentationRejected(diagnostics)
CheckRejected(checkObservation)
Returned(value)
Suspended(request)
RuntimeRejected(diagnostic)
Inconclusive(reason)
```

It adds no compiler envelope, instruction trace, block identity, program
counter, allocation identity, custody token, timing, or cache key. Canonical
encoding uses `encodeCanonicalKernelRunObservation`; byte equality is the
semantic comparator.

Compilation and VM defects that are possible after genuine checked custody are
typed internally and projected to stable `runtime-rejected` diagnostics in a
compiler-owned code namespace. They are never recast as representation or
check rejection. Bounds exhaustion projects to the existing `inconclusive`
observation and never counts as agreement, including when both backends report
the same reason.

The instruction graph is a derived, noncanonical implementation value. It
cannot be serialized through a public API in version 1.

### Effect protocols and uncertainty

Compilation and VM execution are deterministic, local, and finite under their
bounds. They request no filesystem, network, clock, randomness, environment,
process, or console capability. Property generation uses an explicit random
seed as test input; production compilation has no random capability.

Strict decoding is an Effect Schema boundary. Expected preparation,
compilation, and VM failures remain tagged in the Effect error channel until
the one bytes-to-observation composition root projects them. Pure instruction
selection and stepping can remain total TypeScript leaf computations. No
reusable module runs its own Effect runtime or chooses a live Layer.

Sampling is test observation, not proof. A timeout, generator failure, shrink
failure, or exhausted backend makes the property run fail or become
inconclusive; it cannot produce agreement.

### Components and orthogonal structures

```text
                         shared strict preparation
unknown bytes ---------------------------------------------------+
       |                                                         |
       +-> 0020 decode -> 0020 check view -> 0018 checker         |
                     | rejection                 | checked custody|
                     v                           v                |
             exact kernel-run rejection     +----+----+           |
                                             |         |           |
                                             v         v           |
                                     0022 reference  baseline      |
                                     machine path     compiler      |
                                                       |           |
                                                       v           |
                                              opaque instruction   |
                                                / block graph      |
                                                       |           |
                                                       v           |
                                                independent VM     |
                                             +---------+-----------+
                                             v
                                  exact semantic.kernel-run bytes
```

The source term graph, compiled instruction graph, VM control-flow graph, and
generated-test shrink tree are distinct structures. Kernel binder ownership is
resolved during compilation; bytecode operand slots and VM continuation frames
must not be mistaken for source binders. A VM suspension is the same outward
operation request observation as the reference path, not completion.

The complete transitive module-dependency graph rooted at the compiled backend
must contain no import or call path to
`src/kernel-calculus/machine.ts`, `evaluate`, `resume`, or
`interpretKernelJsonBytes`. The differential harness may call
`interpretKernelJsonBytes` only as the oracle side of a comparison. It may not
share execution helpers, runtime values, continuation frames, or reduction
rules with the compiled side.

### Bounded autonomy and resources

The accepted 0020 byte, depth, node, string, collection, operation, clause, and
label limits remain in force. The accepted 0022 evaluation limits remain in
force for the reference side. Version 1 also fixes maximum instruction count,
block count, constant count, operand-stack depth, continuation depth, VM fuel,
and captured trace entries. Compilation performs a finite traversal and must
reject or become inconclusive before any configured maximum is exceeded. The
VM has one program counter and bounded stacks; every step consumes fuel.

Property runs fix seed, path, run count, generated depth, generated collection
size, mutation count, and per-backend bounds. Shrinking is finite. Each
disagreement reports its seed and path. A minimized mismatch is committed as a
named canonical fixture before the defect is considered corrected.

### Evidence, assumptions, and unsupported claims

Contract-shape tests establish that only bytes can enter compiled execution and
that compiled custody has no public constructor or serializer. A transitive
module-graph test plus source scans establish absence of imports and named calls
into the reference machine over the scanned revision; a direct-string scan
alone is insufficient. Runtime custody tests attempt forgeries, mutation,
proxies, and cross-instance values. Focused examples exercise every observation
variant and all configured exhaustion boundaries.

Grammar coverage counters establish that the deterministic generated corpus
visited every frozen constructor and grade; they do not prove all programs were
generated. Differential properties observe agreement over valid and
deliberately invalid cases. A deliberately perturbed compiled backend must
produce a minimized mismatch. Bun and genuine Node must produce byte-identical
compiled observations, reference observations, and minimized fixtures over the
selected corpus.

This evidence does not prove compiler correctness, type soundness, progress,
termination without bounds, performance, or a stable bytecode representation.

## Deep-module contract

The public module exposes one bytes-only compiled execution function and the
smallest backend adapter needed by the differential harness. The function
returns the existing `KernelRunObservation` and accepts only explicit bounded
configuration. No public overload accepts a decoded document, kernel AST,
checked-program lookalike, instruction graph, or compiled-program lookalike.

Compiler and VM modules communicate through an opaque `CompiledProgram` whose
constructor and representation stay private. Tests may inspect a separate
read-only diagnostic projection of instruction kinds and graph cardinalities,
but that projection neither reconstructs custody nor executes. It is not a
wire format.

The shared preparation seam is the single source of representation and check
rejections for both backends. The reference interpreter is refactored to use
that seam without changing one canonical observation byte. The compiler never
rechecks with a second typing rule and never compiles a rejected program.

Differential agreement is:

```text
reference.tag != inconclusive
and compiled.tag != inconclusive
and encodeCanonicalKernelRunObservation(reference)
    == encodeCanonicalKernelRunObservation(compiled)
```

Any other pair is mismatch or inconclusive, never agreement.

## Oracle-first counterexamples

- A valid pure term returns the same canonical value through both paths.
- An unhandled operation suspends with the same canonical request.
- A fully handled operation and one-shot resumption returns the same value.
- Each representation, scope, type, effect, and affine mutation remains in its
  owning rejection phase and has byte-identical diagnostics.
- Every term constructor, type constructor, and grade is visited by a valid
  generated case under a fixed seed.
- Returned function and thunk observations agree when placed in generated
  consuming contexts.
- Equal `inconclusive` observations are rejected as evidence of agreement.
- A backend that deliberately changes one returned integer, suspension label,
  or rejection tag is found and shrunk to a replayable mismatch.
- Forged, mutated, proxy-backed, or foreign compiled values cannot execute.
- A source scan fails if compiler or VM code imports or calls the reference
  machine, evaluator, resumer, or interpreter.
- Narrow compilation and VM bounds terminate deterministically at their exact
  boundary without a host exception.

## Acceptance

Feature 0032 is accepted when:

1. both backends use one strict bytes/check preparation boundary and retain
   byte-exact 0020 rejection observations;
2. only genuine checked custody reaches compilation and only genuine opaque,
   deeply immutable compiled custody reaches the VM;
3. the compiler produces a finite instruction/block graph and the VM executes
   it without inspecting kernel AST nodes or reference-machine state;
4. compiler and VM modules have no import or call path to `machine.ts`,
   `evaluate`, `resume`, or `interpretKernelJsonBytes`;
5. every conclusive generated valid case has byte-identical canonical
   `semantic.kernel-run` observations;
6. every deliberate invalid mutation remains in its named rejection phase and
   agrees byte-for-byte;
7. `inconclusive` never counts as agreement;
8. the deterministic valid corpus covers every term/type constructor and grade,
   retains seeds and shrink paths, and persists every minimized mismatch;
9. a deliberately perturbed backend is detected and minimized;
10. configured byte, compile, graph, stack, fuel, trace, generation, and shrink
    bounds are enforced without ambient effects or host exceptions;
11. Bun and genuine Node emit byte-identical selected observations and fixtures;
12. 0018, 0020, and 0022 exact acceptance remain green; and
13. TypeScript 7, Effect diagnostics, Oxlint, Oxfmt, project-model validation,
    generated projections, the full repository gate, and exact-head independent
    review pass.

The exact acceptance command is:

```bash
bun scripts/accept/0032-baseline-bytecode-backend.ts
```

## Kill or redesign criteria

Stop or recut if compiled execution calls the reference evaluator; a structural
object can forge compilation or execution custody; exact rejection equality
requires a second decoder or checker; a valid 0018 constructor cannot be
represented without changing kernel semantics; execution requires unbounded
host recursion or allocation; `inconclusive` can pass equivalence; or version 1
must expose a durable instruction encoding before the instruction semantics are
stable.

## Non-goals

- CBPV lowering or a new kernel calculus.
- Optimization, constant folding, dead-code elimination, SSA, Wasm, native
  code, benchmarking, or performance claims.
- A durable bytecode wire format, bytecode JSON Schema, persistence, cache key,
  content address, or cross-process compiled artifact.
- Compiler-derived cross-value dependencies, modules, packages, linking,
  reachability authority, or build-system invalidation.
- Surface parsing, elaboration, external effect interpretation, or resuming an
  externally suspended computation.
- A proof of compiler correctness, type soundness, progress, or preservation.

## Semantic diff

The system gains a second, independently executing backend and differential
evidence against the accepted reference meaning. The 0018 calculus, 0020
agent-facing bytes, 0022 canonical run observation, checker authority, effect
request meaning, and language result vocabulary remain unchanged. Bytecode is
an internal derived implementation value and carries no durable semantic or
build-system identity.

## Further reading

- [Effect v4 documentation](https://effect-ts.github.io/effect/)
- [fast-check properties](https://fast-check.dev/docs/core-blocks/properties/)
- [fast-check replay and shrinking](https://fast-check.dev/docs/advanced/runners/)
- [Stable TypeScript 7 release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
