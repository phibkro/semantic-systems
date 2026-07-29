<!--
Design spec 0005 (autonomous development control loop) requires every
nontrivial feature PR to carry these fields as its durable completion
report. Trivial formatting/typo/generated-refresh/maintenance changes may
omit sections that do not apply, but must say so explicitly rather than
deleting them silently.
-->

## Design spec and semantic claim

<!-- design-specs/<id>-<slug>.md and its falsifiable claim -->

## User-visible preview

<!-- one reproducible preview command and the expected observation -->

```bash

```

## Semantic diff

<!-- what changed in meaning, not just in files -->

## Checks run on this exact PR head

<!-- exact commands and their results; the tested SHA must match the PR head -->

- [ ] `nix develop --command ./scripts/check-fast.sh`
- [ ] `nix develop --command ./scripts/check.sh`
- [ ] `nix develop --command ./scripts/accept/<id>-<slug>.sh`
- [ ] `nix flake check`

## Evidence categories and artifacts

<!-- runtime_validation / static_analysis / example_test / assertion, with links -->

## Assumptions and unsupported claims

## Independent reviewer / counterexamples considered

## Deviations and next uncertainty

## Cleanup

<!-- Herdr tab, worktree, and branch status once this merges -->
