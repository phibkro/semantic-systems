# Decision 0005: frozen contracts are deep-module boundaries

## Question

How should Semantic Systems freeze contracts so independent implementations
can progress concurrently without moving conflict into final integration?

## Alternatives

1. Freeze the current file, API, or data structure shape.
2. Keep contracts fluid and serialize all implementation behind the designer.
3. Freeze a compact semantic interface that exposes types, operations, laws,
   invariants, effects, ownership, observations, evidence obligations, and
   acceptance behavior while hiding implementation depth.

## Chosen option

Option 3. A frozen contract is the shallow interface of a deep module.

The boundary should be small relative to the behavior and implementation
freedom it enables. Independent realizations may choose representations,
algorithms, allocation strategies, runtimes, and internal proof techniques so
long as they satisfy the same observable contract and evidence obligations.

Freezing is scoped to one tracer or version. New evidence may reopen the
contract, but the revision must be explicit and downstream work must be
invalidated or migrated rather than silently retargeted.

## Rationale

Freezing a shallow mirror of implementation structure produces brittle
parallelism: every internal change leaks through the boundary. Leaving the
contract fluid makes every worker depend on ongoing semantic design.

A deep-module contract concentrates judgment in a compact, composable
interface and turns implementation alternatives into realizations of the same
theory. This supports parallel work without making representation choices
semantic by accident.

## Confidence

High for tracer-sized contracts with executable oracles. Moderate for
foundational calculi, where hidden interactions between effects, ownership,
normalization, and evidence may force explicit revision.

## Reversibility

Moderate. A versioned contract can be replaced, but accepted realizations and
evidence remain bound to the exact old contract and require migration or new
evidence.

## Affected entities

Design specs, normalized contracts, realization interfaces, evidence recipes,
delegation packets, work dependencies, acceptance gates, and integration
reviews.

## Reopening condition

Reopen when a supposedly internal choice changes an observation, evidence
obligation, realization eligibility, or composition law; or when repeated
implementations require access to hidden machinery and the interface no longer
provides enough leverage.
