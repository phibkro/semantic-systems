---
format: semantic.feature-artifact/v1
feature_id: 0020-agent-facing-kernel-json
kind: plan
---
# Plan 0020-agent-facing-kernel-json: agent-facing kernel JSON

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
- `plans/completed/0020-agent-facing-kernel-json.md`
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
- 2026-07-31 (third correction): independent review falsified the envelope
  bounds with a byte-legal input — 300 thunk leaves × 256 unique labels, a
  complete 605,672-byte `KernelDocument` with 79,816 JSON value occurrences
  whose program's rejection carries 76,800 distinct labels — verified and
  reduced against the real 0018 checker (the mechanism reproduces at 2
  leaves × 3 labels; the old
  65,536 label cap breaks at 257 leaves; the old raw node cap 65,536 also
  rejected the byte-legal input itself). Raw-input and observation-envelope
  bounds are now separate named families: raw `maximumNodes` = 524,288
  (structural-induction bound `nodes <= floor((bytes + 1) / 2)`),
  `maximumLabels` = 1,048,576
  (simple byte-bound ceiling; tight lemma 349,525 at three bytes per
  distinct spelling), `maximumObservationNodes` = 4,194,304 (proven worst
  case 3,569,047), `maximumObservationCollectionLength` = 1,048,576, and
  `maximumObservationBytes` kept at 33,554,432 (proven worst case later
  corrected to 25,108,480). The counterexample and every bound derivation
  are committed as `tests/kernel-json-observation-bounds.test.ts`, aligned
  with the schema constants.
- 2026-07-31 (fourth correction): primary review rejected the false claim
  that every JSON value occurrence consumes two bytes and the stronger-than-
  observed claim that arithmetic tests exercised runtime envelope rejection.
  The contract now proves `2 × nodes <= compactBytes + 1` by JSON-grammar
  induction. A generated dense array witnesses the exact byte/node boundary:
  524,287 zeroes produce 1,048,575 bytes and 524,288 nodes; one more zero
  produces 1,048,577 bytes and 524,289 nodes. The design checkpoint claims
  arithmetic and grammar evidence only; real decoder/encoder fitting and
  rejection cases remain mandatory implementation acceptance work.
- 2026-07-31 (fifth correction): Luna-max review found that the counterexample
  test measured only the nested term while calling it a full document and
  that the byte derivation used a 64-byte estimate smaller than a valid
  maximal function-node wrapper. The generated fixture now measures the
  complete canonical-order `KernelDocument`: 605,672 bytes and 79,816 JSON
  value occurrences. It claims only raw arithmetic plus accepted 0018 program
  decoding until the 0020 decoder exists. The type-node derivation now
  serializes the exact 1,871-byte maximal function node and includes table
  brackets and separators, yielding a corrected rejected-observation worst
  case of 25,108,480 bytes under the unchanged 32 MiB ceiling.
- 2026-07-31 (sixth correction, slice 0024): independent review reproduced a
  blocker at integration head 87c532e. `checkKernelDocument` correctly emits
  the frozen reserved diagnostic facts `{"type_index": n}` with a nonempty
  shared type table for `type.argument-mismatch`, but the observation
  decoder treated the reserved shapes as generic open-vocabulary records:
  it never registered them with the `typeIndex`/`labelIndexRow` authority,
  so `verifyTraversalOrder` rejected every such observation with
  `decode.type-table-order`, while a dangling or malformed
  `type_index`/`label_indexes` reference decoded silently. The decoder now
  routes exactly the two reserved shapes from the contract's fact kind rules
  through the existing table authorities — index range, sorted-row
  discipline, and the frozen first-encounter traversal order included — and
  rejects a reserved key carried next to sibling keys with
  `decode.reserved-fact-shape`. Every other fact record key remains the
  deliberate open vocabulary. No second checker was added; traversal,
  maximal-sharing, range, and kind checks are unweakened.
  `tests/kernel-json-diagnostic-fact-custody.test.ts` holds the round-trip
  regression (value and byte-exact canonical paths) and the
  dangling/malformed negative oracles, and joins the 0020 acceptance run.
- 2026-07-31 (seventh correction, slice 0025): the 0024 residual was a real
  frozen-interface failure, reproduced independently. A representation-valid
  rejected observation put `{"z":{"type_index":0},"a":{"type_index":1}}` in
  diagnostic `expected` with `z`-then-`a` insertion order. It decoded as a
  value (traversal authority encountered types 0 then 1),
  but its own canonical bytes sort the keys `a`,`z`, so byte decoding
  encountered 1 before 0 and rejected `decode.type-table-order` at
  `$/observation/types`: an accepted value did not survive its canonical
  encoding. Root cause: `diagnosticFact` traversed open fact records in host
  insertion order while `canonicalJson` serializes keys in
  `compareCodePoints` order. Decision — recorded in the frozen contract's
  table-discipline and fact-grammar sections: within a diagnostic fact the
  frozen traversal descends arrays in element order and open fact records in
  Unicode code-point key order, the canonical encoding's own key order,
  never insertion order. This is a clarification, not a semantic version
  change: the frozen canonical byte grammar already fixes open-record key
  order to code-point order, and the value/byte agreement requirement makes
  code-point traversal the only self-consistent reading — insertion order
  was never expressible in canonical bytes. `diagnosticFact` (decode) and
  `translateFact` (observe seam) now traverse and materialize open-record
  keys with the already-imported `compareCodePoints`; reserved singleton
  shapes stay exact, closed structures are untouched, and no table-order,
  range, sharing, bounds, reserved-shape, or kind check is weakened.
  `tests/kernel-json-diagnostic-fact-custody.test.ts` pins the residual
  counterexample (now rejected identically in both representations), the
  corrected table order end-to-end (value decode → canonical encode → byte
  decode → byte-identical re-encode), nested `type_index`/`label_indexes`
  under open keys, materialized-key order, and exotic keys (U+FF5A vs
  U+1D400) where UTF-16 order and code-point order disagree, so the
  comparator authority itself is pinned.
- 2026-08-02 (post-0025 custody correction): an independently reproduced own
  `__proto__` fact key exposed a second materialization hazard. The strict
  decoder accepted the key as part of the frozen open vocabulary, then wrote
  it into `{}`, invoking the inherited prototype setter and silently
  projecting the nonempty fact to `{}`. `diagnosticFact` and `translateFact`
  now build null-prototype records before their code-point-ordered writes.
  The correction preserves the existing vocabulary and byte grammar; it
  removes a host-object collision rather than changing semantics. The
  regression proves the own key and nested value survive value decoding,
  canonical encoding, byte decoding, and byte-identical re-encoding.
- 2026-08-02 (interpreter review custody follow-up): the own `__proto__`
  regression now exercises object, scalar, and null values, pinning ordinary
  own-property materialization rather than only the prototype-mutation
  variant. The 0020 acceptance artifact list now also holds
  `rejected-type-mismatch.kernel.json`, the generated input consumed by the
  0022 Bun and genuine-Node corpora.
- 2026-08-02: the corrected 0020 lineage was integrated at
  `c660b657ee951a65328a485bbaf6762d90a07910` through the accepted 0022
  interpreter slice. The composed acceptance chain passed 65 focused kernel
  JSON tests / 176 expectations, genuine-Node golden parity, TypeScript,
  strict lint, formatting, project-model validation and generation, and the
  full repository gate. The only project-model warning remains the explicit
  unsupported `claim.kernel.safety` claim.
- 2026-08-02: Historical lifecycle heading migrated verbatim from the pre-migration plan:
  # Completed plan 0020: agent-facing kernel JSON
