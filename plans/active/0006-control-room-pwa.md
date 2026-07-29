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
- `phibkro/semantic-systems` is public after a complete-history Gitleaks and
  manual publication audit; GitHub secret scanning and push protection are
  enabled.
- GitHub Actions is enabled; GitHub Pages currently returns 404 because no site
  is configured.

## Frozen boundary decisions

- The first public view is accepted-commit near-real-time, not local-agent live
  telemetry.
- Public fields are allowlisted by a versioned schema.
- The app is a read-only projection; semantic and evidence decisions remain in
  the project model.
- The app uses Bun, React/Vite, shadcn/ui, Tailwind, React Flow, Oxlint, Oxfmt,
  stable native TypeScript 7, Vitest, and Playwright.
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
- 2026-07-29: Audited all 30 Git commits with Gitleaks 8.30.1 and a manual
  credential/private-data scan; no leaks were found.
- 2026-07-29: Made the repository public and verified GitHub secret scanning
  and push protection are enabled.
- 2026-07-29: Revised the frontend contract to the operator-selected modern
  stack.
- 2026-07-29: Corrected stale web-search information against the npm registry:
  `typescript@7.0.2` is stable and owns `tsc`; the separate native-preview
  package remains a development build. The app uses TypeScript 7 only.
- 2026-07-29: Added red-first exporter oracles for determinism, invalid kinds,
  missing identities, allowlist sentinels, digest mismatch, and exact canonical
  provenance; implemented the versioned content-addressed public snapshot.
- 2026-07-29: Implemented the phone-first React PWA with Pulse, Systems,
  Semantics, Evidence, and Work views; search, drilldown, typed relations,
  assumptions, evidence categories, source links, and explicit freshness
  states remain projections of the exported schema.
- 2026-07-29: Passed local Vitest behavior tests and mobile Chromium acceptance
  for the Pages base path, manifest/service worker, and offline last-known
  snapshot. Added final-payload scanning and an executable local acceptance
  script.
- 2026-07-29: Added a least-privilege, immutable-action Pages workflow. No
  workflow was pushed or run, no Pages site was configured, and no DNS or HTTPS
  change was made.
- 2026-07-29: Clean-tree feature acceptance reached the pre-existing generated
  projection gate and reported only `generated/README.md` (`work_item` count 25
  versus canonical 26). Integration owns the single post-rebase regeneration;
  this worker left `generated/**` untouched as assigned. All independent
  canonical validation, Python, exporter, frontend, payload-scan, production
  build, and mobile Playwright gates passed.

## Decisions and deviations

- This independent tooling frontier may proceed alongside semantic checker and
  source-custody work after its public query contract is frozen.
- Custom-domain setup is completion item 9 but cannot weaken or block the
  default Pages artifact if external DNS/account state is unavailable.

## Completion state

Local implementation complete pending clean-tree full acceptance and
independent review. Default Pages deployment, phone observation of the deployed
URL, and `semantic.phibkro.org` DNS/HTTPS remain external work. Complete only
when items 1–8 pass against accepted `main`, the independent review is resolved,
the default site is usable from a phone, and custom-domain state is either
verified or recorded as the remaining external blocker.
