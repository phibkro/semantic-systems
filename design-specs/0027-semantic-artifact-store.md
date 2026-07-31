# Design spec 0027: semantic artifact store tracer

Status: frozen for the first in-memory semantic reuse journey

Date: 2026-08-01

Depends-On-Feature-IDs: 0019-normalized-core-format

Design-Lens-Version: open-semantic-system-v1

## Problem

Feature 0019 gives one accepted normalized-core artifact two different
identities: `semantic_identity` identifies the checked semantic value, while
`artifact_identity` also identifies source correspondence and other retained
artifact metadata. The language system cannot yet reuse those identities. It
has no executable component that distinguishes an exact artifact hit from a
different artifact carrying the same semantic value, and no place to bind an
authored name without making that name part of semantic identity.

The first build-system tracer needs the smallest store that exercises those
relations without prematurely defining a database, a distributed cache, a
general Merkle graph, or compiler invalidation. It must never turn possession
of bytes or a claimed digest into semantic acceptance.

## Felt journey

A caller inserts canonical bytes for one accepted 0019 artifact and receives a
`stored` receipt. Repeating the exact bytes returns `artifact-hit`. Inserting a
second artifact whose source correspondence differs but whose checked program
does not returns `semantic-hit`: the semantic identity is unchanged and the
artifact identity differs.

The caller binds the authored name `main` to that accepted semantic identity.
The binding is a separate projection and does not change the stored semantic
value. A deterministic snapshot is replayed into a fresh store only after every
artifact identity, semantic identity, and name target is revalidated. Forged or
malformed input is rejected without changing the prior state.

## Open semantic system design lens

### Boundary and warranted state

Feature 0027 owns one in-memory `SemanticStore` service. Its warranted state is:

```text
semantic identity -> one or more accepted 0019 artifact variants
authored name     -> one present semantic identity
```

The service preserves these invariants:

- every artifact was accepted by `validateNormalizedCoreBytes`;
- every stored identity equals the identity recomputed by 0019;
- every semantic value has at least one accepted artifact;
- artifact identities are unique within a semantic value;
- every authored name targets a present semantic value; and
- authored names never participate in semantic identity.

The 0019 validator remains the sole authority for normalized-core acceptance
and identity derivation. A cache lookup is only an observation about previously
accepted state. It is not a proof, checker judgment, or new semantic authority.

### Semantic inputs

- `insert(unknown)` is a command carrying candidate normalized-core bytes. The
  caller's bytes and embedded identities are assertions until 0019 accepts
  them.
- `bindName(unknown)` is a command to project one exact authored name onto one
  present semantic identity. It grants no semantic meaning to the name.
- `resolveName(unknown)` is a query over the name projection.
- `snapshot` is a query over current warranted state.
- `replay(unknown)` is a replacement command carrying an untrusted snapshot.
  It establishes no state until its closed schema, identities, artifacts, and
  name targets all validate.

Closed command and snapshot records reject excess properties. Names are exact,
nonempty strings; version 1 performs no Unicode or language-specific name
normalization.

### Semantic outputs

An accepted insert returns one immutable receipt:

```text
Stored       (semantic identity, artifact identity, artifact count)
ArtifactHit  (semantic identity, artifact identity, artifact count)
SemanticHit  (semantic identity, artifact identity, artifact count)
```

Name binding distinguishes `bound`, `binding-hit`, and `rebound`. Name
resolution returns `resolved`. Replay returns counts only after the complete
replacement is accepted.

The versioned `semantic.language-build-store` snapshot is a deterministic
materialized view ordered by identity and authored name. It contains the exact
canonical bytes needed to revalidate each artifact. It is not itself a new
semantic identity, a build receipt, or a publication claim.

Expected rejections remain typed: artifact rejection, digest-service failure,
closed-input rejection, absent semantic target, absent authored name, or
snapshot rejection. A rejection produces no success receipt.

### Effect protocols and uncertainty

`insert` validates before one atomic state transition. Repeated exact and
semantic inserts are idempotent observations over current state. `bindName`
validates its closed input and changes the projection atomically. `replay`
validates a complete candidate state before one atomic replacement; partial
replay is forbidden.

The service requests only the existing Effect `Crypto` capability through the
0019 validator. It requests no filesystem, network, clock, random, process, or
console effect. The live in-memory `Layer` selects `Ref` as its state owner.

Concurrent calls are linearized at their `Ref` transition. A replay can replace
an insert that linearizes before it, or an insert can extend a replay that
linearizes before it. Version 1 offers no compare-and-swap generation, merge,
subscription, retry, remote reconciliation, or durable commit protocol.

### Components and orthogonal structures

```text
candidate bytes
  -> 0019 validation and identity recomputation
  -> accepted semantic/artifact pair
  -> atomic in-memory index transition
  -> immutable receipt

candidate snapshot
  -> closed snapshot decode
  -> every artifact through 0019 validation
  -> semantic/artifact cross-check
  -> name-target cross-check
  -> one atomic state replacement
  -> deterministic snapshot projection
```

The state-ownership graph, semantic-dependency graph, authored-name projection,
and artifact-derivation relation stay distinct. This tracer stores the accepted
0019 relation; it does not infer compiler dependencies or derivations.

Object-to-snapshot projection stays within the store layer. Artifact validation
crosses from untrusted representation to an accepted 0019 semantic value.
Binding a name creates a projection edge, not a semantic dependency edge.

### Bounded autonomy and resources

Every artifact inherits the 0019 byte, depth, node, string, and collection
bounds. Version 1 additionally limits a replay snapshot to 1,024 semantic
values, 4,096 total artifact variants, and 4,096 authored-name bindings. A
snapshot that exceeds a limit is rejected before it replaces state.

The service has no background fiber, queue, retry, timer, eviction, or
automatic growth policy. Inserted state remains until its Layer is released or
a validated replay replaces it. In-memory growth through individual inserts is
caller-controlled; production persistence and quota policy are explicitly
deferred.

### Evidence, assumptions, and unsupported claims

Focused runtime tests observe invalid and forged artifact rejection, exact and
semantic hits, separate name binding, deterministic ordering, fully validated
replay, bounded replay rejection, and state preservation after every rejected
command. TypeScript 7 with Effect diagnostics checks service requirements and
error channels. Effect Schema checks closed external records. Oxfmt, Oxlint,
the Effect lint plugin, 0019 acceptance, project-model validation, and the full
repository gate cover their declared static and regression scopes.

These observations do not prove SHA-256 collision resistance, semantic
equivalence beyond the accepted 0019 identity rule, crash durability,
distributed consistency, cache profitability, or compiler correctness. The
tracer assumes the accepted 0019 contract and the supplied `Crypto` service.

## Deep-module contract

`SemanticStore` exposes exactly five operations: `insert`, `bindName`,
`resolveName`, `snapshot`, and `replay`. Callers supply unknown values at every
external command boundary and receive typed Effect failures. The implementation
may replace `Ref` and immutable maps later, but it must preserve the receipts,
snapshot version, validation authority, name separation, atomic transition
semantics, and deterministic ordering frozen here.

Version 1 accepts only `semantic.normalized-core` version 1 artifacts. The
generic service name describes its role in the language build architecture; it
does not imply that arbitrary byte formats or caller-selected hash domains are
accepted.

## Oracle-first counterexamples

- malformed bytes and a forged embedded identity do not mutate prior state;
- the same semantic value with different source correspondence is a semantic
  hit, not an exact artifact hit or new semantic value;
- a changed checked integer creates a new semantic value;
- a name cannot target an absent semantic identity;
- excess fields on a command are rejected;
- replay rejects duplicate identities, empty semantic entries, absent name
  targets, forged canonical bytes, and over-limit collections;
- any replay rejection preserves the complete prior snapshot; and
- insertion order does not change snapshot ordering or replayed output.

## Acceptance

Run:

```bash
bun scripts/accept/0027-semantic-artifact-store.ts
```

The acceptance script requires the frozen contract, active plan, model item,
service, focused tests, accepted 0019 dependency, TypeScript 7 checks, lint,
formatting, deterministic project projections, and the full repository gate.

## Kill or redesign criteria

Redesign before integration if the store trusts claimed identities, lets a
rejected command mutate state, folds authored names into semantic identity,
uses one digest for distinct equivalence relations, exposes mutable state, or
cannot state a finite replay bound. Recut the snapshot version if durable byte
encoding, multiple artifact kinds, eviction, persistence, or cross-process
coordination changes its meaning.

## Non-goals

This feature does not implement source hashing, parsing, recursive-component
canonicalization, reachability, dead-code analysis, rewrites, optimization,
module interfaces, build recipes, eviction, filesystem persistence, remote
transfer, publication, garbage collection, or a general Merkle database.

## Semantic diff

Before 0027, semantic and artifact identities exist only on individual 0019
artifacts. After 0027, one executable service can reuse accepted identities,
retain multiple artifact variants per semantic value, bind names separately,
and reproduce its validated state deterministically. The meaning and authority
of the 0018 kernel, 0019 normalized core, 0020 kernel JSON, 0022 interpreter,
and 0026 surface language remain unchanged.
