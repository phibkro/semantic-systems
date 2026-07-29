# Design spec 0006: Semantic Systems Control Room PWA

Status: frozen for implementation

Problem owner: operator and main research/integration agent

Frontier: read-only project observability and public-safe deployment

Revision 2026-07-29: the operator explicitly made the repository public after
the initial freeze. The privacy boundary is therefore the allowlisted product
projection versus arbitrary repository, build, agent, and operator context;
repository visibility itself is no longer frozen as private.

Revision 2026-07-29 after independent rejection: observation provenance is now
part of the public contract. A snapshot identifies itself as either a
`local_preview` or a `main_ci_assertion`. The latter is a publisher assertion,
not authenticated provenance or proof of acceptance; the official Pages origin
and exact GitHub Actions deployment run remain separate runtime observations.
The wrapper rejects accidental local use but is not an authority boundary.
Mutable version and snapshot data must remain network-observable rather than
service-worker precached. Pulse reports completed work identities without
inventing chronology that the canonical model does not contain.

## User journey

From a phone, the operator opens or installs the Semantic Systems Control Room
and sees which semantic components exist, which contracts and realizations
connect them, which claims are supported or unsupported, which work is ready or
blocked, and whether the displayed state is current. Selecting any item reveals
its typed relations, provenance, evidence category, assumptions, and canonical
source link.

The first deployment is a GitHub Pages PWA generated from accepted `main`
commits in the public `phibkro/semantic-systems` repository. Its preferred
custom address is `semantic.phibkro.org`.

## Falsifiable claim

A public-safe, installable PWA can project the canonical project graph and
accepted control state without becoming a second source of truth, leaking
non-product build or operator context, or representing a stale snapshot as
live.

The claim is falsified if:

- a displayed semantic or work fact cannot be traced to an exported canonical
  identity and exact commit;
- the public artifact contains a field or file outside the explicit export
  schema;
- a canonical change does not alter the derived snapshot deterministically;
- invalid canonical input publishes a repaired or partial snapshot;
- offline or stale data is displayed without a visible state marker;
- the browser can mutate project state; or
- the PWA describes local, uncommitted, or agent state as current.

## Frozen deep-module contract

### Authoritative inputs and derived outputs

The canonical inputs remain:

- `model/**/*.json`;
- accepted evidence and claim records referenced by that model;
- exact Git commit and CI observation metadata.

The exporter produces a versioned, deterministic public read model. The web
client reads only that model. It does not parse canonical files, reimplement
semantic rules, infer evidence strength, or own status.

```text
canonical graph + exact accepted observation
-> validated public exporter
-> content-addressed snapshot
-> static PWA projection
```

Every exported node and relation includes its canonical identity. Source links
bind to the exact Git commit. Volatile observations include observation time,
subject commit, observation source, and freshness policy and remain
distinguishable from durable model facts. The exporter derives work readiness
and blockers through the canonical scheduler rather than recreating those
rules.

### Public export boundary

Public output is allowlisted by schema, not produced by recursively serializing
arbitrary entity attributes. The initial schema may expose:

- entity identity, kind, public name, public summary, status, and safe tags;
- relation source, target, kind, and public summary;
- derived counts, ready/blocking relations, unsupported-claim identities, and
  typed evidence categories;
- exact commit, snapshot digest, generation time, and deployed-check status;
- exact-commit source URLs in the public GitHub repository.

It must not expose:

- local absolute paths;
- remote tokens, environment variables, secrets, or workflow contexts;
- agent transcripts, prompts, process metadata, or private operator notes;
- arbitrary model attributes that have not been admitted to the public schema;
- uncommitted worktree state.

Public-artifact inspection remains an acceptance gate even after the source
repository becomes public: Git history and build/runtime contexts can contain
facts that are not part of the product's public projection.

### Frontend and tooling stack

The initial application uses established, composable tools:

- Bun for package management, scripts, and the workspace runtime;
- React and Vite for the static application;
- shadcn/ui source components with Tailwind CSS for a phone-first interface;
- React Flow (`@xyflow/react`) for the optional graph canvas, paired with
  accessible lists and relation summaries;
- Oxlint and Oxfmt as the authoritative JavaScript/TypeScript lint and format
  gates;
- stable native TypeScript 7 as the authoritative type checker;
- Vitest for component and behavior tests;
- Playwright with real service workers for mobile, install/update, offline, and
  Pages-base-path acceptance.

Generated shadcn components are repository-owned source and may be tailored to
the product. Only components used by the user journey are added. The graph
library owns viewport interaction, not project semantics or application state.

### Orthogonal phone-first views

The PWA provides:

1. **Pulse** — snapshot age, commit, gate state, unsupported claims, active and
   blocked work, and completed work identities without an implied temporal
   order;
2. **Systems** — recursive components and typed relations;
3. **Semantics** — theories, refinements, effects, invariants, realizations,
   handlers, and deployments;
4. **Evidence** — claims, evidence categories, assumptions, obligations, and
   unsupported claims;
5. **Work** — dependencies, ready frontier, active contracts, gates, and
   completion state.

The graph canvas is one view, not the navigation model. Lists, search,
filters, drill-down, and accessible relation summaries remain usable on a
small screen and without relying on color alone.

### Freshness, update, and offline behavior

GitHub Pages represents accepted committed state, not local real-time state.
Every successful `main` publication creates an immutable snapshot identified by
commit and digest and marked `main_ci_assertion`. That label reports what the
publisher asserted; it gains operational support only from the separately
observed protected workflow and deployed origin. A clean exact-HEAD local
export is marked `local_preview` even when its commit is already accepted. The
installed PWA polls a small version document while online, updates atomically
when a newer complete snapshot exists, and retains the last valid snapshot for
offline use. The application shell may be precached; the mutable version
document and content snapshot may not be service-worker precached.

The interface always shows one of:

- current for commit and observation time;
- update available;
- stale beyond the declared freshness window;
- offline using last-known snapshot; or
- invalid/unavailable.

An exporter or deployment failure preserves the preceding valid deployment and
surfaces failure through CI; it does not publish a partial graph.

### Read-only authority

The public PWA has no credentials and no mutation endpoints. Links may navigate
to GitHub or durable project artifacts, but the application cannot merge,
dispatch agents, edit evidence, or change project status.

### Deployment boundary

The first publication target is GitHub Pages through a custom Actions workflow
using least-privilege `pages: write` and `id-token: write` permissions. Build
actions are pinned to immutable commits. Only accepted `main` may deploy to the
`github-pages` environment.

Publication first proves the default GitHub Pages URL. The custom
`semantic.phibkro.org` route is then configured through GitHub Pages and the
domain's canonical Cloudflare infrastructure. HTTPS must be healthy before the
custom address is reported complete.

## Oracle first: behavior inventory

### Intended behavior

- A deterministic fixture exports byte-identical snapshots for identical
  canonical inputs and commit metadata.
- Each item drills down to typed incoming/outgoing relations and exact source
  provenance.
- A model change produces a new digest and the expected visible update.
- A deployed snapshot N is visibly replaced by a valid newer snapshot N+1,
  while an older or mismatched candidate cannot roll the client back.
- The PWA is installable with concrete 192px and 512px icons, works at its Pages
  base path, and can load its last valid snapshot offline.

### Minimal rejections

- An unknown entity or relation kind makes export fail.
- A relation to a missing identity makes export fail.
- A non-allowlisted field does not appear in the public artifact.
- A snapshot whose digest does not match its version document is rejected.

### Adversarial behavior

- Secret-shaped sentinel values placed in arbitrary attributes, CI metadata,
  and local paths never reach the public artifact.
- An invalid new snapshot cannot replace a cached valid snapshot.
- Out-of-order version responses cannot roll the client back.
- A cache hit cannot turn a failed build into a successful verdict.
- Offline data, delayed deployment, and failed refresh never appear current.
- Graph labels and summaries cannot inject executable HTML or script.

Every oracle must first fail for the intended semantic reason, not merely
because the fixture crashes or the application is absent.

## Permitted implementation scope

- a versioned public snapshot schema and exporter under the project-model
  boundary;
- a Bun/Vite/React app under `apps/control-room/`;
- deterministic exporter, UI, PWA, accessibility, and public-artifact tests;
- a Pages build/deploy workflow and feature acceptance script;
- canonical model, generated views, documentation, and completion records for
  this feature;
- custom-domain configuration after the default deployment passes.

## Frozen boundaries

- canonical entity/relation and evidence meanings;
- compiler, runtime, resolver, and theory semantics;
- public repository visibility does not make arbitrary fields part of the
  product projection;
- public deployment remains read-only;
- no local-agent telemetry in the first public slice;
- no arbitrary graph database or second mutable status store.

## Acceptance

1. The public exporter rejects invalid canonical input and produces a stable,
   schema-valid, content-addressed snapshot from valid input.
2. Public-artifact tests prove allowlisting with secret/path/script sentinels.
3. Unit and integration tests encode the intended, rejection, boundary, and
   adversarial behavior inventory above.
4. The phone viewport exposes all five views with search, filters, drill-down,
   provenance, and accessible non-color status.
5. The manifest, icons, service worker, base paths, update flow, and offline
   last-known snapshot pass browser-level acceptance, including a real
   deployment N-to-N+1 update and rollback rejection.
6. The visible UI reports exact commit, digest, observation time, freshness,
   evidence categories, assumptions, and unsupported claims without upgrading
   their meaning.
7. CI builds the artifact from the exact accepted commit and scans the final
   Pages payload before deployment.
8. The default GitHub Pages URL works on a clean phone browser and as an
   installed PWA.
9. `semantic.phibkro.org` resolves to that deployment with healthy HTTPS, or is
   recorded as a separate external deployment blocker without weakening items
   1–8.
10. An independent reviewer searches for information leaks, stale-as-live
    states, accessibility failures, and a second-source-of-truth path.

## Evidence

- deterministic exporter and UI tests: `example_test`;
- schema, type, lint, and forbidden-data checks: `static_analysis`;
- browser/PWA and deployed URL checks: `runtime_validation`;
- independent security/semantic review: `assertion`;
- no proof, universal secrecy guarantee, or live-local-state guarantee is
  claimed.

## Kill criteria

Stop publication if the safe export cannot be expressed as an allowlist, a
public artifact exposes private data, the client needs a repository credential,
or the first slice requires a mutable backend to be useful. Preserve the local
preview and recut the deployment boundary rather than weakening privacy or
truthfulness.

## Next uncertainty

Whether accepted-commit snapshots provide enough operator feedback, or whether
an authenticated event stream for CI and agent observations justifies a
separate private control plane.
