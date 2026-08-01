# Active plan 0031: Control Room interactive skill tree

Canonical frozen contract:
[`design-specs/0031-control-room-interactive-skill-tree.md`](../../design-specs/0031-control-room-interactive-skill-tree.md).
This execution record cannot redefine that contract.

Status: accepted on exact local head; publication pending

Owner: primary Semantic Systems and PBK Technologies portfolio lead

## Dependencies

- accepted 0017 phone-first Control Room custody boundary;
- merged 0021 PBK portfolio model and UI candidate;
- merged 0030 Semantic main `695aefa`;
- installed TypeScript 7, Bun, Effect v4, React 19, React Compiler, Tailwind,
  shadcn with Base UI, XState, Playwright, and Axe; and
- official React Flow layout and accessibility guidance.

Production deployment is downstream and currently unavailable because the
configured provider credential returns an authentication error. Local product
work and unprivileged static-artifact CI remain unblocked.

## Owned paths

- `design-specs/0031-control-room-interactive-skill-tree.md`
- `plans/active/0031-control-room-interactive-skill-tree.md`
- `model/work/control-room-interactive-skill-tree.json`
- bounded current-state additions in `portfolio/**`
- `apps/control-room/src/roadmap-model.ts`
- `apps/control-room/src/roadmap-model.test.ts`
- `apps/control-room/src/components/roadmap/**`
- `apps/control-room/src/portfolio-ui-machine.ts`
- bounded Roadmap integration in `apps/control-room/src/Portfolio.tsx`
- focused component and Playwright journeys
- `apps/control-room/package.json`, root lockfile, and maintained React Flow
  stylesheet import
- `scripts/accept/0031-control-room-interactive-skill-tree.ts`
- derived generated project views

Forbidden: changing 0017 snapshot custody or deployment workflows; provider
mutation; changing portfolio dependency, readiness, priority, or evidence
meaning; editing operator-owned `AGENTS.md`; adding a time axis; adding
`useEffect`; or adopting a second canonical store.

## Implementation posture

- Derive one deeply immutable roadmap model before rendering.
- Reuse 0021 saved-view interpreters and existing work detail.
- Keep `requires`, `contains`, and project membership orthogonal.
- Preserve both saved-view source identities and query diagnostics; reject
  unsupported selected containment topology through a typed failure.
- Use deterministic fixed lanes and coordinates; React Flow renders but does
  not own layout or data.
- Keep guarded focus and selection in the existing XState UI actor; invalid
  identities and view-inapplicable events leave its snapshot unchanged.
- Use Tailwind, shadcn, Base UI, OKLCH tokens, and the maintained React Flow
  base stylesheet. Add no feature-specific global CSS.
- Retain an ordered semantic HTML path for keyboard and assistive technology.
- Add current Semantic work and exact accepted artifacts as a vertical product
  slice, not as inferred repository synchronization.

## Execution sequence

1. Freeze contract, plan, model item, active portfolio row, and red acceptance.
2. Add React Flow through the workspace package boundary.
3. Implement and independently property-test the pure roadmap model.
4. Extend the XState focus and selection transitions.
5. Implement the read-only skill-tree renderer and visible ordered navigation
   without duplicate semantic canvas tab stops.
6. Implement project and milestone semantic-zoom Mosaic over the same model.
7. Integrate current Semantic work, artifacts, relations, and receipts.
8. Add component, phone Playwright, keyboard, and Axe journeys.
9. Run focused app checks, 0017/0021 regression, static scan, and full gates.
10. Commission revision-pinned review and correct every finding.
11. Publish and merge only after exact hosted acceptance passes.

## Acceptance command

```bash
bun scripts/accept/0031-control-room-interactive-skill-tree.ts
```

## Evidence ledger

- 2026-08-01: exact main inspection found that 0021 derives dependency depth
  but `Portfolio.tsx` ignores it and renders a flat grid plus edge ledger.
- 2026-08-01: Mosaic groups by project and filters to one project, but has no
  milestone/feature hierarchy or cross-mode selected-identity continuity.
- 2026-08-01: focused 0021 portfolio-model tests passed 9 tests with 8,216
  assertions before contract freeze.
- 2026-08-01: live `semantic.phibkro.org` served pre-portfolio commit
  `9b7ef6c`; the current main deployment passed provenance and payload gates but
  the provider rejected its configured credential. This is recorded as an
  unavailable deployment observation, not a product-code failure.
- 2026-08-01: official React Flow guidance confirms maintained fixed-layout,
  focusable node/edge, keyboard, screen-reader, zoom, and pan primitives. The
  product retains a separate ordered HTML navigation path.
- 2026-08-01: independent review of frozen commit `523448c` found that the
  initial contract assumed a containment tree the base portfolio decoder does
  not warrant, discarded query diagnostics, underspecified invalid XState
  events and keyboard ownership, and could pass without feature-specific
  tests. The frozen contract now requires typed topology rejection, preserved
  source diagnostics, guarded transitions, one visible ordered path, iterative
  bounded layout, and exact feature-owned acceptance artifacts.
- 2026-08-01: exact implementation head `264e34e` passed 16 focused model,
  component, and XState tests; 9 phone Chromium journeys including the exact
  pointer, keyboard, Mosaic, and Axe paths; 703 Bun tests with one intentional
  optional-oracle skip and 17,601 assertions; 68 Python tests; TypeScript 7;
  Oxlint; Oxfmt; production builds; public-payload scans; project-model checks;
  and the canonical full gate in the pinned environment.
- 2026-08-01: revision-pinned review rejected `7b1a5fd` for a render-time typed
  failure escape, undirected highlight traversal, missing spoken dependency
  direction, inherited recursive graph projection, and ambiguous Mosaic
  relation custody. Corrected head `264e34e` preserves typed projection
  failure, walks prerequisite and unlock directions independently, speaks the
  relation, derives the bounded graph iteratively, requires equal traversal
  declarations, and was approved with no release-relevant findings.

## Review disposition

- Every visual dependency preserves `prerequisite -> dependent` while the
  authored relation remains `dependent requires prerequisite`.
- Focus changes information density without changing canonical membership.
- Pointer and ordered keyboard paths reach the same work detail; dependency
  direction is visible and spoken.
- React Flow receives fixed derived values and gains no mutation or semantic
  authority.
- Invalid selected containment is a typed roadmap rejection and does not make
  the surrounding portfolio unavailable.
