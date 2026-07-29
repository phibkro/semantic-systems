# RFC 0001: Federated Typed Project Graph

## Status

Bootstrap decision.

## Decision

Store project facts as typed JSON entities and relations. Generate orthogonal
views for structure, semantic realization, responsibilities, evidence, work,
delegation, and runtime behavior.

## Why

A hierarchy cannot faithfully represent alternative realizations, evidence
dependencies, work dependencies, deployment choices, or responsibility.
Separately maintained diagrams drift. An untyped graph cannot support strong
validation or scheduling inference.

## Consequences

The metamodel becomes governed project infrastructure. Every generated view
links back to stable source IDs. Cycles and unsupported claims become explicit
diagnostics.
