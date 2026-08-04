---
format: semantic.feature-artifact/v1
feature_id: 0020-lossless-kernel-source
kind: specification
legacy_entity_id: work.lossless-frontend-spec
---
# Design 0020: lossless kernel source

## Status

Superseded on 2026-07-31 by operator decision. The active 0020 contract is
[`design-specs/0020-agent-facing-kernel-json.md`](0020-agent-facing-kernel-json.md):
recursive JSON, not this S-expression format, is the stable user and
agent-facing kernel interface. This checkpoint is preserved unchanged below
and at commit `ee13bffec46ac4df9fa73874b8bf7a17cf6d2496`; it is not an active
contract and has no acceptance script.

This contract freezes one source format for the accepted 0018 kernel.

The first version is `semantic.kernel-source` version 1.

The format is a small S-expression language. It covers the complete 0018 type
and term grammar.

This feature does not define the future user language. It supplies a stable
source boundary for tools and later elaboration.

## Purpose

The feature adds this executable path:

```text
UTF-8 source bytes
-> lossless syntax tree
-> inert 0018 signature and term
-> existing 0018 checker
-> existing 0019 normalized core
```

Each arrow has one owner. A parser result cannot mint a checked program or a
normalized artifact.

## System boundary

| Part        | Contract                                                             |
| ----------- | -------------------------------------------------------------------- |
| Input       | One private snapshot of bounded UTF-8 bytes                          |
| State       | One immutable green tree and one revision view                       |
| Message     | Parse bytes or apply one bounded byte edit                           |
| Effect      | Explicit Effect `Crypto` service for content identities              |
| Observation | Exact bytes, syntax nodes, ranges, diagnostics, or inert kernel data |
| Evidence    | Round-trip, bounds, differential, custody, and Bun/Node tests        |
| Owner       | The source document owns its bytes and green nodes                   |
| Projection  | A revision view derives offsets and diagnostics                      |
| Liveness    | Every parse and edit stops within the declared limits                |

The portable module has no filesystem, console, network, clock, random, or
process authority. It does not use ambient crypto.

## Source custody

The input is an unknown value at the public boundary. The decoder accepts only
a genuine `Uint8Array` with an intrinsic length.

The decoder copies the bytes once. It does not retain the caller object or its
buffer.

The decoder rejects these inputs:

- a `Proxy`
- an accessor-backed object
- an inherited lookalike
- another typed-array kind
- a detached buffer
- a byte sequence that is not valid UTF-8
- input that is larger than the source limit

The public string helper rejects lone UTF-16 surrogates. It then encodes the
string as UTF-8 and uses the same byte boundary.

Returned byte observations are copies. Caller mutation cannot change a source
document or a prior result.

## Lexical grammar

The lexer emits every source byte into one token. No byte disappears.

The token kinds are:

- `left_paren`
- `right_paren`
- `symbol`
- `string`
- `integer`
- `whitespace`
- `comment`
- `invalid_token`

Whitespace contains spaces, tabs, carriage returns, and line feeds.

A comment starts with `;`. It ends before the next line feed or at end of input.

A symbol contains ASCII letters, ASCII digits, `_`, `-`, `.`, `/`, `?`, or `!`.
The first character cannot be a digit or `-`.

A string uses the JSON string grammar. The parser decodes escapes for semantic
projection but keeps the exact token bytes.

An integer uses this grammar:

```text
-?(0|[1-9][0-9]*)
```

The semantic value must be a safe JavaScript integer. The value `-0` remains
different from `0`.

Trivia tokens are `whitespace` and `comment`. Trivia remains in the green tree.

## Document grammar

The complete document grammar is:

```text
document :=
  (kernel-source 1 signature program)

signature :=
  (signature declaration*)

declaration :=
  (declare string string value-type value-type)

program :=
  (program computation-term)

grade :=
  zero | one | omega

effect-row :=
  (effects string*)

value-type :=
  unit
  | bool
  | int
  | (pair-type value-type value-type)
  | (thunk-type effect-row computation-type)

computation-type :=
  (return-type grade value-type)
  | (function-type value-type grade effect-row computation-type)

value-term :=
  (variable integer)
  | unit-value
  | (bool-value true)
  | (bool-value false)
  | (int-value integer)
  | (pair-value value-term value-term)
  | (thunk computation-term)
  | (resumption integer)

computation-term :=
  (return grade value-term)
  | (let computation-term computation-term)
  | (force value-term)
  | (lambda value-type grade computation-term)
  | (apply computation-term value-term)
  | (operation grade string string value-term)
  | (handle string computation-term return-clause operation-clause*)
  | (resume integer value-term)

return-clause :=
  (on-return computation-term)

operation-clause :=
  (on-operation string computation-term)
```

The parser does not add name resolution. Variable and resumption operands are
explicit de Bruijn indexes.

The two strings in `declare` are the effect label and operation name.

The two strings in `operation` have the same order.

The first string in `handle` is the handled effect label.

## Green tree

A green token contains:

- one token kind
- exact owned bytes
- a UTF-8 byte length
- a content identity

A green node contains:

- one syntax kind
- ordered green children
- the sum of child byte lengths
- a content identity

Green values contain no parent, absolute offset, line, column, document ID, or
revision number.

All green values are deeply immutable. Public constructors do not exist.

The content identity uses a domain-separated SHA-256 digest. The digest payload
contains the kind and exact ordered child identities.

Equal token or node content has equal content identity. Duplicate occurrences
can have the same content identity.

Content identity is not occurrence identity. The feature makes no stable
cross-revision occurrence claim.

## Revision view

A source document contains one root green node and one exact byte snapshot.

A revision view derives these facts by ordered traversal:

- the byte start and end for each occurrence
- the parent path for each occurrence
- ordered syntax diagnostics
- the exact bytes for a selected occurrence

An occurrence path is revision-scoped. It is an array of child indexes from the
root.

The view does not write offsets into green nodes. Two revisions can share the
same green node at different offsets.

## Error recovery

Malformed source produces a syntax tree and diagnostics. Syntax errors are not
Effect failures.

An unexpected token becomes part of an `error` node. The parser never drops the
token.

A missing required token produces a zero-width `missing` node. This node does
not add bytes during reconstruction.

The parser synchronizes at a right parenthesis or the end of input. Recovery
must always consume a token or return from the current rule.

Diagnostics use this closed shape:

```ts
interface SourceDiagnostic {
  readonly code: SourceDiagnosticCode;
  readonly startByte: number;
  readonly endByte: number;
  readonly message: string;
}
```

Version 1 has these diagnostic codes:

- `source.unexpected-token`
- `source.missing-token`
- `source.unknown-form`
- `source.wrong-arity`
- `source.invalid-string`
- `source.invalid-integer`
- `source.integer-out-of-range`
- `source.invalid-index`
- `source.depth-limit`
- `source.token-limit`
- `source.diagnostic-limit`

Diagnostics use source order. For one start offset, the parser uses code order.

Messages are presentation text. Tests and callers use diagnostic codes and
ranges as the stable contract.

## Semantic projection

`projectKernelDocument` accepts only a privately custodied source document.

The projection requires:

- version 1
- one signature
- one program
- no syntax diagnostic
- the complete frozen grammar
- every 0018 decoder bound

The projection returns plain inert data. It calls the existing 0018 decoders to
validate the final signature and term.

The projection cannot return `CheckedProgram`. The caller must use the existing
`check` function.

The source module does not call `check`, `evaluate`, or normalized-core
emission. A composition test can connect these existing public functions.

Source trivia and alternate JSON string escapes do not change projected kernel
data. They do change source document identity.

## Edits and reuse

An edit has this closed shape:

```ts
interface SourceEdit {
  readonly startByte: number;
  readonly endByte: number;
  readonly replacement: Uint8Array;
}
```

The edit range uses half-open UTF-8 byte offsets.

The decoder snapshots the replacement bytes before it reads document state.

The range must satisfy this rule:

```text
0 <= startByte <= endByte <= sourceByteLength
```

The replacement must be valid UTF-8. The resulting document must remain within
all limits.

`applySourceEdit` returns a new source document. The prior document does not
change.

Version 1 can parse the complete new byte sequence. It must reuse equal green
subtrees from the prior revision after exact structural comparison.

A digest match alone does not authorize reuse. The implementation must compare
the complete kind and child structure.

Incremental and clean parsing must return equal trees, diagnostics, bytes, and
kernel projections. Reuse is an optimization with an explicit observation.

## Public API

The first public entry point is `src/kernel-source/index.ts`.

The public API exports:

```ts
parseKernelSource(input, bounds?)
parseKernelSourceString(input, bounds?)
applySourceEdit(document, edit, bounds?)
sourceBytes(document)
sourceText(document)
sourceRoot(document)
sourceDiagnostics(document)
sourceOccurrence(document, path)
projectKernelDocument(document)
defaultSourceBounds
```

The API exports opaque read-only types for documents, nodes, tokens, edits,
diagnostics, bounds, and projection results.

No exported function accepts a forged document, node, token, or occurrence as
authority.

## Limits

The default limits are:

| Limit                            |     Value |
| -------------------------------- | --------: |
| Source bytes                     | 1,048,576 |
| Tokens                           |   131,072 |
| Green nodes                      |   131,072 |
| Parse depth                      |       256 |
| Diagnostics                      |     1,024 |
| String value bytes               |     4,096 |
| Effect labels                    |       256 |
| Operation declarations           |       256 |
| Operation clauses in one handler |       256 |

Custom bounds can only reduce these values. A caller cannot increase a bound.

The decoder snapshots and validates all bound fields. It rejects accessors,
symbols, inherited fields, extra fields, and invalid numbers.

## Failure order

The public boundary uses this failure order:

1. Validate the request shape without property access side effects.
2. Validate and snapshot source bytes or edit bytes.
3. Validate bounds.
4. Validate the edit range.
5. Validate UTF-8.
6. Enforce the source-byte limit.
7. Lex with token and string limits.
8. Parse with node, depth, and diagnostic limits.
9. Build the immutable document.
10. Project only after explicit caller request.

Resource-limit failures use typed Effect errors. Syntax diagnostics remain
successful source observations.

## Liveness

The lexer advances by at least one byte for each loop.

The parser consumes one token or returns for each recovery step.

The parser uses an explicit depth counter. It does not use unbounded host
recursion.

An edit performs one bounded reconstruction and one bounded parse.

No API waits for external input. No API starts background work.

## Acceptance

The exact acceptance command is:

```bash
bun scripts/accept/0020-lossless-kernel-source.ts
```

The acceptance must include these positive cases:

1. A complete handled program reconstructs exact source bytes.
2. The complete 0018 grammar projects to expected inert data.
3. The existing 0018 checker accepts the projected positive fixture.
4. The existing 0019 emitter produces the expected normalized identity.
5. Trivia and string-escape edits preserve projected kernel data.
6. An edit outside one subtree reuses the unchanged subtree.
7. Bun and genuine Node return equal normalized observations.

The acceptance must include these negative cases:

1. Every malformed token remains in the reconstructed bytes.
2. Missing tokens use zero-width nodes and stable diagnostics.
3. Invalid UTF-8 fails before lexing.
4. Lone UTF-16 surrogates fail in the string helper.
5. Unsafe integers and negative indexes fail with stable codes.
6. Every resource limit has one exact boundary and one rejection case.
7. Proxy, accessor, alias, mutation, and typed-array lookalikes cannot defect.
8. A forged document or green node cannot enter semantic projection.
9. A digest collision fixture cannot authorize structural reuse.
10. Random bounded edit scripts equal a clean parse after every edit.
11. The portable import closure reaches no runtime authority.

The full repository gate must pass after the focused acceptance.

## Exclusions

Version 1 excludes:

- the final user-language syntax
- names and binder elaboration
- package or module loading
- formatting changes
- an LSP server
- UTF-16 position conversion
- filesystem watches
- global green-node interning
- persistent parser caches
- parallel parsing
- proof search
- evaluation
- backend lowering

These exclusions keep the parser reusable. They also keep semantic authority in
the accepted 0018 and 0019 modules.
