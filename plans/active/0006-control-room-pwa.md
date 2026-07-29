# Active plan 0006: Semantic Systems Control Room PWA

Canonical frozen contract:
[`design-specs/0006-control-room-pwa.md`](../../design-specs/0006-control-room-pwa.md).
This plan records execution state and must not redefine that contract.

## Semantic claim

A public-safe, installable, phone-first PWA can remain a deterministic
projection of the canonical project graph and exact accepted commit while
making stale, offline, unsupported, and unavailable state visible.

## Current repository state

- The project model already loads and validates a federated typed graph and
  generates eight Markdown/Mermaid projections.
- `component.explorer` is planned and `work.explorer-query-contract` is ready in
  the canonical model.
- The tooling specification already requires orthogonal system, theory,
  evidence, source-to-artifact, work, and deployment views.
- No public JSON export contract, web application, PWA, browser test, or Pages
  workflow exists.
- `phibkro/semantic-systems` is private; GitHub Actions is enabled; GitHub Pages
  currently returns 404 because no site is configured.
- Official GitHub documentation says private-repository Pages requires GitHub
  Pro, Team, or Enterprise and warns that Pages output is normally public.

## Frozen boundary decisions

- The first public view is accepted-commit near-real-time, not local-agent live
  telemetry.
- Public fields are allowlisted by a versioned schema.
- The app is a read-only projection; semantic and evidence decisions remain in
  the project model.
- Default Pages deployment precedes custom-domain attachment.
- `semantic.phibkro.org` is the preferred custom address.

## Implementation slices

1. Red behavior fixtures: positive, rejection, boundary, privacy, stale/offline,
   rollback, and injection cases.
2. Versioned public snapshot schema and deterministic exporter.
3. Thin PWA shell and five phone-first orthogonal views.
4. Graph/list navigation, provenance, search, and filtering.
5. Service-worker install, atomic update, offline, and freshness states.
6. Exact-commit build, payload scan, Pages workflow, and acceptance script.
7. Independent semantic/security/accessibility review.
8. Default Pages deployment, phone preview, and completion evidence.
9. Custom domain and HTTPS health gate.

Slices 1 and public-schema design precede implementation. Exporter and static
UI may proceed in separate worktrees once the schema is frozen. Deployment
serializes after the payload scan and independent review.

## Delegated work

No implementation worker has been assigned. Existing checker, reference
custody, and reference-research lanes retain their current ownership. A PWA
worker starts only when a lane is harvested or capacity is explicitly expanded.

## Acceptance commands

Exact commands will be frozen with the scaffold and must include:

```text
public exporter schema and determinism tests
privacy/sentinel payload scan
frontend unit/type/lint checks
browser-level mobile, install, update, and offline tests
project model validation and generated-view equality
feature acceptance script 0006
GitHub Pages deployment and HTTPS probe
```

## Evidence requirements

- Never classify tests or deployed probes as proof.
- Bind every build and deployment observation to exact commit and snapshot
  digest.
- Preserve unsupported claims and assumptions in the exported view.
- Record Pages/account eligibility and custom-domain health as observed
  operational facts.

## Known assumptions

- The operator intends the sanitized dashboard to be public.
- A GitHub plan supporting private-repository Pages is available; this remains
  unverified until site creation succeeds.
- Cloudflare remains the canonical DNS provider for `phibkro.org`.
- Accepted-commit freshness is initially sufficient for phone monitoring.

## Risks

- Public export leaks private attributes from a private repository.
- “Real-time” overstates accepted-commit snapshot freshness.
- Service-worker caching presents stale state as current.
- A visually impressive graph obscures actionable lists and explanations.
- Client code reimplements semantic or evidence rules.
- Pages/custom-domain setup consumes effort before the local oracle is useful.

## Kill criteria

Use the kill criteria in design spec 0006. In particular, do not publish a
recursive dump of model attributes or put a GitHub credential in the client.

## Progress log

- 2026-07-29: Operator requested a real-time visual view of systems and
  components, installable on a phone and preferably attached to
  `phibkro.org`.
- 2026-07-29: Chose GitHub Pages as the simplest first deployment and calibrated
  the first slice to accepted-commit near-real-time.
- 2026-07-29: Verified the repository is private, Actions is enabled, and Pages
  is not yet configured.
- 2026-07-29: Froze the public-export, freshness, read-only, PWA, and deployment
  boundaries before implementation.

## Decisions and deviations

- This independent tooling frontier may proceed alongside semantic checker and
  source-custody work after its public query contract is frozen.
- Custom-domain setup is completion item 9 but cannot weaken or block the
  default Pages artifact if external DNS/account state is unavailable.

## Completion state

Open. Complete only when items 1–8 pass, the independent review is resolved,
the default site is usable from a phone, and custom-domain state is either
verified or recorded as the remaining external blocker.
