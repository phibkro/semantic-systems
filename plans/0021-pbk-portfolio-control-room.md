# Plan 0021-pbk-portfolio-control-room: PBK Technologies portfolio Control Room

Canonical frozen contract:
[`design-specs/0021-pbk-portfolio-control-room.md`](../design-specs/0021-pbk-portfolio-control-room.md).
This execution record cannot redefine that contract.

Owner: primary Semantic Systems and PBK Technologies portfolio lead

## Dependencies

- accepted Control Room 0017 integration `26a7625ad4fdd5538efdbec3f28eaa7e0885c38a`;
- authoritative Semantic primary at `f7371bf276ddd2441fe0ec0a8e093c0d82a00838`;
- accepted public snapshot freshness and content-custody boundary;
- operator naming of PBK Technologies; and
- operator choice of dependency-first Roadmap over calendar-first Gantt; and
- course-platform's bounded Any/All/Exclude/Unlabeled label algebra.

No provider or external mutation is authorized by this plan.

## Owned paths

- `design-specs/0021-pbk-portfolio-control-room.md`
- `plans/completed/0021-pbk-portfolio-control-room.md`
- `model/work/pbk-portfolio-control-room.json`
- generated project-model projections
- `portfolio/**`
- `src/portfolio-model/**`
- focused portfolio tests
- bounded `apps/control-room/**` changes
- `scripts/accept/0021-pbk-portfolio-control-room.ts`

Forbidden: changing kernel, theory, evidence, resolver, scheduler, 0017
freshness/deployment custody, provider state, adjacent repositories, or
operator-owned `AGENTS.md`; separate canonical data per view; calendar-based
roadmap fields; and browser mutation authority.

## Implementation posture

- Reuse the accepted public-snapshot, last-known-valid, phone UI, testing, and
  deployment pipeline instead of creating a second dashboard stack.
- Reuse the project model's strict decoder and immutable projection techniques,
  but keep portfolio and project authority distinct.
- Reuse Effect v4's maintained `Graph` module behind the stable-ID portfolio
  adapter and `@xyflow/react` for the accessible visual graph. PBK owns typed
  relation meaning, bounds, projections, and deterministic public identities;
  it does not own generic graph storage or canvas interaction machinery.
- Use TypeScript 7, Bun, Effect v4, Oxfmt, Oxlint, React, and existing
  Playwright. Do not commit Python or shell programs.
- Treat project heads and preview links as exact observations, not live truth.
- Keep strict JSON rows as the durable authoring store. Treat assembled JSON,
  SQL indexes, and visualization layouts as replaceable projections.
- Use labels for selection and grouping, metadata for typed predicates, and
  typed relations for dependency meaning. Do not let one impersonate another.
- Treat a work definition as inert until an evidence-backed receipt accepts its
  artifacts. A process exit or candidate output is not a realized work value.

## Execution sequence

1. [x] Commit the frozen contract, plan, canonical work item, and acceptance.
2. [x] Author bounded row-oriented PBK portfolio records and assemble one
       canonical content-addressed snapshot.
3. [x] Implement strict decoding, bounded label normalization, typed metadata
       predicates, history compatibility, and immutable projections.
4. [x] Add exhaustive small-universe tests against the course-platform label
       laws.
5. [x] Implement saved views and list, grid, graph, DAG, and semantic-zoom
       Mosaic projections over one selected identity set.
6. [x] Add shared Overview, Board, Features, Roadmap, History, and Detail views.
7. [x] Add deterministic dependency layout and an accessible phone fallback.
8. [x] Add cross-view, priority, dependency, history, hostile-text, Axe, and
       mobile counterexamples.
9. [x] Run exact 0021 acceptance and full integration on the reconciled head.
10. [x] Receive independent review through the integrated implementation and
        interactive-roadmap pull requests.
11. [x] Integrate accepted product heads. Public deployment remains a separate
        provider effect and is not inferred from build or workflow success.

## Acceptance command

```bash
bun scripts/accept/0021-pbk-portfolio-control-room.ts
```

At the design checkpoint, contract artifacts must pass and the command must
then fail on the first absent implementation artifact,
`portfolio/studio/pbk-technologies.json`.

## Evidence ledger

- 2026-07-31: operator named the overarching studio **PBK Technologies**.
- 2026-07-31: operator selected multiple views over the same data: Board,
  Features, dependency-first skill-tree Roadmap, History, and Overview. Gantt
  and deadline semantics are explicitly rejected.
- 2026-07-31: primary design separates mutable working horizon from append-only
  accepted receipts and product snapshots. Operator priority is an assertion
  over eligible work and cannot override dependency readiness.
- 2026-07-31: operator connected project work to executable computation and
  selected the course-platform label algebra for composable views. The design
  now separates inert work definitions, execution traces, output candidates,
  and evidence-backed accepted artifact values.
- 2026-07-31: operator requested queryable metadata and considered file or
  database storage. The frozen choice is strict row-oriented JSON in Git, an
  assembled content-addressed JSON snapshot, and replaceable database indexes.
- 2026-07-31: operator selected Mosaic as an alternate semantic-zoom view of
  the primary Obsidian-like Roadmap graph. It preserves node membership and
  authority while exposing progressively richer metadata.
- 2026-07-31: no implementation, adjacent-repository write, provider action,
  deployment, or public cutover occurred during contract freeze.
- 2026-07-31: portfolio rows, strict decoding, label laws, typed queries,
  immutable projections, all five product views, browser journeys, and the
  content-addressed public snapshot integrated through PBK portfolio PR #7 at
  `ee9423a`.
- 2026-07-31: the accessible XYFlow skill tree, ordered fallback, shared detail
  state, and Mosaic focus behavior integrated through Control Room PR #13 at
  `27ef5b1`.
- 2026-08-01: generic multigraph storage and traversal moved behind a narrow
  stable-ID adapter to Effect v4's maintained `Graph` module at `e6489be`,
  retaining the frozen public snapshot and cross-view identity laws.
- 2026-08-01: reconciliation review found that the default graph projected
  only work nodes and prerequisite edges even though the model already derived
  projects and containment. The accepted correction reuses XYFlow to render
  project membership, milestone-to-feature containment, and prerequisite
  families distinctly; the ordered phone path exposes the same projects, work
  identities, containment links, and exact detail controls.
- 2026-08-01: the feature-specific stages of exact acceptance on main proved
  15 portfolio-model tests, 74 Control Room component/tooling tests, and 9
  mobile Chromium journeys, including Axe, offline shell, atomic snapshot
  activation, Roadmap, Mosaic, and detail navigation. The repository-wide gate
  is rerun on the reconciled completion head before publication.
- 2026-08-01: the immutable main static artifact for `6eebc5a` built
  successfully. The trusted provider workflow did not establish deployment:
  Cloudflare rejected the configured credential as unauthorized, so no served
  snapshot or public-cutover claim is recorded.

- 2026-08-02: this reconciliation ports the accepted capability lineage from
  source tip `51076b53408dafa1fa8f2b75cbf5593aec3c7fc4`, specifically contract
  commits `ee9423a4496e92e616aad9b5719566402f132a2a`,
  `27ef5b17bf2c979598b5ff12107012d5818154be`,
  `e6489be751e2cd027383858aa3f4a9a2c1ae23d9`, and
  `835412b59b49ebd3c7bf362727f3a2da66c760f8`, onto authoritative primary
  `f7371bf276ddd2441fe0ec0a8e093c0d82a00838`. The giant source publication
  commit was not merged; no provider action or deployment is claimed.
- 2026-08-02: Historical leading status migrated verbatim from the pre-migration plan:
  Status: complete; implementation integrated and locally accepted
