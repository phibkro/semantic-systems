# Tooling and Project Model Design Specification

## Objective

The project should make semantic structure, implementation structure, evidence,
work, and responsibility explorable without forcing them into one hierarchy.
The current federated typed graph remains the conceptual source of truth.

## Canonical graph domains

Maintain separate but linked domains:

- semantic contracts;
- architecture and realizations;
- evidence and assumptions;
- work and decisions;
- runtime interactions;
- deployments;
- people, agents, and responsibilities.

Stable IDs connect domains. A projection chooses only the facts relevant to one
question.

## Authoring representation

Early project-model sources should remain reviewable structured text in Git.
Requirements:

- explicit schema version;
- deterministic formatting;
- stable IDs;
- typed entity and relation kinds;
- source locations for every fact;
- extension fields that do not silently alter core meaning;
- migration tooling for schema evolution.

JSON is acceptable for the bootstrap. A purpose-built declarative syntax may be
introduced only when it improves human authoring and can elaborate to the same
canonical graph.

## Derived relational representation

Export canonical entities and relations as typed facts. Datalog is a strong fit
for recursive queries such as:

```text
transitive dependency
affected-by assumption
ready work frontier
uncovered obligation
capability reachability
realization candidates
recursive component containment
```

The Datalog rules themselves should be packageable analyses with tests and
versioned semantics.

Negative queries must declare whether the relevant relation is complete. For
example, “no evidence exists” is valid only relative to a closed evidence
snapshot.

## Local storage

Use an embedded database as a rebuildable index for:

- text and symbol search;
- normalized artifact metadata;
- query memoization;
- reverse dependency indexes;
- evidence and work projections;
- language-server state.

The database may be deleted and reconstructed from canonical sources and
published artifacts.

## Query service

Expose a typed query boundary supporting:

- entity lookup;
- graph traversal;
- semantic diff;
- evidence explanation;
- realization comparison;
- source-to-core navigation;
- work readiness;
- deployment explanation.

A GraphQL-like introspective API is useful for the web explorer, but the same
queries should be available through a local library and CLI.

## Language server

The LSP-facing system should be a thin adapter over the incremental compiler
and project graph.

Capabilities include:

- parse and type diagnostics;
- inferred type/effect/usage display;
- go-to definition across theories and realizations;
- find all implementations of a theory;
- show law and evidence status;
- explain realization selection;
- preview normalized core;
- show semantic diff;
- generate or navigate obligations;
- apply structured refactorings.

The language server should not have separate semantic logic from the compiler.

## Web explorer

The explorer should support orthogonal views rather than a single graph canvas.

### Recursive system view

Expand or collapse components while preserving typed ports and contracts.

### Theory view

Show operations, laws, refinements, realizations, handlers, and dependent
applications.

### Evidence view

Trace a claim to evidence, assumptions, tools, and affected deployments.

### Source-to-artifact view

Navigate:

```text
source declaration
-> elaborated core
-> generated obligations
-> selected realization
-> lowered operations
-> target artifact
```

### Work view

Show phase, dependencies, decisions, acceptance gates, agentability, and current
parallel frontier.

### Deployment view

Compare realization selections, effects, platform capabilities, evidence, and
operational metadata.

## Work modelling

Work items remain distinct from components. Each work item declares:

- objective;
- phase and status;
- changed entities;
- hard and soft dependencies;
- unresolved decisions;
- acceptance evidence;
- allowed scope;
- review responsibility;
- delegation metadata.

The system derives the ready frontier from hard dependencies and locks.

## Agent delegation

An agent-ready work contract requires:

- stable inputs and boundaries;
- bounded context;
- deterministic or reviewable outputs;
- an acceptance oracle;
- explicit forbidden scope;
- low or understood blast radius;
- a human reviewer for semantic changes.

Agents may produce code, proofs, tests, research summaries, diagrams, or
candidate decisions. They do not silently approve new axioms, trust policies,
or kernel semantics.

### Artifact-centered delegation

Every delegated task should produce named artifacts and evidence:

```text
inputs -> agent execution -> products + activity attestation -> validation
```

This mirrors the package evidence model and enables reproducibility and audit.

## Decision records

Decisions are graph entities with:

- question;
- alternatives;
- constraints;
- supporting evidence;
- selected option;
- confidence;
- reversibility;
- affected contracts;
- reopening conditions.

Work depends on decision identities, making hidden serialization visible.

## Generated views

Canonical generated views should include:

1. recursive system map;
2. theory-realization map;
3. concern matrix;
4. evidence and trust graph;
5. work dependency graph and critical path;
6. delegation frontier;
7. runtime interaction view;
8. technology and external-adapter map;
9. source-to-artifact provenance view;
10. semantic change-impact report.

Every generated node links back to canonical facts and source locations.

## Explainability data model

Store explanations as typed trees or graphs rather than preformatted strings.
An explanation node may represent:

- rule application;
- candidate considered;
- constraint introduced;
- evidence accepted or rejected;
- assumption imported;
- dependency path;
- counterexample step.

Renderers produce terminal messages, editor hovers, diagrams, or machine input
for agents.

## Observability

Instrument tools with structured traces for:

- query execution and invalidation;
- elaboration decisions;
- resolver search;
- proof/analyzer adapter execution;
- runtime message and transaction traces;
- registry verification.

Telemetry must be optional and privacy-preserving. Local diagnostic traces
should remain available without external services.

## Reproducibility

Generated artifacts record:

- canonical input identities;
- tool and adapter versions;
- configuration and policies;
- environment-sensitive assumptions;
- outputs and evidence identities;
- non-deterministic seeds where applicable.

A report should be reproducible from a deployment lock and local artifact
cache, subject to explicitly recorded external assumptions.

## Evolution path from the current bootstrap

### Current

- JSON source documents;
- typed Python validator;
- Mermaid projections;
- simple work scheduler.

### Next

- schema migrations;
- source locations in loaded entities;
- semantic and technology adapter entities;
- SQLite derived index;
- structured explanation objects;
- generated Datalog facts;
- one recursive Datalog analysis;
- web explorer reading the same query model.

### Later

- production Rust model engine;
- incremental compiler integration;
- signed published graph snapshots;
- registry-backed multi-project discovery;
- agent execution attestations;
- impact analysis across package ecosystems.

## Acceptance criteria

The tooling architecture is validated when:

1. every displayed fact links to its canonical source;
2. deleting caches and indexes does not lose project meaning;
3. a semantic change regenerates only affected views and evidence status;
4. the same query can power CLI, LSP, and web rendering;
5. work readiness is derived rather than manually duplicated;
6. delegated work produces inspectable artifacts and validation evidence;
7. assumptions can be traced to every affected deployment.
