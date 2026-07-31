# Active plan 0019: normalized core format

Canonical frozen contract:
[`design-specs/0019-normalized-core-format.md`](../../design-specs/0019-normalized-core-format.md).
This mutable record cannot change that contract.

Status: corrected frozen design checkpoint. Awaiting independent rereview before implementation

Owner: primary Semantic Systems language lane

## Dependencies

- accepted minimal kernel calculus 0018;
- accepted integration head `f461cb38960493c044459c58374d6d1aa12bda3b`;
- compiler vocabulary in `docs/compiler-semantics-spec.md`;
- open-system design lens 0015; and
- TypeScript 7, Bun, Effect v4, Oxfmt, and Oxlint from migration 0010.

The first slice consumes only privately custodied accepted 0018 programs.
Frontend, proof adapter, package identity, lowering, and backend work depend on
this feature rather than entering it.

## Discovery evidence

- `src/kernel-calculus/checker.ts` keeps accepted program internals in a
  private `WeakMap` and exposes only a custodied program surface.
- `src/kernel-calculus/ast.ts` already snapshots finite 0018 terms and uses
  de Bruijn indices.
- `src/kernel-calculus/report.ts` has deterministic report projections, but
  those reports omit the term and signature and are not durable checked
  artifacts.
- `src/tracer/canonical.ts` supplies an Effect `Crypto` SHA-256 technique.
  Feature 0019 can reuse the explicit digest service, but its canonical byte
  grammar and domain separation come from the frozen contract.
- The repository has no existing normalized-core schema or general normalizer
  to reuse.

No upstream source was copied during contract work.

## Owned paths

- `design-specs/0019-normalized-core-format.md`
- `plans/active/0019-normalized-core-format.md`
- `scripts/accept/0019-normalized-core-format.ts`
- future `src/normalized-core/**`
- future `tests/normalized-core-*.test.ts`
- one bounded fixture family under future `examples/normalized-core/`
- `scripts/oxlint/semantic-effect-rules.ts`
- the normalized-core rule and closure cases in
  `tests/semantic-effect-rules.test.ts`
- the `work.normalized-core-format` model entry
- the `artifact.normalized-core` model entry
- generated projections from those canonical model changes
- the focused ready-frontier assertion in `tests/project-model.test.ts`
- the already accepted `work.kernel-spec` status and completion record
- the 0018 plan status and exact integration evidence

Forbidden changes include 0018 syntax or judgments, `theory-norm-v0`, surface
syntax, package identity, proof semantics, inventory rules, actors, STM,
deployment behavior, hand-edited generated views, and user `AGENTS.md`.

## Implementation posture

- Search existing schema, custody, canonical JSON, digest, portable-closure,
  and Bun/Node patterns before writing infrastructure.
- Reuse the accepted 0018 checker and private internals through an internal
  module seam. Do not recreate typing rules.
- Keep the public entry point smaller than the implementation.
- Decode and snapshot metadata before digesting it.
- Use explicit Effect `Crypto` digest authority. Do not add ambient Node crypto
  to the portable core.
- Implement the smallest strict canonical JSON encoder needed by the frozen
  schema. Do not build a general serializer.
- Record any license-compatible reused technique with source and license
  provenance.
- Stop work that expands into parsing, proof search, package identity,
  optimization, persistence, or a backend.

## Execution sequence

1. Freeze this contract, plan, model state, and red exact acceptance scaffold.
2. Commission independent semantic, identity, and hostile-decoder review.
3. Correct and refreeze any rejected contract head.
4. Add red exact-byte, identity, custody, decoder, and Node oracles.
5. Implement exact inert data types and bounded metadata decoding.
6. Implement structural projection from private 0018 program internals.
7. Implement entity, semantic, and artifact identity derivation.
8. Implement canonical UTF-8 bytes and strict byte decoding.
9. Implement identity verification and independent 0018 recheck.
10. Add mutation, forged-input, bounds, source, alpha-stability, portable-lint,
    and transitive-closure oracles.
11. Run exact acceptance and full integration at one clean head.
12. Commission independent implementation and API review.
13. Correct each rejected exact head before integration.

## Acceptance command

```bash
bun scripts/accept/0019-normalized-core-format.ts
```

At this design-only checkpoint the command must fail because
`src/normalized-core/index.ts` does not exist. A missing implementation is not
downgraded to a warning.

## Evidence ledger

- 2026-07-31: language feature 0018 was accepted at candidate
  `d436176d3b652b81b19ec81716dcde88dda848ca` and integrated at
  `f461cb38960493c044459c58374d6d1aa12bda3b`.
- 2026-07-31: repository research selected a bounded structural artifact over
  accepted 0018 programs. The contract excludes general normalization,
  frontend, proof, package, persistence, and backend work.
- 2026-07-31: the design separates semantic identity from source-bearing
  artifact identity and gives every version 1 entity an exact domain-separated
  SHA-256 derivation.
- 2026-07-31: the design retains de Bruijn references, explicit assumptions,
  attributed source correspondence, strict bounds, and fail-closed versioning.
- 2026-07-31: no implementation, provider, network, filesystem, deployment, or
  external repository effect occurred during contract work.
- 2026-07-31: independent review rejected `e02b9d3` because the term grammar,
  signed-integer policy, metadata inputs, assumption semantics, portable lint
  scope, and resource accounting were incomplete. The recut enumerates the
  complete accepted 0018 grammar, preserves signed safe integers and `-0`,
  makes assumptions inert metadata, defines identity-free input and strict
  source-pointer resolution, adds normalized core to the portable lint domain,
  and freezes exact traversal and failure precedence. No implementation began.
- 2026-07-31: final rereview required four narrow corrections at `9016225`:
  literal entity digest payloads, observable normalized-coordinate pointer
  cases, removal of normalized-core runtime-filename exemptions, and emission
  precedence consistent with post-normalization pointer resolution. The final
  recut makes those exact corrections and does not change 0018 or begin
  implementation.
