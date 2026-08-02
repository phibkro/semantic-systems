# Plan 0048-pbk-control-room-acceptance-reconciliation: PBK Control Room acceptance reconciliation

Canonical contract:
[`design-specs/0048-pbk-control-room-acceptance-reconciliation.md`](../design-specs/0048-pbk-control-room-acceptance-reconciliation.md).

## Claim and scope

Correct the missing 0021 Roadmap hierarchy/containment projection, preserve
one acceptance definition, and reconcile the feature's plan, model status,
and generated frontier without changing the frozen portfolio semantics.

## Completed slices

1. Reproduced the default Roadmap omission under independent review.
2. Reused the existing Effect Graph index and maintained XYFlow renderer
   behind one pure stable-ID element adapter.
3. Added project nodes, project membership, and milestone containment while
   preserving prerequisite direction, authored `requires` metadata, and an
   honest prerequisite-to-dependent `unlocks` label.
4. Added equivalent ordered navigation and phone-browser regression evidence.
5. Removed the duplicate repository-wide gate from 0021 acceptance because
   the inherited 0017 acceptance already owns it.
6. Reconciled the 0021 plan, portfolio status, and generated delegation
   frontier.
7. Recut final acceptance under 0048 so the prior 0021 migration lineage is
   not silently reused.
8. Corrected the independent-review counterexample where a prerequisite-to-
   dependent arrow was visibly labelled as though the target required the
   source; tuple-level regression now binds source, target, `unlocks` label,
   accessible text, and authored `requires` metadata.

## Acceptance

```bash
nix develop --command bun scripts/accept/0048-pbk-control-room-acceptance-reconciliation.ts
```

The pre-recut exact product head passed 15 portfolio tests, 74 Control Room
tests, all 9 mobile Chromium journeys, and the complete repository gate: 893
passed, 1 explicitly configured skip, 0 failed, with 20,744 assertions. The
0048 exact head must replay the delegated acceptance before integration.

## Review and uncertainty

Independent review first rejected the candidate because project nodes and
milestone containment were absent. The corrected product head received
`APPROVE`. Public deployment remains unobserved because Cloudflare rejects the
current operator-owned Actions credential; no deployment success is claimed.

## Completion state

Implementation, local product verification, independent correction review,
and contract recut are complete. Protected exact-head checks and merge remain
the integration boundary.
- 2026-08-02: Historical lifecycle heading migrated verbatim from the pre-migration plan:
  # Completed plan 0048: PBK Control Room acceptance reconciliation
