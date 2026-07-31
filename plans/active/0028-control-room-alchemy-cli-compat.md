# Active plan 0028: Control Room Alchemy CLI compatibility

Canonical frozen contract:
[`design-specs/0028-control-room-alchemy-cli-compat.md`](../../design-specs/0028-control-room-alchemy-cli-compat.md).
This execution record cannot redefine that contract.

Status: correction candidate; exact GitHub and provider observations pending

Owner: primary Semantic Systems lead

## Dependencies

- accepted Control Room deployment custody from 0017;
- merged PBK Control Room artifact at `ee9423a4496e92e616aad9b5719566402f132a2a`;
- pinned Alchemy 2.0.0-beta.64; and
- operator authority for the Control Room production deployment.

## Owned paths

- `design-specs/0028-control-room-alchemy-cli-compat.md`
- `plans/active/0028-control-room-alchemy-cli-compat.md`
- `model/work/control-room-alchemy-cli-compat.json`
- `.github/workflows/control-room-alchemy-trusted.yml`
- `apps/control-room/tooling/workflow-safety.test.ts`
- `scripts/accept/0028-control-room-alchemy-cli-compat.ts`
- generated project-model views affected by the work item

Forbidden: candidate code execution with provider credentials, provider-state
claims from process exit, Alchemy version changes, resource changes, DNS
changes, and edits to operator-owned `AGENTS.md`.

## Execution sequence

1. Reproduce the exact unsupported-option failure from trusted run 30666370300.
2. Inspect the pinned deploy and destroy command surfaces.
3. Remove the unsupported option from both trusted commands.
4. Add one workflow regression check covering deploy and cleanup.
5. Run focused workflow checks and the full repository gate.
6. Pass the exact feature contract and acceptance gates on GitHub.
7. Squash merge the accepted correction.
8. Observe the trusted production deployment and exact served snapshot.

## Acceptance command

```bash
bun scripts/accept/0028-control-room-alchemy-cli-compat.ts
```

## Evidence ledger

- 2026-07-31: unprivileged artifact run 30666176110 passed at merged commit
  `ee9423a4496e92e616aad9b5719566402f132a2a`.
- 2026-07-31: trusted run 30666370300 failed because Alchemy rejected `--yes`.
- 2026-07-31: pinned deploy and destroy help both omit that option.
- 2026-07-31: focused workflow safety checks pass with an added command-shape
  counterexample for both provider paths.
