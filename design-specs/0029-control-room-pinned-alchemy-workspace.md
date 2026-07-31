# Design spec 0029: Control Room pinned Alchemy workspace

Status: frozen for the exact trusted-workflow correction

Date: 2026-08-01

Depends-On-Feature-IDs: 0017-control-room-reconstruction,
0021-pbk-portfolio-control-room, 0028-control-room-alchemy-cli-compat

Migrates-Feature-IDs: 0028-control-room-alchemy-cli-compat

Design-Lens-Version: open-semantic-system-v1

## Problem

Feature 0028 removed `--yes` after a trusted run rejected it. The next run
showed that the workflow was invoking root-level `bunx`, which resolved a
different Alchemy package instead of the app's pinned workspace dependency.
The trusted job also received empty Cloudflare credential values. The foreign
tool exited successfully without changing the served Control Room, and the
post-effect observer correctly returned `DeploymentUnknown`.

The workflow must invoke the exact installed workspace binary, use that
binary's documented option order, and reject an empty credential boundary
before it can report a provider-process outcome.

## Felt journey

A trusted main artifact reaches the provider step. The step first confirms
that both required credential values are present. It then invokes the Alchemy
binary installed for `apps/control-room`, with flags before the stack
entrypoint. The provider result remains intermediate. Deployment is complete
only when the existing observer reads the expected public bytes and live
target.

## Open semantic system design lens

### Boundary and warranted state

Feature 0029 owns the executable selected for trusted deploy and cleanup, the
command order, empty-credential preflight, regression checks, and this
correction record. It does not own credential values, Cloudflare state,
artifact bytes, DNS, or deployment observation semantics.

The package lock warrants which Alchemy package is installed. A root-level
package runner does not warrant that it selected that package. A nonempty
credential check warrants only presence, not validity or scope.

### Semantic inputs and outputs

Inputs are the accepted artifact custody receipt, exact stage, pinned workspace
installation, and two provider credentials. The provider step emits a bounded
process outcome. The existing observer emits the final deployed, unknown, or
failed observation.

### Effects and uncertainty

No provider request occurs when either credential is empty. A present but
invalid credential can still fail inside Alchemy. A successful Alchemy exit can
still lead to `DeploymentUnknown` until public bytes and target state agree.
There is no automatic retry.

### Bounded resources

Deploy retains its 15-minute outer bound. Cleanup retains its 8-minute outer
bound. Both retain a 60-second termination allowance, stage serialization, and
reserved observation time.

## Executable contract

```text
Trusted deploy :=
  nonempty provider credentials
  + apps/control-room workspace Alchemy binary
  + deploy flags before tooling/deploy-static.run.ts
  + bounded provider process
  + existing served-state observation

Trusted cleanup :=
  nonempty provider credentials
  + apps/control-room workspace Alchemy binary
  + destroy flags before alchemy.run.ts
  + bounded provider process
  + existing absence observation
```

## Counterexamples

1. Root-level `bunx alchemy` can resolve a package outside lockfile custody.
2. Flags after the entrypoint can be interpreted by a different command shape.
3. Empty credential values can let a foreign tool exit without a provider
   request.
4. A successful process without matching served bytes remains unknown.
5. Candidate code still cannot receive provider credentials.

## Acceptance

Feature 0029 is accepted when one clean head:

1. invokes Alchemy through `bun run --cwd apps/control-room alchemy`;
2. contains no trusted `bunx alchemy` invocation;
3. checks both required credential values before deploy and cleanup;
4. places stage and confirmation flags before the stack entrypoint;
5. preserves custody, serialization, bounds, and post-effect observation;
6. passes the focused workflow checks and the accepted Control Room gate; and
7. produces an exact served production observation after merge.

The exact local command is:

```bash
bun scripts/accept/0029-control-room-pinned-alchemy-workspace.ts
```

## Non-goals

- Changing Control Room content, Cloudflare resources, DNS, or Alchemy version.
- Printing, storing, or returning provider credential values.
- Treating credential presence or process exit as deployment.
- Adding retries or widening provider authority.

## Semantic diff

Trusted deploy and cleanup now select the lockfile-owned Alchemy executable and
fail closed on an empty keyring. Feature 0029 supersedes feature 0028's command
surface conclusion while preserving its evidence as the observation that
revealed the wrong executable boundary.
