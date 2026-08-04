---
format: semantic.feature-artifact/v1
feature_id: 0017-control-room-reconstruction
kind: specification
legacy_entity_id: work.control-room-reconstruction
---
# Design spec 0017: Control Room reconstruction

Status: frozen for implementation

Date: 2026-07-31

Design-Lens-Version: open-semantic-system-v1

## Problem

The accepted Control Room PWA and its reviewed Alchemy v2 deployment control
plane exist only on the obsolete GitHub-main lineage rooted at `e00e8f9`.
Today’s accepted Semantic Systems primary is more than one hundred commits
ahead and has replaced committed Python and shell programs with TypeScript,
Bun, Effect v4, Just, and a stricter project-model boundary. Directly merging
the old branch would reintroduce a second Python model implementation,
superseded governance, stale dependencies, and unrelated history.

The operator therefore cannot yet use the most mature user-interactive
Semantic Systems artifact from the current canonical system. This feature must
reconstruct—not blindly merge—the already reviewed product behavior onto the
accepted TypeScript/Effect primary while preserving exact provenance for every
reused decision and exposing deployment as a later operator-owned effect.

## Felt journey

From a clean accepted commit, an engineer runs one Bun command and opens the
phone-first Control Room locally. Pulse reports the exact commit, snapshot
digest, generation observation, unsupported claims, completed work, and ready
frontier. Systems, Semantics, Evidence, and Work expose canonical identities,
typed relations, assumptions, and source links. Stale, offline, invalid, or
unavailable data never looks current.

The same gated artifact can be planned through an exact-pinned Alchemy v2
stack for `semantic.phibkro.org` or an isolated `p<PR>` preview. Local
acceptance performs no Cloudflare, GitHub, or DNS mutation. Applying a plan,
minting CI authority, publishing production, and destroying a preview remain
explicit operator-owned effects with separately observed outcomes.

## Open semantic system design lens

### Boundary and warranted state

The feature boundary contains a versioned TypeScript public projection under
the existing project-model component, a read-only React/Vite PWA, pure
deployment-identity parsing, an exact-pinned Alchemy v2 description, static
workflow checks, and local browser acceptance.

Canonical project JSON remains the only authored project truth. The exporter
warrants only that a validated finite model was projected through its explicit
allowlist at the recorded commit and observation source. The PWA owns
last-known-valid client snapshot state and visible freshness state; it does not
own semantic facts, work status, evidence strength, Git history, CI truth, or
Cloudflare state. Alchemy owns a desired deployment description, not the truth
that a deployment succeeded or is currently served.

Historical contracts and implementation commits are prior evidence:

- accepted PWA lineage `f3250485ebf293ee270b262abad726ecc720c937`;
- reviewed Alchemy correction head
  `2301780c6a4a24b1fa707ee5e893ebf96d1b814b`; and
- accepted historical PWA repair
  `ff35eb272c4f99e73270f659f75355a3607d182f`.

Their code may be selectively adapted with same-repository provenance. Their
Python exporter, shell acceptance, old project model, generated views, runtime
versions, and governance files are not admissible implementation sources.

### Semantic inputs

The exporter accepts validated canonical model documents, an exact full Git
commit, a strict UTC observation time, and one observation source:
`local_preview`, `main_ci_assertion`, or `pr_ci_assertion`. Those source labels
are publisher assertions and do not establish acceptance, branch protection,
successful deployment, or served-origin truth.

The browser accepts a version document and a content-addressed public snapshot.
Search text, view selection, filters, and drill-down identities are queries
over that immutable projection. Deployment planning accepts only `prod` or
`p<positive decimal pull-request number>` after exact parsing. GitHub event
payloads and Cloudflare responses are untrusted observations at their
boundaries.

### Semantic outputs

The exporter derives an allowlisted public snapshot, matching version document,
and digest. The PWA derives accessible Pulse, Systems, Semantics, Evidence, and
Work views plus explicit freshness, update, offline, invalid, and unavailable
states. These are materialized views, never canonical sources.

The deployment module derives a typed stage, exact hostname, and URL. The
Alchemy program describes a Worker website and exact custom domain. Static
workflow analysis emits diagnostics. Local acceptance emits test, static
analysis, build, payload-scan, and browser observations. No local command in
this feature emits a deployment-success event.

### Effect protocols and uncertainty

Snapshot publication is:

```text
ValidatedModelObserved(commit, source, observedAt)
  -> PublicSnapshotDerived(commit, digest)
  -> ArtifactScanned(digest)
  -> DeploymentRequested(stage, digest)
  -> DeploymentObserved | DeploymentRejected | DeploymentUnknown
```

Only the first two transitions occur in the portable exporter; deployment
request and observation belong to CI/operator interpreters. Timeout or an
Alchemy command exit does not establish that Cloudflare made no change.
Retry, reconciliation, and cleanup must inspect the exact stage and served
snapshot. Production cannot be represented as a destroyable preview target.

The PWA may retain the last digest-valid snapshot when refresh is rejected,
late, out of order, unavailable, or offline. A newer invalid candidate never
replaces it. Mutable version and snapshot data are network-observable and may
not be silently satisfied by an application-shell service-worker cache.

### Components and orthogonal structures

The TypeScript project-model loader owns canonical decoding and graph
validation. The public exporter owns allowlisting and content identity. The
PWA owns presentation and client cache state. GitHub Actions owns event
selection and credential release. Alchemy owns desired resource composition.
Cloudflare owns deployed runtime state. None may impersonate another layer.

Canonical entities become public snapshot records at an evidential boundary:
private or undeclared attributes are intentionally discarded. Snapshot records
become UI view models without changing semantic force. A deployment assertion
crosses from desired artifact identity to an outward effect request; a served
HTTPS probe returns as a separate observation.

One export/build/browser slice is finite over a finite model and terminates in
an artifact or typed failure. Client polling is an intentional persistent
process with one in-flight refresh, digest monotonicity, abort on component
unmount, and a configured interval. GitHub deploys serialize per exact stage.
Preview cleanup accepts only a parsed preview identity and terminates in
observed removal, explicit failure, or unknown state requiring reconciliation.

React component state, service-worker cache state, workflow concurrency,
Alchemy remote state, and Cloudflare Worker state are separate. No actor,
STM, or OTP guarantee is claimed. Structured concurrency applies only to
bounded local effects and browser refresh lifetime.

### Bounded autonomy and resources

Export observes a finite checked-in model once and emits one bounded snapshot.
The allowlist prevents recursive serialization of arbitrary attributes.
Browser search and filtering operate on the loaded snapshot; no background
fan-out or mutation endpoint exists. Refresh concurrency is one and invalid
responses do not accumulate retained candidates.

Local acceptance performs no provider apply, destroy, secret write, DNS
change, or repository mutation. Alchemy is pinned exactly to
`2.0.0-beta.64`; any version change requires refreshed type, plan-shape,
workflow, browser, and independent-review evidence. Effect dependencies must
use one repository-compatible v4 line rather than silently installing an
independent semantic runtime.

### Evidence, assumptions, and unsupported claims

Schema and type checks establish declared shape only. Allowlist and sentinel
tests provide bounded privacy evidence, not a universal secrecy proof.
Digest, rollback, and cache tests provide exercised behavioral evidence.
Oxlint/Oxfmt and import-domain checks provide static evidence. Bun/Node
agreement, production builds, Playwright journeys, payload scans, and exact
Alchemy dry plans are runtime observations. Independent review is an
assertion, not semantic authority.

The feature assumes the pinned browser, Bun, TypeScript 7, Effect v4, Vite,
Alchemy beta, GitHub event schema, Cloudflare API, DNS, and certificate systems
behave as observed. It does not establish successful production deployment,
continuous availability, authenticated publisher provenance, universal
privacy, branch protection, exact-once publication, or safety of an unreviewed
provider apply.

## Deep-module contract

`src/project-model/public-export.ts` is the only public-projection semantic
module. It accepts already decoded canonical model state plus exact observation
metadata and returns deeply immutable, versioned snapshot and version records
or a typed failure. It exports no filesystem, process, Git, network, browser,
React, or Alchemy authority.

`apps/control-room/` consumes only the public schema. Its application module
does not import canonical model loaders or infer readiness, evidence strength,
or unsupported claims. `src/deployment.ts` is pure and makes malformed stages
unrepresentable before Alchemy resource construction. `alchemy.run.ts`
composes the desired website; it does not mint CI authority. Any separate
operator administration stack is excluded from routine application CI and
must require an explicit administration profile.

The repository owns selectively reconstructed source. Historical same-project
code is adapted with commit provenance recorded in the plan. Upstream
dependencies and generated shadcn sources retain their licenses and version
provenance. No Python or shell program may be committed for this feature.

## Oracle-first counterexamples

- Identical validated model and metadata bytes produce identical snapshot and
  digest; a meaning-bearing public field change changes the digest.
- Unknown kinds, missing relation endpoints, invalid timestamps, abbreviated
  commits, duplicate public identities, and mismatched digest/version pairs
  reject.
- Absolute paths, secret-shaped sentinels, arbitrary attributes, prompts,
  process context, and executable HTML never reach the final artifact.
- Out-of-order, stale, invalid, and offline refreshes cannot replace a newer
  last-known-valid snapshot or appear current.
- All five views remain usable at a phone viewport with non-color status,
  search, filtering, drill-down, provenance, and accessible relation text.
- `prod`, `p1`, and a large positive PR number map exactly; `p0`, `p01`,
  `pr-1`, Unicode digits, traversal strings, suffixes, and newlines reject.
- No cleanup target can be constructed for production.
- Fork events cannot read provider secrets and `pull_request_target` is absent.
- An Alchemy memo input includes mutable public snapshot bytes, so an otherwise
  unchanged source deployment cannot silently retain stale data.
- Root-base PWA build, install, offline, N-to-N+1 update, and rollback
  rejection pass without a Pages base-path assumption.

Every oracle must first fail for the intended missing or incorrect behavior,
not merely because tooling or fixtures crash.

## Acceptance

The exact feature gate must require, from one clean head:

1. the frozen public-schema, allowlist, determinism, provenance, deployment
   identity, workflow, and Alchemy memo tests;
2. TypeScript 7 plus Effect diagnostics, severe Oxlint, Oxfmt, and dependency
   consistency;
3. deterministic public export from the current canonical model and a final
   payload scan;
4. a production root-base Vite build and mobile Playwright PWA journeys;
5. current project-model validation and all eight generated views;
6. inherited 0016 and full repository gates; and
7. independent adversarial review of semantic drift, privacy, stale-as-live
   behavior, credentials, cleanup identity, provider ownership, and reused-code
   provenance.

Provider plans are permitted read-only observations only after local
acceptance. Apply, secret provisioning, preview destruction, DNS mutation,
production cutover, and publishing remain externally authorized completion
gates and are not implied by a green local acceptance.

## Kill or redesign criteria

Stop if reconstruction requires restoring Python or shell as product source,
recursively exporting arbitrary model attributes, duplicating scheduler or
evidence semantics in React, giving the client credentials, allowing
production through a cleanup type, adopting the Cloudflare zone, sharing
mutable preview state, or granting unrelated provider authority. Stop before
apply if an exact plan cannot isolate the intended Worker, domain, and remote
state.

## Non-goals

This feature does not add live agent telemetry, a mutation API, authentication,
a database, a graph database, server-side semantic logic, a general dashboard
framework, Pulumi, provider apply, production cutover, or custom-domain
ownership. It does not redesign the accepted PWA information architecture or
change canonical semantic meanings.

## Semantic diff

This feature adds one TypeScript public-projection boundary, restores the
accepted read-only PWA journey on the current canonical lineage, adds
`pr_ci_assertion` as an explicit publisher-assertion variant, and restores the
reviewed pure Alchemy stage description. It changes no theory, realization,
resolver, evidence-strength, work-readiness, actor, STM, or semantic-system
meaning. Historical Python and shell representations are replaced, not
preserved as alternate authorities.
