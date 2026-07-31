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
- the judgment-recording seam only, inside `src/kernel-calculus/checker.ts`
  and its export in `src/kernel-calculus/index.ts`, exactly as frozen in the
  contract's "Checker observation seam" section
- focused seam assertions in `tests/kernel-calculus-checker.test.ts`
- the exact model entries for `work.agent-facing-kernel-json` and
  `work.lossless-frontend-spec`
- focused scheduler assertions in `tests/project-model.test.ts`

## Forbidden changes

Do not change 0018 typing, usage, effect, or handler semantics, acceptance
or rejection observations, diagnostic codes, derivation shape, normalized
report bytes, machine behavior, or `CheckedProgram` custody. The only
permitted 0018 change is the additive judgment-recording seam frozen in the
contract, and it must leave every existing 0018 test and acceptance
observation unchanged.

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
5. Implement the additive 0018 judgment-recording seam with focused tests
   proving all existing 0018 observations unchanged.
6. Implement bounds and the strict byte and object decoders.
7. Implement canonical encoding for both documents.
8. Implement the inert 0018 projection and check composition over the
   recorded judgment table, with no fact re-derivation in kernel-json.
9. Implement the agent-facing judgments translation and observation
   encoding.
10. Add the schema-artifact equality and golden-example tests.
11. Add the storage-independence differential observation.
12. Run focused acceptance and the full pinned gate.
13. Commission an independent implementation review.
14. Correct each rejected implementation head before integration.

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
- 2026-07-31 (correction): independent review found the checked view
  unimplementable from the accepted 0018 public evidence; the contract now
  freezes one additive, backward-compatible judgment-recording seam inside
  the authoritative 0018 checker, with exact kernel-calculus paths
  authorized above, instead of a second downstream checker.
- 2026-07-31 (correction): `work.lossless-frontend-spec` was restored to its
  original lossless-frontend identity and truthful relations; the recut now
  lives under a new `work.agent-facing-kernel-json` identity. Semantic IDs
  are never reused for different work items.
- 2026-07-31 (correction): diagnostic `expected`/`actual` are a recursive
  bounded inert fact grammar; diagnostic codes and rules are closed version
  1 enums; the schema `$id` moved to the project-controlled
  `https://semantic.phibkro.org/` namespace; occurrence paths forbid RFC
  6901 escapes in prose and schema alike.
- 2026-07-31 (second correction): singular `signature_origin` was
  incomplete for `handler.deep`; it is now `signature_origins`, complete
  and in canonical signature order, recorded by the seam as the exact
  consulted declaration indexes. A new handled-program accepted golden
  exercises it for both `computation.operation` and `handler.deep`.
- 2026-07-31 (second correction): the 4,096-byte fact-string cap was proven
  unsound against the real checker — a thirty-five-node let chain of pair
  doublings inside every default bound renders a 524,283-byte mismatch fact
  and grows exponentially. Observations now carry shared `labels` and
  `types` tables; all inferred types and rows are table indexes; diagnostic
  facts follow frozen kind rules (type facts are `type_index` records,
  never rendered strings); rejected observations are always representable
  with an arithmetic proof against the exact 0018 bounds; over-bound
  accepted observations fail loudly as typed resource errors, never by
  truncation. The seam records structured facts and reserves preorder
  record indexes with fixed-point rollback, without a second traversal or
  conclusion parsing.
