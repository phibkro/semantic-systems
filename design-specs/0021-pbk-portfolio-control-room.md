# Design spec 0021: PBK Technologies portfolio Control Room

Status: frozen for implementation

Date: 2026-07-31

Design-Lens-Version: open-semantic-system-v1

Migrates-Feature-IDs: 0002-reference-baselines-deep-research, 0003-independent-resolution-checker, 0005-autonomous-development-control-loop, 0006-control-room-pwa, 0007-reuse-first-engineering, 0010-typescript-effect-v4-runtime, 0011-effect-v4-oxlint-domains, 0012-minimal-actor-runtime, 0013-bounded-actor-trace-retention, 0014-stm-effect-handler-laws, 0015-open-semantic-system-design-lens, 0016-executable-semantic-system-kernel, 0017-control-room-reconstruction, 0018-minimal-kernel-calculus, 0019-normalized-core-format, 0020-agent-facing-kernel-json, 0022-kernel-reference-interpreter

## Problem

PBK Technologies operates several related and independent products, but the
accepted Control Room exposes only one Semantic Systems project snapshot. The
operator cannot inspect the portfolio as one dependency-aware system, compare
working-horizon options, or travel from completed work to the research,
design, acceptance evidence, user journeys, and product snapshots that explain
it.

Separate Kanban, issue, roadmap, and history stores would drift. A Gantt view
would also encode deadlines and duration assumptions that do not govern this
studio. PBK Technologies needs one bounded portfolio value with several honest
projections: Overview, Board, Features, Roadmap, and History. It also needs a
small query language so the operator can compose new list, grid, graph, DAG,
and mosaic views without creating a new source of truth.

## Felt journey

On a phone, the operator opens Control Room and sees **PBK Technologies**.
Roadmap renders projects and milestones as major skill-tree nodes and features
as minor nodes. Typed dependency edges explain what requires or unlocks what;
there is no time axis. Selecting a ready feature opens its research, design,
definition of done, simulated user journeys, evidence, and exact previews or
snapshots. The same identity appears in Board and Features. History retains an
accepted receipt and content-addressed snapshot after the feature leaves the
working horizon. An operator priority assertion reorders ready candidates but
cannot make blocked work ready or rewrite history. The operator can save a
question such as "engineering or research, all agent-facing work, excluding
deferred work" and render the same selected identities as a list, a
project-by-status grid, a dependency DAG, or a zoomable metadata mosaic.

## Open semantic system design lens

### Boundary and warranted state

The feature boundary contains a closed, versioned PBK portfolio document; a
Git-native row store that assembles that document; a strict TypeScript decoder;
pure selection and projection interpreters; and read-only Control Room views.
The portfolio document owns portfolio identities, explicit observations of
project heads, work definitions, dependency assertions, operator priority
assertions, accepted receipts, artifact references, and product snapshots.

Each project repository remains authoritative for its own source, contracts,
tests, and releases. A portfolio project record is a revision-bound
observation, not live repository truth. The Control Room owns presentation and
last-known-valid snapshot state only. Roadmap layout, Board columns, counts,
and readiness explanations are projections, never canonical state.

Working horizon and persistent history are different relations:

- the horizon contains nonterminal work definitions currently considered for
  execution; it can expand, split, reorder, defer, or supersede;
- history is the append-only set of accepted or superseded receipts and
  content-addressed snapshots observed at exact revisions.

A work definition can leave the horizon while its identity, receipts, and
snapshots remain inspectable forever.

### Semantic inputs

`pbk.portfolio/v1` accepts these closed families:

- `StudioDefinition(id, name, summary)`;
- `ProjectObservation(id, repositoryUrl?, head, observedAt, status)`;
- `WorkDefinition(id, projectId, kind, status, definitionOfDone, attributes)`
  where kind is `milestone` or `feature` and attributes are bounded typed
  metadata values;
- `Contains(parentId, childId)` and `Requires(workId, prerequisiteId)`;
- `LabelDefinition(id, name, color)` and `LabelMembership(workId, labelId)`;
- `SavedView(id, name, query, projection)`;
- `ArtifactReference(id, workId, kind, title, href, revision)` where kind is
  `research`, `design`, `journey`, `evidence`, or `preview`;
- `OperatorPriorityAssertion(id, workId, rank, assertedAt, reason)`;
- `WorkReceipt(id, workId, outcome, commit, observedAt, evidenceRefs,
snapshotId?)`; and
- `ProductSnapshot(id, projectId, workId?, commit, digest, observedAt,
previewUrl?)`.

Status is one of `candidate`, `planned`, `ready`, `active`, `blocked`,
`review`, `accepted`, `superseded`, or `abandoned`. Board includes only the
first six. Receipt outcomes are `accepted` or `superseded` and do not derive
from a status string alone.

The format accepts no deadline, start date, end date, duration, percentage,
velocity, or Gantt field. `observedAt` records evidence time; it is not a
schedule.

### Label and metadata query algebra

The label algebra reuses the course-platform List contract rather than adding
an arbitrary recursive expression language:

```ts
interface LabelRule {
  readonly includeLabelIds: ReadonlyArray<LabelId>;
  readonly includeUnlabeled: boolean;
  readonly includeMode: "any" | "all";
  readonly excludeLabelIds: ReadonlyArray<LabelId>;
  readonly excludeUnlabeled: boolean;
}
```

For the universe `U` of work definitions, an empty include group has identity
`U`. `any` unions included predicates, `all` intersects them, and excluded
predicates are unioned and subtracted. `unlabeled` is derived from zero label
memberships. Duplicate and permuted predicates normalize identically. Exclude
wins over contradictory inclusion and produces an explicit diagnostic. The
unsatisfiable `all(unlabeled, label X)` shape remains visible and explained.
Unknown label identities are dropped with a diagnostic; they never silently
bind to a later label.

Labels are operator-authored classification and grouping facts. They do not
replace typed containment, prerequisite, receipt, provenance, status, or
priority relations. Derived labels must carry their derivation basis.

Each work definition also carries a bounded metadata record. Keys are stable,
namespaced identifiers. Values are strings, finite numbers, booleans, null, or
bounded arrays of strings. Canonical fields such as identity, project, kind,
status, and priority remain typed fields and cannot be shadowed by metadata.

`WorkQuery` combines one normalized `LabelRule` with a bounded, flat list of
typed field predicates. Version 1 supports `equals`, `not-equals`, `in`,
`contains`, `exists`, `greater-than-or-equal`, and `less-than-or-equal`.
Predicates are conjoined. A saved view adds selected fields, relation traversal,
grouping, stable sorting, and one presentation: `list`, `grid`, `graph`, `dag`,
or `mosaic`. This JSON query value is the agent-facing interface. A later
SQL-like text surface may parse to the same value but cannot add semantics to
it.

Every presentation interprets the same selected identity set. List and grid do
not invent edges. Graph can show selected typed relations, while DAG rejects a
requested cyclic relation family. Changing presentation never changes query
membership.

Roadmap defaults to an Obsidian-like graph that makes typed dependency and
containment edges inspectable. Mosaic is its alternate semantic-zoom
interpreter. It nests portfolio, project, milestone, and feature tiles and
reveals more selected metadata as the operator zooms into a tile. Mosaic is not
a second roadmap, does not copy work records, and cannot hide an identity merely
because metadata is absent. Tile area and position have no effort, duration,
priority, or importance meaning unless the saved view explicitly selects and
labels such a metric. Both modes expose the same ordered accessible node list
and detail controls; neither requires a canvas or pointer precision.

### Work as an executable calculus

A work definition is an inert computation description, not completed value.
Dispatch supplies an interpreter (agent, human, CI, or simulator), explicit
inputs, and bounded authority. Execution produces an attempt trace and output
candidates. Only an acceptance decision backed by evidence emits a
`WorkReceipt` and realizes durable artifacts as the work value. A stopped,
blocked, failed, or merely successful process does not accept itself.

```text
WorkDefinition + DispatchBinding
  -> AttemptTrace + OutputCandidates
  -> AcceptanceDecision
  -> WorkReceipt<ArtifactReferences>
```

This gives portfolio work the same useful recursive shape as a build system,
compiler, and kernel without merging their authority. Portfolio execution is
at work-item granularity; compilation is at module and AST granularity. The
shared laws are explicit inputs, interpreter choice, deterministic identity,
observable effects, evidence-backed realization, and replayable receipts.
Attempts may be retried or interpreted by different executors while the work
identity remains stable. Their traces belong to history; only accepted or
superseded receipts establish realized values.

Priority is an operator assertion. The latest assertion for one work identity
orders otherwise eligible horizon choices. It does not add or remove a
dependency, establish readiness, change evidence strength, or mutate an older
assertion.

### Semantic outputs

One decoded document and one normalized query derive:

- `OverviewProjection`: studio and project summaries plus warranted counts;
- `BoardProjection`: horizon identities grouped by exact status;
- `FeatureProjection`: searchable milestone and feature records;
- `RoadmapProjection`: typed project, milestone, and feature nodes with
  containment, prerequisite, and derived-unlock edges;
- `HistoryProjection`: ordered receipts and snapshots; and
- `DetailProjection`: one work identity with its definition of done,
  artifacts, dependencies, receipts, and snapshots.

The five built-in views are ordinary checked `SavedView` values. Operator views
use the same selection and projection functions; there is no privileged hidden
query path.

`unlocks` and `blocked_by` are derived directions over `requires`; they are not
second authored truths. Node size is a presentation mapping from project,
milestone, or feature kind and has no priority or effort meaning.

### Effect protocols and uncertainty

The first slice is read-only. Canonical authoring data is a row-oriented folder
of strict JSON records under `portfolio/`: studio, projects, work definitions,
labels, memberships, relations, views, receipts, and snapshots have separate
stable identities. The exporter sorts and assembles these rows into one static,
content-addressed public portfolio snapshot during the existing Control Room
export/build pipeline.

JSON is selected over YAML, TOML, or Markdown frontmatter for version 1 because
the agent-facing boundary already has a closed JSON schema, numbers and booleans
retain their types, and duplicate or ambiguous keys can be rejected. Markdown
remains the content format for linked research and design. A database, search
index, columnar file, or SQL engine may be built as a disposable projection of
the same decoded rows. It is never the sole durable copy and cannot write
canonical history in this slice.
Opening an artifact or preview URL is an ordinary browser request whose later
availability is environmental.

Candidate refresh follows the existing last-known-valid protocol. In addition,
an update is rejected if it removes or changes a prior receipt, rebinds a
snapshot identity to different content, advances a project without an exact
head, or changes an older priority assertion. New assertions and receipts are
append-only. A failed or unavailable preview does not erase its historical
reference.

This slice does not write priorities from the browser. A future authenticated
command can request a new assertion, but it must return a separate accepted,
rejected, or unknown effect observation.

### Components and orthogonal structures

`src/portfolio-model` owns row assembly, decoding, cross-reference validation,
label normalization, metadata predicates, history compatibility,
dependency-cycle rejection, and pure projections.
`apps/control-room` owns accessible rendering, selection, filtering, and
deterministic graph layout. The existing project-model exporter owns Semantic
project projection and does not become a portfolio crawler. Adjacent project
repositories own their heads and capability receipts.

Containment hierarchy, prerequisite DAG, project ownership, artifact
derivation, priority ordering, and receipt history are separate graphs. Only
the prerequisite projection must be acyclic. A project can contain many
milestones and features without implying a prerequisite. Artifact references
explain a work item without becoming dependencies.

All five views consume one immutable decoded value. No React component may
derive a separate status, readiness rule, label rule, or receipt. Query
evaluation, relation traversal, and feature selection terminate. Roadmap
layout is finite over the bounded graph. Client refresh is the existing
intentional persistent process with one in-flight candidate.

### Bounded autonomy and resources

Version 1 permits at most 64 projects, 2,048 work definitions, 512 labels,
16,384 memberships, 8,192 relations, 8,192 artifact references, 512 saved
views, 8,192 priority assertions, 8,192 receipts, and 4,096 snapshots. A query
has at most 64 label predicates, 64 metadata predicates, 16 relation traversal
steps, 32 selected fields, 8 group fields, and 8 sort fields. IDs, names,
metadata, summaries, reasons, URLs, and definitions of done have explicit
decoder bounds. Query, dependency traversal, and layout visit each selected
node and edge a bounded number of times. Roadmap provides an accessible
ordered-list fallback and never requires pointer precision to inspect a node.

The local gate performs no repository write outside its worktree, provider
apply, deployment, DNS change, priority mutation, or preview destruction.

### Evidence, assumptions, and unsupported claims

Decoder and cross-reference tests provide runtime validation over selected
documents. Projection-law tests establish exercised agreement between views,
not a proof for arbitrary implementations. Mobile browser journeys establish
selected usability and interaction observations. Digest and update tests
establish selected append-only-history behavior. Independent review remains an
assertion.

The feature assumes observed repository heads and referenced URLs were supplied
honestly and remain retrievable as described by their source. It does not prove
that a project is healthy, a preview is available, a dependency estimate is
complete, a priority is optimal, a user journey matches production, or an
accepted receipt proves more than its attached evidence.

## Deep-module contract

```text
decodePortfolioDocument(unknown)
  -> PortfolioDocument | PortfolioDecodeFailure

acceptPortfolioUpdate(previous, candidate)
  -> PortfolioDocument | PortfolioHistoryConflict

projectPortfolio(document)
  -> {
       overview,
       board,
       features,
       roadmap,
       history,
       detail(id)
     }

normalizeLabelRule(document, rule)
  -> NormalizedLabelRule + QueryDiagnostics

queryWork(document, query)
  -> ReadonlyArray<WorkIdentity> + QueryDiagnostics

projectWork(document, selectedIdentities, view)
  -> ListProjection | GridProjection | GraphProjection | DagProjection
     | MosaicProjection
```

Returned documents and projections are deeply immutable and alias no caller
structure. Projection functions request no filesystem, Git, network, browser,
clock, random, or provider capability. Unknown fields reject at every level.

The Roadmap is dependency-first, never calendar-first. Its deterministic layout
uses prerequisite depth plus stable ID order. Rendering technology can change
without changing node, edge, priority, receipt, or snapshot meaning.

## Oracle-first counterexamples

- One work identity appears with the same name, status, dependencies, and
  priority in Board, Features, Roadmap, and Detail.
- Empty, Any, All, Exclude, Unlabeled, duplicate, contradictory, unknown-label,
  and permutation cases match the course-platform label algebra.
- Every presentation over one query contains exactly the same selected work
  identities; grid grouping and graph edges cannot add or remove membership.
- Graph, DAG, and Mosaic expose the same selected identities and detail links.
  Mosaic zoom changes visible metadata density, not membership or authority.
- Mosaic tile area and position do not imply effort, priority, or schedule when
  no explicit labelled metric is selected.
- Typed metadata distinguishes `5`, `"5"`, `false`, and absent. Canonical fields
  cannot be shadowed by metadata.
- A cyclic relation family rejects DAG projection while the same selected work
  remains valid for list, grid, or graph presentation.
- A blocked item with operator priority rank 1 remains blocked.
- Removing or changing an older receipt or snapshot rejects an update.
- Adding a new receipt and snapshot preserves every historical identity.
- Missing endpoints, duplicate IDs, cross-project containment, self-requires,
  and a prerequisite cycle reject before projection.
- A containment edge never makes a child blocked; a prerequisite can.
- Unknown status, artifact kind, URL scheme, abbreviated commit, malformed
  digest, and excess field reject.
- Deadline, duration, percentage, velocity, and Gantt-shaped fields reject.
- Journey text and hostile titles render as text, never executable markup.
- Roadmap exposes every visual node through keyboard-accessible controls and an
  ordered-list fallback at a phone viewport.
- Clicking research, design, definition of done, journeys, evidence, preview,
  and snapshot details preserves exact revision or digest context.

Each counterexample must first fail for the intended semantic reason.

## Acceptance

Feature 0021 is accepted only when one clean head:

1. strictly decodes the bounded portfolio document and rejects every oracle;
2. reuses the bounded Any/All/Exclude/Unlabeled label algebra, evaluates typed
   metadata predicates, and proves exhaustive small-universe laws;
3. derives all five built-in views plus list, grid, graph, DAG, and mosaic
   projections and proves selected cross-view identity agreement;
4. exposes PBK Technologies and every recorded project from one public
   content-addressed portfolio snapshot;
5. renders a dependency-first Roadmap with major project/milestone nodes,
   minor feature nodes, typed edges, no time axis, and an alternate zoomable
   metadata Mosaic over the same identities;
6. renders Board, Features, History, and detail journeys over the same data;
7. retains accepted receipts and product snapshots across an update;
8. passes phone Chromium interaction and accessibility journeys;
9. preserves every accepted 0017 freshness, provenance, offline, workflow,
   and deployment-custody observation;
10. passes TypeScript 7, Effect diagnostics, Oxfmt, Oxlint, project-model, and
    full repository gates; and
11. receives independent review of semantic drift, history rewriting,
    dependency direction, priority force, hostile rendering, and phone use.

The exact command is:

```bash
bun scripts/accept/0021-pbk-portfolio-control-room.ts
```

## Kill or redesign criteria

Redesign if implementation needs separate mutable data for any view, makes
calendar fields authoritative, infers project truth by ambient filesystem
scanning, rewrites accepted history, treats priority as readiness, executes
journey content, hides graph nodes from keyboard users, or requires a provider
mutation for local acceptance.

## Non-goals

Version 1 does not provide authenticated browser commands, live agent state,
automatic repository crawling, an arbitrary recursive expression language, a
textual SQL parser, a database as canonical authority, estimates, deadlines,
Gantt charts, resource allocation, billing, chat, or universal historical
reconstruction. It does not move project-owned contracts into the portfolio
model.

## Semantic diff

This feature names the studio PBK Technologies and adds one portfolio semantic
boundary plus five read-only projections. It adds explicit working-horizon,
priority-assertion, receipt-history, artifact, journey, and product-snapshot
meaning. It reuses course-platform's bounded label-set algebra, adds typed
metadata queries and interchangeable presentation interpreters, adds a
semantic-zoom Mosaic alternate to the primary dependency graph, and makes the
work-definition to accepted-artifact transition explicit. Existing Semantic
project facts, scheduler readiness, evidence categories, Control Room
freshness, deployment custody, and provider authority remain unchanged.
