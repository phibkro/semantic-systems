---
format: semantic.feature-artifact/v1
feature_id: 0003-independent-resolution-checker
kind: specification
legacy_entity_id: work.independent-resolution-checker
---
# Design spec 0003: independent resolution-result checker

Status: active

Problem owner: main research and integration agent

Semantic frontier: evidence production, policy adjudication, independent
checking, and executable-to-canonical binding

## User journey

A developer runs one command and sees the inventory evidence recipes execute
into lossless, exact-subject evidence results; the production resolver emit a
serialized resolution claim; a smaller independent checker re-derive that
claim without executing realizations or importing the resolver; and execution
proceed only after the checker and canonical-model binding gate report valid.

## Falsifiable semantic claim

For a fixed authored theory, complete realization set, lossless evidence-result
set, and evidence policy, an independent checker accepts a serialized
resolution claim if and only if:

1. theory, realization, evidence, and policy bindings plus recipe-identity
   propagation derivable from the declared checker inputs are exact;
2. every candidate is represented once;
3. evidence result truth values and counts derive from full case results;
4. candidate eligibility and reasons follow the frozen policy;
5. zero, one, or multiple eligible candidates produce the declared terminal
   result;
6. selected identity and assumptions are complete.

The composite checker-and-adapter gate additionally requires the canonical
project-model bindings to agree before execution.

Any single semantic-field mutation whose expected value is derivable from the
relevant declared inputs produces a stable named violation and prevents
execution.

## Values

- Check outputs instead of trusting producers.
- Evidence recipes and evidence results are different artifact kinds.
- Stored booleans, counts, verdicts, and terminal status are claims to
  recompute, not authority.
- The checker is smaller and less capable than the resolver pipeline.
- Shared canonicalization assumptions remain visible.
- Invalidity blocks execution and publication.

## Oracle first

The initial oracle is a positive committed development resolution plus
mutation tests that independently change one field at a time.

Required minimal rejections:

- a conformance recipe supplied where an evidence result is required;
- an `example_test` result relabeled as `proof`;
- a failing case stored with `passed: true`;
- a copied pure result with stale or internally inconsistent subject bindings
  rebound to the broken realization;
- an eligible bit or reason set changed;
- selected ID or identity changed or omitted;
- a candidate omitted or duplicated;
- a selected assumption omitted;
- policy content changed without recomputing the claim;
- canonical model identity or case count changed by one character.

Required subtle adversarial distinction: a copied pure evidence result rebound
to the broken realization with any stale subject, aggregate, claim, or result
identity must be rejected. If every declared field and identity is refreshed
self-consistently, the oracle must expose that observation authenticity is not
derivable from the generic checker inputs, and the checker must not fabricate a
violation. This is a spec-level evidence limit, not an additional checker-report
field.

## Frozen deep-module contract

### Evidence production boundary

Conformance execution occurs before resolution. The producer receives an exact
theory, realization, recipe, and execution adapter and returns either:

- one `evidence_result_v1`; or
- typed producer diagnostics and no result.

The production resolver never imports or calls the conformance runner,
operation registry, domain transition, replay function, or execution adapter.

An unbound adapter remains a producer diagnostic. Resolution treats the lack of
a valid result as ineligible while retaining the producer diagnostic in the
explanation.

### `evidence_result_v1`

A lossless result contains:

- fixed artifact kind `evidence_result`;
- schema version;
- fixed producer-owned evidence category;
- producer identity;
- exact recipe identity;
- exact theory and realization identities;
- obligation;
- declared assumptions;
- every case result, including case ID, passed value, and failure detail.

Overall pass/fail, passed count, total count, counterexamples, and evidence
result identity derive from those fields. Consumers must not trust separately
stored aggregate values.

A conformance-suite recipe has artifact kind `conformance_suite` and cannot
stand in for a result.

### `resolution_claim_v1`

A serialized resolution claim contains:

- schema version;
- exact theory ID and identity;
- required obligation;
- exact policy ID and content identity;
- complete candidate set;
- for each candidate: realization ID and identity, theory targeting,
  realization assumptions, evidence result or producer diagnostics,
  claimed eligibility, and claimed reason set;
- terminal status;
- selected `{id, identity}` or null;
- projected selected assumptions.

Candidate and reason ordering is presentation-only. Candidate membership,
identities, reason sets, status, selection, and assumptions are semantic.
Lexical order is never a fallback selection rule.

### Independent checker

The generic checker receives authored theory, realization, and policy documents
plus the evidence packets and serialized claim. It:

1. recomputes theory and realization identities;
2. recomputes policy content identity;
3. requires complete unique candidate coverage;
4. validates exact evidence subjects derivable from its inputs and requires at
   most one result per realization/obligation;
5. validates a nonempty recipe identity and its exact propagation through the
   evidence result and claim, without claiming authored-recipe source binding;
6. derives evidence aggregates from non-empty full case results;
7. applies category and assumption policy;
8. re-derives every candidate reason set and eligibility;
9. derives the zero/one/multiple-candidate terminal result;
10. verifies selected identity and assumption projection; and
11. reports deterministic violations.

All supplied evidence packets must be consumed exactly once or rejected as
missing, duplicate, malformed, foreign, or unbound. Candidate and reason
ordering remains presentation-only.

The checker must not import the production resolver, demo orchestration,
conformance runner, operation registry, domain semantics, or execution module.
It performs no realization execution, plugin loading, network access, or
filesystem mutation.

The checker establishes consistency of serialized observations with authored
subjects, policy, and claim fields. It has no execution, canonical-model,
recipe-source, provenance, signature, freshness, or observation-authentication
authority. It must reject stale or internally inconsistent subject rebinding,
but it must not report a fully refreshed self-consistent observation forgery as
detectable without an additional custodied input.

Sharing canonical JSON and exact identity functions is a visible correlated-TCB
assumption, not independent proof of hashing correctness.

### Checker report

The report contains:

- `valid` or `invalid`;
- stable violation code;
- exact subject;
- structured details;
- recomputed terminal status and selection;
- model-binding status.

Violation ordering is presentation-only. An invalid report blocks execution.

### Canonical project-model binding

A thin inventory-specific adapter compares the valid generic-checker result
with canonical model identities, canonical evidence subjects and case counts,
policy, deployment lock, and selected realization. The generic checker contains
no project-graph logic.

The adapter can report disagreement between the submitted evidence result and a
separately custodied canonical record, including the canonical broken
realization's `7/9` result and named counterexamples. Such disagreement is a
canonical-binding violation. Agreement is not proof that the underlying
observation is true, authentic, independently witnessed, signed, or current.

This remains implementation slice 7. It is a test/runtime-validation rung. A
later generator may make the executable result lock the canonical source for
derived graph fields.

### Recipe-source custody

A separate adapter may receive an authored recipe, recompute its identity, and
compare it with the result's `recipeIdentity`. The generic checker does not
receive authored recipes and therefore cannot make this claim. Recipe-source
custody establishes content equality only; it does not establish that the
recipe was executed or that its observation is authentic.

## Independence and size gate

The checker decision core must remain at most 70% of the production
adjudication decision surface by nonblank, noncomment source lines. The exact
measurement and exclusions are recorded in the completed plan.

This ratio is a guard against duplicating the resolver, not a reason to obscure
code. Kill or recut the design if independent recomputation needs the same
execution dependencies or equal decision complexity. A declarative eligibility
table that generates both implementations is the preferred fallback.

This authority recut does not change the compared checker and production
adjudication surfaces. It does not authorize changing the 70% threshold,
padding the production denominator, omitting checker-side structural
validation, or counting unlike semantic regions. Any later surface definition
must classify every validity-affecting executable region on both sides under
identical inclusion and exclusion rules.

## Visible command

```bash
bun run semantic-tracer -- verify-resolution examples/inventory
```

It reports the exact theory, policy, evidence result identities, selected
realization, checker status, assumptions, and canonical-model binding. It exits
nonzero before execution if either check fails.

## Acceptance

1. The positive development result is accepted and then executes the oracle.
2. Every required mutation derivable from the relevant declared inputs reports
   its stable violation and prevents execution.
3. Production resolution consumes precomputed evidence packets and imports no
   evidence producer or execution adapter.
4. The checker satisfies its forbidden-import and capability restrictions.
5. Lossless serialization round-trips case details and derives aggregates.
6. Policy changes alter eligibility without invalidating the historical
   evidence result.
7. Canonical model drift fails the slice-7 binding gate. A fully refreshed
   observation that disagrees with a separately custodied canonical record is
   reported as canonical disagreement, not generic-checker detection of
   forgery.
8. Existing inventory tracer behavior and counterexamples remain covered.
9. The checker meets the unchanged symmetric independence and 70% size gate.
10. Full repository checks and generated-view checks pass.
11. A recipe supplied as an evidence result is rejected, while authored-recipe
    source binding is reported only by the recipe-custody adapter.
12. The oracle corpus distinguishes stale or internally inconsistent rebinding
    from a fully refreshed self-consistent rebound whose authenticity is not
    derivable from the generic checker inputs.

## Evidence claim and limits

Positive and mutation fixtures provide `example_test` evidence. Executing the
checker and binding adapters provides `runtime_validation`. Neither is proof.

The generic checker establishes internal consistency for frozen v1 artifacts
relative to its declared authored theory, realization, policy, evidence-packet,
and claim inputs. It does not establish:

- authored-recipe source binding;
- truth, authenticity, provenance, freshness, or independent custody of
  producer observations;
- that a fully refreshed self-consistent result was produced by executing the
  claimed realization or recipe;
- universal inventory correctness;
- proof validity;
- external signatures or revocation;
- collision resistance or canonicalizer correctness; or
- production runtime suitability.

A recipe-custody adapter can establish equality between an authored recipe's
recomputed identity and the result's `recipeIdentity`; it does not establish
that execution occurred. A canonical-model adapter can establish agreement with
a separately custodied canonical record; it does not authenticate either
record. Observation provenance or authenticity belongs to a future explicitly
named observation-custody and authentication frontier.

## Frozen boundaries and non-goals

Do not change the inventory theory, laws, effects, domain transition, replay
semantics, `theory-norm-v0`, binder significance, evidence-category meanings,
policy semantics, proof/import/signature systems, actor or STM runtimes, or
kernel calculus.

## Kill criteria

- A recipe is accepted as evidence.
- A one-field subject, policy, case, verdict, selection, assumption, or model
  mutation whose expected value is derivable from the relevant declared inputs
  is accepted.
- Candidate omission or duplication is accepted.
- The checker trusts stored aggregates or verdicts instead of deriving them.
- Invalid checking does not block execution.
- The checker imports the resolver or execution machinery.
- The checker equals or exceeds the resolver decision surface without a
  demonstrated trust reduction.
- Model drift remains only a hand-maintained assertion rather than a reusable
  violation.
- The generic checker claims authored-recipe source binding without receiving
  the authored recipe.
- The generic checker claims to detect a fully refreshed self-consistent
  observation forgery without execution, custody, authentication, or an
  independently authoritative observation input.
- Canonical-model disagreement is reported as proof of observation forgery or
  authenticity.
- Recipe custody, generic claim checking, canonical-model binding, and
  execution gating are collapsed into one unnamed authority.

## Semantic diff

This recut preserves typed serializable evidence results, serialized resolution
claims, complete authored-candidate coverage, exact subject checks derivable
from declared inputs, independent policy and terminal recomputation, exact
selected identities and assumptions, deterministic violations, execution
blocking, and a separate canonical-model binding check.

It clarifies that the generic checker validates recipe-identity presence and
propagation but does not bind that identity to an absent authored recipe.
Authored-recipe source binding moves to a separately named recipe-custody
adapter.

It separates stale or internally inconsistent result rebinding, which the
generic checker rejects, from a fully refreshed self-consistent observation
forgery, which the generic checker cannot distinguish. Canonical-model
disagreement remains a slice-7 consistency violation. Observation provenance
and authenticity move to a future observation-custody and authentication
frontier.

The recut does not change theory meaning, laws, effects, identity v0, evidence
categories, policy rules, inventory behavior, slice-6 execution/CLI ownership,
slice-7 canonical-model ownership, or the 70% checker-size gate.
