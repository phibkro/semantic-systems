---
format: semantic.feature-artifact/v1
feature_id: 0049-canonical-work-lifecycle
kind: plan
---
# Plan 0049-canonical-work-lifecycle: canonical work lifecycle

Canonical contract: [`design-specs/0049-canonical-work-lifecycle.md`](../../design-specs/0049-canonical-work-lifecycle.md)

Feature base: `8902ba7cd468063ec28385265befdfc45607e5c2`

Owner: primary Semantic Systems lead

## Goal

Make `model/work` the only authority for the work lifecycle. Derive stable feature artifacts, acceptance dispatch, and lifecycle views from one typed feature record.

## Fixed boundaries

- Keep work, contract, review, evidence, question, and deployment states separate.
- Keep the project graph pure. Interpret file and process effects in Effect programs.
- Use stable paths for feature model sources, design contracts, plans, and acceptance programs.
- Preserve historical ledger text and frozen superseded contracts.
- Use no aliases or old lifecycle-path compatibility code.
- Keep operator authority for completion assertions and external effects.

## Execution slices

### Typed lifecycle module

1. Add one public project-model module for work status and feature records.
2. Add forward and changed-path inverse feature resolution.
3. Add Effect-based repository artifact validation.
4. Add deterministic lifecycle rendering and source links.
5. Integrate diagnostics with `semproj validate` and generated views.

### Canonical model migration

1. Move each feature owner to `model/work/features/<feature_id>.json`.
2. Keep non-feature work in other model documents.
3. Normalize every work status to the frozen vocabulary.
4. Migrate completion and replacement metadata without evidence upgrades.
5. Record 0001 through 0004 as the only pre-loop features.
6. Give feature 0012 one owner and keep the inventory actor distinct.
7. Move the Control Room public URL to a deployment observation.

### Stable authored artifacts

1. Move every plan to `plans/<feature_id>.md`.
2. Use lifecycle-neutral plan headings.
3. Move leading status notes into dated historical ledger entries.
4. Move the superseded 0020 contract to the stable design path.
5. Repair relative Markdown links without rewriting ledger claims.
6. Update current author instructions and the design 0005 semantic diff.

### Acceptance custody

1. Replace caller path reconstruction with canonical feature resolution.
2. Make direct, PR, range, and release modes handle non-runnable work explicitly.
3. Make only changed design declarations own range migrations.
4. Reject orphan acceptance programs.
5. Add the exact 0049 acceptance program.
6. Replay the complete model-aware release set.

## Integration order

1. Land the frozen contract and this plan.
2. Integrate the model migration and stable authored artifacts.
3. Integrate the typed lifecycle module and command callers.
4. Regenerate canonical views.
5. Run the exact feature, range, release, and repository gates.
6. Commission independent exact-head review.
7. Record the final evidence and completion transition in this ledger and the canonical model.

## Acceptance evidence

The exact acceptance gates are:

```text
bun run semproj -- validate
bun run semproj -- generate --check
just accept 0049-canonical-work-lifecycle
bun scripts/run-feature-acceptance.ts --mode range --base 8902ba7cd468063ec28385265befdfc45607e5c2 --head <exact-head>
bun scripts/run-feature-acceptance.ts --mode release
just check
```

The acceptance report must include command results, counts, revisions, unrun checks, assumptions, and unsupported claims.

## Completion blocker

The lifecycle code and canonical migration integrated at
`451361f6fa1cf10b6a13b988cb288f1439c9a4d0`. Stable artifact resolution,
acceptance dispatch, typed completion evidence, and deterministic lifecycle
projections are implemented.

The feature remains `in_progress`: frozen acceptance criterion 14's stable-plan
instruction is still unmet because the preserved operator-owned `AGENTS.md`
content prescribes `plans/active/`. Its one-record completion instruction is
already correct. This work has no UI preview surface.

## Evidence ledger

- 2026-08-02: the operator selected the canonical-model architecture. Plan frontmatter was rejected as a second lifecycle authority.
- 2026-08-02: the first independent review found five Critical and eight Important contract defects. The contract added typed evidence, exact changed-path selection, pre-loop records, link checks, and model-aware release dispatch.
- 2026-08-02: the second independent review found a range migration-ownership collision. The contract made unchanged declarations inert and required actual range replay.
- 2026-08-02: focused independent rereview reported `READY`. No Critical or Important contract findings remain.
- 2026-08-02: exact replay at
  `01117e844d6367f722a57f308e9a3be00f433b79` passed. Direct acceptance ran
  63 lifecycle tests/515 assertions and 145 reference-custody tests/607
  assertions, validated 23 sources and 137 entities/190 relations with zero
  errors and one disclosed unsupported-claim warning, and checked all nine
  generated views. Range replay selected the canonical 0049 migration owner
  and passed. Release replay passed 18 runnable managed features, classified
  four pre-loop features and one superseded managed feature as non-runnable,
  and failed none; its integration loop
  passed 670 tests/17,145 assertions plus typecheck, Effect diagnostics, severe
  lint, formatting, commit policy, and native Nix source-invariant checks.
- 2026-08-02: independent full implementation review of the staged tree later
  committed as `451361f6fa1cf10b6a13b988cb288f1439c9a4d0` reported `ACCEPTED`
  with no Critical or Important findings. It explicitly disclosed the unmet
  operator-owned `AGENTS.md` part of acceptance criterion 14.
