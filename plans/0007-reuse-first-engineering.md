# Plan 0007-reuse-first-engineering: reuse-first engineering assignments

Canonical contract:
[`design-specs/0007-reuse-first-engineering.md`](../design-specs/0007-reuse-first-engineering.md).

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

## Completion state

Open pending exact-head acceptance, protected checks, merge, completion
feedback, and cleanup.

- 2026-08-02: Historical lifecycle heading migrated verbatim from the pre-migration plan:
  # Active plan 0007: reuse-first engineering assignments
