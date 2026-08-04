---
format: semantic.feature-artifact/v1
feature_id: 0046-effect-graph-execution-index
kind: specification
legacy_entity_id: work.effect-graph-execution-index
---
# Design spec 0046: Effect Graph execution index

Status: frozen for one bounded portfolio-model pilot

Date: 2026-08-01

Depends-On-Feature-IDs: 0021-pbk-portfolio-control-room

Design-Lens-Version: open-semantic-system-v1

## Problem

The portfolio projection currently computes dependency depth and cycle presence
with recursive, hand-written graph walks. Those walks duplicate machinery now
available in the pinned `effect@4.0.0-beta.102` Graph module and make depth
evaluation depend on the host call stack. Replacing the canonical portfolio
document with Effect Graph would be incorrect, however: Graph allocates local
numeric indices, its iteration order follows construction order, and it has no
canonical structural codec.

The bounded capability is therefore a deterministic, disposable execution
index. It must remove recursive cycle/depth mechanics without changing stable
semantic identities, relation direction, public projections, or durable bytes.

## Felt journey

A caller projects the same DAG from two permutations of its selected work and
relations. Both calls return byte-equal public projections with the same stable
work and relation IDs. A 2,048-node prerequisite chain receives depths 0 through
2,047 without recursive evaluation. Parallel authored relations remain distinct,
while a selected cycle still returns the existing typed portfolio failure.

## Open semantic system design lens

### Boundary and warranted state

0046 owns one internal adapter from validated stable-ID nodes and edges to an
immutable directed Effect Graph, plus the portfolio projection's boolean
acyclicity and iterative dependency-depth use of that adapter. The canonical
portfolio document remains warranted state; the index is reconstructed derived
state and is never persisted.

### Semantic inputs

The adapter receives already decoded work identities and selected relations.
Work and relation IDs are semantic identities. Relation `source_id` and
`target_id` retain their authored direction, including `source requires target`.
Input ordering establishes no meaning.

### Semantic outputs

The adapter returns only an in-process index to portfolio-model code. Public
outputs remain `WorkProjection` values containing stable string identities,
original work values, original relation values, and derived numeric depths.
Adapter invariant failures are translated into `PortfolioProjectionFailure`.

### Effect protocols and uncertainty

Construction rejects duplicate node IDs, duplicate relation IDs, and missing
endpoints as typed internal failures. Any exception from the beta Graph API is
captured at the adapter boundary. Topological iteration is requested only after
acyclicity is observed and is also exception-mapped. There is no retry, I/O,
background work, or external effect.

### Components and orthogonal structures

```text
canonical portfolio + saved-view query
                 |
                 v
      selected stable-ID relations
                 |
                 v
 deterministic Effect Graph index -- local numeric indices
                 |
          +------+------+
          |             |
          v             v
   acyclicity       topo order
                          |
                          v
             authored-direction depth fold
                          |
                          v
             stable-ID public projection
```

Canonical custody, query selection, dependency meaning, graph execution, and
presentation remain separate. Numeric Graph indices may not cross into schema,
URL, digest, persistence, generated model, or public projection boundaries.
Weighted critical paths, exact cycle witnesses, relational-fact paths, custom
Mermaid, query algebra, and Control Room rendering remain owned by their current
components.

### Bounded autonomy and resources

Portfolio schemas already bound work to 2,048 and relations to 8,192. Index
construction and the depth fold are finite and iterative. There are no fibers,
queues, timers, network requests, filesystem effects, retries, or retained
incremental index state.

### Evidence, assumptions, and unsupported claims

Tests observe permutation invariance, parallel-edge retention, explicit cycle
failure, public snapshot stability, and maximum-chain stack safety. TypeScript 7
Effect diagnostics, lint, format, strict model validation, deterministic view
generation, and the repository gate provide evidence only over their checked
scope. This pilot does not establish Graph as canonical storage, a query engine,
an incremental database, a serializer, a renderer, or a performance win.

## Deep-module contract

`graph-index.ts` exposes a stable-ID directed index builder, acyclicity query,
and typed topological stable-ID query. It sorts nodes and relations by UTF-16
code-unit identity before calling Effect Graph and keeps every local numeric
index behind this internal module boundary.

## Oracle-first counterexamples

1. Permuting selected work and relation arrays cannot change a public projection.
2. Parallel relations keep distinct relation IDs and do not inflate dependency depth.
3. A cyclic selected DAG returns `PortfolioProjectionFailure`; graph presentation
   retains its existing ability to show a cycle.
4. A 2,048-node requires chain derives depth 2,047 without host recursion.
5. A representative accepted portfolio projection remains structurally unchanged.
6. Duplicate IDs or missing endpoints cannot escape as an ambient Graph exception.

## Acceptance

`bun scripts/accept/0046-effect-graph-execution-index.ts` runs focused portfolio
tests under Bun and genuine Node, TypeScript 7 Effect diagnostics, Oxlint,
Oxfmt, strict project-model validation, deterministic generated-view checks,
and the complete repository gate.

## Kill or redesign criteria

Redesign if Effect Graph requires numeric indices in a persisted/public value,
changes authored edge direction, coalesces parallel relations, makes ordering
depend on insertion or locale, or requires changing query/rendering contracts.

## Non-goals

No canonical graph migration, schema or serialization change, content-addressed
index, incremental persistence, layout, Control Room change, generic query
algebra, shortest-path feature, weighted critical-path rewrite, exact cycle
witness rewrite, relational-fact traversal rewrite, or benchmark claim.

## Semantic diff

Portfolio projection meaning and public representation remain unchanged. Only
the hidden execution mechanism for boolean cycle detection and dependency depth
changes from recursive bespoke walks to a deterministic Effect Graph index plus
an iterative domain fold.
