# Design spec 0040: surface runner CLI

Status: frozen

Date: 2026-08-01

Design-Lens-Version: open-semantic-system-v1

## Problem

Readable Semantic source can be parsed, elaborated, checked, and interpreted,
but only through TypeScript imports. Agents need one stable process boundary
whose output keeps source rejection distinct from kernel execution outcomes.

## Felt journey

An agent runs `semantic run program.semantic`, or pipes the same source with
`semantic run -`. The command reads one bounded UTF-8 byte stream, compiles it
once through the accepted surface-language boundary, invokes only the reference
interpreter, and emits one canonical `semantic.surface-run/v1` observation.
Bun and genuine Node emit identical bytes.

## Open semantic system design lens

### Boundary and warranted state

The command is stateless. It owns no current source, cache, continuation,
backend selection, or operation delivery. The host owns input and output. The
surface compiler warrants source admission and elaboration; the reference
interpreter warrants only the nested kernel observation.

### Semantic inputs

The command family is exactly `run FILE|-`. The host supplies at most the
accepted 1,048,576 source bytes plus one excess byte. Invalid UTF-8 and an
over-limit prefix become explicit source rejections. A source is decoded,
compiled, and interpreted at most once.

### Semantic outputs

After a successful input read, stdout contains exactly one canonical envelope:

```text
semantic.surface-run/v1 =
  source-rejected { phase, code, message, span, kernel_diagnostics? }
  | kernel-observed { kernel_run: semantic.kernel-run/v1 }
```

The envelope pins `surface` to `semantic.surface-language/0026/v1` and
`kernel` to `semantic.kernel-calculus/0018/v1`. Source diagnostics preserve the
accepted compiler phase, code, message, and UTF-16 source span. Invalid UTF-8
uses `surface.input.invalid-utf8`; an input prefix beyond the byte limit uses
`surface.lex.source-too-large` with the unwarranted span `{start:0,end:0}`.

### Effect protocols and uncertainty

Nested `returned` and `suspended` observations exit 0. Source rejection,
kernel rejection, and kernel inconclusion exit 1. Usage or host I/O failure
exits 2 and writes only a bounded generic diagnostic to stderr. Suspension
does not claim delivery. A failed stdout write may have accepted a prefix;
that prefix is not a semantic observation.

### Components and orthogonal structures

Host I/O reads and writes bytes. The 0026 compiler owns lexing, Pratt parsing,
name resolution, elaboration, and the strict kernel boundary. The 0022
interpreter owns checking and execution. The new module owns only strict UTF-8
admission, envelope construction, canonical encoding, and exit classification.
No bytecode backend, effect replay driver, second parser, or direct
`JSON.parse` enters the command closure.

### Bounded autonomy and resources

There is one command, one prefix read, one compilation, at most one reference
interpretation, one canonical encoding, and at most one stdout write. There is
no network, retry, concurrency, background task, resume, or wider language
bound. An unbounded stdin is cut after the first excess byte.

### Evidence, assumptions, and unsupported claims

Focused injected-host tests observe exact bytes, read/write counts, exit codes,
source diagnostics, and architecture. Genuine Bun and Node processes compare
accepted source, rejected source, stdin, missing files, closed stdout, and
over-limit input. Existing 0022 and 0026 acceptance remains semantic evidence.
This feature does not establish compiled-backend agreement or effect delivery.

## Deep-module contract

```text
runSurfaceCli(arguments, host) -> Effect<number, never>

semantic run FILE|-
  stdout: one canonical semantic.surface-run/v1 observation after input read
  stderr: usage or host-I/O diagnostics only
  exit: 0 returned|suspended; 1 source|kernel rejection|inconclusive; 2 usage|I/O
```

## Oracle-first counterexamples

- invalid UTF-8 and excess bytes are source rejections, not host exceptions;
- parse and elaboration failures never reach the interpreter;
- a checker rejection remains nested `check-rejected` and never becomes a
  source diagnostic;
- an unhandled operation remains a successful suspension without implying
  delivery;
- a changing input capability is read once;
- missing input and failed output stay off semantic stdout;
- Bun and Node emit byte-identical canonical observations; and
- the command closure contains no bytecode, replay, or direct JSON parser.

## Acceptance

- `just accept 0040-surface-runner-cli` passes on a clean candidate;
- focused Bun tests cover returned, suspended, source rejection, kernel
  rejection, bounds, usage, and I/O custody;
- genuine Node and Bun process journeys agree byte-for-byte; and
- TypeScript 7 Effect diagnostics, Oxlint, Oxfmt, project-model validation,
  generated-view equality, and the full repository gate pass.

## Kill or redesign criteria

Redesign if the command needs a second grammar/checker, changes an accepted
surface or kernel contract, invokes the bytecode backend, reads source twice,
or cannot keep host failures distinct from semantic output.

## Non-goals

Compilation-only output, external-effect replay, resume, backend selection,
differential verification, REPL/daemon mode, network serving, installation,
and deployment are outside 0040.

## Semantic diff

The existing readable language and reference interpreter become one stable,
agent-facing process capability. Their grammar, elaboration, checking,
execution, and lower observation contracts do not change.
