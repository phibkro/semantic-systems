# Active plan 0020: agent-facing kernel JSON

## Contract

The frozen contract is
[`design-specs/0020-agent-facing-kernel-json.md`](../../design-specs/0020-agent-facing-kernel-json.md).

This plan recuts the earlier 0020 S-expression checkpoint by operator
decision. The prior design is preserved, not erased: its full checkpoint is
commit `ee13bffec46ac4df9fa73874b8bf7a17cf6d2496`, and its spec and plan are
retained under `design-specs/superseded/` and `plans/superseded/`.

## Goal

Freeze one recursive JSON contract as the stable user and agent-facing kernel
interface: a raw `semantic.kernel-json` document, a separate
`semantic.kernel-check` observation with explicit binder context and semantic
judgments, one JSON Schema description, golden fixtures, strict boundaries,
and a storage-independence rule that keeps any future Merkle DAG internal.

## Dependencies

- accepted kernel calculus 0018 at integration head
  `f461cb38960493c044459c58374d6d1aa12bda3b`
- accepted normalized core 0019 at integration head
  `2959681e01df2acc4ea1318b8ce634b9ccf7d10c`
- the operator decision selecting recursive JSON over the S-expression
  source as the frozen agent-facing interface

## Owned paths

- `design-specs/0020-agent-facing-kernel-json.md`
- `design-specs/superseded/0020-lossless-kernel-source.md`
- `plans/active/0020-agent-facing-kernel-json.md`
- `plans/superseded/0020-lossless-kernel-source.md`
- `scripts/accept/0020-agent-facing-kernel-json.ts`
- `spec/kernel-json/kernel-json-v1.schema.json`
- `examples/kernel-json/**`
- `src/kernel-json/**`
- `tests/kernel-json-*.test.ts`
- the exact model entry for `work.lossless-frontend-spec`

## Forbidden changes

Do not change the 0018 type, term, checker, or machine contract.

Do not change the 0019 normalized artifact schema or identity rules.

Do not let any hash, node reference, cache topology, store path, or bundle
detail into the frozen JSON contracts.

Do not add a parser for non-JSON text, an evaluator adapter, a filesystem or
network adapter, or a backend.

Do not add Python source or scripts.

## Sequence

1. Freeze the contract, schema, golden examples, plan, model state, and red
   acceptance at one clean commit.
2. Commission an independent contract review.
3. Correct each rejected contract head.
4. Add red decode, canonicalization, custody, check-view, and Node tests.
5. Implement bounds and the strict byte and object decoders.
6. Implement canonical encoding for both documents.
7. Implement the inert 0018 projection and check composition.
8. Implement the agent-facing judgments projection and observation encoding.
9. Add the schema-artifact equality and golden-example tests.
10. Add the storage-independence differential observation.
11. Run focused acceptance and the full pinned gate.
12. Commission an independent implementation review.
13. Correct each rejected implementation head before integration.

## Acceptance command

```bash
bun scripts/accept/0020-agent-facing-kernel-json.ts
```

At this frozen-design checkpoint, the command must prove the contract
artifacts (spec, schema, golden examples, plan, model entry) and then fail on
the first missing implementation artifact, `src/kernel-json/index.ts`. The
failure is not a warning.

## Evidence ledger

- 2026-07-31: operator decision: recursive JSON is the stable user and
  agent-facing kernel interface; JSON Schema describes the complete
  structural contract; the strict decoder and the 0018 checker remain
  authorities; a future Merkle DAG stays internal and invisible in the JSON;
  the checked view must make binder context and semantic judgments explicit.
- 2026-07-31: the earlier S-expression checkpoint is preserved at
  `ee13bffec46ac4df9fa73874b8bf7a17cf6d2496` and superseded without history
  rewrite; its acceptance script is removed so exactly one 0020 lineage is
  active.
- 2026-07-31: the raw document reuses the 0019 normalized term vocabulary
  plus the raw `resumption` value variant, so agents read one JSON term
  vocabulary across raw documents and normalized artifacts.
- 2026-07-31: golden semantic facts (pure let program, handled one-shot
  program, and the `usage.affine-duplicated` double-resume rejection with its
  exact diagnostic fields) were produced by running the accepted 0018 checker
  before freezing the fixtures.
- 2026-07-31: no production decoder, checker extension, or storage
  implementation was written during this design checkpoint.
