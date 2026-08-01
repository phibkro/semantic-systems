# Design spec 0039: kernel runner CLI

Status: frozen

Date: 2026-08-01

Design-Lens-Version: open-semantic-system-v1

## Problem

The frozen kernel JSON and reference interpreter are executable only through a
TypeScript import. A user or agent cannot pass a kernel document across a
stable process boundary and receive the interpreter's canonical observation.
This makes the language capability harder to compose and encourages ad hoc
JSON parsing or wrapper scripts that would weaken the accepted boundary.

## Felt journey

An agent runs `semantic-kernel run program.kernel.json`, or pipes the exact
bytes with `semantic-kernel run -`. The command reads those bytes once, sends
them through the accepted reference interpreter, writes exactly one canonical
`semantic.kernel-run/v1` observation to stdout, and exits according to that
observation. Bun and genuine Node produce identical stdout bytes.

## Open semantic system design lens

### Boundary and warranted state

The command is a stateless host adapter around `interpretKernelJsonBytes` and
`encodeCanonicalKernelRunObservation`. It owns no semantic state, cache,
continuation, current document, or backend selection. The input bytes and host
I/O remain environmental. Only the returned kernel-run observation is warranted
by the interpreter.

### Semantic inputs

The command family is exactly `run FILE|-`. `FILE` denotes one bounded byte
read from that path; `-` denotes one bounded read of stdin until EOF. The bytes
are not pre-decoded, normalized, or reparsed by the CLI. Invocation shape and
host read success establish no semantic property.

### Semantic outputs

For every successful input read, stdout contains exactly the existing canonical
encoding of one `semantic.kernel-run/v1` observation and no human text. The
observation retains representation, checking, execution, suspension, runtime
rejection, and resource inconclusion as distinct outcomes. Usage and host I/O
diagnostics go only to stderr and are not semantic observations.

### Effect protocols and uncertainty

`returned` and `suspended` observations exit 0: suspension reports an outward
operation request but does not claim delivery. `representation-rejected`,
`check-rejected`, `runtime-rejected`, and `inconclusive` observations exit 1.
Invocation or input-read failure exits 2 before any stdout write. An output
failure also exits 2, but the host may already have accepted a prefix: ordinary
process streams do not provide an atomic-write guarantee. Such a prefix is not
a semantic observation. The command does not retry, resume, reconcile, contact
a network, or interpret an operation.

### Components and orthogonal structures

The host adapter reads bytes and writes bytes. The strict kernel JSON boundary
owns representation admission; the 0018 checker owns semantic acceptance; the
0022 reference interpreter owns execution; the existing canonical encoder owns
output bytes. The CLI only composes these authorities and derives an exit code
from the observation tag. No bytecode compiler or VM may enter its dependency
closure.

### Bounded autonomy and resources

There is one command, one input read, one interpreter invocation, one canonical
encoding, and at most one stdout write. Existing kernel JSON and evaluation
bounds remain unchanged. The adapter adds no concurrency, retry, queue,
background task, network capability, or wider bound. stdin must be rejected as
a host I/O failure if the host cannot supply a finite byte sequence.

### Evidence, assumptions, and unsupported claims

Focused Bun tests observe invocation, read count, exact successful bytes, exit
codes, and host failures. Genuine Node tests compare the process boundary with
Bun on the same fixtures. Architecture tests reject bytecode imports and direct
`JSON.parse`. Existing 0020 and 0022 acceptance remains the semantic evidence.
This feature does not prove that a suspended request was handled, that a
rejected program ran, that the optimized VM agrees, that a failed output stream
is atomic, or that arbitrary host I/O is deterministic.

## Deep-module contract

```text
runKernelCli(arguments, host)
  -> Effect<number, never>

semantic-kernel run FILE|-
  stdout: canonical semantic.kernel-run/v1 bytes after a successful read
  stderr: invocation or host-I/O diagnostics only
  exit: 0 returned|suspended; 1 semantic rejection|inconclusive; 2 usage|I/O
```

`host` is the narrow injected read/write capability used by Bun, Node, and
tests. It must expose one read operation and separate stdout/stderr writes.

## Oracle-first counterexamples

- invalid UTF-8, duplicate JSON keys, and malformed JSON become canonical
  `representation-rejected` observations rather than host exceptions;
- a semantic rejection never reaches evaluation;
- an unhandled operation exits 0 with `suspended`, without implying delivery;
- an input capability that changes on a second read is observed once;
- a missing file or failed stdin exits 2 before stdout; a failed stdout exits 2
  without a host stack trace and any accepted prefix is explicitly
  non-semantic;
- excess arguments exit 2 without reading input;
- Bun and Node emit byte-identical stdout for accepted and rejected inputs;
- the command closure contains no bytecode import, direct `JSON.parse`, or
  reference/compiled agreement claim.

## Acceptance

- `just accept 0039-kernel-runner-cli` passes on a clean candidate;
- focused Bun journeys cover returned, suspended, representation rejection,
  check rejection, inconclusion classification, usage, and I/O custody;
- genuine Node and Bun process journeys emit exact identical canonical bytes;
- TypeScript 7 Effect diagnostics, Oxlint, Oxfmt, project-model validation,
  generated-view equality, and the full repository gate pass.

## Kill or redesign criteria

Redesign if the CLI must parse JSON separately, changes any existing kernel
observation, requires the bytecode backend, reads caller input more than once,
cannot keep host failures off semantic stdout, or widens interpreter bounds.

## Non-goals

Surface syntax, compilation, observation-script replay, continuation resume,
backend selection, differential verification, daemon mode, network serving,
package installation, and deployment are outside 0039.

## Semantic diff

The existing reference interpreter becomes available through one stable,
stateless process boundary. Kernel syntax, checking, runtime semantics, bounds,
observations, and optimized backend behavior remain unchanged.
