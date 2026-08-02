# Plan 0053-relational-fact-export: relational fact export

Canonical frozen contract: [`design-specs/0053-relational-fact-export.md`](../../design-specs/0053-relational-fact-export.md).
This mutable plan records implementation state and does not redefine the frozen
contract.

Feature base: `7caebb0546b9e9f1412de006158e1decd8d5f46c`

Owner: primary Semantic Systems integration lead

## Scope and custody

The feature owns only the following new artifacts:

- `src/relational-facts/**`;
- `tests/relational-facts.test.ts`;
- `examples/relational-facts/**`;
- `scripts/accept/0053-relational-fact-export.ts`;
- `plans/active/0053-relational-fact-export.md`; and
- `model/work/features/0053-relational-fact-export.json`.

The canonical project model, loader, validator, generated projections, frozen
specification, and all existing plans remain read-only. The exporter consumes
`ProjectGraph` as authenticated in-process input and performs no file walking,
validation, graph mutation, indexing, database work, or policy judgment.

## Design decisions

- `semantic.relational-facts/v1` is one closed lossless row vocabulary. Entity
  attributes are emitted as one top-level `attribute` row per key; relation
  attributes remain one JSON object value. Tags retain authored occurrences,
  including duplicates.
- Source custody is converted only from normalized absolute loader paths under
  `<project.root>/model` to normalized POSIX `source_key` values. Invalid or
  portable-host paths fail with `RelationalExportError`.
- Relation rows retain their zero-based canonical sequence ordinal, so authored
  parallel and duplicate relations remain distinct. Rows sort by their complete
  closed keys and canonical bytes use the repository JSON encoder.
- Export snapshots recursively clone JSON values and deep-freezes the bundle.
  Query results are derived, bounded, and deeply immutable; no query owns or
  mutates canonical graph state.
- Reachability validates roots, relation kinds, direction, and bounds before a
  breadth-first traversal. It records one shortest predecessor path per entity,
  exact traversed relation rows, and truncation at depth or row bounds.
- Evidence lookup retains every direct `supports`, `covers`, `discharges`,
  `validates`, and `invalidates` relation. Assumptions are reached only through
  outgoing `assumes` edges; no evidence category is upgraded to sufficiency.
- Bun and genuine Node entrypoints compose the existing Effect platform layers
  and emit one canonical report containing the bundle summary and query
  observations. The reusable exporter and query algorithms remain pure.

## Implementation sequence

1. Define the versioned bundle, closed row types, typed export/query errors, and
   result shapes.
2. Implement source-custody normalization, lossless row projection, recursive
   JSON snapshotting, deterministic sorting, and deep freezing.
3. Implement bounded incoming/outgoing breadth-first traversal with shortest
   paths, exact relation ordinals, and truncation observations.
4. Implement direct evidence and transitive assumption traversal while retaining
   authored relation force.
5. Add canonical UTF-8 encoders, report entrypoints, fixture/golden artifacts,
   and focused oracle tests.
6. Add the exact acceptance program, including row-count/custody checks,
   deterministic immutability checks, query observations, typed failures,
   Bun/Node parity, and project-model/generated-view gates.
7. Run the exact acceptance command and integration gates at the implementing
   head; then record completion evidence in the canonical feature record during
   integration.

## Acceptance command

```bash
nix develop -c bun scripts/accept/0053-relational-fact-export.ts
```

## Evidence ledger

- 2026-08-02: frozen contract inspected at the exact base commit; no existing
  module owns a relational fact projection or bounded graph query.
- 2026-08-02: implementation adds pure export/query seams, canonical encoding,
  fixture/goldens, focused tests, and Bun/Node composition roots.
- 2026-08-02: delegated implementation intentionally did not run formatter,
  lint, typecheck, tests, acceptance, or project-wide validation. The
  integrating lead owns those gates.
- 2026-08-02: the integrating lead ran the exact acceptance program at integration head `6536fbe03fe2d25bc7e0776312092a04508c5c24`; it completed successfully. The gate exercised focused export/query behavior, canonical golden bytes, typed custody failures, genuine Bun/Node parity, typecheck, strict lint, format, project-model validation, and generated-view checks.
- 2026-08-02: independent exact-head review accepted canonical source custody, deep immutable snapshots, exact relation ordinals and direction, bounded shortest-path queries, authored evidence force, and transitive-assumption preservation. Review is an authored assertion, not proof or runtime validation.

## Assumptions and limits

The exporter assumes the loader supplied a canonical `ProjectGraph`; it still
fails closed for source custody and unsupported runtime JSON values. Query
observations are structural derivations only. They do not establish evidence
sufficiency, claim truth, logical entailment, graph completeness, durable
relation identity, or termination of arbitrary future query vocabularies.

Status: accepted at integration head `6536fbe03fe2d25bc7e0776312092a04508c5c24`.
