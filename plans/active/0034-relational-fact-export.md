# Plan 0034: relational fact export

Status: accepted for integration at implementation checkpoint `d1a6594`

Design spec: `design-specs/0034-relational-fact-export.md`

## Contract checkpoint

- Canonical input is one validated project-model observation.
- Output is a versioned, content-addressed, non-authoritative JSON projection.
- Every fact has a stable key and exact repository-relative provenance.
- Relation families preserve dependency, effect, ownership, derivation,
  causality, observation, and evidence distinctions; unclassified relations
  remain explicit `other` facts.
- Public recursive queries validate the export bytes before traversal, expose
  depth limitation, and reject node excess.
- Storage, mutation, negative closed-world queries, normalized-core import, and
  explorer rendering remain outside this feature.

## Execution record

- [x] Read the canonical project-model and relational-analysis architecture.
- [x] Freeze the falsifiable deep-module boundary and counterexamples.
- [x] Implement schemas, canonical export, provenance, and validation.
- [x] Implement impact and evidence query tracer bullets.
- [x] Add example, property, rejection, mutation, and Bun/Node tests.
- [x] Add exact acceptance and regenerate deterministic project views.
- [x] Run focused and complete gates at implementation checkpoint `d1a6594`.

## Reuse record

- Reuse the accepted Effect v4 `Schema`, typed error, `Crypto.Crypto`, and
  project-loader conventions already installed in the repository.
- Reuse normalized-core canonical JSON custody rather than hand-writing a
  second encoder or byte-capture protocol.
- Keep traversal as a small total in-process reference implementation. A
  Datalog or SQL engine is deferred until datasets or packaged rule sets make
  that dependency earn its cost.

## Review record

- A Fable 5 high review of candidate `7234d4a` reproduced a hostile
  query-request defect: Effect Schema could escape through the defect channel.
  Correction `0702375` captures that failure as
  `RelationalFactQueryRejected` with a revoked-proxy regression.
- Independent correction review then found two admission-order gaps: project
  cardinality was checked after validation, and query-root cardinality was
  checked after Schema array traversal. Correction `f5541c0` moves both limits
  before their respective traversals and proves over-limit records and roots
  are not inspected.
- A descriptor/get disagreement review then showed the caller query object was
  observed twice. Correction `d1a6594` captures one complete plain
  data-property snapshot, bounds its copied root array, and Schema-decodes that
  same snapshot. Accessor, revoked-proxy, and moving-proxy counterexamples stay
  typed without observing live getter values.
- Independent final review of exact clean checkpoint `d1a6594` found no
  remaining blocker and approved integration.
- The independent 0036 explorer-query lane aligned its adapter with the exact
  0034 provenance tuple without creating a source dependency; compatible 0036
  head: `479a8a535cf216b079fc99445ec5224faf28f41a`.
- Exact acceptance at `d1a6594` passed 16 focused Bun tests with 217 assertions
  and 48 seeded property runs; genuine Node parity; all project-model tests;
  the complete repository suite; TypeScript 7 Effect diagnostics; Oxlint;
  Oxfmt; commit policy; project validation; and all eight generated views.
