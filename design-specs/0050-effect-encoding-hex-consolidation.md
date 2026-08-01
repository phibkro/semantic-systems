# Design spec 0050: Effect Encoding hexadecimal consolidation

Status: frozen for one representation-preserving reuse migration

Date: 2026-08-01

Depends-On-Feature-IDs: 0010-typescript-effect-v4-runtime

Design-Lens-Version: open-semantic-system-v1

## Problem

Twelve production modules independently encode bytes as lowercase hexadecimal
with hand-written loops or `Array.from` transformations. These copies sit on
identity-bearing paths for normalized core, compiler/build receipts, public
project projections, reference custody, tracer documents, and bytecode
differential observations. Repeating a standard encoding algorithm adds drift
surface without expressing project semantics.

The repository already pins `effect@4.0.0-beta.102`. Its maintained
`Encoding.encodeHex` function owns exactly this pure representation conversion
and documents lowercase output. The migration must delete the duplicate
mechanics without changing one digest input, public identity, error, or byte.

## Felt journey

The same accepted normalized program, build receipt, project snapshot,
reference catalog, tracer document, or differential observation produces the
same lowercase hexadecimal identity before and after the migration. Empty and
arbitrary bytes retain the exact legacy spelling while all domain-specific hash
failure paths remain typed and unchanged.

## Open semantic system design lens

### Boundary and warranted state

0050 owns only the final pure conversion from already-observed digest or
canonical bytes to lowercase hexadecimal text in the twelve named modules. The
existing canonical encoders, domain separators, hash algorithms, digest-length
checks, schemas, public formats, and error channels remain authoritative.

Effect Encoding is implementation machinery, not a new identity authority.
The semantic identity is still warranted by each owning domain's preimage and
hash contract.

### Semantic inputs

Inputs are finite `Uint8Array` observations already produced by canonical
encoding or the injected Effect Crypto service. The conversion receives no
filesystem, network, clock, randomness, configuration, or deployment input.

### Semantic outputs

The sole output is primitive text with exactly two lowercase hexadecimal digits
per byte, no prefix or separator, and the empty string for empty input. Existing
domain code may retain its `sha256:` prefix outside the conversion.

### Effect protocols and uncertainty

`Encoding.encodeHex` is total for `Uint8Array`; no new failure channel is
introduced. Crypto and canonicalization failures remain mapped by the existing
domain boundary before hexadecimal conversion. The pinned Effect beta is an
explicit dependency assumption.

### Components and orthogonal structures

```text
domain value -> canonical/domain-separated bytes -> typed SHA-256 observation
                                                        |
                                                        v
                                             Encoding.encodeHex
                                                        |
                                                        v
                                      unchanged domain identity text
```

Canonicalization, hashing, digest validation, hexadecimal representation, and
public identity ownership stay distinct. The migration directly uses the
maintained pure function; an additional PBK adapter would only rename it and is
therefore excluded.

### Bounded autonomy and resources

Encoding traverses one finite byte array once and allocates one output string of
twice its length. Existing schema and digest bounds remain unchanged. There are
no fibers, queues, timers, retries, effects, retained state, or provider calls.

### Evidence, assumptions, and unsupported claims

An independent legacy oracle exhausts all 256 one-byte values and fixed empty
and multi-byte vectors. Existing domain tests re-observe accepted golden
identities and typed digest failures. TypeScript 7 Effect diagnostics, Oxlint,
Oxfmt, strict model validation, deterministic generated views, and focused Bun
and Node tests provide bounded evidence over their checked scope.

This feature does not prove Effect Encoding correct, alter SHA-256, standardize
canonical JSON, benchmark performance, or authorize any public identity.

## Deep-module contract

The twelve production modules use pinned `Encoding.encodeHex` directly across
thirteen invocations; the bytecode comparator encodes both compared sides.
For every input byte array `b`, output length is `2 * b.byteLength`; characters
are only `[0-9a-f]`; byte order is preserved; there is no prefix; and empty
input returns `""`. Domain prefixes and typed failures remain outside this
pure conversion.

## Oracle-first counterexamples

1. Every one-byte value from `0x00` through `0xff` matches an independent
   nibble-table legacy oracle.
2. Empty bytes encode to the empty string.
3. Leading zeroes, boundary nibbles, and a mixed multi-byte vector retain two
   lowercase digits per byte in input order.
4. Accepted normalized-core and tracer identities remain exact.
5. Reachability, runtime-closure, reproducible-action, relational-fact, and
   public-export identities remain exact and deterministic.
6. Catalog and Git/working-tree SHA-256 observations retain their accepted
   lowercase spelling.
7. Invalid digest observations still fail through their existing typed domain
   errors rather than through hexadecimal conversion.
8. No Control Room file changes; 0049 retains that boundary.

## Acceptance

`bun scripts/accept/0050-effect-encoding-hex-consolidation.ts` checks the exact
owned source inventory, the independent exhaustive oracle, focused identity
and failure tests, TypeScript 7 Effect diagnostics, Oxlint, Oxfmt, strict
project-model validation, and generated-view drift. It performs no provider
operation.

## Kill or redesign criteria

Stop if the maintained API changes case, width, byte order, empty-input
behavior, throws for a `Uint8Array`, requires changing a digest preimage or
prefix, widens a typed error, or requires touching Control Room.

## Non-goals

No hash algorithm or preimage change, identity-version bump, canonical JSON
change, digest codec abstraction, hexadecimal decoding, Control Room migration,
Effect version update, new dependency, performance claim, provider operation,
or unrelated encoding cleanup.

## Semantic diff

No domain or representation meaning changes. Only the hidden byte-to-hex
implementation changes from twelve PBK-maintained copies to the pinned Effect
Encoding function.
