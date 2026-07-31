# Active plan 0029: Control Room pinned Alchemy workspace

Canonical contract:
[`design-specs/0029-control-room-pinned-alchemy-workspace.md`](../../design-specs/0029-control-room-pinned-alchemy-workspace.md).

Status: correction candidate; provider observation pending

Owner: primary Semantic Systems lead

## Owned paths

- `.github/workflows/control-room-alchemy-trusted.yml`
- `apps/control-room/tooling/workflow-safety.test.ts`
- the 0029 design, plan, model, acceptance, and generated views

## Execution

1. Preserve the failed 0028 run as evidence.
2. Compare the foreign `bunx` output with the pinned workspace CLI.
3. Bind deploy and cleanup to the workspace binary.
4. Add credential-presence and command-order regression checks.
5. Run exact local and GitHub gates.
6. Merge and observe exact public bytes.

## Evidence ledger

- 2026-08-01: trusted run `30669154533` used empty credential values. Its
  provider command emitted only dependency-resolution output, then exited zero.
  The observer correctly returned `DeploymentUnknown`.
- 2026-08-01: the pinned workspace Alchemy 2.0.0-beta.64 help contains
  `--yes` and declares flags before the optional main entrypoint. Root `bunx`
  was therefore outside the intended package boundary.
- 2026-08-01: the repository's two required GitHub credential entries were
  provisioned from existing operator-owned app-deploy custody without printing
  their values.

## Acceptance command

```bash
bun scripts/accept/0029-control-room-pinned-alchemy-workspace.ts
```
