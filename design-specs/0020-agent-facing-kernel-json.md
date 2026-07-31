# Design spec 0020: agent-facing kernel JSON

Status: frozen for the first agent-facing kernel interface

Date: 2026-07-31

Depends-On-Feature-IDs: 0018-minimal-kernel-calculus,
0019-normalized-core-format

Migrates-Feature-IDs: 0020-lossless-kernel-source

Design-Lens-Version: open-semantic-system-v1

## Problem

The accepted 0018 calculus checks and runs terms, and the accepted 0019 format
freezes checked artifacts. Neither gives a user or an agent a stable way to
_write_ a kernel program, or to _read back_ what the checker judged and why.

The earlier 0020 checkpoint froze an S-expression source format. The operator
decision recuts that boundary: recursive JSON is the stable user and
agent-facing kernel interface. Agents produce and consume JSON natively, a JSON
Schema can describe the complete structural contract for them, and the format
composes with every JSON tool without a new parser class.

Without this contract, agent-facing work drifts toward ad-hoc term dumps,
duplicated inferred facts, and interfaces that leak whatever internal storage
the implementation happens to use. The project needs one frozen, versioned,
recursive JSON contract with a strict decoder, an explicit checked view, and a
storage-independence rule that keeps any future Merkle DAG internal.

## Felt journey

An agent writes a `semantic.kernel-json` document: a signature declaring
`fresh.allocate` and a program that performs the operation under a handler
whose clause resumes once. The agent validates its draft against the published
JSON Schema, fixing field-name and arity mistakes without running anything.

The strict decoder accepts the bytes and returns an immutable document. The
agent requests the check observation. The accepted observation lists one
judgment per term occurrence: its occurrence path, the exact value and
resumption binder contexts in scope, each binder's origin, type, and usage
limit, the inferred type, effects, and usage, the rule name, and links to the
premise judgments. The agent reads exactly why the program is well typed.

The agent then edits the clause to resume twice. The schema still accepts the
bytes — the mistake is semantic. The decoder accepts the document, and the
check observation is a rejection with the stable diagnostic
`usage.affine-duplicated` at the exact clause-body occurrence path. At no point
did parsing or schema validation mint checked authority.

## Open semantic system design lens

### Boundary and warranted state

Feature 0020 owns:

- the exact `semantic.kernel-json` version 1 raw document contract;
- the exact `semantic.kernel-check` version 1 observation contract;
- one JSON Schema Draft 2020-12 artifact describing both;
- strict bounded byte and object decoding, canonical encoding, and immutable
  snapshots;
- one exact additive judgment-recording seam inside the accepted 0018
  checker, frozen below, which records the agent-facing facts during the
  authoritative check; and
- the projection from a decoded document through the existing 0018 checker to
  an agent-facing checked view.

The strict decoder and the accepted 0018 checker remain the authorities. The
JSON Schema is a description for agents; passing it warrants representation
shape only. A decoded document warrants representation validity only. Only the
existing 0018 `check` function warrants typing, effects, usage, and handler
judgments, and only the existing 0019 module mints normalized artifacts.

The feature does not own surface syntax, names, elaboration, evaluation
transcripts, packages, storage layout, caching, or deployment. The future
internal implementation may use a Merkle DAG, but no hash, node reference,
cache topology, store path, or bundle detail may appear in the frozen JSON.

### Semantic inputs

The feature accepts these input families:

- unknown candidate bytes for a raw document or a check observation;
- an unknown in-memory value for the same shapes;
- public bounds that can only narrow the version 1 defaults; and
- a privately decoded `KernelDocument` for canonical encoding, inert 0018
  projection, and check composition.

Unknown input establishes nothing. Schema validity establishes representation
shape only, and a caller-side schema check establishes nothing at this
boundary: the strict decoder revalidates everything it needs. A decoded
document does not establish scope safety, signature agreement, typing,
effects, usage discipline, or handler completeness. Those judgments belong to
the 0018 checker alone.

An accepted observation supplied _to_ the decoder is inert data. Decoding it
warrants only representation validity, never that its judgments were produced
by the checker for any particular document.

### Semantic outputs

Decoding returns:

```text
Decoded(document)
```

or fails with typed diagnostics. Check composition returns one
`KernelCheckObservation`:

```text
Accepted(inferred, judgments)
Rejected(diagnostics)
```

Canonical encoding returns exact deterministic UTF-8 bytes for a document or
an observation. The schema observation returns the frozen JSON Schema artifact
as inert data.

The raw `KernelDocument` is a canonical input representation. It carries no
inferred fact: no result type, no effect summary, no usage vector, no
derivation. Every inferred fact lives only in the `KernelCheckObservation`,
which is a derived projection of one check run over one exact document
revision. Diagnostics are observations, not artifacts and not proof.

### Effect protocols and uncertainty

There is no external protocol, retry, timeout, or reconciliation loop.
Decoding, encoding, schema observation, projection, and checking are finite
local operations. The module requests no effect service in version 1; it has
no filesystem, network, clock, random, process, console, or digest authority.

Resource-limit and malformed-input failures are typed Effect failures. A
semantic rejection is a successful observation, not an Effect failure, because
the check ran to completion and produced a judgment.

### Components and orthogonal structures

The vertical slice is:

```text
unknown bytes or object
  -> strict bounded decoder
  -> immutable KernelDocument
  -> inert 0018 signature and term projection
  -> existing 0018 checker with the judgment-recording seam
  -> KernelCheckObservation
  -> canonical UTF-8 bytes
```

Each arrow has one owner. The decoder owns representation validation. The
projection owns the translation to inert 0018 data and calls the existing 0018
decoders; it cannot return a `CheckedProgram`. The existing `check` function
owns every semantic judgment and, through the frozen seam, records the
agent-facing facts while it derives them. The observation layer owns only the
representation translation of that recorded judgment. The existing 0019 module
keeps sole authority over normalized artifacts and identities.

These structures remain distinct:

- raw representation and check observation;
- ordinary value binders and one-shot resumption binders;
- occurrence paths and any storage identity;
- schema description and decoder authority;
- checked facts and 0019 normalized identity.

### Bounded autonomy and resources

Every public operation is finite. Decoding walks each JSON value occurrence
once under explicit byte, depth, node, string, and collection bounds. Check
composition adds the existing 0018 decode and checker bounds; those bounds
remain in force and are not widened by this feature. Canonical encoding visits
each node once. No API waits for external input or starts background work. The
exact version 1 bounds appear in the deep-module contract.

### Evidence, assumptions, and unsupported claims

Runtime decoding tests, schema-artifact tests, golden-example tests,
adversarial custody tests, and Bun-versus-Node byte fixtures establish
selected representation behavior. Composition tests establish that selected
documents produce the recorded observations through the real 0018 checker.
Focused kernel-calculus tests establish that the judgment-recording seam
preserves 0018 acceptance and rejection observations, normalized report
bytes, machine behavior, and checked-program custody.
A storage-differential test establishes observational equality between the
reference recursive implementation and any alternative internal
representation for selected fixtures.

The feature assumes the accepted 0018 checker and the accepted 0019 module at
integration head `2959681e01df2acc4ea1318b8ce634b9ccf7d10c`. Diagnostic codes
and rule names are surfaced verbatim from the 0018 checker, which remains
their single source of truth.

This feature does not establish:

- progress, preservation, or type soundness;
- that JSON Schema validity implies semantic acceptance;
- scope safety, signature agreement, typing, effects, usage, or handler
  completeness at the schema or decoder layer;
- stable identity, hashing, or binder-equivalence policy;
- truth or delivery of external effects; or
- a compatibility promise for any future internal Merkle representation
  beyond the observational rule frozen below.

## Deep-module contract

### Versioned formats

Version 1 freezes two closed top-level documents:

```text
KernelDocument := {
  "format": "semantic.kernel-json",
  "version": 1,
  "kernel": "semantic.kernel-calculus/0018/v1",
  "signature": [SignatureOperation...],
  "program": ComputationTerm
}

KernelCheckObservation := {
  "format": "semantic.kernel-check",
  "version": 1,
  "kernel": "semantic.kernel-calculus/0018/v1",
  "observation": CheckAccepted | CheckRejected
}
```

All fields are required. No other field is accepted at any level of either
document. Every object in both contracts is a closed tagged record: unknown
fields, missing fields, and unknown tags are rejected. An unknown `format`,
`version`, or `kernel` value is rejected before any deeper inspection.

### Raw types and terms

The raw grammar covers the complete 0018 operation signature, value and
computation types, values, computations, grades, handlers, and resumptions.
It deliberately reuses the 0019 normalized field vocabulary so agents read one
JSON vocabulary across raw documents and normalized artifacts:

```text
Grade := "0" | "1" | "omega"

ValueType :=
  {"tag":"unit"}
  {"tag":"bool"}
  {"tag":"int"}
  {"tag":"pair","first":ValueType,"second":ValueType}
  {"tag":"thunk","effects":[Label...],"computation":ComputationType}

ComputationType :=
  {"tag":"return","grade":Grade,"value":ValueType}
  {"tag":"function","parameter":ValueType,"grade":Grade,
   "effects":[Label...],"result":ComputationType}

ValueTerm :=
  {"tag":"bound-value","distance":NonnegativeSafeInteger}
  {"tag":"unit"}
  {"tag":"bool","value":Boolean}
  {"tag":"int","value":SignedSafeInteger}
  {"tag":"pair","first":ValueTerm,"second":ValueTerm}
  {"tag":"thunk","body":ComputationTerm}
  {"tag":"resumption","distance":NonnegativeSafeInteger}

ComputationTerm :=
  {"tag":"return","grade":Grade,"value":ValueTerm}
  {"tag":"let","bound":ComputationTerm,"body":ComputationTerm}
  {"tag":"force","value":ValueTerm}
  {"tag":"lambda","parameter_type":ValueType,"grade":Grade,
   "body":ComputationTerm}
  {"tag":"apply","computation":ComputationTerm,"argument":ValueTerm}
  {"tag":"operation","grade":Grade,"label":String,"operation":String,
   "argument":ValueTerm}
  {"tag":"handle","label":String,"computation":ComputationTerm,
   "return_clause":ReturnClause,
   "operation_clauses":[OperationClause...]}
  {"tag":"resume","resumption_distance":NonnegativeSafeInteger,
   "value":ValueTerm}

ReturnClause := {"body":ComputationTerm}

OperationClause := {"operation":String,"body":ComputationTerm}

SignatureOperation := {
  "label": String,
  "operation": String,
  "argument_type": ValueType,
  "result_type": ValueType
}
```

Unlike the 0019 normalized grammar, the raw grammar includes the
`{"tag":"resumption"}` value variant because the 0018 raw term grammar
contains it. It is structurally representable and always semantically
rejected: the 0018 checker refuses every occurrence with `resumption.escape`
or a scope diagnostic. The raw document carries no identity field of any kind.

A `SignedSafeInteger` is any integer from `-9007199254740991` through
`9007199254740991`, with negative zero accepted as a value distinct from zero,
exactly as in 0018 and 0019. Labels and operation names are nonempty Unicode
scalar strings; lone UTF-16 surrogates are rejected; no NFC, NFD, case,
locale, or compatibility normalization is applied.

Array order is fixed so that one meaning has one representation:

- every `effects` row is sorted by Unicode code-point order with no
  duplicates;
- `signature` is sorted by `(label, operation)` with no duplicate pairs; and
- `operation_clauses` is sorted by operation name with no duplicates.

The strict decoder rejects any other order. Object key order and JSON
whitespace are not semantic; canonical encoding fixes them.

### Binder positions and reference meaning

Ordinary value binders and one-shot resumption binders live in two separate
contexts with separate de Bruijn distances. Version 1 freezes every
binder-introducing position:

| Introducing position           | Context    | Binds at distance 0       |
| ------------------------------ | ---------- | ------------------------- |
| `lambda` body                  | value      | the function argument     |
| `let` body                     | value      | the bound `F[q] A` result |
| `handle` return-clause body    | value      | the handled result value  |
| `handle` operation-clause body | value      | the operation argument    |
| `handle` operation-clause body | resumption | the one-shot resumption   |

Reference meaning:

- `{"tag":"bound-value","distance":d}` refers to the value binder introduced
  `d` value-binder-introducing positions outward from the occurrence. It never
  refers to a resumption.
- `{"tag":"resume","resumption_distance":d}` consumes the resumption binder
  introduced `d` resumption-binder-introducing positions outward. Only
  operation-clause bodies introduce resumption binders, each with usage limit
  `1`.
- `{"tag":"resumption","distance":d}` is the raw 0018 value spelling of a
  resumption reference outside `resume` head position. It decodes, and the
  0018 checker always rejects it, because a resumption is not a value: it
  cannot enter a pair, thunk, return value, operation argument, or result.

Entering a `lambda`, `let`, return-clause, or operation-clause body shifts
value distances by one. Entering an operation-clause body shifts resumption
distances by one. No other position shifts either context. The raw document
records no binder names; version 1 makes no alpha-equivalence claim beyond
identical de Bruijn terms.

### Check observation

`KernelCheckObservation.observation` is a closed tagged union:

```text
CheckAccepted := {
  "tag": "accepted",
  "labels": [Label...],
  "types": [TypeNode...],
  "inferred": InferredSummary,
  "judgments": [Judgment...]
}

CheckRejected := {
  "tag": "rejected",
  "labels": [Label...],
  "types": [TypeNode...],
  "diagnostics": [CheckDiagnostic...]
}

InferredSummary := {
  "type": TypeIndex,
  "effects": [LabelIndex...],
  "usage": [Grade...]
}
```

Inferred types are exponentially larger than their program when spelled
inline: a let chain of pair doublings within every default bound renders a
single mismatched type beyond half a megabyte after sixteen doublings and
beyond any flat cap in general. The observation therefore never spells an
inferred type or effect label inline. Both observation variants carry two
shared tables:

- `labels` lists every distinct effect label the observation mentions,
  sorted by Unicode code-point order with no duplicates. A `LabelIndex` is a
  nonnegative safe integer index into this table. Every effect row in the
  observation — judgment effects, binder continuation effects, type-node
  rows, and row-valued diagnostic facts — is an array of label indexes
  sorted by the referenced labels' code-point order.
- `types` is the maximally shared type table. A `TypeIndex` is a nonnegative
  safe integer index into it. Each `TypeNode` is the frozen type grammar
  with child positions replaced by type indexes:

```text
TypeNode :=
  {"tag":"unit"}
  {"tag":"bool"}
  {"tag":"int"}
  {"tag":"pair","first":TypeIndex,"second":TypeIndex}
  {"tag":"thunk","effects":[LabelIndex...],"computation":TypeIndex}
  {"tag":"return","grade":Grade,"value":TypeIndex}
  {"tag":"function","parameter":TypeIndex,"grade":Grade,
   "effects":[LabelIndex...],"result":TypeIndex}
```

Table discipline is frozen: every child index is strictly smaller than its
parent's index, so the table is acyclic by construction; no two entries are
structurally equal, so sharing is maximal and exponential inline duplication
is unrepresentable; and entries appear in first-encounter postorder under
the frozen traversal — `inferred.type` first, then each judgment in table
order (context entries before the judged type), then each diagnostic's
`expected` before `actual` — so the table is deterministic. These indexes
are observation-scoped semantic sharing, not node identities: they carry no
storage, hash, cache, or bundle meaning.

`judgments` is the preorder flattening of the exact 0018 derivation: one
judgment per successfully judged term occurrence, parents before
descendants, premise subtrees in derivation premise order (for `handle`:
the handled computation, then the return clause, then the clauses in
canonical clause order). Each judgment is one of:

```text
Judgment := ValueJudgment | ComputationJudgment

ValueJudgment := {
  "tag": "value-judgment",
  "occurrence_path": OccurrencePath,
  "rule": RuleName,
  "value_context": [ValueBinderEntry...],
  "resumption_context": [ResumptionBinderEntry...],
  "value_type": TypeIndex,
  "usage": [Grade...],
  "resumption_usage": [Grade...],
  "premises": [JudgmentIndex...]
}

ComputationJudgment := {
  "tag": "computation-judgment",
  "occurrence_path": OccurrencePath,
  "rule": RuleName,
  "value_context": [ValueBinderEntry...],
  "resumption_context": [ResumptionBinderEntry...],
  "computation_type": TypeIndex,
  "effects": [LabelIndex...],
  "usage": [Grade...],
  "resumption_usage": [Grade...],
  "premises": [JudgmentIndex...],
  "signature_origins"?: [OccurrencePath...]
}

ValueBinderEntry := {
  "binder_origin": OccurrencePath,
  "origin_kind": "lambda-parameter" | "let-result"
    | "return-clause-result" | "operation-clause-argument",
  "value_type": TypeIndex,
  "usage_limit": Grade
}

ResumptionBinderEntry := {
  "binder_origin": OccurrencePath,
  "origin_kind": "operation-clause-resumption",
  "label": String,
  "operation": String,
  "result_type": TypeIndex,
  "continuation_type": TypeIndex,
  "continuation_effects": [LabelIndex...],
  "usage_limit": "1"
}

CheckDiagnostic := {
  "code": DiagnosticCode,
  "rule": String,
  "occurrence_path": OccurrencePath,
  "message": String,
  "expected"?: JsonValue,
  "actual"?: JsonValue
}
```

Exact meanings:

- `occurrence_path` is a strict RFC 6901 JSON Pointer into the checked
  `KernelDocument`, rooted at `/program` for term occurrences and
  `/signature/N` for declaration references. Tokens must equal exact schema
  field names or canonical array indexes. Every version 1 field token comes
  from a closed ASCII vocabulary containing no `~` and no `/`, so RFC 6901
  escape sequences are forbidden entirely: any `~` in a pointer is rejected,
  as are leading zeroes, signs, `-`, and out-of-range indexes.
  Paths are revision-scoped: they are meaningful only against the exact
  document supplied to the check call that produced the observation, and
  against nothing else. The observation embeds no identity, hash, or node
  reference for the document.
- `value_context` and `resumption_context` list the exact binders in scope at
  the occurrence, index `i` holding the binder at de Bruijn distance `i`
  (innermost first). `usage` and `resumption_usage` are the inferred use
  vectors aligned index-for-index with those contexts.
- `binder_origin` is the occurrence path of the introducing `lambda`, `let`,
  or `handle` term. `usage_limit` is the exact 0018 limit: the declared grade
  for `lambda-parameter`; `q1 * atLeastOnce(q2)` for `let-result`; the
  handled result grade for `return-clause-result`; `omega` for
  `operation-clause-argument`; and always `"1"` for a resumption binder.
- `rule` in a judgment is one of the closed 0018 derivation rule names:
  `value.variable`, `value.unit`, `value.bool`, `value.int`, `value.pair`,
  `value.thunk`, `computation.return`, `computation.let`,
  `computation.force`, `computation.lambda`, `computation.apply`,
  `computation.operation`, `computation.resume`, `handler.deep`.
- `premises` lists the indexes of the judgment's immediate subderivations in
  the same order as the 0018 derivation. Every premise index is strictly
  greater than the judgment's own index, so the table is acyclic by
  construction. Judgment 0 is the root program judgment and must agree
  exactly with `inferred`.
- `signature_origins` is present exactly when `rule` is
  `computation.operation` or `handler.deep`, and lists every `/signature/N`
  declaration the judgment actually consulted, complete and in canonical
  signature order. For `computation.operation` it holds exactly one entry:
  the performed operation's declaration. For `handler.deep` it holds every
  declaration under the handled label — the handler validates the complete
  clause set and uses each declaration's argument and result types, so
  recording fewer entries would hide semantic dependencies. It is absent for
  every other rule. The 0018 seam records the exact declaration indexes it
  consulted; kernel-json translates them to pointers and must not rediscover
  them.
- `code` and `rule` in a diagnostic are surfaced verbatim from the 0018
  checker and are frozen as closed version 1 enums. The complete
  `DiagnosticCode` vocabulary is: `checker.invalid-input`,
  `handler.clauses-inexact`, `handler.label-unknown`, `resumption.escape`,
  `scope.resumption-out-of-range`, `scope.variable-out-of-range`,
  `signature.duplicate-operation`, `signature.empty-name`,
  `signature.operation-unknown`, `term.expected-computation`,
  `type.argument-mismatch`, `type.expected-function`, `type.expected-return`,
  `type.expected-thunk`, `type.handler-clause-mismatch`,
  `type.handler-grade-mismatch`, `type.operation-argument-mismatch`,
  `type.resumption-argument-mismatch`, `usage.affine-duplicated`,
  `usage.exceeds-grade`, `value.integer-out-of-range`. The complete
  `DiagnosticRule` vocabulary is: `checker.boundary`, `computation.apply`,
  `computation.family`, `computation.force`, `computation.lambda`,
  `computation.let`, `computation.operation`, `computation.resume`,
  `handler.input`, `handler.operation`, `handler.return`,
  `handler.signature`, `signature`, `value.int`,
  `value.resumption-forbidden`, `value.variable`. These are exactly the
  codes and rules reachable from the 0018 `check` function at the pinned
  head; `checkEffectAssertion`-only codes (`checked-program.required`,
  `effect.foreign-tunneling`, `effect.row-mismatch`) are outside the version
  1 observation vocabulary because check composition never calls that
  function. New checker vocabulary is not silently accepted: surfacing a new
  code or rule requires an explicit interface version decision, and the
  strict decoder rejects values outside these enums. `occurrence_path` is
  the checker's term path translated into document pointer coordinates.
  `message` is presentation text; tests and callers bind to `code` and
  `occurrence_path`. `expected` and `actual`, when present, are
  `DiagnosticFact` values built from the structured facts the seam records.

`DiagnosticFact` is the recursive bounded inert fact grammar:

```text
DiagnosticFact :=
  null | Boolean | SignedSafeInteger | BoundedString
  | [DiagnosticFact...]
  | {BoundedKey: DiagnosticFact, ...}
```

A `BoundedString` and a `BoundedKey` hold at most 4,096 UTF-8 bytes of
Unicode scalar values. A fact array holds at most 256 elements; a fact record
holds at most 256 properties; fact nesting counts against the document depth
bound. Fact record keys are a deliberate open vocabulary — they mirror the
checker's fact records, which name expected and actual features per rule —
but every key, scalar, array, and record is bounded and inert, and the strict
decoder enforces every one of these limits. No other JSON value form
(fractions, exponents, unsafe integers) is accepted inside a fact.

Fact values are closed under these frozen kind rules, which is what makes the
bounds provable rather than aspirational:

- a type-valued fact is the record `{"type_index": TypeIndex}` into the
  observation type table — never an inline or rendered type;
- a row-valued fact is the record `{"label_indexes": [LabelIndex...]}` into
  the label table;
- a name-valued fact is the exact 0018 label or operation string;
- a grade-valued fact is a `Grade` string;
- a count- or index-valued fact is a nonnegative safe integer or a record of
  them;
- a shape expectation is one of the fixed literals `"F[q] A"`,
  `"U(effects, C)"`, or `"A ->[q] (effects, C)"`; and
- a numeric fact outside the safe-integer range (a malformed constructed
  int) is recorded as its ECMAScript decimal or exponent string rendering,
  at most 32 bytes.

Boundedness proof against the exact 0018 bounds: every 0018 name is at most
256 UTF-16 code units (`maximumStringLength`), hence at most 256 code points
and 768 UTF-8 bytes, far under the 4,096-byte scalar cap; every fact array
mirrors a 0018 collection of at most 256 entries
(`maximumCollectionLength`); fact records carry a handful of fields; and all
type and row content lives in the shared tables, so no fact scalar or
aggregate depends on inferred-type size. The demonstrated d8d663a failure —
a thirty-five-node let chain of pair doublings, inside every default bound,
whose rendered mismatch fact is 524,283 bytes after sixteen doublings and
exponential in general — is unrepresentable under these rules by
construction: the same rejection is one diagnostic holding one `type_index`
into a maximally shared table whose distinct nodes are linear in the checked
term. Rendered type strings never enter the observation.

The raw `KernelDocument` never carries any of these inferred facts; the
observation is their only home. The observation never carries the program
term; agents correlate through occurrence paths.

### Checker observation seam

The accepted 0018 public evidence (`Derivation` with `rule`, `path`,
`conclusion`, `premises`, plus root type, effects, and usage) does not expose
per-occurrence contexts, structured types, usage vectors, binder origins, or
signature origins. Reconstructing those facts in `src/kernel-json` would be a
second checker and trip this contract's own kill criterion. Version 1
therefore freezes exactly one additive, backward-compatible amendment to the
0018 kernel-calculus module — a judgment-recording seam inside the
authoritative checker:

- `CheckAccepted` gains one new readonly field `judgments`: a deeply
  immutable, inert record table produced during the single authoritative
  check pass, one record per derivation node, in the derivation's preorder.
- Each record carries the structured facts the checker already holds at the
  exact point where it constructs the matching derivation node: the rule
  name; the 0018 term path; the structured value or computation type by
  reference; the effect row for computation rules; the usage and
  resumption-usage vectors; the exact value and resumption contexts, each
  entry with its introducing term path, origin kind, type, and usage limit;
  the complete list of signature operation indexes the rule actually
  consulted, in canonical signature order — exactly one for
  `computation.operation`, every declaration under the handled label for
  `handler.deep`, none otherwise; and the premise indexes into the same
  table in derivation order.
- On rejection, the seam records the structured diagnostic facts alongside
  the unchanged rendered `KernelDiagnostic`: type-valued facts as references
  to the in-memory structured types, and grades, indexes, counts, names,
  operation lists, and shape literals as the bounded scalars the fail site
  already holds. Rendered `showValueType` and `showComputationType` strings
  are never the recorded fact.
- Preorder premise indexes need no hidden semantic pass: on entering a term
  occurrence the seam reserves the next record index, checks the rule
  through the existing code path, and fills the reserved record only after
  the rule succeeds, appending each child's index to the parent as that
  child returns. A thrown `CheckFailure` unwinds past every reserved record,
  and the seam keeps only the structured facts of the failing site. For the
  handler fixed point, the seam snapshots the table length before each
  clause iteration and truncates back to the snapshot before re-checking, so
  provisional records from non-final iterations are discarded and only the
  final iteration's records survive, exactly matching the final derivation.
  The seam performs no second traversal, parses no `conclusion` string, and
  duplicates no semantic rule.
- The table is bounded by construction: at most one record per decoded 0018
  term node, so the existing 0018 decode bounds bound its length, and each
  context is bounded by the term depth. Recorded types are references to the
  checker's existing shared type values; the seam copies no type
  structurally, so recording cost stays linear even when spelled types would
  be exponential.
- `check` keeps its exact acceptance and rejection semantics, diagnostic
  codes, derivation shape, normalized report bytes, machine behavior, and
  `CheckedProgram` custody. Existing consumers observe no difference unless
  they read the new field. The rendered rejection diagnostic shape is
  unchanged.

`src/kernel-json` translates the recorded table into the frozen JSON
observation: 0018 term paths become document occurrence pointers, grades and
tags keep the frozen spellings, signature index lists become `/signature/N`
pointer arrays, and the referenced in-memory types and rows are interned into
the observation's shared `types` and `labels` tables by structural equality —
a linear representation translation using reference memoization, not a
semantic judgment. The kernel-json layer must not re-derive any context,
type, usage, premise, or origin fact. If a recorded fact cannot be
translated, check composition fails with a typed error; it never substitutes
its own judgment.

### JSON Schema artifact

The complete structural contract is described by exactly one checked-in JSON
Schema Draft 2020-12 artifact:

```text
spec/kernel-json/kernel-json-v1.schema.json
$id = https://semantic.phibkro.org/spec/kernel-json/kernel-json-v1.schema.json
```

The `$id` is a project-controlled stable identifier. It identifies the
artifact; it does not make remote availability, retrieval, or any remote
schema validation an authority.

The schema root accepts exactly a `KernelDocument` or a
`KernelCheckObservation`, discriminated by `format`. Every object schema is
closed with `additionalProperties: false`. Every array that a version 1 bound
limits carries `maxItems`; every string carries `maxLength`; every integer
carries safe-integer `minimum` and `maximum`. Every definition carries a
description written for agents. The `$id` is stable for version 1; a schema
change that alters accepted or rejected instances requires a version change.

JSON Schema cannot enforce, and the artifact must state that it cannot
enforce:

- de Bruijn scope validity (`distance` and `resumption_distance` in range);
- agreement between `operation` terms, handler clauses, and the declared
  signature;
- typing, effect rows, usage discipline, or handler completeness;
- sorted array order, duplicate-free rows, total node and depth bounds,
  UTF-8 strictness, duplicate-key rejection, or negative-zero distinction;
- occurrence-path resolvability, premise-link well-foundedness (strictly
  increasing, in-range indexes), or agreement between `inferred` and
  judgment 0;
- the conditional presence of `signature_origins` exactly for
  `computation.operation` (one entry) and `handler.deep` (every declaration
  under the handled label, complete and in canonical order), each entry's
  `/signature/N` range, or agreement between a binder entry's
  `origin_kind`, its `binder_origin` target, and the introducing term;
- label- and type-table discipline: code-point label order and uniqueness,
  child type indexes strictly below parents, maximal structural sharing,
  the frozen first-encounter traversal order, and index range validity;
- diagnostic-fact kind rules and nesting depth (fact record keys are
  deliberately open, but keys, scalars, arrays, and records are bounded;
  only kind agreement and depth escape the schema); and
- that any observation was produced by the authoritative checker.

Schema validity is a courtesy pre-check for agents. The strict decoder and
the 0018 checker remain the authorities, and the decoder revalidates every
structural rule without consulting the schema artifact.

### Golden examples

Version 1 checks in these byte-exact golden examples:

```text
examples/kernel-json/pure-program.kernel.json
examples/kernel-json/handled-program.kernel.json
examples/kernel-json/pure-program.accepted.kernel-check.json
examples/kernel-json/handled-program.accepted.kernel-check.json
examples/kernel-json/rejected-double-resume.kernel.json
examples/kernel-json/rejected-double-resume.rejected.kernel-check.json
```

They cover: a pure let program; a handled `fresh.allocate` operation whose
clause resumes exactly once; the complete accepted checked views of both,
including the shared label and type tables, binder contexts, usage limits,
rule names, premise links, and `signature_origins` for both
`computation.operation` and `handler.deep`; and one schema-valid document
whose clause resumes twice and is semantically rejected with
`usage.affine-duplicated`, together with its exact rejected observation. The
semantic facts in these fixtures were produced by running the accepted 0018
checker; the implementation must reproduce them byte-for-byte through
canonical encoding.

### Boundary and canonicalization

The byte boundary accepts only a genuine `Uint8Array`, snapshots it once, and
rejects proxies, accessor-backed objects, other typed-array kinds, and
detached buffers. The object boundary applies the 0019 repeated-reference
rule: it tracks every array and object by identity and rejects a second
occurrence, whether mutable or frozen, so cycles and aliases fail closed. It
rejects accessors, symbol keys, non-enumerable properties, exotic prototypes,
sparse arrays, and excess properties.

Input bytes must be strict UTF-8. The JSON parser rejects duplicate keys
before building an object. Strings must be Unicode scalar sequences; lone
surrogates are rejected; no Unicode normalization is applied. Numbers must be
safe integers with no fraction, exponent, plus sign, or leading zero;
negative zero is accepted for `int` values and preserved.

Canonical encoding follows the exact 0019 canonical JSON grammar: no
insignificant whitespace, object keys in Unicode code-point order, arrays in
contract-defined order, shortest UTF-8 string encoding with the fixed escape
set, `-0` and `0` as distinct integer tokens, and one final line feed.
Decoding then canonically encoding any accepted input yields exactly one byte
sequence per document meaning.

Object decoding has no input bytes, so — following the 0019 precedent — it
additionally enforces the byte bound on the canonical encoding of the decoded
value. Every accepted document therefore fits the byte bound regardless of
entry path, which the diagnostic-fact and observation size proofs rely on.

Returned documents and observations are deeply immutable snapshots. Later
caller mutation of any input cannot change a prior document, observation, or
byte result. All boundary failures are typed Effect failures with stable
`{code, path, message}` diagnostics.

### Storage independence

Version 1 freezes an observational compatibility rule: any implementation —
the reference recursive tree, a future Merkle DAG, or any other internal
representation — must decode the same accepted bytes to equal documents,
encode equal documents to identical canonical bytes, and produce identical
check observations for identical documents. Storage changes alone never
change version 1 and never appear in the JSON: no hash, node reference,
cache topology, store path, or bundle detail is representable in either
frozen document. The observation's `labels` and `types` indexes are not an
exception: they are observation-scoped semantic sharing with a frozen
deterministic construction, identical across every conforming
implementation, and they identify nothing outside their own document. A
representation change that alters any observable byte or observation is a
version change, not an implementation detail.

### Public module

The first implementation lives under `src/kernel-json/`. One documented entry
point exports:

```ts
decodeKernelDocumentBytes(input, bounds?)
decodeKernelDocumentValue(input, bounds?)
decodeKernelCheckObservationBytes(input, bounds?)
decodeKernelCheckObservationValue(input, bounds?)
encodeCanonicalKernelDocument(document)
encodeCanonicalKernelCheckObservation(observation)
kernelJsonSchema()
projectKernelProgram(document)
checkKernelDocument(document)
defaultKernelJsonBounds
```

Exact obligations:

- the decoders return immutable documents or observations and fail with
  typed diagnostics; they mint no semantic authority;
- the canonical encoders return exact deterministic bytes;
- `kernelJsonSchema` returns the frozen schema artifact as inert data; a test
  proves it byte-equal to the checked-in file, because the portable module
  has no filesystem authority;
- `projectKernelProgram` returns inert 0018 signature and term data through
  the existing 0018 public decoders; it cannot return a `CheckedProgram`;
- `checkKernelDocument` composes projection with the existing 0018 `check`,
  translates the judgment table recorded by the checker observation seam
  without re-deriving any fact, and returns the complete
  `KernelCheckObservation`; the emitted judgments must agree with the 0018
  derivation node-for-node; and
- no export accepts a forged document or observation as authority, exposes a
  raw checked-program or resumption constructor, or reaches 0019 emission.

Parsing, schema validation, and decoding cannot mint a `CheckedProgram` or
any 0019 normalized authority. The implementation uses TypeScript 7, Bun,
Effect v4, Oxfmt, and Oxlint, with one genuine Node test process importing
the same portable entry point.

### Limits

Version 1 separates raw-input decoding bounds from observation-envelope
bounds. They are different facts: raw bounds limit what a caller may hand
the decoder; envelope bounds limit what the authoritative check run is
entitled to produce, and they are derived from the raw bounds so that every
default-bound rejection is representable. Reusing the raw collection and
node limits for observations was falsified by an accepted input — the
label-bound counterexample below — whose rejection carries 76,800 distinct
labels.

The `semantic.kernel-json` raw-input defaults are:

```text
{
  "maximumBytes": 1048576,
  "maximumDepth": 128,
  "maximumNodes": 524288,
  "maximumStringBytes": 4096,
  "maximumCollectionLength": 4096,
  "maximumOperations": 256,
  "maximumOperationClauses": 256,
  "maximumEffectLabels": 256
}
```

The `semantic.kernel-check` observation-envelope defaults are:

```text
{
  "maximumObservationBytes": 33554432,
  "maximumObservationNodes": 4194304,
  "maximumObservationCollectionLength": 1048576,
  "maximumObservationDepth": 128,
  "maximumObservationStringBytes": 4096,
  "maximumLabels": 1048576,
  "maximumTypeNodes": 16384,
  "maximumJudgments": 16384,
  "maximumContextEntries": 256,
  "maximumDiagnostics": 1024
}
```

Depth counts JSON value nesting from the root at depth zero. Nodes count
every JSON value occurrence once — objects, arrays, strings, numbers,
booleans, and nulls — in preorder, before children. String bytes count
strict UTF-8 bytes for every key and string value. Document decoders apply
the raw family; observation decoders and observation encoding apply the
envelope family; the entry point selects the family, never a heuristic.
Custom bounds are exact records that can only lower these values; they are
validated before any candidate is inspected. The existing 0018 decode and
checker bounds apply unchanged during projection and check composition, so a
document within kernel-json bounds can still be rejected by the 0018
authority.

The raw `maximumNodes` is derived from the byte bound, not chosen: every
JSON value occurrence in a byte input consumes at least two input bytes (its
own shortest token plus one adjacent structural byte), so a 1,048,576-byte
document has at most 524,288 value occurrences. The label-bound
counterexample's 605,557-byte document holds 79,811 occurrences — over the
previous 65,536 raw cap, which therefore also strangled byte-legal input,
and comfortably under the derived cap. On the object path, which has no
input bytes, `maximumNodes` is the working traversal bound and the
canonical-encoding byte check completes the equivalence.

Envelope derivations, each tied to an exact raw or 0018 bound:

- `maximumLabels` = 1,048,576, the simple safe ceiling: every distinct
  label is nonempty and is spelled at least once in the raw input, which
  both entry paths bound at 1,048,576 bytes, so distinct labels can never
  exceed the byte bound. The tight occurrence lemma is stronger: each
  distinct label's first spelling is a quoted JSON string of at least three
  bytes occupying a disjoint input substring, so at most
  ⌊1,048,576 / 3⌋ = 349,525 distinct labels can exist. The counterexample's
  76,800 labels sit far inside both, and already above the falsified
  65,536.
- `maximumTypeNodes` = 16,384: distinct type-table nodes are at most
  decoded type record nodes plus one constructor node per checked term node
  plus declared signature type nodes, at most 3 × 4,096 = 12,288 under the
  0018 `maximumNodes` = 4,096 per decode call.
- `maximumObservationNodes` = 4,194,304, proven to dominate every
  default-bound rejection: the label table contributes at most
  1 + 349,525 occurrences (tight lemma); the type table contributes at most
  1 + 12,288 × 262 = 3,219,457 occurrences, because the widest type node —
  a function node — is one object, one tag, two child indexes, one grade,
  one row array, and at most 256 label indexes (the 0018 row bound), for
  262 occurrences; and the envelope, one diagnostic, and two structured
  facts contribute at most 64. The total, 3,569,047, leaves a seventeen
  percent margin under 4,194,304.
- `maximumObservationCollectionLength` = 1,048,576: the label table is the
  longest array the envelope permits; every other observation array has a
  smaller named cap (types and judgments 16,384, diagnostics 1,024, rows
  and contexts 256, premises 4,096).
- `maximumObservationBytes` = 33,554,432: serialized labels cost at most
  their raw input spellings plus three bytes each of quoting and
  separation, at most 1,048,576 + 3 × 349,525 = 2,097,151 bytes; the type
  table costs at most 12,288 × 1,856 = 22,806,528 bytes, because a full
  256-entry row of at-most-six-digit label indexes with separators is at
  most 1,792 bytes and node overhead at most 64; envelope and diagnostic
  cost at most 8,192. The total, 24,911,871, leaves a twenty-five percent
  margin under 32 MiB.

Rejected observations are therefore always representable under the default
envelope: one diagnostic, at most two type facts, tables bounded by the
arithmetic above. Accepted observations carry the full per-judgment
contexts, which are quadratic in the worst case; an accepted observation
whose canonical encoding exceeds the envelope bounds is a typed, loud
resource failure — never truncation, elision, or a silent partial view —
and the 0018 acceptance itself is unaffected. That escape hatch is
forbidden for default-bound rejections: a `KernelDocument` that decodes
under the default raw bounds and reaches a checker rejection must produce
its complete bounded rejection observation.

### Failure order

Byte decoding fails in this order:

1. request shape, without property access side effects;
2. bounds validation;
3. byte snapshot and byte-length limit;
4. strict UTF-8;
5. JSON grammar and duplicate keys;
6. generic depth, node, string, and collection bounds of the entry point's
   bound family (raw for documents, envelope for observations);
7. exact closed schema shape, tags, enums, and safe integers;
8. cross-field rules, in this order: version markers; sorted effect rows,
   signature order, and clause order; duplicate signature pairs and
   duplicate clauses; label-table code-point order and uniqueness;
   type-table child indexes strictly below their parent, structural
   uniqueness (maximal sharing), and frozen first-encounter traversal order;
   every label and type index in range; occurrence-path token validity;
   premise links strictly increasing and in range;
   `inferred`-versus-judgment-0 agreement; `signature_origins` present
   exactly for `computation.operation` (exactly one entry) and
   `handler.deep` (every declaration under the handled label, complete and
   in canonical signature order), each entry within `/signature/N` range;
   binder-entry `origin_kind` agreement with its `binder_origin` token
   shape; diagnostic `code` and `rule` membership in the closed version 1
   enums; and diagnostic-fact kind rules and string, array, record, and
   depth bounds; and
9. immutable document construction.

Object decoding starts at step 6 with the repeated-reference rule. Check
composition validates its document input, projects, then defers entirely to
the 0018 checker; the first 0018 diagnostic becomes the rejection
observation. Each failure returns the first diagnostic only.

### Liveness

Every decoder loop consumes at least one byte or one JSON value occurrence.
Canonical encoding and projection each visit every node exactly once with an
explicit depth counter and no unbounded host recursion. Check composition
inherits the 0018 checker's termination on finite terms. No API waits for
external input or starts background work.

## Oracle-first counterexamples

The implementation must retain focused rejection observations for:

1. an unknown `format`, `version`, or `kernel` marker;
2. one missing required field and one excess field at every schema family;
3. an unknown tag in every tagged union;
4. an unsorted or duplicate effect row, signature pair, or operation clause;
5. an unsafe integer, fractional number, exponent form, or leading zero;
6. `-0` collapsing to `0` across decode and canonical encode;
7. invalid UTF-8, a lone surrogate, and a duplicate JSON key;
8. input over each byte, depth, node, string, and collection bound;
9. a cyclic object, repeated alias, accessor, symbol key, exotic prototype,
   and sparse array at the object boundary;
10. a `resumption` value accepted structurally and rejected by the checker;
11. an out-of-range `distance` and `resumption_distance` rejected by the
    checker, not the schema;
12. a schema-valid document rejected for signature disagreement, typing,
    usage, and handler inexactness;
13. a malformed occurrence path, an escaped `~` pointer token, a broken
    premise link, or a judgment table disagreeing with `inferred`;
14. a missing, extraneous, incomplete, misordered, or out-of-range
    `signature_origins` list — including a `handler.deep` judgment listing
    fewer than every declaration under its handled label;
15. a diagnostic code or rule outside the closed version 1 enums;
16. a diagnostic fact over the string, array, record, or depth bound, or
    breaking a frozen fact kind rule (an inline or rendered type where a
    `type_index` is required);
17. an unsorted or duplicate label table; a type table with a dangling or
    forward child index, two structurally equal entries, or entries outside
    the frozen traversal order;
18. the maximum-shape rejection: a document inside every default bound whose
    let chain of pair doublings makes the mismatched inferred type render
    beyond 4,096 bytes — beyond 512 KiB at sixteen doublings — which the
    d8d663a contract could not represent, and which must remain a bounded
    rejected observation through one `type_index` into the shared table,
    never an Effect failure, truncation, or omission;
19. an accepted observation whose canonical encoding exceeds the envelope
    bounds failing as a typed resource error, never as truncation or a
    partial view;
20. the label-bound counterexample: a balanced value type with 300 thunk
    leaves, each carrying 256 unique labels, inside a lambda applied to
    unit — a 605,557-byte document with 79,811 JSON value occurrences and
    76,800 distinct labels that decodes under the default raw bounds,
    rejects with `type.argument-mismatch`, and must produce its complete
    bounded rejection observation (its labels alone falsified the previous
    65,536 caps); generated compactly in TypeScript, never as a checked-in
    giant JSON;
21. a boundary case at every envelope maximum — `maximumLabels`,
    `maximumTypeNodes`, `maximumObservationNodes`,
    `maximumObservationCollectionLength`, `maximumObservationBytes` — and
    at the derived raw `maximumNodes`, each with the worst-case arithmetic
    checked executable, one fitting case, and one rejection;
22. a forged or caller-mutated document failing to enter projection or check
    composition;
23. parsing or schema validation attempting to mint checked or 0019
    authority;
24. a seam-recorded judgment table disagreeing with the final 0018
    derivation in rule, order, or premise shape, or retaining records from a
    discarded handler fixed-point iteration; and
25. two internal representations producing different bytes or observations
    for one fixture.

Positive observations must include:

1. the pure golden document decoding, checking, and re-encoding
   byte-exactly;
2. the handled golden document with one resumption accepted with residual
   row `{}`;
3. both accepted checked views exposing exact contexts, origins, limits,
   rules, premise links, shared label and type tables, and complete
   `signature_origins` for `computation.operation` and `handler.deep`;
4. the rejected golden document producing the exact frozen diagnostic;
5. whitespace, key-order, and escape variants of one document decoding to
   equal documents and identical canonical bytes;
6. schema validation accepting all golden documents and rejecting each
   closed-shape mutation;
7. the 0018 seam recording every golden judgment fact during the single
   authoritative check pass, with all prior 0018 acceptance observations,
   normalized report bytes, and custody tests unchanged; and
8. Bun and genuine Node returning byte-identical documents, observations,
   and canonical encodings.

## Acceptance

Feature 0020 is accepted only when:

1. the frozen contract, schema artifact, and six golden examples are
   checked in and byte-stable;
2. the strict decoders enforce every boundary, bound, and cross-field rule
   with typed failures, including label- and type-table discipline;
3. canonical encoding is deterministic and byte-identical on Bun and genuine
   Node;
4. check composition reproduces every golden observation through the real
   0018 checker, using only the judgment-recording seam for per-occurrence
   facts, while every prior 0018 acceptance stays green;
5. the maximum-shape counterexample — exponential rendered types inside
   every default bound — yields a bounded rejected observation through the
   shared type table, with the rejection-representability arithmetic
   checked by a focused test;
6. the committed label-bound counterexample fixture
   (`tests/kernel-json-observation-bounds.test.ts`) reproduces the 76,800
   distinct-label rejection compactly, proves the raw and envelope bound
   derivations executable, and holds a boundary assertion at every revised
   maximum, aligned with the schema constants;
7. the schema artifact matches the exported schema observation byte-for-byte
   and documents its non-enforcement list;
8. no public path mints checked or 0019 authority from parsed input;
9. the storage-independence differential observation passes for the
   reference implementation;
10. all counterexample and positive families above have focused tests;
11. typecheck, strict lint, formatting, project-model validation, and
    generated-view gates pass; and
12. exact feature acceptance and full integration pass at one clean head.

The exact acceptance command is:

```bash
bun scripts/accept/0020-agent-facing-kernel-json.ts
```

At the frozen-design checkpoint, the command must prove the contract
artifacts exist and then fail on the first missing implementation artifact,
`src/kernel-json/index.ts`.

## Kill or redesign criteria

Stop or recut the feature if:

- any hash, node reference, cache topology, store path, or bundle detail
  becomes representable in either frozen JSON document;
- schema validity or decoding is treated anywhere as checked authority;
- the raw document grows an inferred fact that duplicates the observation;
- the observation cannot be produced from the real 0018 checker without
  re-deriving semantics in a second checker;
- binder or resumption contexts in the checked view disagree with 0018;
- canonical bytes depend on host property order, locale, or default string
  encoding;
- a storage change requires a version change to stay observationally equal;
  or
- the slice expands into surface syntax, names, evaluation transcripts, or
  package identity.

## Non-goals

- Surface syntax, names, parsing of non-JSON text, or elaboration.
- The S-expression source format; the prior checkpoint is preserved at
  commit `ee13bffec46ac4df9fa73874b8bf7a17cf6d2496` and superseded by this
  contract.
- Evaluation, machine traces, suspension transport, or resumption custody in
  JSON.
- Normalized identity, hashing, Merkle layout, caching, bundles, or storage
  of any kind.
- Schema-driven code generation, `$ref` resolution services, or remote
  schemas.
- Polymorphism, recursion, row variables, or any 0018 grammar extension.
- Editing, incrementality, formatting preservation, or an LSP server.
- A compatibility promise for pre-version-1 drafts.

## Semantic diff

The project gains one frozen, versioned, agent-facing JSON interface for the
accepted 0018 kernel: a raw recursive document with exact binder semantics, a
separate checked observation that makes binder context and semantic judgment
explicit, one JSON Schema description, golden fixtures, strict boundaries,
and a storage-independence rule that keeps any future Merkle DAG invisible.

The 0018 typing, usage, effect, handler, and custody semantics and the 0019
normalized artifact and identity semantics do not change. The 0018 accepted
observation gains one additive judgment-recording field so the authoritative
checker, not a downstream reconstruction, supplies every agent-facing fact;
its acceptance, rejection, report bytes, and custody behavior are
unchanged. The earlier 0020
S-expression contract is superseded, not erased: its checkpoint remains in
history, and this contract replaces it as the single active 0020 lineage.
