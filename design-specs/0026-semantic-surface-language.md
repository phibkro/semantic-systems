# Design spec 0026: Semantic surface language

Status: frozen for the first named surface-language tracer

Date: 2026-07-31

Depends-On-Feature-IDs: 0018-minimal-kernel-calculus,
0020-agent-facing-kernel-json, 0022-kernel-reference-interpreter

Design-Lens-Version: open-semantic-system-v1

## Problem

The accepted kernel can be authored as strict recursive JSON, checked, and
interpreted. It deliberately has no source names or surface syntax. Humans and
agents must currently calculate de Bruijn distances and repeat constructor
field names by hand. That is useful as a stable machine interface, but it is
not a readable programming language.

The project needs one small named surface language that covers every current
0018 kernel constructor, elaborates without changing kernel semantics, and
hands the result back to the strict 0020 boundary. It must not introduce type
inference, implicit effects, hidden grades, or a second checker.

## Felt journey

An author declares `fresh.allocate : Unit -> Int`, writes a named handler, and
uses `result`, `argument`, and `continuation` in their lexical scopes. The
parser returns a source AST with spans. The elaborator resolves those distinct
value and resumption names to their separate de Bruijn distances, produces a
`semantic.kernel-json` document, and submits it to the existing strict decoder
and checker. The reference interpreter returns the same observation as if the
canonical JSON had been written directly.

Changing `result` to an unbound name is rejected by the elaborator at the
source span. Reusing one binder name in an overlapping scope is rejected as
ambiguous. Changing a grade or type may parse and elaborate but remains a
kernel-check rejection; the surface layer does not reinterpret that outcome.

## Open semantic system design lens

### Boundary and warranted state

Feature 0026 owns UTF-8 JavaScript source text, a bounded token stream, a named
surface AST, lexical name resolution, canonical declaration ordering, and one
strictly decoded kernel document. It warrants only surface representation and
name resolution. The 0020 decoder remains the representation authority, the
0018 checker remains the semantic authority, and the 0022 interpreter remains
the operational oracle.

The parser does not own kernel types, effects, grades, usage judgments,
evaluation, modules, packages, storage, formatting preservation, or compiler
optimization. Parsed AST values are inert. Only parser-produced AST custody
may enter the public elaborator.

### Semantic inputs

The public source boundary accepts `unknown`. Effect Schema first establishes
that it is a string. The lexer then accepts Unicode scalar source with ASCII
language punctuation, `//` line comments, non-nesting `/* ... */` block
comments, decimal safe integers, string literals for the fixed kernel marker,
and identifier names.

The parser consumes the complete token stream. A successful parse is not a
type judgment. The elaborator consumes only a parser-produced `SurfaceDocument`
and two explicit lexical contexts: ordinary value binders and one-shot
resumption binders. A source binder name is never itself a kernel distance.

### Semantic outputs

Parsing returns a deeply immutable named AST or a typed diagnostic with phase,
stable code, message, and half-open source span. Elaboration returns a strict,
deeply immutable `KernelDocument` or a typed scope, ambiguity, duplicate, or
boundary diagnostic. Compilation returns the parsed AST, decoded kernel
document, and the existing `KernelCheckObservation` without changing its
accepted or rejected meaning.

The surface AST is the canonical input for one elaboration attempt. Kernel JSON
and the check observation are derived projections. Source spans are source
coordinates, not kernel occurrence identities or evidence of semantic truth.
Binder spellings and source spans do not enter kernel JSON. The decoded kernel
document therefore has deterministic canonical bytes suitable as a later
domain-separated content input. Feature 0026 does not mint that identity: a
later definition layer owns explicit definition dependencies, recursive-group
boundaries, hashing domains, and source-name metadata.

### Effect protocols and uncertainty

Schema decoding, lexing, parsing, elaboration, strict kernel validation, and
checking are finite local computations. Expected failures use tagged Effect
error channels. No phase requests filesystem, network, clock, random, process,
console, retry, or background-fiber authority.

A parser or elaborator rejection is a failed Effect. A completed kernel check,
including `observation.tag = "rejected"`, is a successful compilation
observation because the authoritative checker ran to completion.

### Components and orthogonal structures

```text
unknown source
  -> Effect Schema string boundary
  -> bounded lexer
  -> Pratt-shaped parser + named SurfaceDocument
  -> separate value/resumption lexical contexts
  -> recursive kernel-json candidate
  -> 0020 strict decoder
  -> 0018 checker observation
```

The lexer owns characters and spans. The parser owns grammar and precedence.
The elaborator owns names-to-distances and canonical list order. The strict
decoder owns the kernel representation. The checker owns types, effects,
grades, usage, and handler completeness. These are different authorities and
no earlier phase may mint a later phase's claim.

Value binders and resumption binders are orthogonal stacks. `lambda`, `let`, a
handler return clause, and a handler operation argument extend only the value
stack. A handler operation continuation extends only the resumption stack.
Both stacks are innermost first, matching the frozen 0020 distance convention.

### Bounded autonomy and resources

Version 1 accepts at most 1,048,576 UTF-8 source bytes, 65,536 tokens, 128
recursive parser/elaborator levels, 4,096 signature declarations, 4,096
operation clauses in one handler, and 4,096 UTF-8 bytes per identifier. Each
successful parser action consumes a token or descends under the depth bound.
The elaborator visits every AST node once except deterministic sorting of
signature and clause lists.

### Evidence, assumptions, and unsupported claims

Focused tests observe every grammar constructor, precedence and associativity,
positive scope resolution, value/resumption separation, ambiguity rejection,
parse rejection, strict boundary agreement, checker phase separation, and
interpreter agreement. Bun and genuine Node must agree on selected source
fixtures. Architecture checks reject ambient authority and direct construction
of kernel checked authority.

These tests do not prove completeness, soundness, preservation, termination
beyond the stated bounds, diagnostic optimality, or equivalence for untested
programs. The feature does not claim type inference, implicit effects,
formatter round trips, incremental parsing, or compatibility with lang-bang.

## Deep-module contract

### Source document

```text
Document ::= `kernel` String `;` Declaration* `run` Computation EOF
Declaration ::= `effect` Name `.` Name `:` ValueType `->` ValueType `;`
```

The string must equal `semantic.kernel-calculus/0018/v1`. Signature
declarations may appear in any source order; elaboration rejects duplicate
`(label, operation)` pairs and sorts them by Unicode code-point `(label,
operation)` order required by 0020.

### Types, grades, and effect rows

```text
Grade ::= `0` | `1` | `omega`
EffectRow ::= `{` (Name (`,` Name)*)? `}`

ValueType ::=
    `Unit` | `Bool` | `Int`
  | ValueType `*` ValueType
  | `U` `[` EffectRow `]` ComputationType

ComputationType ::=
    `F` `[` Grade `]` ValueType
  | ValueType `->` `[` Grade `;` EffectRow `]` ComputationType
```

`*` is right associative. Computation `->` is right associative and looser
than value product. Rows are explicit; elaboration rejects duplicates and
sorts labels by Unicode code-point order. No row, grade, or type is inferred.

### Values and computations

```text
Value ::=
    Name | `()` | `true` | `false` | SignedSafeInteger
  | `(` Value `,` Value `)`
  | `thunk` `{` Computation `}`
  | `resumption` Name

Computation ::=
    `return` `[` Grade `]` Value
  | `let` Name `=` Computation `in` Computation
  | `force` Value
  | `fun` `(` Name `:` ValueType `)` `[` Grade `]` `=>` Computation
  | `perform` `[` Grade `]` Name `.` Name `(` Value `)`
  | `handle` Name `(` Computation `)` `with` Handler
  | `resume` Name `(` Value `)`
  | `(` Computation `)`
  | Computation `(` Value `)`

Handler ::= `{`
  `return` Name `=>` Computation `;`
  OperationClause+
`}`

OperationClause ::=
  `operation` Name `(` Name `,` Name `)` `=>` Computation `;`
```

Postfix computation application is left associative and has the highest
computation binding power. Parentheses override grouping. Every 0018 value and
computation constructor is represented explicitly, including the raw
`resumption` value spelling that the kernel checker always rejects when it
escapes `resume` head position.

A handler operation clause's first binder is its ordinary value argument; the
second is its one-shot resumption. Clause order is not semantic and elaboration
sorts it by operation name. Duplicate clauses reject before the strict boundary.

### Names and ambiguity

Identifiers match `[A-Za-z_][A-Za-z0-9_-]*` and exclude all reserved words.
Name lookup is lexical and innermost-first. Version 1 rejects a binder whose
spelling is already present in either active binder context. This no-shadowing
rule keeps every visible name locally unambiguous for authors and agents.

An ordinary value occurrence resolves only in the value context. `resume` and
`resumption` occurrences resolve only in the resumption context. A name present
in the other context produces a wrong-binder-kind diagnostic, never a guessed
distance.

### Reified Pratt rules

The parser represents precedence as rule data consumed by one binding-power
loop. Version 1 has two rules: value-type product with `(leftBP=30,
rightBP=29)` and computation postfix application with `(leftBP=50,
rightBP=51)`. Product therefore associates right and application associates
left. Prefix and keyword-led constructs are parsed by explicit grammar rules;
they are not forced into the operator table when no precedence choice exists.

This adopts the rule-table technique from lang-bang's Apache-2.0
`Bang/Frontend/Surface.lean` at pinned revision
`5b8e032bcffefb23a3a153d3f5cea99050e589c1`; no source is copied and no
lang-bang language decision defines this grammar.

### Public module

`src/surface-language/index.ts` exports the typed diagnostics and:

```ts
parseSurfaceDocument(input);
elaborateSurfaceDocument(document);
compileSurfaceDocument(input);
defaultSurfaceLanguageBounds;
```

All three functions return Effect programs. `compileSurfaceDocument` composes
the first two stages and `checkKernelDocument`. Elaboration must submit its
candidate to `decodeKernelDocumentValue`; it never casts a constructed object
to `KernelDocument`. The public module exports no unchecked kernel authority.

## Oracle-first counterexamples

1. Wrong input type fails at the Schema boundary.
2. Unknown characters, unterminated strings/comments, unsafe integers, and
   exhausted source/token/depth bounds reject with exact spans.
3. Missing delimiters and trailing tokens reject in the parse phase.
4. `F[1] Int * Bool` and nested application pin the declared precedence.
5. Product types associate right; computation applications associate left.
6. An unbound value and unbound resumption reject separately.
7. A value name used as a resumption and a resumption used as a value reject
   with wrong-binder-kind diagnostics.
8. Shadowing or a cross-context binder collision rejects as ambiguous.
9. Duplicate signature operations, effect-row labels, and handler clauses
   reject before the strict boundary.
10. Every kernel constructor elaborates to the exact expected JSON shape.
11. An escaped `resumption` value reaches the kernel checker and rejects there,
    not in parsing or elaboration.
12. A well-shaped type mismatch elaborates and remains a kernel-check rejection.
13. Selected compiled kernel bytes produce the same 0022 interpreter result as
    direct canonical JSON.
14. Bun and genuine Node compile selected sources to byte-identical kernel JSON.

## Acceptance

Feature 0026 is accepted when:

1. the frozen contract, active plan, model item, implementation, fixtures, and
   exact acceptance script exist;
2. Effect Schema guards the external source boundary and expected failures use
   tagged Effect errors;
3. the reified Pratt tables and tests pin precedence and associativity;
4. all current 0018 constructors have a source spelling and exact JSON oracle;
5. ordinary and resumption binders elaborate through separate contexts;
6. the strict 0020 decoder validates every produced kernel document;
7. semantic mistakes remain 0018 check rejections;
8. selected programs agree with the 0022 reference interpreter;
9. Bun and genuine Node selected outputs are byte-identical;
10. no ambient capability appears in the portable module;
11. 0020 and 0022 acceptance remain green; and
12. exact feature acceptance and the full integration gate pass at one clean
    head.

The exact acceptance command is:

```bash
bun scripts/accept/0026-semantic-surface-language.ts
```

## Kill or redesign criteria

Stop or recut if surface parsing can mint checked authority, elaboration needs
to duplicate a kernel typing/effect/usage rule, binder names leak into kernel
JSON, an existing kernel form has no explicit spelling, precedence depends on
parser control-flow order rather than rule data, or a compiled source bypasses
the strict 0020 decoder.

## Non-goals

- Type, grade, effect-row, handler-clause, or operation inference.
- New kernel constructs or changed 0018 semantics.
- Modules, imports, packages, recursion, polymorphism, traits, or macros.
- A formatter, exact-printing complement, CST, incremental parser, or LSP.
- Compiler optimization, Merkle storage, build caching, or deployment.
- Definition identities, explicit definition dependencies, or recursive-group
  identity; those can wrap this deterministic elaboration seam without making
  source names or spans semantic.
- Syntax compatibility with lang-bang or the superseded kernel S-expression.
- A proof of parser correctness, elaboration correctness, or type soundness.

## Semantic diff

Semantic Systems gains a readable, bounded, named surface syntax whose complete
version 1 grammar elaborates to the frozen agent-facing kernel JSON and composes
with the existing checker and reference interpreter. Kernel JSON remains the
stable agent/machine interface and kernel semantics remain unchanged.
