# Plan 0034: relational fact export

Status: contract frozen; implementation pending

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
- [ ] Implement schemas, canonical export, provenance, and validation.
- [ ] Implement impact and evidence query tracer bullets.
- [ ] Add example, property, rejection, mutation, and Bun/Node tests.
- [ ] Add exact acceptance and regenerate deterministic project views.
- [ ] Run focused and complete gates at the committed head.

## Reuse record

- Reuse the accepted Effect v4 `Schema`, typed error, `Crypto.Crypto`, and
  project-loader conventions already installed in the repository.
- Reuse normalized-core canonical JSON custody rather than hand-writing a
  second encoder or byte-capture protocol.
- Keep traversal as a small total in-process reference implementation. A
  Datalog or SQL engine is deferred until datasets or packaged rule sets make
  that dependency earn its cost.

## Review record

- Pending implementation review and exact-head evidence.
