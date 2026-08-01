# Design spec 0034: relational fact export

Status: frozen for one bounded project-model analysis journey

Date: 2026-08-01

Depends-On-Feature-IDs: 0010-typescript-effect-v4-runtime

Design-Lens-Version: open-semantic-system-v1

## Problem

The project model is canonical Git-tracked state, but every recursive consumer
currently has to interpret its in-memory entities and relations directly. That
couples analysis to one loader representation and makes it easy for a cache,
database, or explorer to become an accidental second authority. The roadmap
requires a stable fact export with source correspondence, explicit evolution,
and executable impact and evidence queries.

Feature 0034 establishes only the first storage-independent projection. It does
not choose Datalog, SQL, SQLite, or a hosted graph service.

## Felt journey

The accepted project model is loaded and validated. Export emits canonical
UTF-8 JSON containing one entity fact per canonical entity and one relation
fact per canonical relation. Every fact has a stable ordering key and a
relative source-document reference. The export has an exact content identity.

Given the exported bytes and a changed dependency, the impact query returns a
deterministic shortest dependency path to each affected subject. Given a claim,
the evidence query follows support, discharge, coverage, and assumption links
and returns exact paths to evidence, obligations, assumptions, and human review
records. Cycles terminate. An unknown root, malformed export, duplicate fact,
non-canonical bytes, invalid model, or exceeded bound returns a typed failure.
No query can mutate the canonical graph or the exported snapshot.

## Open semantic system design lens

### Boundary and warranted state

Canonical state remains the validated `model/**/*.json` project model. The
relational export is a deeply immutable, rebuildable projection. It owns no
mutable state and grants no write capability.

The export warrants only that:

- every entity and relation fact was projected from one structurally valid
  `ProjectGraph` observation;
- every provenance path identifies the exact model document observed by the
  loader;
- fact order, keys, bytes, and export identity follow this frozen procedure;
- relation direction is the canonical authored direction; and
- relation families are the version-1 classification below.

It does not warrant that authored relations are complete or semantically true.

### Semantic inputs

`buildRelationalFactExport(project)` accepts one already loaded `ProjectGraph`
value. It re-runs project-model validation and rejects any error before
projection. Warnings remain warnings and do not acquire stronger evidential
force.

`validateRelationalFactExportBytes(unknown)` accepts only a genuine bounded
`Uint8Array` containing the exact canonical export.

`queryImpact(exportBytes, unknown)` and `queryEvidence(exportBytes, unknown)`
accept the same validated export bytes plus strict Effect Schema request values:

```text
{
  format: "semantic.impact-query" | "semantic.evidence-query",
  version: 1,
  subject_ids: [CanonicalIdentity...],
  max_depth: Integer,
  max_nodes: Integer
}
```

The request is a query, not a command. It establishes no fact.

### Semantic outputs

The export is exactly:

```text
{
  format: "semantic.project-relational-facts",
  version: 1,
  schema_identity: "semantic.project-model/relational-facts/v1",
  procedure_identity: "semantic.project-model/relational-fact-export/0034/v1",
  authority: "derived-non-authoritative",
  facts: [EntityFact | RelationFact...],
  entity_count: Integer,
  relation_count: Integer,
  fact_count: Integer,
  export_identity: "sha256:..."
}
```

An entity fact contains `fact_key`, `subject_id`, `entity_kind`, `name`,
`status`, and provenance. A relation fact contains `fact_key`, one explicit
`family`, canonical `subject_id`, canonical `object_id`, the exact
`relation_kind`, and provenance. Provenance is:

```text
{
  source_schema: "semantic.project-model/document/v1",
  source_document: "model/<relative path>.json",
  source_record_kind: "entity" | "relation",
  source_record_key: <stable canonical tuple string>
}
```

Version-1 relation families are disjoint projections of exact relation kinds:

- dependency: `blocks`, `requires`;
- effect: `handles`;
- ownership: `accountable_for`, `assigned_to`;
- derivation: `derives`;
- causality: `changes`, `invalidates`;
- observation: `publishes`, `reads`, `writes`;
- evidence: `assumes`, `covers`, `discharges`, `reviewed_by`, `supports`,
  `validates`; and
- other: every accepted relation kind not listed above.

Containment remains `other`; it is not ownership. Communication remains
`other`; it is not causality. Effect, obligation, evidence, claim, assumption,
and human subjects remain explicit through entity kinds even when they have no
relation fact in the corresponding family.

Impact results return changed subjects separately and affected subjects with
minimum depth and one deterministic shortest `fact_key` path. For `requires`,
the canonical target impacts the canonical source. For `blocks`, the canonical
source impacts the canonical target. `max_depth` can intentionally return an
incomplete bounded observation and therefore exposes `depth_limited: true`.
Exceeding `max_nodes` rejects instead of silently dropping facts.

Evidence results return each reachable evidence, obligation, assumption, or
human subject with its entity kind, minimum depth, and one deterministic exact
fact path. `supports`, `discharges`, and `covers` are followed from canonical
target to source. `assumes` and `reviewed_by` are followed from canonical
source to target. Other relation kinds do not silently become evidence edges.

### Effect protocols and uncertainty

`Crypto.Crypto` owns SHA-256 observations. Digest failure remains typed. Pure
bounded projection and traversal use no ambient filesystem, database, clock,
randomness, network, or runtime execution. `Path.Path` owns conversion from
loader paths to portable repository-relative provenance during export.

All failures occur before returning an artifact or query result. No retry,
queue, subscription, or compensating action exists because this slice requests
no external mutation.

### Components and orthogonal structures

```text
validated ProjectGraph -> bounded projection -> typed relational facts
typed facts + Crypto   -> canonical bytes + export identity
export bytes           -> strict decode + identity/canonical validation
validated facts        -> bounded query -> explanation paths
```

Canonical state ownership, derived representation, query traversal, storage,
and rendering remain separate. A later Datalog or SQL adapter may ingest the
same bytes but cannot strengthen their authority.

### Bounded autonomy and resources

- maximum entities: 16,384;
- maximum canonical relations: 65,536;
- maximum facts: 81,920;
- maximum export: 16,777,216 UTF-8 bytes;
- maximum decoded JSON depth: 64;
- maximum decoded JSON values: 524,288;
- maximum query roots: 128;
- maximum query depth: 64; and
- maximum query nodes: 4,096.

Projection visits each admitted entity and relation a bounded number of times.
Each query uses iterative breadth-first traversal and visits each admitted
subject and relevant fact at most once per adjacency expansion. Crypto and host
Schema decoding are observed effects, not termination proofs.

### Evidence, assumptions, and unsupported claims

Example tests establish the exact artifact and both tracer journeys. Property
tests exercise permutation invariance, cycle termination, shortest-path depth,
and input/export non-mutation over generated bounded graphs. Rejection tests
cover malformed, duplicate, non-canonical, unknown, over-limit, and digest
failure paths. Bun and genuine Node runs establish host parity for one fixture.

These observations are tests and runtime validation, not proof of completeness,
semantic truth, or asymptotic performance. The implementation assumes the
loader's source paths identify the checked project root. A missing authored
relation is unknown, not false.

## Deep-module contract

```text
buildRelationalFactExport(ProjectGraph)
  -> Effect<RelationalFactArtifact, RelationalFactExportFailure,
            Path.Path | Crypto.Crypto>

validateRelationalFactExportBytes(unknown)
  -> Effect<RelationalFactExport, RelationalFactExportFailure, Crypto.Crypto>

queryImpact(unknown, unknown)
  -> Effect<ImpactQueryResult, RelationalFactFailure, Crypto.Crypto>

queryEvidence(unknown, unknown)
  -> Effect<EvidenceQueryResult, RelationalFactFailure, Crypto.Crypto>
```

Public schemas, bounds, procedure identity, and relation-family mapping are
exported. Internal maps, traversal indexes, and future storage adapters remain
replaceable.

## Oracle-first counterexamples

1. A generated fact or recursive query is not canonical project state.
2. `contains` cannot silently become ownership.
3. `sends` cannot silently become causality.
4. Missing evidence cannot be reported as disproved evidence.
5. A duplicate canonical relation cannot receive ambiguous provenance.
6. A cycle cannot make either query recurse without a visited bound.
7. A depth-limited result cannot claim complete closure.
8. A forged identity or non-canonical byte representation cannot validate.
9. Fact or source order cannot change export identity.
10. A query cannot alias or mutate graph, fact, or result storage.

## Acceptance

Feature 0034 is accepted when one clean head:

1. freezes and exports the exact versioned schemas and family mapping above;
2. derives deeply immutable canonical facts with exact source correspondence;
3. rejects invalid models, duplicate facts, foreign paths, and resource excess;
4. emits deterministic canonical bytes and a recomputed SHA-256 identity;
5. validates bytes independently before either public query;
6. demonstrates a cyclic, shortest-path impact query with explicit direction;
7. demonstrates a transitive claim-to-obligation-to-evidence query;
8. exposes unknown, depth-limited, and node-limit outcomes honestly;
9. passes example/property tests and Bun/Node parity; and
10. passes TypeScript 7 Effect diagnostics, Oxlint, Oxfmt, project-model
    validation/generated-view checks, and the complete repository gate.

The exact local command is:

```bash
bun scripts/accept/0034-relational-fact-export.ts
```

## Kill or redesign criteria

Recut before implementation if accepted project relations cannot be assigned a
single family without inventing semantics, if exact provenance requires
authoritative state not present in `ProjectGraph`, or if a query needs negative
closed-world reasoning. The version-1 slice may conservatively classify an
unlisted relation as `other`; it may not guess.

## Non-goals

- Choosing or deploying Datalog, Souffle, SQL, SQLite, or graph storage.
- Mutating model documents, databases, caches, work status, or evidence.
- Importing normalized-core program facts in version 1.
- Claiming the authored graph is complete.
- Negative queries such as “uncovered obligation” without a closed evidence
  snapshot contract.
- Incremental invalidation, subscriptions, web rendering, LSP, or deployment.

## Semantic diff

The project-model layer gains a content-addressed, storage-independent read
projection and two bounded recursive queries. Canonical authorship and semantic
authority remain unchanged. Later analysis engines can consume the projection
without owning project truth or silently redefining relation meaning.
