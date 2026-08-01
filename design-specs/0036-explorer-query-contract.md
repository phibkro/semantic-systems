# Design spec 0036: storage-independent explorer query contract

Status: frozen for one bounded recursive navigation journey

Date: 2026-08-01

Design-Lens-Version: open-semantic-system-v1

## Problem

The project model and future relational-fact export can describe canonical
entities and typed relations, but an explorer cannot safely bind itself to a
Git folder, database, or one exporter. It needs one read-only query boundary
that preserves relation meaning and source provenance while producing stable
navigation projections.

## Felt journey

A caller supplies entity and relation facts for a project, chooses one root,
filters to dependency and evidence relations, and asks for a tree projection.
The result expands permitted nodes recursively, reports collapsed and
depth-limited frontiers, and links every row and edge to its canonical identity
and source-document provenance. Reordering the admitted facts does not change
the result. Expanding one previously collapsed identity reveals its descendants
without changing any canonical identity.

## Open semantic system design lens

### Boundary and warranted state

Feature 0036 owns strict admission of an immutable fact source and query,
relation-family filtering, bounded graph traversal, expansion interpretation,
and deterministic list, tree, and mosaic projections. It owns no persistent
state and cannot mutate its source.

The result warrants only that it is the deterministic projection of the exact
admitted facts and query. A fact's provenance is copied from the caller; 0036
does not prove that source file exists or that the stated relation is true.

### Semantic inputs

`queryExplorer(source, query)` runtime-decodes two unknown values.

The source is `semantic.explorer-fact-source` version 1 with a bounded `facts`
array. Entity facts contain a stable `fact_key`, canonical `subject_id`, kind,
status, name, and provenance. Relation facts contain a stable `fact_key`, exact
`subject_id` and `object_id`, relation kind, one explicit family, and
provenance. Families are `dependency`, `effect`, `ownership`, `derivation`,
`causality`, `observation`, `evidence`, and `other`.

Provenance is the exact tuple `source_schema`, `source_document`,
`source_record_kind`, and `source_record_key`. The record key cannot be erased:
one source document can contain several canonical records.

The query contains roots, direction, selected relation families, optional
relation kinds, expansion defaults plus expanded/collapsed overrides,
`max_depth`, `max_nodes`, and one view kind. Inputs are queries, not commands;
they grant no write authority.

### Semantic outputs

A successful result contains:

- selected canonical nodes and relations in canonical order;
- available family and relation-kind introspection;
- collapsed or depth-limited frontier observations with hidden edge counts;
- one deterministic `list`, `tree`, or `mosaic` projection; and
- exact fact keys, canonical subject/object identities, and copied provenance.

Each view is a replaceable projection of the same selected identity set. The
flat tree records one deterministic first-discovery parent; all selected graph
relations remain separately available and are not reclassified as tree edges.

### Effect protocols and uncertainty

Schema decoding and semantic rejection use one typed error channel. The engine
requests no file, network, clock, randomness, persistence, or mutation effect.
It has no retry, queue, subscription, or background lifetime.

### Components and orthogonal structures

```text
unknown fact source -> strict Schema -> immutable canonical nodes/relations
unknown query       -> strict Schema -> normalized traversal policy
nodes + relations + policy           -> bounded selected graph
selected graph                       -> list | tree | mosaic projection
```

Source custody, relation family, traversal direction, first-discovery tree
parentage, and presentation layout remain distinct. A storage adapter crosses
from its own representation into the explorer fact vocabulary; the explorer
does not inspect storage internals.

### Bounded autonomy and resources

- at most 16,384 entity facts and 65,536 relation facts;
- at most 128 roots;
- `max_depth` from 0 through 64;
- `max_nodes` from 1 through 4,096;
- iterative traversal with a persistent visited set;
- every admitted relation is indexed at most once per query; and
- a traversal that needs more than `max_nodes` rejects instead of returning an
  unlabeled partial result.

### Evidence, assumptions, and unsupported claims

Example and property tests observe permutation invariance, recursive
expand/collapse behavior, direction and family filtering, cycle termination,
cross-view identity equality, exact provenance, immutability, and bounded typed
rejections. These observations do not prove source authenticity, relational
truth, rendering usability, database performance, or UI accessibility.

The contract assumes fact keys and provenance are supplied by a canonical
source or adapter. Feature 0034 informed the minimal fact vocabulary but is not
a runtime or source dependency.

## Deep-module contract

```text
queryExplorer(source: unknown, query: unknown)
  -> Effect<ExplorerQueryResult, ExplorerQueryRejected>
```

All exported schemas and types describe this one boundary. No storage service,
global registry, or live implementation is selected by the module.

## Oracle-first counterexamples

1. A collapsed node cannot reveal descendants through another presentation.
2. A dependency-only query cannot include an evidence edge.
3. Incoming traversal cannot silently use outgoing direction.
4. A cycle cannot recurse forever or duplicate one canonical node.
5. Unknown roots, expansion overrides, endpoints, or duplicate identities reject.
6. Conflicting expanded and collapsed overrides reject.
7. Exceeding `max_nodes` cannot return an apparently complete view.
8. Reordering facts cannot change selection, parentage, or projection order.
9. A view record without canonical identity and provenance is invalid.
10. A copied provenance statement is not source verification.

## Acceptance

Feature 0036 is accepted when one clean head passes its exact acceptance script,
focused examples and generated properties, TypeScript 7, Effect diagnostics,
Oxlint, Oxfmt, project-model validation, generated-view equality, and the full
repository gate.

## Kill or redesign criteria

Recut before integration if traversal requires ambient storage reads, if a view
needs a second canonical data model, if relation families collapse distinct
meanings, or if cycle safety depends on recursive host stack depth.

## Non-goals

No browser UI, persistence engine, relational-fact exporter, live source
verification, mutation API, subscriptions, ranking, search language, graph
layout, or public deployment is included.

## Semantic diff

The repository gains a stable, storage-independent read-only explorer query
and projection boundary. Existing project facts, Control Room views, and
Feature 0034 remain unchanged and authoritative in their own layers.
