# Superseded plan 0020: lossless kernel source

Superseded on 2026-07-31 by operator decision. The active 0020 plan is
[`plans/active/0020-agent-facing-kernel-json.md`](../active/0020-agent-facing-kernel-json.md).
The S-expression checkpoint is preserved at commit
`ee13bffec46ac4df9fa73874b8bf7a17cf6d2496`; this plan is retained as history
only and its acceptance script was removed with the recut.

## Contract

The superseded contract is
[`design-specs/superseded/0020-lossless-kernel-source.md`](../../design-specs/superseded/0020-lossless-kernel-source.md).

## Goal

Add one lossless source format for the complete accepted 0018 kernel grammar.

The feature must preserve malformed text. It must also project valid text to
inert 0018 data.

## Dependencies

- accepted kernel calculus 0018 at integration head
  `f461cb38960493c044459c58374d6d1aa12bda3b`
- accepted normalized core 0019 at integration head
  `2959681e01df2acc4ea1318b8ce634b9ccf7d10c`
- the completed source and compiler research in
  `docs/compiler-semantics-spec.md`
- the tested green-tree and incremental-query methods in
  `research/reference-baselines/pilot-control-synthesis.md`

## Owned paths

- `design-specs/0020-lossless-kernel-source.md`
- `plans/active/0020-lossless-kernel-source.md`
- `scripts/accept/0020-lossless-kernel-source.ts`
- `src/kernel-source/**`
- `tests/kernel-source-*.test.ts`
- `examples/kernel-source/**`
- the kernel-source lint domain in `scripts/oxlint/semantic-effect-rules.ts`
- the exact model entry for `work.lossless-frontend-spec`
- focused scheduler assertions in `tests/project-model.test.ts`

## Forbidden changes

Do not change the 0018 type, term, checker, or machine contract.

Do not change the 0019 normalized artifact schema or identity rules.

Do not add a filesystem adapter, LSP server, evaluator, formatter, package
loader, proof adapter, or backend.

Do not add Python source or scripts.

## Sequence

1. Freeze the contract, plan, model state, and red acceptance.
2. Commission an independent contract review.
3. Correct each rejected contract head.
4. Add red round-trip, grammar, custody, edit, and Node tests.
5. Implement the byte and request decoders.
6. Implement the lexer and immutable green values.
7. Implement bounded recovery and revision views.
8. Implement the complete inert 0018 projection.
9. Implement edit replay and structural reuse.
10. Add incremental-versus-clean differential tests.
11. Add the source-to-checker-to-normalized composition test.
12. Run focused acceptance and the full pinned gate.
13. Commission an independent implementation review.
14. Correct each rejected implementation head before integration.

## Acceptance command

```bash
bun scripts/accept/0020-lossless-kernel-source.ts
```

At this frozen-design checkpoint, the command must fail on the missing
`src/kernel-source/index.ts` artifact. The failure is not a warning.

## Evidence ledger

- 2026-07-31: normalized core 0019 closed its dependency edge and made the
  lossless frontend ready in the generated scheduler.
- 2026-07-31: the selected first slice is a lossless kernel source format, not
  the final user language.
- 2026-07-31: the source uses explicit de Bruijn indexes. Name resolution stays
  outside version 1.
- 2026-07-31: the contract keeps source bytes, green content identity, revision
  occurrence paths, inert kernel data, checked programs, and normalized
  artifacts as different objects.
- 2026-07-31: the contract permits complete reparse after an edit. It requires
  exact subtree reuse and incremental-versus-clean equality.
- 2026-07-31: no parser implementation, provider operation, network operation,
  or external repository effect occurred during this design checkpoint.
