---
format: semantic.feature-artifact/v1
feature_id: 0048-pbk-control-room-acceptance-reconciliation
kind: specification
legacy_entity_id: work.pbk-control-room-acceptance-reconciliation
---
# Design spec 0048: PBK Control Room acceptance reconciliation

Status: frozen for one acceptance-lineage correction

Date: 2026-08-01

Design-Lens-Version: open-semantic-system-v1

Migrates-Feature-IDs: 0021-pbk-portfolio-control-room

## Problem

Feature 0021's implementation is integrated, but its accepted contract still
describes project and milestone hierarchy that the default Roadmap did not
render. Its plan and portfolio work record also remained active after the
implementation passed locally. Reusing 0021 as a new acceptance owner would
silently reuse its earlier migration lineage. A new contract must own the
correction, preserve 0021 as the semantic product contract, and delegate to
one executable definition of completion.

## Felt journey

On a phone or desktop, the operator opens Roadmap and sees projects,
milestones, and features together. Membership, containment, and prerequisite
relations remain visibly distinct. The ordered navigation exposes the same
containment links and opens the same work details without requiring precise
pointer input. The portfolio then reports 0021 as complete and removes it from
the ready delegation frontier.

## Open semantic system design lens

### Boundary and warranted state

This feature owns only the acceptance-lineage correction, the thin Roadmap
projection adapter, its accessible ordered projection, regression evidence,
and the completion-state reconciliation. The frozen 0021 portfolio document,
query algebra, history rules, deployment boundary, and all existing view
semantics remain authoritative.

### Semantic inputs

Inputs are the accepted 0021 contract and implementation, the immutable
portfolio value, its project/work/contains/requires relations, the existing
Effect Graph execution index, the maintained XYFlow renderer, and exact local
test observations.

### Semantic outputs

The output is one Roadmap projection containing project, milestone, and
feature nodes plus project membership, milestone containment, and prerequisite
arrows. A prerequisite arrow points prerequisite to dependent, is visibly
labelled `unlocks`, and retains the authored `requires` relation as typed edge
metadata. The ordered accessible projection states the same direction and
contains the same containment relations. The 0021 plan and work record become
complete only with matching acceptance evidence.

### Effect protocols and uncertainty

Roadmap element construction is pure. Browser observation remains separate
from portfolio truth. The acceptance program composes the frozen 0021 program
and does not add provider, network, clock, random, or write authority. Public
deployment is an external observation and is not claimed by local acceptance.

### Components and orthogonal structures

Effect Graph owns generic graph mechanics, XYFlow owns interactive graph
rendering, and React owns component projection. PBK retains stable identities,
relation direction and meaning, deterministic ordering, accessibility, and
the immutable portfolio contract. Project membership, milestone containment,
and prerequisites remain distinct structures.

### Bounded autonomy and resources

The correction adds no recursive search, layout engine, polling loop, or
generic graph implementation. It uses the existing bounded portfolio limits
and the existing nine mobile journeys. Acceptance invokes the canonical 0017
repository gate exactly once through 0021.

### Evidence, assumptions, and unsupported claims

Component and browser tests establish the selected hierarchy and interaction
journeys. Exact acceptance establishes conformance on one revision, not all
possible browser layouts. Independent review is an assertion. This feature
does not claim provider deployment success, optimal visual layout, complete
portfolio data, or universal accessibility.

## Falsifiable claim

The reconciliation is accepted exactly when:

1. the default Roadmap renders every project plus every milestone and feature;
2. `membership`, `contains`, and authored `requires` edges preserve their exact
   directions and never impersonate each other; prerequisite-to-dependent
   arrows are visibly labelled `unlocks` and retain `requires` as metadata;
3. the ordered phone/keyboard path exposes milestone containment and reaches
   the same work-detail controls;
4. project nodes remain hierarchy context rather than pretending to be
   selectable work;
5. 0021 acceptance invokes the inherited 0017 full repository gate exactly
   once;
6. the 0021 plan, model status, and generated delegation frontier agree that
   the feature is complete; and
7. the exact head passes component, browser, portfolio, TypeScript, formatting,
   lint, model, and complete repository checks plus independent review.

The claim is falsified by a missing project node, a missing or reversed
containment edge, divergent pointer and ordered navigation, a second canonical
gate, an active 0021 frontier row, or a deployment claim unsupported by a
provider observation.

## Acceptance

Run:

```bash
just accept 0048-pbk-control-room-acceptance-reconciliation
```

The executable acceptance delegates to the frozen 0021 acceptance program so
the migration owner observes the same product and repository checks instead
of maintaining a second completion definition.

## Non-goals

This feature does not add a new portfolio model, query language, view, layout
engine, database, command surface, deployment mechanism, or provider
credential. It does not alter the semantics of priority, readiness, history,
artifacts, snapshots, or prerequisite reachability.
