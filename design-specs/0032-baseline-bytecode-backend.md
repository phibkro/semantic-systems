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
semantically admissible 0018 term constructor and grade, plus deliberate
invalid mutations for structurally representable but inadmissible forms. When
the two paths disagree, fast-check shrinks the case and the minimized canonical
kernel bytes become a named fixture. Test-only compilers that perturb an
internal opcode, branch target, or resolved slot must be detected, proving that
the oracle can find real compiled-graph differences instead of merely
confirming shared structure or an outward result wrapper.

## Open semantic system design lens

### Boundary and warranted state

Feature 0032 owns:

- one shared, strict bytes-to-check preparation seam used by both reference and
  compiled execution;
- the narrow kernel-JSON direct-import and check-composition refactor required
  for that seam to return the exact accepted observation together with genuine
  checked-program custody, without placing the reference machine in the
  compiled backend's transitive module graph;
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
never widened. The optional outer record has exactly `json` (the inherited
`KernelJsonRawBounds`) and `bytecode` (the record below); no `evaluation` field
controls the compiled path. The differential harness supplies 0022 reference
evaluation bounds separately. Compilation and VM use this exact version 1
`bytecode` record:

| Field                      | Default | Lower bound | Owns                                      |
| -------------------------- | ------: | ----------: | ----------------------------------------- |
| `maximumInstructions`      |  16,384 |           1 | compiled instruction cardinality          |
| `maximumBlocks`            |   4,096 |           1 | compiled block cardinality                |
| `maximumConstants`         |  16,384 |           0 | source-free constant/type descriptors     |
| `maximumOperandStackDepth` |   4,096 |           0 | VM operand stack                          |
| `maximumContinuationDepth` |   4,096 |           0 | VM call, force, and handler continuations |
| `vmFuel`                   |  10,000 |           0 | VM transitions                            |
| `maximumTraceEntries`      |  10,000 |           1 | captured VM trace entries                 |

Every field must be a safe integer no lower than its stated bound. A supplied
value above its default is narrowed to the default. A missing, wrongly typed,
below-lower-bound, accessor-backed, or throwing field is read at most once and
resolves component-wise to its exact default without a host exception. The
outer `json` and `bytecode` fields follow the same single-read rule.

The differential harness accepts the reference backend, the compiled backend,
one generated canonical byte sequence, and explicit seed/run/size bounds. A
backend identity or output TypeScript shape is not evidence of conformance.

Generated valid inputs are grammar-directed and construction-valid rather than
filtered from arbitrary JSON. Across the deterministic corpus they cover every
semantically admissible value term (`variable`, `unit`, `bool`, `int`, `pair`,
`thunk`), every computation term (`return`, `let`, `force`, `lambda`, `apply`,
`operation`, `handle`, `resume`), every value/computation type constructor, and
grades `0`, `1`, and `omega` at every grade-bearing grammar position. Bound
variables appear only inside a warranted value context. `resume` appears only
inside a warranted operation clause with its resumption operand resolved there.
Returned thunks and functions are compared through generated consuming
contexts.

The raw 0020 `resumption` value constructor is structurally representable but
is never semantically valid: the 0018 checker always rejects it as
`resumption.escape`. It therefore belongs to the deliberate invalid-constructor
corpus, not valid-constructor coverage. The invalid corpus must include a
structurally valid `resumption` value whose exact expected check diagnostic is
`resumption.escape`.

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
check rejection. Version 1 maps each new resource boundary exactly:

- exceeding `maximumInstructions`, `maximumBlocks`, or `maximumConstants`
  returns a typed pre-execution compilation rejection, projected through the
  public run entry point as `runtime-rejected` with, respectively,
  `bytecode.compile.instructions-exceeded`,
  `bytecode.compile.blocks-exceeded`, or
  `bytecode.compile.constants-exceeded`;
- exceeding `maximumOperandStackDepth` or `maximumContinuationDepth` returns a
  typed VM capacity rejection, projected as `runtime-rejected` with
  `bytecode.vm.operand-stack-exceeded` or
  `bytecode.vm.continuation-stack-exceeded`;
- exhausting `vmFuel` returns the already-frozen
  `{"tag":"inconclusive","reason":"fuel"}`; and
- reaching `maximumTraceEntries` returns the already-frozen
  `{"tag":"inconclusive","reason":"trace"}`.

Every backend-bound diagnostic uses the stable occurrence path `/program`; the
compiled graph retains no source-occurrence map. Instruction, block, and
constant capacities are checked before appending the candidate. Stack
capacities are checked before mutating VM state. At the start of each VM loop,
zero `vmFuel` takes precedence and returns `fuel`; otherwise a full trace returns
`trace`; otherwise the transition runs, consumes one fuel, and appends at most
one trace entry. No bound introduces an observation tag or `inconclusive` reason
beyond 0022. An inconclusive result never counts as agreement, including when
both backends report byte-identical fuel or trace observations.

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

Version 1 freezes this closed, source-free instruction algebra (field names are
semantic; the private host representation remains free):

```text
Instruction :=
  PushUnit
  | PushBool(constantSlot)
  | PushInt(constantSlot)
  | LoadSlot(slot)
  | BindSlot(slot)
  | MakePair
  | MakeThunk(entryBlock, capturedSlots)
  | Force
  | MakeFunction(entryBlock, parameterSlot, capturedSlots)
  | Call
  | EnterHandler(labelConstantSlot, returnBlock, returnSlot,
                 clauses[operationConstantSlot, entryBlock,
                         argumentSlot, resumptionSlot])
  | LeaveHandler
  | Request(labelConstantSlot, operationConstantSlot, resultTypeConstantSlot)
  | ResumeSlot(resumptionSlot)
  | Jump(targetBlock)
  | Return
```

A block is a finite indexed sequence of these instructions. Block targets,
captured locals, ordinary binders, and resumptions are nonnegative resolved VM
block/slot operands. Constant operands index this second closed algebra:

```text
Constant :=
  BoolConstant(value)
  | IntConstant(value)
  | TextConstant(value)
  | ObservableTypeConstant(descriptor)
```

Each literal, label, operation name, or result-type occurrence appends one
constant in deterministic compiler traversal order; version 1 performs no
deduplication. A constant index is checked before use. The descriptor is the
closed observable type vocabulary already frozen by 0022, not a source type
node or object reference. Source-term grade annotations and checker derivations
are erased from instructions after checking. Grades nested inside the frozen
0022 observable type descriptor remain because they are part of an externally
observable suspended-operation result type.

No `ComputationTerm`, `ValueTerm`, checker derivation, de Bruijn distance,
source binder object, source occurrence node, or reference to any source AST
object may survive in compiled custody. Runtime values for thunks and functions
capture only entry-block identities and resolved VM slots. A custody projection
test must recursively reject any source-node tag or source-object identity.

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
force for the reference side. Version 1 fixes the exact backend field names,
defaults, and lower bounds in the table above. Compilation performs a finite
traversal and returns its typed pre-execution rejection before minting custody
when an instruction, block, or constant maximum would be exceeded. The VM has
one program counter and bounded stacks; every transition consumes one
`vmFuel`, and trace capacity is checked before appending the next entry.

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
visited every semantically admissible constructor and grade and that the
invalid-constructor corpus visited raw `resumption`; they do not prove all
programs were generated. Differential properties observe agreement over valid
and deliberately invalid cases. Test-only compiler adapters must independently
replace one opcode, redirect one branch target, and substitute one resolved slot
inside genuine compiled custody. Each perturbation must produce a minimized
mismatch. Changing only the outward `KernelRunObservation` is not a sufficient
perturbation test. Bun and genuine Node must produce byte-identical compiled
observations, reference observations, and minimized fixtures over the selected
corpus.

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

`compareKernelRunObservations(reference, compiled)` first inspects the nested
observation tag and returns one deeply immutable closed result. Its strict
Effect Schema rejects excess properties:

```text
DifferentialComparison :=
  {"tag":"agreement","canonical_bytes_hex":string}
  | {"tag":"mismatch",
     "reference_bytes_hex":string,
     "compiled_bytes_hex":string}
  | {"tag":"inconclusive",
     "reference_reason":"fuel"|"trace"|null,
     "compiled_reason":"fuel"|"trace"|null}
```

If `reference.observation.tag` or `compiled.observation.tag` is `inconclusive`,
the result has tag `inconclusive` and records each present `fuel` or `trace`
reason. Only when neither is inconclusive does the comparator encode both
complete observations. Byte equality returns tag `agreement`; inequality
returns tag `mismatch`.
The `*_bytes_hex` fields are lowercase, even-length hexadecimal encodings of
the exact bytes returned by `encodeCanonicalKernelRunObservation`. In particular,
byte-identical fuel/fuel and trace/trace pairs have tag `inconclusive`, never
tag `agreement`.

## Oracle-first counterexamples

- A valid pure term returns the same canonical value through both paths.
- An unhandled operation suspends with the same canonical request.
- A fully handled operation and one-shot resumption returns the same value.
- Each representation, scope, type, effect, and affine mutation remains in its
  owning rejection phase and has byte-identical diagnostics.
- Every semantically admissible term constructor, every type constructor, and
  every grade position is visited by a valid generated case under a fixed seed.
- Raw `resumption` value syntax is generated only as an invalid constructor and
  is rejected with `resumption.escape`; valid `resume` remains handler-scoped.
- Returned function and thunk observations agree when placed in generated
  consuming contexts.
- Byte-identical fuel/fuel and trace/trace inconclusive pairs are classified as
  inconclusive, not agreement.
- Test-only compiler perturbations that replace an opcode, redirect a branch,
  or substitute a resolved slot are each found and shrunk to a replayable
  mismatch; the perturbation adapter is private to compiler tests and an outward
  observation wrapper is not used.
- Compiled-custody inspection finds no source term, source binder distance,
  derivation, or source-object identity.
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
3. the compiler produces the closed source-free instruction algebra, resolves
   every binder/resumption reference to a VM slot, and the VM executes it
   without retaining or inspecting kernel AST nodes, derivations, or
   reference-machine state;
4. compiler and VM modules have no import or call path to `machine.ts`,
   `evaluate`, `resume`, or `interpretKernelJsonBytes`;
5. every conclusive generated valid case has byte-identical canonical
   `semantic.kernel-run` observations;
6. every deliberate invalid mutation remains in its named rejection phase and
   agrees byte-for-byte;
7. the explicit comparator reads `.observation.tag`, and byte-identical fuel and
   trace inconclusives never count as agreement;
8. the deterministic valid corpus covers every semantically admissible
   term/type constructor and grade position, while invalid-constructor coverage
   pins raw `resumption` to `resumption.escape`;
9. internal opcode, branch, and resolved-slot perturbations are each detected,
   shrunk, and persisted with seed and path;
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
object can forge compilation or execution custody; a source AST node,
derivation, or unresolved binder survives compilation; exact rejection equality
requires a second decoder or checker; a semantically admissible 0018 constructor
cannot be represented without changing kernel semantics; execution requires
unbounded host recursion or allocation; `inconclusive` can pass equivalence; or
version 1 must expose a durable instruction encoding before the instruction
semantics are stable.

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
