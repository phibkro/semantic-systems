# Decision 0003: scoped data-level theory identity v0

## Question

What exact identity boundary is sufficient to exercise evidence-aware
realization resolution before the normalized core calculus exists?

## Alternatives

1. Wait for the complete normalized core and alpha-equivalence rules.
2. Hash authored JSON directly.
3. Define a versioned data-level semantic projection now and make its
   limitations explicit.

## Chosen option

Option 3: `theory-norm-v0`, as frozen in design spec 0001.

## Rationale

Waiting prevents the smallest thesis-complete tracer bullet. Hashing authored
JSON makes formatting, documentation, and declaration order semantic by
accident. A versioned projection supplies exact subjects for current evidence
while keeping the future normalized-core algorithm free to replace it under a
new normalization version.

## Confidence

Moderate. Determinism and law sensitivity are directly testable; semantic
equivalence beyond the declared v0 treatment is not established.

## Reversibility

High at this stage. Published identifiers always include their normalization
version. A later algorithm creates new identities and explicitly invalidates or
migrates evidence.

## Affected entities

`decision.theory-identity`, `work.theory-identity`, the inventory theory and
realizations, conformance evidence, resolver policy, and deployment lock.

## Reopening condition

Reopen when binder equivalence, opaque definitions, universe parameters,
refinement, or imported normalized-core terms become required by a real
consumer, or if the v0 falsifiers fail.
