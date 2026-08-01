# Design spec 0049: Effect Schema public snapshot boundary

Status: frozen for one representation-preserving migration

Date: 2026-08-01

Depends-On-Feature-IDs: 0017-control-room-reconstruction

Design-Lens-Version: open-semantic-system-v1

## Problem

The Control Room public snapshot consumer maintains a second handwritten
decoder beside its TypeScript interfaces and the public exporter. Exact key
lists, primitive guards, enum membership, safe-integer checks, timestamp
validation, cached-pair decoding, identity uniqueness, and relation endpoint
checks are manually composed in `apps/control-room/src/snapshot.ts`. This is a
large representation boundary whose runtime and static descriptions can drift.

The repository already pins `effect@4.0.0-beta.102`, whose Schema module is the
preferred external-data boundary and is already used by the adjacent portfolio
snapshot path. The migration must delete bespoke decoding machinery without
changing any accepted public bytes, browser state, error classification, or
content-custody behavior.

## Felt journey

The Control Room reads the same version JSON and snapshot JSON from the network
or browser cache. A valid content-addressed pair produces the identical visible
state and cache bytes as before. An excess nested field, impossible date,
unknown kind, unsafe count, duplicate identity, broken relation endpoint, or
forged digest is rejected at the same boundary and cannot replace the
last-known-valid snapshot.

## Open semantic system design lens

### Boundary and warranted state

0049 owns the public snapshot and version Schema values, the browser's strict
decoding adapter, the cached-pair JSON codec, and focused regression evidence.
The frozen 0017 public representation, public exporter, content-addressed
identity, snapshot-state machine, network protocol, and deployment boundary
remain authoritative.

The public Schema is an executable representation contract. It does not become
canonical project state, deployment evidence, or an acceptance authority.

### Semantic inputs

Inputs are untrusted version values, snapshot values, and cached JSON strings;
the accepted public entity and relation kind sets; and the pinned Effect v4
Schema implementation. Network responses and browser storage are observations,
not proof of publisher identity or deployment success.

The exact accepted timestamp language remains `YYYY-MM-DDTHH:mm:ssZ` with a
positive year and a valid Gregorian calendar date. Generic ISO parsing or
normalization is not an input to this contract.

### Semantic outputs

Strict decoding returns the existing `PublicVersion` and `PublicSnapshot`
values or the existing boolean/type-guard and candidate-error observations.
The cached codec returns the same JSON object shape and member ordering for
valid values. No new field, normalization, default, coercion, or public byte is
introduced.

### Effect protocols and uncertainty

Schema owns structural decoding, exact-property rejection, literals, patterns,
safe integers, enums, and named whole-value checks. PBK owns the predicates for
calendar validity, version filename binding, unique public identities, and
relation endpoint membership; Schema composes those predicates into one
inspectable boundary.

PBK continues to own canonical code-unit key ordering, the final line feed,
SHA-256, cross-document commit/digest/time binding, cache digest revalidation,
freshness, rollback, fetch sequencing, abort, and XState adoption. Schema
success alone never authorizes cached or fetched content for display.

Malformed cache JSON still resolves to no cached snapshot. Invalid fetched
values still classify as `invalid`; transport and non-OK responses remain
`unavailable`. The migration adds no retry, polling, write, provider, or clock
authority.

### Components and orthogonal structures

```text
public exporter value
        |
        v
authoritative public Schema
        |
   +----+-------------------+
   |                        |
   v                        v
network unknown       cached JSON string
   |                        |
   +---- strict decode -----+
               |
               v
      structurally warranted pair
               |
               v
 commit/digest/time binding + SHA-256 verification
               |
               v
       XState adoption observation
```

Representation validation, content identity, cache custody, UI state, and
deployment observation remain separate. The producer and consumer share the
same Schema instead of maintaining two runtime descriptions.

### Bounded autonomy and resources

The existing finite public snapshot is traversed once by Schema and once by
the retained uniqueness/endpoint predicates. Cache decoding handles one stored
string. No recursive external fetch, concurrency, timer, queue, retry, or
additional retained state is added.

### Evidence, assumptions, and unsupported claims

Focused tests observe exact valid-pair acceptance, strict nested rejection,
calendar validity, safe integers, identity and endpoint laws, unchanged cache
bytes, and forged-cache refusal. Exporter tests observe that producer values
satisfy the shared Schema. TypeScript, Effect diagnostics, lint, format,
project-model validation, deterministic generated views, inherited 0017
acceptance, and the repository gate provide bounded evidence only.

This feature does not prove Effect Schema correct, generate a public standard,
authenticate a publisher, establish deployment, or prove universal privacy.
`effect@4.0.0-beta.102` remains a pinned beta assumption.

## Deep-module contract

The authoritative module exports `PublicEntitySchema`,
`PublicRelationSchema`, `PublicSnapshotSchema`, and `PublicVersionSchema` plus
their derived TypeScript types. Strict `Schema.decodeUnknownExit` adapters
preserve the existing exported boolean guards. `Schema.fromJsonString` owns
cache JSON syntax and shape.

Every closed decode uses `onExcessProperty: "error"`. The snapshot and version
schemas are identity codecs: they do not transform, normalize, default, strip,
or reorder accepted values.

## Oracle-first counterexamples

1. Producer snapshot and version values decode under the shared Schema without
   changing their canonical bytes or digest.
2. Excess properties reject at the version, snapshot, metadata, entity,
   relation, and cached-pair levels rather than being stripped.
3. Abbreviated commits, malformed digests, unknown enums and kinds, non-string
   lists, negative/unsafe counts, and nonpositive freshness reject.
4. Impossible dates, year zero, fractional seconds, offsets, and non-UTC forms
   reject; a valid leap day accepts.
5. A version filename whose digest differs from its digest field rejects.
6. Duplicate public entity identities and relations with missing endpoints
   reject as part of snapshot decoding.
7. Malformed cache JSON and schema-invalid cache pairs resolve to `null`.
8. A schema-valid forged cached snapshot still resolves to `null` after the
   retained binding and digest checks.
9. Valid cache storage parses to the exact prior `{ snapshot, version }` value.
10. Freshness, rollback, fetch ordering, candidate errors, and XState
    transitions remain unchanged.

## Acceptance

`bun scripts/accept/0049-effect-schema-public-snapshot-boundary.ts` runs the
focused producer and consumer tests, TypeScript 7 Effect diagnostics, Oxlint,
Oxfmt, strict project-model validation, generated-view drift checks, and the
inherited 0017 acceptance exactly once. It performs no provider operation.

## Kill or redesign criteria

Stop if Schema requires widening the timestamp language, stripping excess
properties, changing cache or canonical public bytes, normalizing strings or
numbers, changing guard signatures or candidate classifications, weakening
digest revalidation, or importing browser/XState authority into the exporter.

## Non-goals

No public field change, schema-version bump, canonical JSON rewrite, hash
change, fetch client migration, state-machine rewrite, storage-key change,
portfolio snapshot migration, deployment change, provider observation, generic
codec framework, or Effect version update.

## Semantic diff

Public snapshot meaning, bytes, identity, rejection policy, cache custody, and
visible state remain unchanged. The hidden validation implementation changes
from parallel handwritten guards to one authoritative Effect Schema boundary
with PBK-owned named semantic checks.
