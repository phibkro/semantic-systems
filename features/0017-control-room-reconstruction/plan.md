---
format: semantic.feature-artifact/v1
feature_id: 0017-control-room-reconstruction
kind: plan
---
# Plan 0017-control-room-reconstruction: Control Room reconstruction

Canonical frozen contract:
[`design-specs/0017-control-room-reconstruction.md`](../../design-specs/0017-control-room-reconstruction.md).
This mutable execution record cannot redefine that contract.

Owner: primary Semantic Systems lead

## Dependencies

- independently observed current primary
  `135d9f2d7a53990108b77b12da8904be7b501952` at recut start;
- exact reconstruction base
  `726d315d52c2d9b7ff7f0cd817824cf8b2859a0b` and reviewed candidate
  `5c9cce2404a1da8eef2977e68e0ed733118f927e`;
- reviewed recut `86e9487b054bafdac464c1b8fb1ff4e6d5e9cdff`;
- rejected first custody correction
  `4aef39ee8f42fc993c23973a22441e084aaceaaa`;
- rejected second custody correction
  `1837fa0d2cb7a0a8506ceffa20ebd7502f1cd360`;
- independently reviewed third custody implementation
  `a72da09bdd461e298eaa1ccdcf18b9e69e341f0d`;
- accepted executable semantic-system integration and current TypeScript/Effect
  v4 project model;
- historical accepted Control Room PWA lineage
  `f3250485ebf293ee270b262abad726ecc720c937`;
- historical reviewed Alchemy correction head
  `2301780c6a4a24b1fa707ee5e893ebf96d1b814b`; and
- operator choice of Alchemy v2 over Pulumi.

No provider mutation is authorized by this plan.

## Owned paths

- `design-specs/0017-control-room-reconstruction.md`
- `plans/completed/0017-control-room-reconstruction.md`
- `scripts/accept/0017-control-room-reconstruction.ts`
- `model/work/control-room-reconstruction.json`
- generated projections derived from that model file
- `src/project-model/public-export.ts`
- focused public-export tests under `tests/`
- `apps/control-room/**`
- `.github/workflows/control-room-alchemy.yml`
- bounded root package, lockfile, TypeScript, Nix, lint, and Just changes
  required to compose the app

Forbidden paths and meanings include changing canonical theory/resolution,
inventory, actor, STM, semantic-system, evidence-strength, or scheduler
semantics; restoring Python or shell programs; editing generated views by hand;
copying the old branch wholesale; adopting the Cloudflare zone; provider
apply/destroy; writing GitHub secrets; and unrelated repository cleanup.

## Implementation posture

- Search current project-model, Effect v4, command-runner, lint, workspace, and
  Just patterns before writing infrastructure.
- Use Git archaeology as the scaffold: selectively reconstruct accepted UI and
  deployment behaviors from the three commit-bound historical sources named by
  the contract.
- Record every reused file family and material semantic adaptation. The
  historical source is this same repository; no external code may silently
  define project semantics.
- Replace the Python exporter with one TypeScript/Effect public-export module
  over the current decoded project model. Do not transliterate obsolete
  implementation structure.
- Reuse exact `alchemy@2.0.0-beta.64` behavior initially. Keep Alchemy
  description, operator administration, and workflow event routing separate.
- Add only the shadcn source components actually used by the accepted journey.
- Automate deterministic build/export/payload checks; stop before provider
  deployment, generic scaffolding, a live control plane, or UI redesign.

## Execution sequence

1. Freeze this reconstruction contract, plan, canonical work item, and
   intentionally red TypeScript acceptance.
2. Reconstruct public-schema oracles against the current project-model
   boundary.
3. Implement the minimal TypeScript/Effect allowlist exporter.
4. Selectively reconstruct the PWA shell, five views, freshness/update state,
   and browser oracles.
5. Reconstruct pure deployment identities, Alchemy memo/stack, and static
   workflow safety checks without provider mutation.
6. Run exact local acceptance and full repository integration at a clean head.
7. Commission independent adversarial review and correct rejected heads.
8. Integrate the exact accepted candidate and record user-interactive local
   preview instructions.
9. With separate operator authority, inspect the exact Alchemy plan and decide
   whether to provision CI, preview, cleanup, production, and cutover.

## Acceptance command

```bash
bun scripts/accept/0017-control-room-reconstruction.ts
```

The gate fails closed on missing tools, artifacts, Chromium, public-payload
inspection, current model validation, inherited semantic acceptance, or any
attempt to substitute deployment claims for observations.

## Evidence ledger

- 2026-07-31: repository archaeology established that direct merge is unsafe:
  current primary is more than one hundred commits ahead of the common
  `e00e8f9` base, while the Alchemy branch carries ten old-lineage commits and
  Python/shell project-model programs.
- 2026-07-31: selected reconstruction rather than merge. Evaluated the
  accepted PWA, accepted Pages observation repair, and reviewed Alchemy branch
  as same-repository prior art. Their product behavior, oracles, workflow
  counterexamples, deployment parser, and memo-scope fix are reusable; their
  runtime versions, Python exporter, shell wrappers, old generated views, and
  governance are rejected.
- 2026-07-31: chose exact-pinned Alchemy v2 over Pulumi because the reviewed
  stack is Bun/TypeScript/Effect-native, expresses Vite Worker websites and
  per-stage remote state directly, and already has adversarial stage,
  credentials, cleanup, memo, and zone-ownership evidence. The beta and
  provider plan remain explicit assumptions.
- 2026-07-31: no upstream snippet has been copied and no provider operation has
  run.
- 2026-07-31: the first reconstruction candidate selectively reused the
  accepted PWA information architecture, snapshot-state vocabulary, and
  browser journey family from `f3250485`; the exact-cache repair family from
  `ff35eb2`; and stage parsing, memo-scope, cleanup, and workflow
  counterexamples from `2301780c`. It adapted those behaviors to the current
  TypeScript/Effect v4 project model and authored a new allowlisted exporter,
  custom React/CSS shell, and current workflow rather than copying the old
  Python/shell/runtime lineage.
- 2026-07-31: independent review rejected candidate `5c9cce2404a1` because a
  schema-valid cached snapshot could render before asynchronous digest
  verification, exact acceptance did not invoke the canonical full repository
  gate, same-repository PR code ran in a job that later received Cloudflare
  credentials, and this plan still described an intentionally red pre-build
  state.
- 2026-07-31: the recut persists a complete version/snapshot pair and adopts it
  only after asynchronous binding and content-digest verification. Focused
  tests include schema-valid content-forged and observation-binding-forged
  cache counterexamples.
- 2026-07-31: the recut separates the secret-free `pull_request`/main static
  artifact producer from a trusted-default-branch `workflow_run` consumer.
  The consumer validates exact same-repository provenance, one immutable
  artifact ID and server SHA-256 digest, extracts outside the workspace,
  validates a bounded static tree bound to the producer commit, and uses
  trusted Alchemy code to upload the directory as assets without importing or
  executing returned JavaScript. Cleanup likewise derives a preview-only stage
  with trusted default-branch tooling. There is no `pull_request_target`.
- 2026-07-31: this workflow split adapts GitHub's official `workflow_run`
  privilege-separation and runner-temporary artifact pattern, the official
  immutable `upload-artifact` ID/digest contract, and Alchemy v2's documented
  prebuilt assets-only `Cloudflare.Worker` interface. Sources consulted:
  `docs.github.com/actions/reference/workflows-and-actions/events-that-trigger-workflows`,
  `docs.github.com/en/rest/actions/artifacts`, the MIT-licensed
  `actions/upload-artifact` and `actions/download-artifact` documentation, and
  `alchemy.run/cloudflare/frontend/static-site/`. Only techniques and public
  interface contracts were reused; no external implementation snippet was
  copied.
- 2026-07-31: focused recut evidence before commit: Control Room Vitest
  `39/39`, pinned-Nix mobile Chromium `5/5`, app TypeScript build green, both
  workflow files green under Actionlint, and the built ten-file payload passed
  bounded static-tree, exact-commit, version/snapshot, SHA-256, service-worker,
  and sensitive-sentinel validation. These observations do not prove the
  privileged workflow trustworthy; they exercise the recorded counterexamples
  and static contract.
- 2026-07-31: exact acceptance now invokes
  `nix develop --command just check`; `scripts/check.ts` does not dispatch
  feature acceptance, so the composition is non-recursive. Final exact-head
  acceptance/full-gate evidence and the recut commit are recorded by the
  integrating lead after this commit is created.
- 2026-07-31: static review of exact clean head
  `86e9487b054bafdac464c1b8fb1ff4e6d5e9cdff` returned
  `CHANGES_REQUIRED`. Historical `workflow_run` and `pull_request.closed`
  assertions were sufficient to choose an artifact or stage but did not prove
  the current main ref or pull-request state before a privileged provider
  effect. A replay could roll production back, redeploy an advanced or closed
  preview, or destroy a reopened preview.
- 2026-07-31: the exact acceptance run for `86e9487b054bafdac464c1b8fb1ff4e6d5e9cdff`
  was canceled before completion because the host reached critical kernel-task
  saturation and I/O pressure. No acceptance or full-gate pass is inferred
  from that canceled run.
- 2026-07-31: `86e9487b054bafdac464c1b8fb1ff4e6d5e9cdff`
  and observed primary `135d9f2d7a53990108b77b12da8904be7b501952`
  are sibling lineages with merge base
  `726d315d52c2d9b7ff7f0cd817824cf8b2859a0b`. Integration must preserve
  primary-lineage governance changes, apply this bounded correction, and run
  the exact gate again on the resulting integrated head.
- 2026-07-31: the bounded custody correction binds the producer to exact
  workflow path `.github/workflows/control-room-alchemy.yml`, observes the
  authoritative live main ref or pull request before secret release, and
  re-observes it after the provider effect. Ref or state drift, observation
  failure, and provider failure produce `DeploymentUnknown` with reconciliation
  required rather than deployment success. Permitted local correction evidence:
  custody and workflow-safety Vitest `16/16`, including stale-main, production
  replay, advanced and closed preview, reopened cleanup, and mid-effect race
  counterexamples; owned TypeScript and plan formatting green. No Nix, exact
  acceptance, browser, full integration, provider, GitHub, secret, deployment,
  or network operation ran for this correction.
- 2026-07-31: independent rereview rejected exact clean custody head
  `4aef39ee8f42fc993c23973a22441e084aaceaaa`. Its workflow-run PR fixture
  fabricated `full_name` on GitHub's smaller Repo Ref shape; preview deploy and
  cleanup used different concurrency groups for the same stage; provider exit
  plus unchanged GitHub state was mislabeled `DeploymentObserved`; preview
  wording consequently overclaimed deployment; and an outer job timeout could
  prevent post-effect uncertainty from being materialized.
- 2026-07-31: pinned
  `@octokit/openapi-webhooks-types@12.1.0` evidence records workflow-run PR
  base/head Repo Ref objects as `id`, `name`, and `url`, while the event and
  workflow-run repository objects carry `id` and `full_name`. The second
  correction therefore treats the event repository ID as authoritative and
  validates smaller PR references by repository ID and their available pinned
  fields.
- 2026-07-31: the second correction reuses the pure deployment URL parser and
  public version/snapshot validators. Provider exit and stable GitHub state
  remain `DeploymentUnknown` unless a bounded no-store HTTPS probe observes
  exact served version and snapshot bytes matching the digest-custodied
  artifact, its commit, and its content digest. The post-effect observer also
  re-observes the immutable GitHub artifact digest and revalidates the bounded
  extracted tree before accepting that served observation. Cleanup reports
  `RemovalObserved` only for an explicit 404/410 from the exact preview URL;
  timeout, DNS failure, redirects, and a still-served response remain
  reconciliation-required unknowns.
- 2026-07-31: preview deploy and cleanup now share the exact
  `control-room-alchemy-p<PR>` concurrency group, with cancellation disabled.
  This serializes provider jobs for one stage but does not make GitHub PR state
  and served Cloudflare state atomic, guarantee queued-job order, prevent a
  later reopen, or prove lasting removal. A reopen observed during the effect
  makes the result unknown; a reopen after the final observations remains
  unknowable to that completed run and requires a later reconciliation event
  or operator observation.
- 2026-07-31: provider commands have explicit 15-minute deploy and 8-minute
  cleanup bounds inside 30-minute and 20-minute jobs, reserving time for
  post-effect observations. Permitted focused evidence: custody and
  workflow-safety Vitest `21/21`, owned formatting green, and diff check green.
  The first focused run exposed only a shared-object alias in the new schema
  fixture; separate schema-faithful base/head Repo Ref fixtures corrected it,
  after which the same focused gate passed. No Nix, exact acceptance, browser,
  full integration, provider, GitHub, secret, deployment, or network operation
  ran for this correction.
- 2026-07-31: independent rereview rejected exact clean custody head
  `1837fa0d2cb7a0a8506ceffa20ebd7502f1cd360`. Its provider, artifact, and
  GitHub observations ran concurrently, so GitHub state was not necessarily
  the final observation; its production concurrency group could be selected
  from an incidental non-triggering pull request; its provider bounds did not
  bound preceding steps; post-effect GitHub fetches had no abort timeout; and
  this ledger did not identify the exact second correction.
- 2026-07-31: exact third custody implementation
  `a72da09bdd461e298eaa1ccdcf18b9e69e341f0d` sequences served/provider and
  immutable artifact observations before the final authoritative GitHub target
  observation. Focused adversarial readers change the PR head or reopen the PR
  during earlier observations and require the final result to remain
  `DeploymentUnknown`.
- 2026-07-31: the third correction branches concurrency on
  `workflow_run.event`, so a push selects production independent of incidental
  matching pull requests, while preview deploy and cleanup retain the same exact
  `control-room-alchemy-p<PR>` group. All GitHub fetches have bounded abort
  signals. Per-step bounds cap deploy pre-effect work at 41 minutes in a
  50-minute job and cleanup pre-effect work at 30 minutes in a 35-minute job,
  leaving tested post-effect headroom. Runner cancellation and host loss remain
  outside these workflow-level timing guarantees and require external
  reconciliation.
- 2026-07-31: permitted focused third-correction evidence before commit:
  custody and workflow-safety Vitest `24/24`, owned Oxfmt, severe Oxlint, app
  tooling TypeScript diagnostics, and diff check green. No Nix, exact
  acceptance, browser, full integration, provider, GitHub, secret, deployment,
  or network operation ran for this correction.
- 2026-07-31: independent review of exact clean head
  `a72da09bdd461e298eaa1ccdcf18b9e69e341f0d` found no code or workflow defect.
  It rejected only the plan's `THIRD-CORRECTION-COMMIT-PENDING` marker because
  exact lineage was not yet recorded. The current change is the plan-only
  follow-up that binds the third implementation exactly; as a commit cannot
  self-reference its own hash, this follow-up is described by role and remains
  under review rather than inventing another hash placeholder.
- 2026-07-31: no provider plan/apply/destroy, Cloudflare/DNS mutation, GitHub
  secret mutation, push, pull request, preview, or production operation ran
  during reconstruction or recut.
- 2026-07-31: independent review accepted the exact implementation lineage
  through `3af60bc6fce579dcc1eb3a7931a180e308513243`. The reconstruction was
  integrated at `26a7625ad4fdd5538efdbec3f28eaa7e0885c38a`. Exact acceptance and
  the full pinned repository gate passed on the integrated lineage.
- 2026-07-31: the operator later authorized a public production deployment.
  The scanned static artifact built from
  `f461cb38960493c044459c58374d6d1aa12bda3b` was observed at
  `https://semantic.phibkro.org` with exact version and snapshot bytes. This
  observation records one served artifact; it does not claim continuing
  availability or replace the deployment workflow's reconciliation rules.
- 2026-08-02: Historical leading status migrated verbatim from the pre-migration plan:
  Status: contract frozen; first reviewed candidate
  `5c9cce2404a1da8eef2977e68e0ed733118f927e` received `CHANGES_REQUIRED`;
  recut `86e9487b054bafdac464c1b8fb1ff4e6d5e9cdff` also received
  `CHANGES_REQUIRED`; first custody correction
  `4aef39ee8f42fc993c23973a22441e084aaceaaa` received `CHANGES_REQUIRED`;
  second custody correction `1837fa0d2cb7a0a8506ceffa20ebd7502f1cd360`
  received `CHANGES_REQUIRED`; third custody implementation
  `a72da09bdd461e298eaa1ccdcf18b9e69e341f0d` received no code or workflow
  finding, but its pending ledger marker was rejected; this plan-only exact-ledger
  follow-up is awaiting review and sibling-lineage integration
