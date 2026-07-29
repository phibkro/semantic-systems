# Uncertainty 0004: recutting the independent resolution checker

## Current hypothesis

A compact declarative eligibility contract can generate the production
adjudicator and a structurally different checker, or a compact certificate
checker can validate a richer producer result, while keeping the checker
decision core below 70% of the production adjudication surface.

## Supporting evidence

- Experiment `b9cea28` successfully separated evidence production from
  resolution, preserved lossless packets, blocked execution on mutation, and
  avoided forbidden production imports.
- Data-driven recursive comparison reduced duplicated field-specific branches.
- The frozen contract already identifies a declarative generated table as the
  preferred fallback.

## Counterevidence

- The first independent checker needed additional shape, completeness,
  multiplicity, and model-binding validation that the production resolver did
  not perform; its measured decision surface remained over the 70% limit.
- A shared generated rule table can correlate semantic defects even when its
  interpreters are separate.
- A certificate can become a disguised producer assertion unless the checker
  derives every acceptance-critical field from independently available inputs.

## Dependent work

- design spec 0003 and claim CLM-0002;
- execution authorization based on a resolution claim;
- future package and deployment verification;
- any attempt to present resolution consistency as independently checked.

## Resolving experiment

Build disposable, read-only prototypes against the frozen inventory fixtures:

1. one declarative rule table with two independently implemented evaluators;
2. one minimal certificate format with a checker that validates only the
   certificate and exact input bindings;
3. one recut claim that separates structural packet validation from semantic
   eligibility recomputation.

For each, measure adjudication-only nonblank/noncomment lines, mutation score,
forbidden dependency closure, correlated inputs, and failure explanations.
Reject any option that passes by enlarging the production denominator,
excluding semantic checker branches, sharing an adjudication implementation,
or trusting producer-owned eligibility fields.

## Decision criteria

Select an option only if it satisfies the original behavioral and mutation
corpus, preserves typed evidence meanings, and meets the frozen 70% gate without
measurement gaming. Otherwise reopen the semantic claim itself through an
explicit design-spec revision.
