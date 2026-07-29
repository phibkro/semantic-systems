# `semantic-packages` patterns relevant to Semantic Systems

Inspected at commit `d0fa6d0b2d6d14756c26f793255beae325197895`.

This is design-ancestry analysis, not an import plan. The current repository is
canonical. Differences are evidence about earlier hypotheses, not automatic
defects in either project.

## Patterns to retain or sharpen

1. **Exact typed references.** ADR 0005 addresses records by
   `(kind, id, version)` and rejects bare names, array positions, and implicit
   latest versions. This is a useful negative-fixture inventory for the current
   graph's exact identities and link validation.
2. **Claims are not their evidence.** The evidence model separates a scoped
   proposition from artifacts that support, challenge, or fail to decide it.
   An accepted assertion remains an assertion; an accepted benchmark may still
   fail its threshold.
3. **Validity, applicability, and coverage are separate.** A malformed link,
   valid-but-inapplicable evidence, and an unsupported required concern have
   different meanings and should produce different explanations.
4. **Contradictory evidence survives.** Supporting and challenging evidence
   yields a visible contested result rather than a stronger badge or a
   last-writer-wins collapse.
5. **Semantic and realization compatibility are different graphs.** A
   realization may satisfy the same theory while requiring an FFI, Wasm, RPC,
   or process boundary. Operational composability cannot establish semantic
   acceptability.
6. **Resolution is an explanation artifact.** The earlier resolver design
   returns selected realizations, evidence per required concern, integration
   boundary and cost, unmet preferences, and unknowns.
7. **Profiles scope claims; they are not evidence.** Platform or workload
   metadata describes where a claim applies but does not establish the claim.
8. **Generated projections remain subordinate.** Browser pages, indexes,
   badges, and summaries derive from versioned canonical records.

## Counterexamples and baggage to reject

- The provisional JSON schema permits arbitrary additional properties and is
  too weak to freeze a semantic contract.
- The project contains design documents but no accepted executable vertical
  slice; its assertions do not establish implementation viability.
- Exact author-assigned record identity does not solve normalized theory
  equivalence, binder identity, or semantic compatibility across versions.
- Its evidence lifecycle vocabulary must not be confused with evidence result
  or strength; the current metamodel should keep those axes independently
  queryable.
- The earlier trust-boundary list treats schema validators and conformance
  runners at a coarse component level. The current project still needs exact
  artifact identities and transitive assumptions for each accepted result.
- The repository's active plans and provider-operation notes are historical
  context only; workstation policy and the current execution plan supersede
  them.

## Immediate comparison targets

- Compare current tracer evidence records against the earlier requirement that
  executable evidence name the realization, adapter, runner, inputs, and result
  artifact digests.
- Preserve two permanent resolver counterexamples:
  semantically acceptable but operationally indirect, and operationally
  composable but semantically or evidentially unacceptable.
- Use ADR 0005's rejected reference forms as negative fixtures for future graph
  and package link checking.

## Revisit

Re-read this ancestry before package identity, adapters, profile-scoped
evidence, contested evidence, or cross-version compatibility becomes the active
semantic frontier.
