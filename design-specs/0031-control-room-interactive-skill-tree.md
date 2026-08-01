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
portfolio, project, and authored milestone-to-feature containment requested by
the operator. The decoded portfolio boundary does not itself constrain
`contains` to this display hierarchy, so this feature validates the subset it
renders instead of silently inventing parents.

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
  -> Effect<RoadmapModel, RoadmapModelFailure | InvalidContainmentTopology>
```

It requires exactly one saved `view.roadmap` with presentation `dag` and one
saved `view.roadmap-mosaic` with presentation `mosaic`. Both projections must
select the same work identities and declare the same traversed relation kinds.
Every selected relation endpoint must be selected. The model preserves each
projection's saved-view identity, source identity set, and `QueryDiagnostics`;
renderers cannot erase exclusions, unknown-label observations, or other query
provenance.

UI commands are finite XState events:

```text
view.roadmap
roadmap.graph | roadmap.mosaic
project.focus(projectId) | project.clear
milestone.focus(workId) | milestone.clear
work.select(workId) | work.close
```

Focus and selection are presentation state. They do not mutate the portfolio
or narrow its canonical query result. `work.select` remains the existing
global detail command and accepts any known document work identity; Roadmap
renderers emit it only for work in the shared roadmap set. Events carrying an
unknown work identity, a non-project project identity, or a non-milestone
milestone identity are rejected by XState guards and leave the complete prior
state unchanged. Milestone focus is valid only for a roadmap milestone owned
by the currently focused project; a mismatched focus is rejected, and focusing
a different project clears the narrower milestone focus.

### Semantic outputs

`RoadmapModel` is deeply immutable and contains:

```text
work_identities: Identity[]
projection_sources: {
  graph: { view_id, identity_ids, diagnostics },
  mosaic: { view_id, identity_ids, diagnostics }
}
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
projects: { project_id, name, summary, identity_ids, milestone_ids,
            standalone_feature_ids }[]
accessible_targets: (
  | { kind: "project", project_id }
  | { kind: "milestone" | "feature", work_id }
  | { kind: "dependency", relation_id, prerequisite_id, dependent_id }
)[]
```

For authored `dependent requires prerequisite`, the visual arrow is
`prerequisite -> dependent`. Every dependency satisfies
`prerequisite.depth < dependent.depth`. Lane and position are stable functions
of depth and UTF-16 identity order, not viewport measurement, insertion order,
priority, effort, or time. Work targets use stable depth-then-UTF-16 order;
projects and authored dependency relations use stable identity order.

The Graph and Mosaic renderers consume this same model. Equality applies to
the saved views' `work_identities`; project and containment occurrences are
derived structure, not extra work identities. Visual focus may dim or expand
nodes, but `work_identities` and `accessible_targets` never change. The
existing work-detail projection remains the sole detail source.

### Effect protocols and uncertainty

Model derivation is a finite local Effect program over immutable data. XState
owns view, focus, and selected-work transitions. React owns no hidden
synchronization lifecycle and product components add no `useEffect`.

React Flow is a replaceable rendering adapter for panning, zooming, and visual
edges. It receives deterministic fixed positions from the roadmap model and
receives no mutation, connection, deletion, or layout authority. Its semantic
node and edge tab stops are disabled to avoid a duplicate navigation tree;
canvas keyboard support is limited to viewport controls. A visible ordered
HTML control list is authoritative for keyboard and assistive-technology
navigation, including project focus, every work item, dependency direction,
and detail opening.

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
times and sorts stable identity arrays. Dependency depth and containment
validation use iterative topological traversal, not recursive descent, and are
tested at the maximum declared node bound. No iterative physics,
DOM-measurement loop, timer, polling loop, background Fiber, or recursive
unbounded layout is introduced.

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
from zero. Prerequisite depth is the vertical `y` axis. Version 1 uses 280 px
major width, 232 px minor width, 56 px horizontal lane gap, and 188 px vertical
depth gap. Coordinates are part of the replaceable view model, not the
portfolio identity or snapshot digest.

### Hierarchy

Projects come from `project_id`. Version 1 renders only authored
milestone-to-feature `contains` relations. `deriveRoadmapModel` returns typed
`InvalidContainmentTopology` for a selected containment cycle, a non-milestone
container, a non-feature contained item, or a cross-project pair. A feature
without a selected container remains a standalone project feature. Multiple
containers create multiple visual containment occurrences that point to one
semantic work identity; selection and detail remain keyed by that single work
identity.

Mosaic always retains all selected identities in its model and accessible
order. Project focus expands that project. Milestone focus expands the exact
selected milestone and its directly contained work. Other groups remain
present at lower information density.

### Interaction

Graph and Mosaic share one XState actor. Switching presentation preserves
`selectedId`, `focusProject`, and `focusMilestone`. Closing detail clears only
selection. Clearing milestone focus keeps project focus. Clearing project
focus clears milestone focus because the narrower scope no longer has a
visible owner. Roadmap mode and project or milestone focus events are accepted
only while the actor is on the Roadmap view. The existing global work-detail
selection remains available in every view for known document work. Focusing a
valid milestone requires its owning project to be focused already. Every
rejected event is observable as an unchanged snapshot; it cannot partially
update focus or selection.

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

1. derives the exact immutable roadmap model, source diagnostics, structural
   project records, and accessible targets above from the two saved views;
2. uses only `requires` for prerequisite depth and visual arrows;
3. keeps project membership and `contains` hierarchy distinct;
4. renders deterministic major/minor nodes through React Flow with editing
   disabled;
5. renders portfolio to project to authored milestone-to-feature Mosaic zoom
   over the same work identities and rejects unsupported containment topology;
6. retains selection and focus across Graph/Mosaic transitions through XState;
7. exposes every project, work node, and dependency direction through visible
   ordered keyboard-operable HTML without duplicate canvas tab stops;
8. opens the existing definition-of-done, metadata, relation, artifact,
   receipt, and snapshot detail from either presentation;
9. includes current Semantic surface-language, artifact-store, reachability,
   and skill-tree work in the portfolio vertical slice with exact artifacts
   and receipts where accepted;
10. passes feature-specific pure model, component, XState, phone Playwright,
    Axe, and exact portfolio-evidence tests plus TypeScript 7, Oxlint, Oxfmt,
    production build, static scan, 0017/0021 regression, project model, and
    full repository gates; and
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
