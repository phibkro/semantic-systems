# Design spec NNNN: feature title

Status: draft

Date: YYYY-MM-DD

Design-Lens-Version: open-semantic-system-v1

## Problem

State the user-visible or semantically falsifiable problem. Name the important
claim and why current behavior fails it.

## Felt journey

Describe one experienceable tracer bullet from input through visible result.

## Open semantic system design lens

### Boundary and warranted state

Declare the system/component boundary, the state and invariants it owns, what
remains environmental, and whether any recursive component is opaque or
expanded.

### Semantic inputs

Inventory commands, observations, queries, acknowledgements, snapshots, or
other input families. State observation provenance and what each input does not
establish.

### Semantic outputs

Separate domain events, artifacts/materialized views, effect requests, and
diagnostics. Mark canonical sources and derived projections.

### Effect protocols and uncertainty

Describe accepted, rejected, delayed, duplicated, timed-out, unknown, and
later-observed outcomes where relevant. State idempotency, retry,
deduplication, reconciliation, compensation, and cancellation semantics.

### Components and orthogonal structures

Keep authority/state ownership, supervision, communication, structured-task
ownership, derivation/invalidation, deployment, and cross-component atomicity
distinct where they exist. Identify the typed messages between components.
State whether each transformation preserves one message's semantics within a
layer or crosses into a different vocabulary, authority, evidential force, or
effect interpretation. Trace important vertical slices to an explicit value,
rejection, outward request, handoff, wait, or suspension. For each message
cycle, declare a progress measure, bound, wait state, cancellation/escalation
policy, environmental assumption, or intentional persistent-process meaning.
State composition risks beyond local correctness.

### Bounded autonomy and resources

Declare reaction/task lifetime, queue, fan-out, concurrency, retry, payload,
memory, capability, progress, and recovery bounds or policies that the claim
depends on.

### Evidence, assumptions, and unsupported claims

Name actual evidence categories and artifacts. Record environmental premises
and guarantees the feature does not establish.

## Deep-module contract

Freeze the smallest stable interface that hides implementation freedom.

## Oracle-first counterexamples

List positive, rejection, and adversarial observations that must first fail for
the intended semantic reason.

## Acceptance

List exact executable observations and their scope.

## Kill or redesign criteria

State discoveries that should stop or materially recut the feature.

## Non-goals

Bound the work explicitly.

## Semantic diff

State what meaning changes and what remains unchanged.
