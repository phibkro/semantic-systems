# Active plan 0021: PBK Technologies portfolio Control Room

Canonical frozen contract:
[`design-specs/0021-pbk-portfolio-control-room.md`](../../design-specs/0021-pbk-portfolio-control-room.md).
This execution record cannot redefine that contract.

Status: contract frozen; implementation intentionally absent

Owner: primary Semantic Systems and PBK Technologies portfolio lead

## Dependencies

- accepted Control Room 0017 integration `26a7625ad4fdd5538efdbec3f28eaa7e0885c38a`;
- current corrected Semantic primary `4b520e9`;
- accepted public snapshot freshness and content-custody boundary;
- operator naming of PBK Technologies; and
- operator choice of dependency-first Roadmap over calendar-first Gantt; and
- course-platform's bounded Any/All/Exclude/Unlabeled label algebra.

No provider or external mutation is authorized by this plan.

## Owned paths

- `design-specs/0021-pbk-portfolio-control-room.md`
- `plans/active/0021-pbk-portfolio-control-room.md`
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
- Implement one bounded dependency layout directly before evaluating a graph
  library. Record a deferred library choice only if the direct layout becomes
  costly to own.
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

1. Commit this frozen contract, active plan, canonical work item, and
   intentionally red acceptance.
2. Author bounded row-oriented PBK portfolio records with exact observed
   project heads and assemble one canonical snapshot.
3. Implement strict decoding, bounded label normalization, typed metadata
   predicates, history compatibility, and immutable projections.
4. Add exhaustive small-universe tests against the course-platform label laws.
5. Implement saved view specifications and list, grid, graph, and DAG
   projection interpreters over one selected identity set.
6. Add shared Overview, Board, Features, Roadmap, History, and Detail views.
7. Add deterministic dependency layout and accessible phone fallback.
8. Add cross-view, priority, dependency, history, hostile-text, and mobile
   counterexamples.
9. Run exact 0021 acceptance and full integration.
10. Commission independent review and correct every required finding.
11. Integrate the accepted head and deploy only through the existing separately
    authorized Control Room workflow.

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
- 2026-07-31: no implementation, adjacent-repository write, provider action,
  deployment, or public cutover occurred during contract freeze.
