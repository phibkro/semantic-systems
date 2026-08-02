# Design spec 0056: project JSON language tooling

Status: frozen

Date: 2026-08-02

Design-Lens-Version: open-semantic-system-v1

## Problem

Canonical project JSON is decoded and validated only after a command runs. Agents
editing `model/**/*.json` receive no structural completion or immediate schema
diagnostics, and the existing hand-authored JSON Schema can drift from the Effect
v4 decoder and lifecycle metadata contract.

## Felt journey

An agent opens a feature record, completes a canonical entity kind and lifecycle
field from the schema, and sees an invalid value rejected before running
`semproj`. The later `semproj validate` command remains the authority for graph
semantics.

## Open semantic system design lens

### Boundary and warranted state

The boundary is structural editor tooling for canonical project-model JSON. The
Effect v4 input schemas own decodable shape. A deterministic JSON Schema is a
projection. The language server reports document diagnostics; it does not own or
establish graph validity.

### Semantic inputs

- Effect v4 project-document and feature-metadata schemas.
- Canonical `model/**/*.json` documents.
- LSP completion and diagnostic queries.

File contents are observations of authored state. Successful schema validation
does not establish cross-file references, lifecycle custody, evidence force, or
semantic correctness.

### Semantic outputs

- `generated/schema/project-document.schema.json`: deterministic projection.
- `.omp/lsp.json`: deterministic repository configuration with the schema
  embedded for `model/**/*.json`.
- LSP completion candidates and diagnostics: ephemeral editor observations.
- `semproj validate`: existing semantic diagnostics, unchanged.

No domain event or external effect is introduced.

### Effect protocols and uncertainty

Generation either writes/checks the complete projection or fails. The standard
JSON language service either returns diagnostics/completions or an explicit
protocol failure. Unsupported custom keywords are omitted rather than silently
claimed as enforced.

### Components and orthogonal structures

```mermaid
flowchart LR
  E[Effect v4 input schemas] --> G[semproj generator]
  G --> J[generated JSON Schema]
  G --> C[repository LSP configuration]
  J --> C
  C --> L[standard JSON language service]
  M[model JSON] --> L
  M --> V[semproj semantic validator]

The generator preserves one structural vocabulary. The semantic validator applies
a different, stronger graph vocabulary. Neither result upgrades the other's
evidential force.

### Bounded autonomy and resources

Generation and validation are finite over repository files. The LSP reads one
workspace, performs no network request, launches no background project worker,
and has no authority to mutate model documents.

### Evidence, assumptions, and unsupported claims

- Types and runtime decode enforce the canonical source shape.
- Deterministic generation tests enforce projection custody.
- The maintained VS Code JSON language service is exercised against known-good
  and known-bad documents.
- Exact acceptance and independent review cover the repository integration.
- Assumption: editors or agents honor the repository `.omp/lsp.json` association.
- Unsupported: schema success proves referential integrity, lifecycle correctness,
  evidence validity, or semantic truth.

## Deep-module contract

`projectDocumentJsonSchema(): JsonValue` returns a deterministic Draft 2020-12
schema derived from the exported Effect v4 schemas. The projection exposes exact
entity and relation kind enums and feature lifecycle metadata while leaving other
attribute keys available to their owning domain validators. Default
`semproj generate` owns both the generated schema path and `.omp/lsp.json`;
the repository configuration embeds that schema and binds it to canonical model
JSON using the maintained JSON language server. An explicit `--output PATH`
writes or checks only that isolated projection directory and never mutates or
requires repository configuration.

## Oracle-first counterexamples

1. A valid canonical feature record has zero JSON language-service errors.
2. `entities: "not-an-array"` produces a structural diagnostic.
3. An unknown entity kind produces an enum diagnostic and no completion claim.
4. `feature_loop: "sometimes"` produces a lifecycle enum diagnostic.
5. A structurally valid dangling relation remains schema-valid and is rejected
   only by `semproj validate`.

## Acceptance

`just accept 0056-project-json-language-tooling` must:

1. run focused source/projection tests;
2. prove deterministic generation is current;
3. exercise the maintained JSON language service on positive and negative cases;
4. prove the repository LSP association targets only canonical model inputs;
5. run `semproj validate` to preserve the semantic boundary.

A fresh read-only agent must use only the schema association and a representative
feature-edit task, report completions/diagnostics, and identify that semantic
validation remains separate.

## Kill or redesign criteria

Redesign if Effect cannot generate the required Draft 2020-12 vocabulary without
hand-copying domain facts, or if the language service cannot consume the projection
with deterministic diagnostics. Do not build a custom JSON language server.

## Non-goals

- Replacing `semproj validate` or the Effect decoder.
- Encoding all domain semantics in JSON Schema.
- Adding editor-specific settings outside repository OMP configuration.
- Auto-editing, code actions, or remote schema hosting.
- Claiming proof, analysis, or runtime correctness from LSP diagnostics.

## Semantic diff

Before: model JSON shape is checked only by commands, and a hand-authored schema
can drift. After: Effect schemas remain canonical, a deterministic schema
projection supplies standard language tooling, and semantic validation remains
explicitly separate.

Revision 1, 2026-08-02: `.omp/lsp.json` is now an explicit deterministic
repository projection of the same Effect schema. The initial frozen text treated
it only as a hand-authored binding; this revision invalidates that custody claim.
An explicit generation output remains isolated from repository configuration.
