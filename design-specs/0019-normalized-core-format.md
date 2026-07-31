# Design spec 0019: normalized core format

Status: frozen for the first normalized-core tracer

Date: 2026-07-31

Depends-On-Feature-IDs: 0018-minimal-kernel-calculus

Design-Lens-Version: open-semantic-system-v1

## Problem

Feature 0018 can check and run one finite calculus, but its accepted program is
an in-process value under private custody. It is not a durable semantic
artifact. A second process cannot decode it, verify its exact meaning, or bind
evidence to it without trusting host object layout.

The project needs one deterministic, host-neutral artifact for accepted 0018
programs. The artifact must retain the checked term, operation signature,
inferred summary, imported assumptions, and optional source correspondence.
It must have collision-resistant, domain-separated identities and a strict,
bounded decoder.

This feature defines only a finite structural normalization. It does not
evaluate terms, search for proofs, parse source text, or define the future
general normalized core.

## Felt journey

A language engineer checks a closed 0018 program. They supply one imported
assumption and source correspondence for two normalized nodes. The normalizer
emits canonical UTF-8 bytes with a semantic identity and an artifact identity.

Bun and Node emit identical bytes. A second process strictly decodes the bytes,
recomputes all identities, reruns the 0018 checker over the inert signature and
term, and observes the same type, effect row, and usage vector.

Changing only a source range preserves the semantic identity and changes the
artifact identity. Changing an operation type, term, grade, effect, or imported
assumption changes the semantic identity. An unknown version, forged identity,
cyclic object, excess property, or over-bound input is rejected before it can
be treated as a normalized artifact.

## Open semantic system design lens

### Boundary and warranted state

Feature 0019 owns:

- the exact `semantic.normalized-core` version 1 document;
- a finite transformation from a privately custodied 0018 checked program and
  decoded metadata to inert normalized data;
- canonical UTF-8 byte encoding;
- domain-separated SHA-256 identities;
- strict bounded decoding from unknown objects or bytes; and
- independent rechecking through the accepted 0018 checker.

The feature warrants that an emitted artifact was derived from the exact
checked program in its custody. A successful validation warrants that the
decoded inert signature and term are accepted by the current
`semantic.kernel-calculus/0018/v1` checker with the recorded summary.

The feature does not warrant that source correspondence or imported assumptions
are true. Those are attributed input assertions. It does not own source text,
source names, packages, proof evidence, files, networks, deployment, or a
general compiler pipeline.

The canonical artifact is inert data. It never contains a `CheckedProgram`,
machine state, internal resumption, external suspension, one-shot token,
runtime closure, schema object, Effect service, or host object identity.

### Semantic inputs

The normalizer accepts:

- a privately custodied 0018 `CheckedProgram`;
- one unknown `EmissionMetadataInput` for bounded decoding; and
- public bounds that can only narrow the version 1 defaults.

The checked program is execution authority already minted by 0018. Feature
0019 may inspect its private internals inside the repository module boundary,
but it must not export those internals or a raw constructor.

Source metadata is a human or tool assertion. A source content digest
identifies bytes reported by the caller. It does not establish that the bytes
exist or produced the checked program. A source range states an asserted
correspondence to one normalized node path.

An imported assumption is an inert attributed assertion or dependency carried
by the artifact. The 0018 checker does not receive, interpret, or validate it.
Its identity establishes only its exact normalized record. It is not a checker
premise, proof, or evidence that the statement is true.

The decoder also accepts unknown in-memory values or candidate UTF-8 bytes.
Unknown input establishes no schema, identity, acyclicity, or checker
acceptance.

### Semantic outputs

Emission returns one immutable `NormalizedCoreArtifact` observation and its
canonical bytes. Decoding returns:

```text
Decoded(candidate)
Rejected(diagnostics)
```

Validation returns:

```text
Accepted(artifact, checkSummary)
Rejected(diagnostics)
```

`Decoded` means only that the versioned representation, bounds, ordering, and
identities are valid. `Accepted` additionally means that the inert signature
and term pass the 0018 checker and match the recorded summary.

Canonical bytes are the durable artifact. Object values are immutable
projections of those bytes. Diagnostics are observations, not semantic
artifacts and not proof.

The feature emits no effect request. SHA-256 is a deterministic digest service,
not random-number authority. The implementation requests only the digest
operation through an explicit Effect `Crypto` service.

### Effect protocols and uncertainty

There is no external protocol, retry, timeout, or reconciliation loop.
Normalization, encoding, decoding, identity verification, and rechecking are
finite local operations.

A digest-service failure returns a typed failure. It does not emit an artifact
with a missing or placeholder identity. A decode or validation failure returns
diagnostics and no checked-program authority.

### Components and orthogonal structures

The vertical slice is:

```text
custodied 0018 program + unknown metadata
  -> bounded metadata decoder
  -> structural normalizer
  -> entity identity derivation
  -> semantic identity derivation
  -> artifact identity derivation
  -> canonical UTF-8 artifact bytes
  -> strict byte decoder
  -> identity verifier
  -> 0018 checker
  -> accepted observation or rejection
```

These structures remain distinct:

- 0018 checked-program custody;
- normalized inert representation;
- binder/reference structure;
- semantic identity;
- source correspondence;
- artifact identity;
- imported assumptions;
- checker acceptance; and
- external evidence.

The transformation from the custodied program to normalized inert data crosses
a semantic boundary. It discards runtime authority and preserves the finite
0018 term, signature, and checker summary. Object-to-byte encoding stays
within the normalized-core layer.

The graph is acyclic. Every traversal consumes one node from a finite decoded
input under explicit depth, node, string, collection, and byte bounds.

### Bounded autonomy and resources

Version 1 uses these public maxima:

- 1,048,576 input or output bytes;
- depth 64;
- 4,096 total JSON value occurrences;
- 4,096 UTF-8 bytes per string;
- 256 operations;
- 256 imported assumptions;
- 256 source units;
- 1,024 source correspondences; and
- 4,096 entries in each array or object.

The exact public bounds record is:

```text
{
  "maximumBytes": 1048576,
  "maximumDepth": 64,
  "maximumNodes": 4096,
  "maximumStringBytes": 4096,
  "maximumCollectionLength": 4096,
  "maximumOperations": 256,
  "maximumAssumptions": 256,
  "maximumSourceUnits": 256,
  "maximumCorrespondences": 1024
}
```

The node counter starts at zero. Visiting any JSON value occurrence increments
it once before visiting children. Scalars, arrays, and objects each count one.
A semantic term or type node is its underlying object occurrence and does not
increment a second counter. Object keys do not count as nodes. Each property
value or array element is one child occurrence.

The root has depth zero. Every property value or array element has parent depth
plus one. A value at depth greater than 64 is rejected. Each array length and
each object's count of own enumerable string keys must be at most 4,096.
Specialized operation, assumption, source-unit, and correspondence maxima also
apply.

The string limit counts strict UTF-8 bytes for every property key and string
value after lone-surrogate rejection. The input-byte limit counts the complete
candidate byte array. The output-byte limit counts the complete canonical
artifact, including its final line feed. Unknown-object decoding has no input
bytes, so it applies the output limit after canonical encoding.

Signed integer literals are safe integers. Indices, ranges, byte lengths,
versions, and bounds are nonnegative safe integers. The decoder tracks every
array or object by identity and rejects its second occurrence, whether it is
mutable or frozen. This repeated-reference rule detects both cycles and
acyclic aliases. It rejects accessors, symbol keys, non-enumerable properties,
exotic prototypes, sparse arrays, and excess properties.

Public bounds are exact records containing every version 1 bound. Each value
must be a positive safe integer and cannot exceed its default. Bounds are
validated before any candidate or checked program is inspected.

Each public operation starts fresh counters. Metadata decoding counts the
complete metadata input. Unknown-artifact decoding counts the complete
artifact candidate. Emission separately counts the complete projected artifact
after all normalized program and metadata fields are present. Thus a large
custodied 0018 program can be rejected by the 0019 output depth, node, string,
collection, or byte bound even though 0018 accepted it.

Unknown-object decoding visits values in preorder. It visits object properties
in Unicode code-point key order and arrays in increasing index order. It
reports only the first diagnostic. At each value it checks depth, node budget,
prior object identity, object or array shape, collection length, key and value
string bounds, then children. Schema and cross-field checks follow the same
canonical field and array order.

Byte decoding has this failure precedence:

1. bounds;
2. input byte length;
3. strict UTF-8;
4. JSON grammar and duplicate keys;
5. generic JSON traversal bounds;
6. byte-for-byte canonical re-encoding;
7. exact artifact schema and cross-field references;
8. entity identities;
9. semantic identity;
10. artifact identity; and
11. independent 0018 recheck.

Emission checks bounds, 0018 custody, metadata shape, metadata references,
structural projection, entity identities, semantic identity, artifact
identity, then output byte length. A failure returns one stable
`{code, path, message}` diagnostic and no partial artifact.

Emission snapshots every caller-owned input before the first digest. Returned
objects and nested arrays are deeply immutable. Later input mutation cannot
change prior bytes, identities, or validation results.

The implementation has no filesystem, network, clock, random, process,
console, parser, evaluator, proof search, or backend authority.

### Evidence, assumptions, and unsupported claims

Runtime schemas and adversarial tests establish selected representation and
bound behavior. Exact byte fixtures establish Bun and genuine Node agreement
for selected inputs. Mutation tests establish selected snapshot and identity
sensitivity cases. Rechecking establishes only acceptance by the 0018
algorithmic checker.

The repository's semantic Effect lint classifies every
`src/normalized-core/**` file as portable. A focused rule test establishes that
direct runtime imports, ambient nondeterminism, and Effect execution are
rejected there. The implementation acceptance must also traverse the
normalized-core entry point's relative-import closure and reject runtime
adapters or forbidden bare imports. These are static observations over the
checked closure, not proof that an indirect dependency has no hidden effect.

SHA-256 collision resistance is an imported cryptographic assumption. Domain
separation prevents accidental cross-kind reuse under that assumption. Tests
cannot prove collision resistance.

The artifact imports the 0018 semantic contract
`semantic.kernel-calculus/0018/v1`. It assumes the accepted 0018 checker and
private custody implementation at integration head
`f461cb38960493c044459c58374d6d1aa12bda3b`.

This feature does not establish:

- progress, preservation, or type soundness;
- truth of imported assumptions or source correspondence;
- semantic equivalence with a future full language;
- Unicode normalization equivalence;
- proof-obligation validity;
- package or declaration identity;
- general normalization or definitional equality;
- protection against SHA-256 collisions or hostile process failure; or
- compatibility with Rust, Lean, MLIR, Wasm, or any host serializer.

## Deep-module contract

### Exact versioned document

The only accepted top-level shape is:

```text
{
  "format": "semantic.normalized-core",
  "version": 1,
  "kernel": "semantic.kernel-calculus/0018/v1",
  "semantic_identity": Identity,
  "artifact_identity": Identity,
  "signature": [NormalizedOperation...],
  "term": ComputationTerm,
  "summary": {
    "type": ComputationType,
    "effects": [Label...],
    "usage": [Grade...]
  },
  "assumptions": [ImportedAssumption...],
  "obligations": [],
  "source": {
    "units": [SourceUnit...],
    "correspondence": [SourceCorrespondence...]
  }
}
```

All fields are required. No other field is accepted at any level. Version 1
has no proof obligations, so `obligations` must be the exact empty array.
This makes absence explicit without inventing proof claims.

An `Identity` is exactly `sha256:` followed by 64 lowercase hexadecimal
digits. A `Grade` is exactly `"0"`, `"1"`, or `"omega"`.

All strings must be nonempty where the 0018 contract requires a name. Every
string must be a sequence of Unicode scalar values. Lone UTF-16 surrogates are
rejected. Version 1 performs no NFC, NFD, case, locale, or compatibility
normalization. Labels and operation names are exact code-point sequences.

### Types, terms, binders, and references

Value and computation types preserve the 0018 tagged structure with these
snake-case field names:

```text
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
```

The complete normalized value grammar is:

```text
ValueTerm :=
  {"tag":"bound-value","distance":NonnegativeSafeInteger}
  {"tag":"unit"}
  {"tag":"bool","value":Boolean}
  {"tag":"int","value":SignedSafeInteger}
  {"tag":"pair","first":ValueTerm,"second":ValueTerm}
  {"tag":"thunk","body":ComputationTerm}
```

The complete normalized computation and clause grammar is:

```text
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

ReturnClause :=
  {"body":ComputationTerm}

OperationClause :=
  {"operation":String,"body":ComputationTerm}
```

Every object has exactly the shown fields. A `SignedSafeInteger` is any integer
from `-9007199254740991` through `9007199254740991`, including negative zero as
a distinct accepted 0018 number. Canonical bytes encode negative zero as
`-0`; they encode positive zero as `0`. Identity therefore distinguishes them.
This preserves 0018 values that an external operation argument can observe
with host negative-zero semantics.

`distance` is the exact 0018 de Bruijn index. Ordinary binders and resumption
binders each have their own context and distance. A resumption is not a value
and has no general reference form. The raw 0018 AST's `resumption` value
variant has no normalized variant because the 0018 checker always rejects it
with `resumption.escape`; no custodied accepted program can contain it.

No source binder name appears in the semantic payload. The normalized
representation is therefore stable for 0018 programs that differ only by
external binder spellings and produce the same de Bruijn term. Version 1 makes
no broader alpha-equivalence claim.

Effect rows are sorted by Unicode code-point order and contain no duplicates.
Operation signatures are sorted by `(label, operation)` in the same order.
Handler clauses are sorted by operation name. Reordering these set- or
dispatch-shaped inputs does not change semantic identity. No term is evaluated
or rewritten.

Each normalized operation is:

```text
{
  "operation_identity": Identity,
  "label": String,
  "operation": String,
  "argument_type": ValueType,
  "result_type": ValueType
}
```

Its identity is derived from the other four fields. Duplicate label and
operation pairs or duplicate operation identities are rejected.

The summary is the exact 0018 inferred computation type, sorted effect row,
and usage vector. It is a checked claim inside emitted artifacts. Validation
reruns 0018 and rejects any mismatch.

### Emission metadata input

The caller supplies exactly this identity-free input:

```text
EmissionMetadataInput := {
  "assumptions": [ImportedAssumptionInput...],
  "source": {
    "units": [SourceUnitInput...],
    "correspondence": [SourceCorrespondenceInput...]
  }
}

ImportedAssumptionInput := {
  "kind": "declared",
  "statement": String
}

SourceUnitInput := {
  "source_key": String,
  "uri": String,
  "content_identity": Identity,
  "byte_length": NonnegativeSafeInteger
}

SourceCorrespondenceInput := {
  "node_path": JsonPointer,
  "source_key": String,
  "role": "definition" | "expression" | "type" | "generated",
  "start_byte": NonnegativeSafeInteger,
  "end_byte": NonnegativeSafeInteger
}
```

All fields are required and exact. Callers never supply an operation,
assumption, source-unit, semantic, or artifact identity that the normalizer
owns.

`source_key` is a nonempty caller-local correlation key. Input source keys must
be unique. Every correspondence source key must name one input source unit.
The normalizer derives each source identity, replaces correspondence source
keys with those identities, and omits source keys from the artifact. Renaming a
source key and updating its references cannot change artifact bytes.

Input arrays can have any order. The normalizer decodes and snapshots them,
derives identities, resolves keys and paths, rejects duplicates, and emits the
contract-defined output order.

Assumption statements and source URIs must be nonempty. URIs are opaque scalar
sequences: the normalizer does not parse, resolve, case-fold, or fetch them.

### Imported assumptions

Each imported assumption is:

```text
{
  "assumption_identity": Identity,
  "kind": "declared",
  "statement": String
}
```

The identity is derived from `kind` and `statement`. Assumptions are sorted by
identity and must be unique. A statement is inert text with a maximum of 4,096
UTF-8 bytes and at least one Unicode scalar. Changing any assumption changes
semantic identity.

The operation signature is declared semantic input, not proof and not an
imported assumption. The 0018 checker validates only the signature and term.
It neither consumes nor validates this assumptions array. Version 1 has no
evidence reference field because it cannot validate an evidence vocabulary
without expanding this feature.

### Source correspondence

Each source unit is:

```text
{
  "source_identity": Identity,
  "uri": String,
  "content_identity": Identity,
  "byte_length": NonnegativeSafeInteger
}
```

`source_identity` is derived from the other three fields. `content_identity`
is the caller's assertion about source bytes. The implementation does not read
the URI or source bytes.

Each correspondence is:

```text
{
  "node_path": String,
  "source_identity": Identity,
  "role": "definition" | "expression" | "type" | "generated",
  "start_byte": NonnegativeSafeInteger,
  "end_byte": NonnegativeSafeInteger
}
```

`node_path` is the RFC 6901 JSON Pointer string form with this strict subset:

- it must start with `/term`, `/signature`, `/summary`, or `/assumptions`;
- each token begins with `/`;
- `~0` decodes to `~`, `~1` decodes to `/`, and every other `~` sequence is
  rejected;
- an array token is `0` or a nonzero ASCII decimal digit followed by zero or
  more ASCII decimal digits;
- leading zeroes, signs, whitespace, `-`, unsafe indices, and out-of-range
  indices are rejected; and
- object tokens must equal one exact schema field after escape decoding.

Resolution occurs after term, signature, summary, assumptions, their entity
identities, and their contract-defined array order are complete, but before
the `source` object is created. The pointer root is the identity-bearing
semantic payload object. Only a resolved object value qualifies as a semantic
node. The semantic root, arrays, scalar fields, and identity strings do not
qualify. The normalizer owns structural resolution; the caller owns the
assertion that the selected source range corresponds to that node.

A range must satisfy
`start_byte <= end_byte <= byte_length` for its resolved source unit.

Source units are sorted by source identity. Correspondences are sorted by
`(node_path, source_identity, role, start_byte, end_byte)`. Exact duplicates
are rejected. Source data does not participate in semantic identity. It does
participate in artifact identity.

### Canonical bytes and identities

Canonical JSON has no insignificant whitespace and ends with one line feed.
Object keys use Unicode code-point order. Arrays retain their contract-defined
order. Strings use double quotes, escape quote and reverse solidus, use the
short escapes for backspace, tab, line feed, form feed, and carriage return,
and use lowercase `\u00xx` for other U+0000 through U+001F scalars. All other
Unicode scalar values use their shortest UTF-8 encoding. Integers use base-10
digits with no leading zero. Negative integers use one leading `-`. Negative
zero uses the exact token `-0`; positive zero uses `0`. No plus sign, decimal
point, exponent, or alternate number form is accepted.

The digest input is:

```text
ASCII(domain) || 0x00 || UTF8(canonical-json-without-final-line-feed(payload))
```

The result is `sha256:` plus the lowercase hexadecimal SHA-256 digest.
The exact domains are:

```text
semantic.normalized-core/operation/v1
semantic.normalized-core/assumption/v1
semantic.normalized-core/source-unit/v1
semantic.normalized-core/semantic/v1
semantic.normalized-core/artifact/v1
```

The semantic payload is the top-level document without `semantic_identity`,
`artifact_identity`, or `source`. It includes all derived operation and
assumption identities. The artifact payload is the complete document without
`artifact_identity`. It includes `semantic_identity` and `source`.

The byte decoder uses a bounded JSON parser that reports duplicate keys before
building an object. It parses strict UTF-8 and JSON, validates generic JSON
bounds, and re-encodes the value. Input bytes must equal the canonical bytes
exactly.
Therefore duplicate keys, alternative escapes, alternate ordering, trailing
data, a missing final line feed, or extra whitespace fail closed.

Every accepted operation, assumption, source unit, semantic root, and artifact
has a recomputed identity. Version 1 emits no obligation entities. A forged
identity remains invalid even if a caller refreshes a parent identity.

### Public module

The implementation will live under `src/normalized-core/`. One documented
entry point will export:

- exact data and diagnostic types;
- default and caller-narrowable bounds;
- bounded metadata decoders;
- emission from a custodied 0018 checked program;
- canonical byte encoding;
- strict unknown-object and byte decoders;
- identity verification; and
- validation through the 0018 checker.

The entry point will not export:

- 0018 private program internals;
- raw checked-program constructors;
- resumption or suspension tokens;
- digest placeholders or unchecked identity constructors;
- mutable internal builders;
- filesystem, network, parser, proof, evaluator, or backend adapters; or
- Rust, Lean, MLIR, or Wasm types.

The implementation uses TypeScript 7, Bun, Effect v4, Oxfmt, and Oxlint.
One genuine Node test process must import the same portable entry point and
produce the same bytes and observations. There is no normalized-core runtime
adapter exemption.

## Oracle-first counterexamples

The implementation must retain focused rejection observations for:

1. an unchecked structural lookalike passed as a checked program;
2. a private 0018 resumption, suspension, machine state, or closure in metadata;
3. an unknown `format` or `version`;
4. one missing required field;
5. one excess field at every schema family;
6. one forged operation identity;
7. one forged assumption identity;
8. one forged source-unit identity;
9. one forged semantic identity with a refreshed artifact identity;
10. one forged artifact identity;
11. a duplicate operation pair or identity;
12. a duplicate assumption or source unit;
13. a correspondence to an unknown source or unresolved node path;
14. a source range outside its declared byte length;
15. a cyclic object;
16. a repeated object or array alias, whether mutable or frozen;
17. an accessor, symbol key, exotic prototype, or sparse array;
18. input over each byte, depth, node, string, general collection, and
    specialized collection bound;
19. a lone surrogate or malformed UTF-8 sequence;
20. noncanonical JSON bytes, duplicate keys, whitespace, or trailing data;
21. a summary whose type, effects, or usage differs from the 0018 checker;
22. a later caller mutation changing a prior artifact;
23. a source-only change altering semantic identity;
24. a semantic change preserving semantic identity; and
25. Bun and Node emitting different bytes;
26. `-0` collapsing to `0` or a negative safe integer being rejected;
27. a source key surviving into artifact bytes or failing deterministic
    identity replacement;
28. a malformed, scalar-targeting, pre-normalization, or out-of-range JSON
    Pointer being accepted; and
29. normalized-core code reaching a runtime adapter through its transitive
    import closure.

Positive observations must include:

1. one pure closed 0018 program;
2. one checked operation and handler program;
3. one unhandled-effect program;
4. explicit empty assumptions, obligations, and source correspondence;
5. one imported assumption;
6. one source unit with several correspondences;
7. equal bytes for reordered rows, signatures, and handler clauses;
8. equal semantic identities for binder-spelling-only source metadata;
9. changed artifact identity but stable semantic identity after a source-range
   change;
10. changed semantic and artifact identities after a term, grade, effect,
    operation type, or assumption change;
11. round-trip byte equality through strict decoding; and
12. byte-identical Bun and genuine Node reports;
13. exact round trips for negative safe integers and distinct `-0`;
14. identity-free metadata input deriving all owned identities; and
15. a source-key rename with matching references preserving artifact bytes.

## Acceptance

Feature 0019 is accepted only when:

1. the exact schema, bounds, canonical bytes, and digest domains are executable;
2. emission accepts only privately custodied 0018 checked programs;
3. normalized data contains no private authority or host runtime value;
4. all entity and root identities are recomputed and fail closed;
5. binder and resumption references preserve the 0018 de Bruijn meaning;
6. set-shaped ordering changes preserve semantic identity;
7. every semantic field and assumption changes semantic identity;
8. source-only changes preserve semantic identity and change artifact identity;
9. source correspondence resolves and remains an attributed assertion;
10. the unknown-object and byte decoders enforce every declared bound;
11. forged, excess, cyclic, aliased, malformed, and unknown-version inputs
    have focused rejections;
12. later input mutation cannot change prior bytes or observations;
13. decoded artifacts are independently rechecked by 0018;
14. Bun and genuine Node emit byte-identical artifacts and reports;
15. normalized-core lint and transitive-closure tests find no forbidden
    ambient authority, runtime adapter, or backend type;
16. the full 0018 exact acceptance remains green;
17. typecheck, strict lint, formatting, project-model, and generated-view gates
    pass; and
18. exact feature acceptance and full integration pass at one clean head.

The exact acceptance command is:

```bash
bun scripts/accept/0019-normalized-core-format.ts
```

## Kill or redesign criteria

Stop or recut the feature if:

- normalized emission can inspect a structural lookalike without 0018 custody;
- any serialized field retains a private authority token or host closure;
- identity depends on host property order, locale, or default string encoding;
- one decoder accepts a value that the other decoder rejects as the same
  canonical artifact;
- canonicalization requires term evaluation or an unbounded rewrite;
- source metadata can change semantic identity;
- an imported assumption is relabeled as proof or checked evidence;
- a format change can be accepted without a version change;
- a second process cannot recheck the inert term and signature; or
- the slice expands into parsing, proof search, package identity, or lowering.

## Non-goals

- Surface syntax, parser, elaborator, formatter, or language server.
- General normalization, beta reduction, definitional equality, or evaluation.
- Package, module, declaration, theory, or compatibility identity.
- Stable identity for future language forms not present in 0018.
- Proof terms, proof search, evidence verification, or nonempty obligations.
- Recursive terms, universes, polymorphism, row variables, or ownership IR.
- Optimizations, CBPV lowering, SSA, Rust, Lean, MLIR, Wasm, or native code.
- Filesystem persistence, network transport, signing, registries, or deployment.
- Unicode normalization equivalence beyond exact scalar sequences.
- A proof of SHA-256 collision resistance or kernel soundness.

## Semantic diff

The project gains a durable, deterministic semantic artifact for the exact
accepted 0018 calculus. It gains explicit imported assumptions, source
correspondence, strict versioning, and separate semantic and artifact
identities.

The 0018 syntax, typing, effects, usage, handler, evaluation, suspension, and
private-custody semantics do not change. The new artifact is inert until the
0018 checker accepts it. Future frontend, proof, analysis, and backend work can
depend on this versioned seam without making any host or backend representation
semantic authority.
