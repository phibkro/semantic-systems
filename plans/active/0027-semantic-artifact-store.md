# Active plan 0027: semantic artifact store tracer

Canonical frozen contract:
[`design-specs/0027-semantic-artifact-store.md`](../../design-specs/0027-semantic-artifact-store.md).
This execution record cannot redefine that contract.

Status: review-correction candidate; exact reacceptance and follow-up review pending

Owner: primary Semantic Systems language lead

## Dependencies

- accepted 0019 normalized-core format, validator, and identity separation;
- the content-addressed language/build architecture recorded in
  `docs/language-system-incremental-architecture.md`; and
- installed Effect 4.0.0-beta.102, TypeScript 7.0.2, and Bun 1.3.13.

## Owned paths

- `design-specs/0027-semantic-artifact-store.md`
- `plans/active/0027-semantic-artifact-store.md`
- `model/work/semantic-artifact-store.json`
- `src/language-build/**`
- `tests/language-build-semantic-store.test.ts`
- `scripts/accept/0027-semantic-artifact-store.ts`

Forbidden: changing 0019 identity semantics; changing the kernel, interpreter,
or surface language; implementing compiler optimization or remote storage;
editing operator-owned `AGENTS.md`; pushing, merging, deploying, or deleting
worktrees before exact acceptance and review.

## Implementation posture

- Reuse the 0019 validator and its domain-separated identities; do not hash or
  parse normalized-core artifacts again.
- Use Effect Schema for every unknown command and replay boundary.
- Keep state ownership in one Effect service Layer and make each mutation one
  `Ref` transition.
- Preserve typed failures and Crypto requirements until the composition root.
- Keep total deterministic projection helpers plain and private.
- Reuse accepted repository patterns before adding a dependency or abstraction.

## Execution sequence

1. Freeze this contract, plan, model item, and initially red acceptance.
2. Reconcile the existing tracer to the frozen bounds and deep-module surface.
3. Add adversarial replay and atomic-state counterexamples.
4. Rebase the isolated worktree over the accepted 0026 main head.
5. Run focused tests, TypeScript 7, lint, formatting, 0019 acceptance, project
   projections, and the full repository gate.
6. Commit one clean implementation increment and commission independent review.
7. Correct any finding at its owning boundary, then open one completion PR.
8. Merge only after exact-head checks and review evidence pass.

## Acceptance command

```bash
bun scripts/accept/0027-semantic-artifact-store.ts
```

## Evidence ledger

- 2026-07-31: the operator selected semantic-value content addressing with a
  Unison-shaped language layer and a separate Nix-shaped package/build layer.
- 2026-07-31: the operator required identities to be stage-relative so comments,
  static propositions, unreachable code, runtime closure, and exact emitted
  bytes can participate only where their chosen artifact semantics require.
- 2026-07-31: architecture work separated artifact graphs from fixed pass
  history and recorded analysis, rewrite proposals, and optimization receipts
  as future composable relations.
- 2026-08-01: the first executable candidate reused the 0019 validator and
  demonstrated four focused journeys with 30 assertions before contract freeze.
  This was evidence for contract discovery, not acceptance authority.
- 2026-08-01: the frozen slice deliberately stops at semantic/artifact reuse,
  separate names, and validated replay. Reachability and rewrite work remain a
  later dependency rather than being smuggled into the store abstraction.
- 2026-08-01: the first exact acceptance run passed the 0027 tests, TypeScript,
  lint, formatting, model gates, and current 0019 Bun/Node tests, then exposed
  that recursively invoking 0019 acceptance reopens 0018's machine-local
  `LANG_BANG_LAKE_BIN` oracle. Like accepted feature 0026, 0027 now consumes the
  predecessor receipt and reruns the relevant current normalized-core tests;
  it does not reinterpret a historical external-oracle environment as a new
  dependency of the store.
- 2026-08-01: exact acceptance on the rebased candidate passed 668 Bun tests
  with one explicit optional-oracle skip, 68 reference-custody Python tests,
  the focused genuine-Node normalized-core observation, TypeScript 7 with
  Effect diagnostics, Oxlint, Oxfmt, canonical project-view checks, and the
  full repository gate. Independent review remains required before a PR.
- 2026-08-01: a main-agent adversarial probe after the first green acceptance
  found that Effect Schema defects from revoked or throwing proxies escaped the
  typed `bindName`, `resolveName`, and `replay` boundaries. The correction uses
  Effect v4 `catchDefect` only at those external decode adapters, preserving
  ordinary schema diagnostics and interruption while mapping hostile decoder
  defects to the existing typed errors. Focused regressions now cover revoked
  and throwing proxies and prove state preservation. Exact reacceptance and
  follow-up review are pending.
- 2026-08-01: independent review of pre-correction head `1ae3810` reproduced
  the hostile-proxy defect and found two more boundary failures. A lone UTF-16
  surrogate in snapshot `canonical_bytes` encoded as U+FFFD and could replay
  successfully into text unequal to the accepted candidate. Replay collection
  limits also ran after Effect Schema traversed the arrays. The correction:
  - restricts artifact text to the 0019 byte-limit-sized Unicode-scalar domain;
  - performs a defect-contained descriptor and array-length preflight before
    deep Schema decoding, while retaining the post-decode checks; and
  - preserves exact regressions for surrogate normalization and an oversized
    sparse proxy whose elements must never be read.
- 2026-08-01: review-driven coverage now also checks forged outer semantic and
  artifact identities, equal snapshots under alternate insertion order, nested
  immutability, concurrent insert/bind linearization, and a digest failure after
  replay validation begins. The focused suite passes 12 journeys and 101
  assertions; exact acceptance and corrected-head review remain pending.

## Open review questions

- Does bounded replay reject before any state transition on every malformed,
  duplicate, forged, or over-limit candidate?
- Is the name projection observably independent of semantic values?
- Do concurrent insert, binding, and replay operations have one defensible
  linearization point each?
- Does any public name imply support for more than accepted 0019 artifacts?
