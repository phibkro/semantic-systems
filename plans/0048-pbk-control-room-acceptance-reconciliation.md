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

At exact correction head `a5184fc95b59fb18832d2586456b5092c503e7e4`,
15 portfolio tests passed with 8,235 assertions, together with 73 Control Room
unit/component tests, 9 mobile Chromium journeys, model validation, nine
generated views, build/payload scans, and the inherited feature programs. Full
`just check` passed 676 tests with 17,200 assertions. These are exact-head
runtime observations for `a5184fc`; correction/rereview remains pending.

Historical pre-reassignment runtime evidence recorded 15 portfolio tests, 74
Control Room tests, 9 mobile Chromium journeys, and a complete repository gate
with 893 passed, 1 explicitly configured skip, 0 failed, and 20,744 assertions.
Those counts are historical and are not the `a5184fc` result.

## Review and uncertainty

Independent review first rejected the candidate because project nodes and
milestone containment were absent. A read-only audit accepted the corrected
implementation semantics and one-gate custody. Static rereview at `a5184fc`
accepted five of six correction items but returned `CHANGES_REQUIRED` because
the 0021 integration head was absent from its cited plan. This follow-up adds
that custody entry. These reviewer conclusions are static-analysis evidence,
not independent final acceptance. Public deployment remains unobserved because
Cloudflare rejects the current operator-owned Actions credential; no deployment
success is claimed.

## Completion state

Implementation and exact-head runtime verification are recorded. The 0048 work
item remains `in_progress` pending follow-up rereview. This record does not
claim independent final acceptance. Protected exact-head checks and merge
remain the integration boundary.

- 2026-08-02: Historical lifecycle heading migrated verbatim from the pre-migration plan:
  # Completed plan 0048: PBK Control Room acceptance reconciliation
