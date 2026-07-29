# Decision 0004: dependency-aware parallel semantic frontiers

## Question

Must Semantic Systems restrict development to one active foundational semantic
frontier, or may independent frontiers progress concurrently?

## Alternatives

1. Permit only one semantic frontier at a time.
2. Permit arbitrary concurrent changes and reconcile conflicts afterward.
3. Derive concurrency from explicit dependencies, contract overlap, file
   ownership, acceptance gates, and available resources.

## Chosen option

Option 3. Independent semantic hypotheses may progress concurrently.

Read-only investigation fans out within machine and provider limits.
Concurrent writers receive isolated worktrees and explicit ownership.
Serialization is required only for:

- an unresolved dependency on another work product;
- concurrent changes to the same semantic contract or normalized boundary;
- overlapping write ownership that has not been isolated;
- a shared acceptance gate whose inputs are incomplete;
- final semantic reconciliation, integration, and publication.

## Rationale

A blanket single-frontier rule confuses semantic risk with scheduling. It
delays independent falsifiable experiments even when their contracts,
implementations, and evidence do not interact. Unbounded concurrency is also
unsafe because two agents can silently make incompatible assumptions or mutate
the same working directory.

Explicit dependency edges and isolated ownership make the legitimate
serialization points inspectable. This applies the project thesis to work
itself: work depends on contracts rather than on an implicit global queue.
Decision 0005 defines how a frozen contract must act as a deep-module boundary
rather than a shallow copy of implementation structure.

## Confidence

High for read-only research and non-overlapping implementation slices.
Moderate for multiple foundational designs because hidden semantic coupling may
still be discovered during integration.

## Reversibility

High. Concurrency is an execution property derived from work metadata. Any
frontier can acquire a dependency or lock without changing its semantic
contract.

## Affected entities

The delegation frontier, active execution plans, work dependencies, worktree
ownership, agent admission, and integration gates.

## Reopening condition

Reopen if parallel frontiers repeatedly create hidden contract conflicts that
cannot be represented as dependencies or ownership locks, or if resource
contention makes the derived parallel frontier operationally counterproductive.
