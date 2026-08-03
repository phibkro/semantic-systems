# Plan 0007-reuse-first-engineering: reuse-first engineering assignments

Canonical contract:
[`design-specs/0007-reuse-first-engineering.md`](../../design-specs/0007-reuse-first-engineering.md).

## Claim and scope

Implement only the five delegation clauses frozen in design spec 0007. No
semantic, evidence, license, or merge-authority change is allowed.

## Current state

- The operator required every developer/engineer prompt to use a lazy-senior,
  reuse-first implementation posture.
- `AGENTS.md` contains the five required clauses.
- The first PR attempt correctly failed the feature-contract gate because this
  repository-wide governance change lacked a frozen feature identity.

## Implementation slices

1. Freeze the five-clause assignment contract.
2. Add a removal-sensitive acceptance command.
3. Update the PR completion report with exact evidence limits.
4. Run protected exact-head checks and merge only after they pass.

## Acceptance commands

```bash
nix develop --command just accept 0007-reuse-first-engineering
nix develop --command just check
```

## Evidence requirements

- Map and acceptance checks remain `static_analysis`.
- Prompt/worker compliance remains `assertion`.
- Do not claim legal compatibility or successful reuse without source-specific
  evidence.

## Risks and kill criteria

Use the risks and kill criteria in design spec 0007. In particular, do not
replace bounded implementation with an open-ended tooling search.

## Progress log

- 2026-07-29: Operator froze the reuse-first/lazy-senior posture.
- 2026-07-29: Committed the five clauses as `992abc0`.
- 2026-07-29: Protected PR #3 correctly rejected the uncontracted governance
  change; recut it as feature 0007 without weakening the gate.
- 2026-08-03: With HEAD at
  `df2d51e12b8c1ae9f1902df45f3d9f66ea1e8dbe`, the acceptance observation
  reported all five reuse-first clauses present while tracked files differed
  from HEAD. This is a `runtime_validation` observation of the working tree,
  not exact-commit, proof, independent-review, protected-check, merge, or
  completion evidence.
- 2026-08-03: External PR #3 is OPEN, draft, DIRTY, and unmerged. Protected
  exact-head checks, merge, completion feedback, and cleanup are therefore not
  established.

## Completion state

Blocked by external PR #3: it remains OPEN, draft, DIRTY, and unmerged. The
dirty-tree acceptance observation found all five clauses present, but does not
establish exact-head or protected checks, merge, completion feedback, or
cleanup. No completion evidence is recorded; keep the work nonterminal and do
not move the active plan.

- 2026-08-02: Historical lifecycle heading migrated verbatim from the pre-migration plan:
  # Active plan 0007: reuse-first engineering assignments
