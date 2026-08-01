# Plan 0034: relational fact export

Status: implementation complete; integration gate pending under current host load

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
- [x] Run focused gates at implementation head `660967b`.
- [ ] Rerun the complete repository gate when the two unrelated
      reference-custody five-second host timeouts have capacity to complete.

## Reuse record

- Reuse the accepted Effect v4 `Schema`, typed error, `Crypto.Crypto`, and
  project-loader conventions already installed in the repository.
- Reuse normalized-core canonical JSON custody rather than hand-writing a
  second encoder or byte-capture protocol.
- Keep traversal as a small total in-process reference implementation. A
  Datalog or SQL engine is deferred until datasets or packaged rule sets make
  that dependency earn its cost.

## Review record

- Implementer review found no unresolved 0034 semantic or code finding.
- The independent 0036 explorer-query lane aligned its adapter with the exact
  0034 provenance tuple without creating a source dependency; compatible 0036
  head: `479a8a535cf216b079fc99445ec5224faf28f41a`.
- Focused evidence at `660967b`: Bun 10/10 with 195 assertions and 48 seeded
  property runs; genuine Node 1/1; TypeScript 7 with Effect diagnostics;
  Oxlint; Oxfmt; project validation; and all eight generated views.
- The exact acceptance reached and passed every 0034, project-model, static,
  and generated-view phase. Its nested complete repository gate reported 756
  passes and one skip, then failed only two pre-existing reference-custody
  tests at 5.02 and 5.12 seconds. An isolated rerun also exceeded their fixed
  five-second limits. This is an integration-capacity blocker, not acceptance
  evidence for or against the relational export.
