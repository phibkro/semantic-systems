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

1. theory, realization, recipe, evidence, and policy bindings are exact;
2. every candidate is represented once;
3. evidence result truth values and counts derive from full case results;
4. candidate eligibility and reasons follow the frozen policy;
5. zero, one, or multiple eligible candidates produce the declared terminal
   result;
6. selected identity and assumptions are complete; and
7. the canonical project-model bindings agree.

Any single semantic-field mutation produces a stable named violation and
prevents execution.

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
- a copied pure result rebound to the broken realization;
- an eligible bit or reason set changed;
- selected ID or identity changed or omitted;
- a candidate omitted or duplicated;
- a selected assumption omitted;
- policy content changed without recomputing the claim;
- canonical model identity or case count changed by one character.

Required subtle adversarial case: a structurally valid pure evidence result is
copied, assigned the broken realization identity, and retains its passing case
payload. Exact subject and derived result checks must reject it.

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

The checker receives authored theory, realization, and policy documents plus
the evidence packets and serialized claim. It:

1. recomputes theory and realization identities;
2. recomputes policy content identity;
3. requires complete unique candidate coverage;
4. validates exact evidence subjects and at most one result per
   realization/obligation;
5. derives evidence aggregates from non-empty case results;
6. applies category and assumption policy;
7. re-derives every candidate reason set and eligibility;
8. derives the zero/one/multiple-candidate terminal result;
9. verifies selected identity and assumption projection; and
10. reports deterministic violations.

The checker must not import the production resolver, demo orchestration,
conformance runner, operation registry, domain semantics, or execution module.
It performs no realization execution, plugin loading, network access, or
filesystem mutation.

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

A thin inventory-specific adapter compares the checked result with canonical
model identities, evidence subjects, case counts, policy, deployment lock, and
selected realization. The generic checker contains no project-graph logic.

This is a test/runtime validation rung. A later generator may make the
executable result lock the canonical source for derived graph fields.

## Independence and size gate

The checker decision core must remain at most 70% of the production
adjudication decision surface by nonblank, noncomment source lines. The exact
measurement and exclusions are recorded in the completed plan.

This ratio is a guard against duplicating the resolver, not a reason to obscure
code. Kill or recut the design if independent recomputation needs the same
execution dependencies or equal decision complexity. A declarative eligibility
table that generates both implementations is the preferred fallback.

## Visible command

```bash
PYTHONPATH=src python -m semantic_tracer verify-resolution examples/inventory
```

It reports the exact theory, policy, evidence result identities, selected
realization, checker status, assumptions, and canonical-model binding. It exits
nonzero before execution if either check fails.

## Acceptance

1. The positive development result is accepted and then executes the oracle.
2. Every required mutation reports its stable violation and prevents
   execution.
3. Production resolution consumes precomputed evidence packets and imports no
   evidence producer or execution adapter.
4. The checker satisfies its forbidden-import and capability restrictions.
5. Lossless serialization round-trips case details and derives aggregates.
6. Policy changes alter eligibility without invalidating the historical
   evidence result.
7. Canonical model drift fails the binding gate.
8. Existing inventory tracer behavior and counterexamples remain covered.
9. The checker meets the independence and size gate.
10. Full repository checks and generated-view checks pass.

## Evidence claim and limits

Positive and mutation fixtures provide `example_test` evidence. Executing the
checker provides `runtime_validation`. Neither is proof.

This tracer establishes internal consistency for frozen v1 artifacts. It does
not establish:

- universal inventory correctness;
- truth or authenticity of producer observations;
- proof validity;
- external signatures or revocation;
- collision resistance or canonicalizer correctness;
- Python runtime correctness;
- production runtime suitability.

## Frozen boundaries and non-goals

Do not change the inventory theory, laws, effects, domain transition, replay
semantics, `theory-norm-v0`, binder significance, evidence-category meanings,
policy semantics, proof/import/signature systems, actor or STM runtimes, or
kernel calculus.

## Kill criteria

- A recipe is accepted as evidence.
- A one-field subject, policy, case, verdict, selection, assumption, or model
  mutation is accepted.
- Candidate omission or duplication is accepted.
- The checker trusts stored aggregates or verdicts instead of deriving them.
- Invalid checking does not block execution.
- The checker imports the resolver or execution machinery.
- The checker equals or exceeds the resolver decision surface without a
  demonstrated trust reduction.
- Model drift remains only a hand-maintained assertion rather than a reusable
  violation.

## Semantic diff

This bullet adds typed serializable evidence results, serialized resolution
claims, an independent validation gate, exact selected identities, and a
canonical-model binding check. It moves conformance production out of policy
resolution.

It does not change theory meaning, laws, effects, identity v0, evidence
categories, policy rules, or inventory behavior.
