# Design spec 0028: Control Room Alchemy CLI compatibility

Status: frozen for the exact trusted-workflow correction

Date: 2026-07-31

Depends-On-Feature-IDs: 0017-control-room-reconstruction,
0021-pbk-portfolio-control-room

Design-Lens-Version: open-semantic-system-v1

## Problem

The Control Room artifact for merged commit
`ee9423a4496e92e616aad9b5719566402f132a2a` passed every unprivileged gate.
The trusted deployment then stopped before a provider request. Its command used
`--yes`, which pinned Alchemy 2.0.0-beta.64 does not support.

The trusted workflow needs one exact command-shape correction. It must retain
artifact custody, provider isolation, bounded execution, and post-effect
observation.

## Felt journey

A main build emits one validated immutable static artifact. The trusted
workflow verifies its origin and bytes, then invokes pinned Alchemy with the
exact stage. Alchemy accepts the command. The workflow reports deployment only
after it observes the served snapshot and current target.

Preview cleanup uses the same pinned command contract. It does not retain the
unsupported option on its less frequent path.

## Open semantic system design lens

### Boundary and warranted state

Feature 0028 owns only the deploy and destroy command shape in the trusted
workflow, its executable regression check, and this correction record. It does
not own candidate artifact bytes, secrets, Cloudflare state, DNS, Alchemy
internals, or the observation protocol.

The workflow warrants that it invoked the pinned CLI with supported declared
options. A process exit does not warrant deployment or cleanup.

### Semantic inputs

The workflow consumes:

- one same-repository workflow-run event;
- one digest-custodied static artifact;
- one explicit production or preview stage;
- trusted Cloudflare credentials; and
- the pinned Alchemy package from the exact lock file.

The event and process outcome do not establish provider state. The existing
custody and observation steps retain that authority.

### Semantic outputs

The provider step emits one bounded deploy or destroy request and one process
outcome. The later observation step emits `DeploymentObserved`,
`CleanupObserved`, or an explicit unknown or failed result under the existing
0017 contract.

The regression check emits only local test evidence. It never requests a
provider effect.

### Effect protocols and uncertainty

Deploy and cleanup remain serialized by their exact Alchemy stage. The provider
command has an outer timeout and reserves time for observation. It receives
secrets only after artifact or closed-preview custody succeeds.

The workflow performs no automatic retry. A failure or unknown outcome remains
visible for reconciliation. Removing `--yes` permits the pinned CLI to parse
the request. It does not predict or fabricate the later provider result.

### Components and orthogonal structures

```text
validated artifact + exact stage
  -> pinned Alchemy deploy command
  -> provider process outcome
  -> served snapshot and target observation

validated closed preview + exact stage
  -> pinned Alchemy destroy command
  -> provider process outcome
  -> preview absence and target observation
```

Command compatibility, artifact custody, provider mutation, and served-state
observation remain separate facts. The trusted default-branch workflow is the
only component that composes them.

### Bounded autonomy and resources

The existing deploy provider step remains bounded to 15 minutes. Cleanup
remains bounded to 8 minutes. Both retain a 60-second termination allowance
and job time for observation. The correction adds no loop, retry, fan-out,
queue, or persistent process.

### Evidence, assumptions, and unsupported claims

The failed trusted run `30666370300` is runtime evidence for the exact rejected
option. Installed `deploy --help` and `destroy --help` are package-surface
evidence. The workflow test checks both provider commands and rejects `--yes`.
Repository and GitHub gates check syntax and regression scope.

The feature assumes the pinned Alchemy package treats a noninteractive deploy
or destroy invocation as an apply request without a separate confirmation
option. It does not prove Cloudflare availability or deployment success.

## Deep-module contract

```text
TrustedDeployCommand :=
  timeout 15m
  + alchemy deploy
  + trusted static adapter
  + exact stage

TrustedDestroyCommand :=
  timeout 8m
  + alchemy destroy
  + trusted application entrypoint
  + exact stage
```

Neither command contains an option absent from the pinned CLI. Both commands
retain the existing secret scope, serialization group, and observation step.

## Oracle-first counterexamples

1. `alchemy deploy ... --yes` rejects before a provider request.
2. `alchemy destroy ... --yes` retains the same latent cleanup failure.
3. A deploy or destroy command without the exact stage rejects the contract.
4. Candidate code cannot receive provider credentials or execute in the
   trusted workflow.
5. A successful provider process without an exact served-state observation is
   not reported as deployed.
6. Removing the post-effect observation or its reserved job time fails the
   existing workflow checks.

## Acceptance

Feature 0028 is accepted when one clean head:

1. removes `--yes` from trusted deploy and destroy commands;
2. retains explicit stages and bounded provider commands;
3. adds an executable regression check for both command shapes;
4. preserves artifact custody, secret isolation, serialization, and
   post-effect observation checks;
5. passes the 0021 Control Room acceptance and full repository gate; and
6. enters Alchemy successfully in the next trusted production run, with final
   success determined by the existing served-state observation.

The exact local command is:

```bash
bun scripts/accept/0028-control-room-alchemy-cli-compat.ts
```

## Kill or redesign criteria

Stop if the pinned CLI still requires an unmodeled interactive prompt, the
correction broadens provider authority, or a command exit becomes deployment
evidence. Recut the provider adapter if future Alchemy versions expose a stable
programmatic apply API that removes CLI parsing from this boundary.

## Non-goals

- Changing Control Room content or portfolio semantics.
- Changing Cloudflare resources, DNS, credentials, or Alchemy versions.
- Replacing Alchemy with direct provider calls.
- Adding retries, rollback, remote commands, or browser mutation authority.
- Claiming deployment before served bytes and target state are observed.

## Semantic diff

Trusted Control Room deploy and cleanup commands now match the pinned Alchemy
v2 option surface. The change permits the provider request to start. All
artifact, authority, serialization, timeout, and observation semantics remain
unchanged.
