# Design spec 0031: Control Room interactive skill tree

Status: frozen for one corrective portfolio-roadmap journey

Date: 2026-08-01

Depends-On-Feature-IDs: 0017-control-room-reconstruction,
0021-pbk-portfolio-control-room

Design-Lens-Version: open-semantic-system-v1

## Problem

The accepted PBK portfolio model can derive graph, DAG, and Mosaic
projections. The Control Room does not yet render a dependency graph. Its
Roadmap presents every work item in a flat card grid and lists typed edges in a
separate ledger. The already-derived prerequisite depth is unused. Mosaic
groups cards by project, but its one-level filter does not express the
portfolio, project, milestone, and feature hierarchy requested by the
operator.

The product therefore has the data model of a skill tree without the user
journey of one. A phone or keyboard user cannot visually follow prerequisite
paths, see which work a node unlocks, or move through semantic zoom while
retaining the selected identity.

## Felt journey

The operator opens the PBK Roadmap on a phone. The Graph presentation lays
prerequisites above the work they unlock, renders milestones as major nodes and
features as minor nodes, and keeps project membership visible without
pretending that membership is a dependency. Selecting Surface Language
highlights its prerequisites and dependents and opens the existing exact work
detail.

The operator switches to Mosaic. The same selected work identity remains
selected. Tapping a project or milestone changes information density and focus
without changing the underlying query membership. A keyboard-only user can
traverse the same stable ordered nodes and dependency links outside the visual
canvas.

## Open semantic system design lens

### Boundary and warranted state

Feature 0031 consumes only one already decoded `PortfolioDocument` and its
frozen `view.roadmap` and `view.roadmap-mosaic` projections. A pure roadmap
model derives deterministic lanes, prerequisite and unlock adjacency,
containment adjacency, project membership, presentation scale, and accessible
order.

The feature warrants that every rendered node and edge comes from that one
portfolio observation and that graph and Mosaic share one selected identity
set. It does not infer readiness, priority, status, containment, dependency,
or project membership. In particular, a `contains` relation never becomes a
`requires` relation and a visual prerequisite arrow never reverses the
authored dependency meaning.

### Semantic inputs

The public model constructor is:

```ts
deriveRoadmapModel(document: PortfolioDocument)
  -> Effect<RoadmapModel, RoadmapModelFailure>
```

It requires exactly one saved `view.roadmap` with presentation `dag` and one
saved `view.roadmap-mosaic` with presentation `mosaic`. Both projections must
select the same identities. Every selected relation endpoint must be selected.

UI commands are finite XState events:

```text
view.roadmap
roadmap.graph | roadmap.mosaic
project.focus(projectId) | project.clear
milestone.focus(workId) | milestone.clear
work.select(workId) | work.close
```

Focus and selection are presentation state. They do not mutate the portfolio
or narrow its canonical query result.

### Semantic outputs

`RoadmapModel` is deeply immutable and contains:

```text
identities: Identity[]
nodes: {
  id, project_id, kind, title, summary, status,
  depth, lane, position,
  prerequisite_ids, unlock_ids,
  container_ids, contained_ids,
  scale: "major" | "minor"
}[]
dependency_edges: {
  id,
  dependent_id,
  prerequisite_id,
  visual_source_id,
  visual_target_id
}[]
containment_edges: { id, container_id, contained_id }[]
projects: { project_id, identity_ids, milestone_ids, standalone_feature_ids }[]
accessible_order: Identity[]
```

For authored `dependent requires prerequisite`, the visual arrow is
`prerequisite -> dependent`. Every dependency satisfies
`prerequisite.depth < dependent.depth`. Lane and position are stable functions
of depth and UTF-16 identity order, not viewport measurement, insertion order,
priority, effort, or time.

The Graph and Mosaic renderers consume this same model. Visual focus may dim or
expand nodes, but `identities` and `accessible_order` never change. The
existing work-detail projection remains the sole detail source.

### Effect protocols and uncertainty

Model derivation is a finite local Effect program over immutable data. XState
owns view, focus, and selected-work transitions. React owns no hidden
synchronization lifecycle and product components add no `useEffect`.

React Flow is a replaceable rendering adapter for panning, zooming, edges, and
canvas keyboard behavior. It receives deterministic fixed positions from the
roadmap model and receives no mutation, connection, deletion, or layout
authority. An ordered HTML control list remains available and authoritative
for keyboard and assistive-technology navigation.

The renderer follows the official React Flow
[installation](https://reactflow.dev/learn),
[layout](https://reactflow.dev/learn/layouting/layouting), and
[accessibility](https://reactflow.dev/learn/advanced-use/accessibility)
guidance. The app imports the maintained library stylesheet after Tailwind and
uses Tailwind, shadcn, Base UI, and existing OKLCH tokens for owned UI.

### Components and orthogonal structures

```text
PortfolioDocument
  -> saved DAG/Mosaic interpreters
  -> pure RoadmapModel
       |-> React Flow skill-tree projection
       |-> hierarchical Mosaic projection
       |-> ordered HTML navigation projection

XState focus + selection
  -> presentation emphasis and existing work detail
```

Portfolio truth, derived graph facts, visual coordinates, interaction state,
and rendered DOM are separate structures. React Flow never becomes the data
store. XState never becomes evidence authority.

### Bounded autonomy and resources

The existing portfolio bounds remain authoritative: at most 2,048 work nodes
and 8,192 relations. Derivation visits nodes and relations a bounded number of
times and sorts stable identity arrays. No iterative physics, DOM-measurement
loop, timer, polling loop, background Fiber, or recursive unbounded layout is
introduced.

The graph canvas renders only the selected saved-view identities. The ordered
HTML fallback exposes the same identities once. The feature does not raise any
portfolio bound.

### Evidence, assumptions, and unsupported claims

Pure tests establish stable layout, dependency direction, adjacency,
containment separation, equal graph/Mosaic membership, immutable output, and
typed failure for mismatched or malformed saved views. Component and browser
journeys establish selection continuity, focus transitions, keyboard access,
phone rendering, detail opening, and zero unexplained Axe findings in the
tested states.

These observations do not prove universal accessibility, optimal graph
layout, comprehension, or successful public deployment. The current provider
credential rejects production deployment independently of this local product
contract. A passing build is not a deployment observation.

## Deep-module contract

### Layout

Dependency depth is derived only from `requires`. Nodes with no prerequisites
have depth zero. A dependent has one plus the maximum depth of its
prerequisites. Because the decoded portfolio already rejects `requires`
cycles, this derivation terminates.

Within each depth, nodes are ordered by UTF-16 code units and assigned lanes
from zero. Version 1 uses fixed major and minor node dimensions and fixed lane
and depth gaps. Coordinates are part of the replaceable view model, not the
portfolio identity or snapshot digest.

### Hierarchy

Projects come from `project_id`. Milestone-to-work hierarchy comes only from
authored `contains` relations. A feature without a selected container remains
a standalone project feature. Multiple containers remain explicit rather than
being silently collapsed into one parent.

Mosaic always retains all selected identities in its model and accessible
order. Project focus expands that project. Milestone focus expands the exact
selected milestone and its directly contained work. Other groups remain
present at lower information density.

### Interaction

Graph and Mosaic share one XState actor. Switching presentation preserves
`selectedId`, `focusProject`, and `focusMilestone`. Closing detail clears only
selection. Clearing milestone focus keeps project focus. Clearing project
focus clears milestone focus because the narrower scope no longer has a
visible owner.

Visual nodes are not draggable or connectable. Delete and edit shortcuts are
disabled. Selecting a node may open the existing detail dialog but cannot
change portfolio data.

## Counterexamples

1. Card insertion order cannot change lanes or coordinates.
2. Priority rank cannot change dependency depth.
3. A containment edge cannot render as a prerequisite arrow.
4. A visual arrow cannot imply the reverse authored dependency.
5. Switching Graph to Mosaic cannot clear or replace the selected work.
6. Project or milestone focus cannot remove identities from the model.
7. A title containing markup remains text.
8. A canvas without the ordered HTML path is not accepted.
9. Effort cannot size a node and no time axis can enter the roadmap.
10. A successful static build cannot be reported as a public deployment.

## Acceptance

Feature 0031 is accepted when one clean head:

1. derives the exact immutable roadmap model above from the two saved views;
2. uses only `requires` for prerequisite depth and visual arrows;
3. keeps project membership and `contains` hierarchy distinct;
4. renders deterministic major/minor nodes through React Flow with editing
   disabled;
5. renders portfolio to project to milestone to feature Mosaic zoom over the
   same identities;
6. retains selection and focus across Graph/Mosaic transitions through XState;
7. exposes every node and dependency through ordered keyboard-operable HTML;
8. opens the existing definition-of-done, metadata, relation, artifact,
   receipt, and snapshot detail from either presentation;
9. includes current Semantic surface-language, artifact-store, reachability,
   and skill-tree work in the portfolio vertical slice with exact artifacts
   and receipts where accepted;
10. passes pure model, component, XState, phone Playwright, Axe, TypeScript 7,
    Oxlint, Oxfmt, production build, static scan, 0017/0021 regression, project
    model, and full repository gates; and
11. receives revision-pinned independent review before integration.

The exact local command is:

```bash
bun scripts/accept/0031-control-room-interactive-skill-tree.ts
```

## Non-goals

- Mutating work, priority, dependencies, labels, evidence, or history.
- Inferring readiness, dependency, containment, or completion.
- General SQL/query-builder UI, TanStack Router adoption, or deep links.
- Live agent, host, process, or provider state.
- Force-directed layout, manual node positioning, collaborative editing, or
  graph persistence.
- Deadlines, estimates, Gantt semantics, or effort-sized tiles.
- Provider credential repair, workflow changes, or claiming public cutover.

## Semantic diff

PBK Control Room gains the missing skill-tree journey: one deterministic
dependency view model now drives an interactive graph, semantic-zoom Mosaic,
and equivalent ordered navigation without adding or changing portfolio truth.
The feature turns existing dependency data into inspectable product behavior
while keeping rendering, interaction, and evidence authority separate.
