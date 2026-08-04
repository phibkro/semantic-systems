# Plan 0058-feature-dossier-workflow: feature dossier workflow

Canonical contract:
[`design-specs/0058-feature-dossier-workflow.md`](../../design-specs/0058-feature-dossier-workflow.md).

## Claim and scope

Implement the stable feature dossier, receipt-derived lifecycle compiler, and
the `setup` / `check` / `verify` / `start` command contract from design spec 0058.

This feature performs a clean migration. It leaves no status-authoring JSON,
lifecycle plan moves, aliases, fallback readers, or duplicate command paths.

## Current state

- The operator approved the stable dossier and generated work-IR design.
- The operator approved bounded deterministic repair in local `check` runs.
- `done` means merged delivery. Feedback and cleanup use a separate closure queue.
- Design spec 0055 currently makes model JSON and its status canonical.
- Design spec 0005 currently assigns feature artifacts to four root-level layouts.
- Existing project-model checks enforce the old layout and require coordinated migration.

## Implementation slices

1. Add strict dossier artifact, receipt, observation, and historical-import schemas.
2. Add the pure lifecycle derivation and invalidation interpreter.
3. Generate deterministic tree-only work IR and query-time observation overlays.
4. Add bounded `mutate`, `repair`, and `observe` workflow modes.
5. Prove the complete lifecycle with a synthetic fixed-observation tracer.
6. Prepare deterministic historical imports for every migrated feature.
7. Perform one atomic cutover of paths, resolver, validators, hooks, CI, and views.
8. Run exact-head acceptance and independent review.
9. Record the post-merge delivery and closure observations.

Slices 1 and 4 can start independently after their shared types are frozen.
The compiler and synthetic tracer must pass before cutover.

The accepted cutover head must contain all new dossier artifacts and historical
imports. The same commit must replace the resolver and validators, move each
acceptance program, and remove every old reader and source. No intermediate
accepted head can contain both authority models.

## Owned paths

The implementation can change:

- `features/`;
- `justfile`;
- `src/project-model/`;
- `scripts/` and `.githooks/` workflow entrypoints;
- `.github/workflows/` repository checks;
- generated project-model views;
- lifecycle tests and fixtures;
- contributor workflow documentation;
- design spec 0005 through an explicit artifact-layout amendment;
- design spec 0055 through a supersession amendment that transfers lifecycle
  ownership, invalidates its old path acceptance, and names feature 0058;
- every feature ID in the `Migrates-Feature-IDs` declaration; and
- old feature lifecycle artifacts during the atomic clean migration.

## Frozen boundaries

The implementation must not change:

- language or theory semantics;
- evidence-category meanings;
- merge or operator-effect authority;
- reference-source custody;
- Git provider behavior; or
- telemetry authority.

## Acceptance command

```bash
just accept 0058-feature-dossier-workflow
```

Before cutover, the single acceptance program is
`scripts/accept/0058-feature-dossier-workflow.ts`.

The atomic cutover moves that program to
`features/0058-feature-dossier-workflow/accept.ts`. The resolver changes in the
same commit. Both paths never exist in one accepted head.

The exact-head integration gate remains:

```bash
just verify
```

## Evidence requirements

- Schema and lifecycle-law checks are `static_analysis` or `test`.
- Fixture and command runs are `runtime_validation`.
- Independent review is `assertion`.
- Provider observations retain provider provenance.
- A repair receipt cannot serve as exact-head verification evidence.

## Risks and kill criteria

- Migration can create dual authority during an incomplete cutover.
- Receipt schemas can become status fields with extra ceremony.
- A repair allowlist can expand into semantic code modification.
- Generated IR can become a second hand-edited source.
- Provider unavailability can be mistaken for a successful transition.
- A scalar pipeline view can hide orthogonal lifecycle facts.

Stop or recut the feature when any kill criterion in design spec 0058 occurs.

## Progress log

- 2026-08-02: The operator approved deterministic local repair for known format,
  lint, and generated-view defects. Authoritative verification remains read-only.
- 2026-08-02: The operator approved stable feature dossiers. Typed artifact
  receipts and external observations derive lifecycle views and generated work IR.
- 2026-08-02: The operator defined `done` as merged delivery. Post-merge feedback
  and cleanup remain visible in a separate closure queue.
- 2026-08-02: Adversarial review rejected the first frozen draft. Revision 1
  added migration custody, historical import, query-time observation,
  transition authority, atomic cutover, and executable acceptance boundaries.
