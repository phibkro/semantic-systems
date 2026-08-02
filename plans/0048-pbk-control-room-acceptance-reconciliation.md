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
7. Reassigned acceptance ownership under 0048 so the prior 0021 migration
   lineage is not silently reused.
8. Corrected the independent-review counterexample where a prerequisite-to-
   dependent arrow was visibly labelled as though the target required the
   source; tuple-level regression now binds source, target, `unlocks` label,
   accessible text, and authored `requires` metadata.

## Acceptance

```bash
just accept 0048-pbk-control-room-acceptance-reconciliation
```

The exact current head `46ba730521f2d2560feeff8184e8672e0a2983ed` passed
15 portfolio tests with 8,235 assertions, 73 Control Room unit/component
tests, 9 mobile Chromium journeys, model validation, nine generated views,
build/payload scans, and the inherited feature programs. Full `just check`
passed 676 tests with 17,200 assertions. These are current-head runtime
observations; correction/re-review remains pending.

Historical pre-recut runtime evidence recorded 15 portfolio tests, 74 Control
Room tests, 9 mobile Chromium journeys, and a complete repository gate with
893 passed, 1 explicitly configured skip, 0 failed, and 20,744 assertions.
Those counts are historical and are not the exact current-head result.

## Review and uncertainty

Independent review first rejected the candidate because project nodes and
milestone containment were absent. A read-only audit accepted the
implementation semantics and one-gate custody and found no Critical issue.
That reviewer conclusion is static-analysis evidence, not independent final
acceptance; correction/re-review remains pending. Public deployment remains
unobserved because Cloudflare rejects the current operator-owned Actions
credential; no deployment success is claimed.

## Completion state

Implementation and local runtime verification are recorded. The 0048 work
item remains `in_progress` pending correction/re-review. This record does not
claim independent final acceptance. Protected exact-head checks and merge
remain the integration boundary.

- 2026-08-02: Historical lifecycle heading migrated verbatim from the pre-migration plan:
  # Completed plan 0048: PBK Control Room acceptance reconciliation
