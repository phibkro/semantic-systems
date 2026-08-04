---
format: semantic.feature-artifact/v1
feature_id: 0055-lifecycle-plan-layout
kind: plan
---
# Plan 0055-lifecycle-plan-layout: lifecycle-derived plan layout

Canonical frozen contract: [`design-specs/0055-lifecycle-plan-layout.md`](../../design-specs/0055-lifecycle-plan-layout.md).
This mutable ledger records execution evidence and does not own lifecycle truth.

Feature base: `837574a`

Owner: primary Semantic Systems integration lead

## Goal

Replace the obsolete root-level plan layout with one clean status-derived layout
that matches the current operator charter and preserves canonical model authority.

## Fixed boundaries

- Derive plan location only from validated feature identity and status.
- Keep plan prose and completion claims unchanged.
- Preserve `AGENTS.md` as dirty operator-owned work.
- Add no fallback path, alias, symlink, or dual convention.
- Keep all product semantics outside work lifecycle unchanged.

## Execution slices

### Red tracer

1. Add focused lifecycle cases for active, completed, and superseded plan paths.
2. Add repository acceptance that rejects root-level and wrong-directory plans.
3. Observe the focused failure against the 0049 resolver.

### Resolver and custody migration

1. Change the existing deep module to derive the three closed lifecycle paths.
2. Move every ledger to its status-derived directory without rewriting prose.
3. Repair only relative links broken by the additional directory depth.
4. Remove authored derived fields from features 0052 through 0054.
5. Supersede 0049 with an explicit replacement and add the 0055 feature record.

### Callers and projections

1. Update exact acceptance artifact paths and changed-path selection tests.
2. Update current documentation links that name feature ledgers.
3. Regenerate deterministic views.
4. Add the exact 0055 acceptance program.

### Integration and review

1. Run the focused lifecycle suite and exact 0055 acceptance.
2. Run each newly integrated 0052 through 0054 acceptance.
3. Run release replay and `just check`.
4. Commission independent exact-head review.
5. Record typed completion evidence and move this ledger to `plans/completed/`.

## Acceptance command

```text
just accept 0055-lifecycle-plan-layout
```

## Evidence ledger

- 2026-08-02: the current `AGENTS.md` requires mutable execution state under
  `plans/active/`; the accepted 0049 resolver still derives `plans/<id>.md`.
- 2026-08-02: alternatives were rejected: moving only new plans back to the root
  violates current policy, while dual lookup creates a second convention and
  hides drift. The frozen 0055 contract selects one lifecycle-derived clean
  cutover.

- 2026-08-02: the integrating lead ran the exact 0055 acceptance program. It passed 11 focused lifecycle tests, 145 reference-custody tests, typecheck, strict lint, format, reference-source validation, project-model validation, and generated-view checks.
- 2026-08-02: `just check` at clean integration head `4b7d1c09812b0453b23779bb1e03e1134075f74c` passed 749 tests with 16,582 assertions after the completed-language frontier oracle was updated. The same command against the operator's dirty working tree fails only the reuse-first charter test because its uncommitted `AGENTS.md` edit contradicts the committed contract.
- 2026-08-02: independent exact-head review accepted the lifecycle cutover with no Critical or Important findings. It recorded three non-blocking observations: reconcile the operator's uncommitted `AGENTS.md` completion rule before it lands, tolerate a future missing empty lifecycle directory in acceptance, and optionally align one historical superseded-plan link label.

Status: accepted at integration head `4b7d1c09812b0453b23779bb1e03e1134075f74c`.