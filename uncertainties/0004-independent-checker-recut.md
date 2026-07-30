# Uncertainty 0004: recutting the independent resolution checker

## Current hypothesis

No non-executing checker can authenticate a fully self-consistent rebound of
producer-owned case observations from the current authored inputs alone.
Internal structural and policy consistency can still be checked independently,
but observation authenticity requires an independently acquired custody input.
The frozen claim must either add that input or explicitly narrow its authority.

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
- TypeScript experiment `a373ae9` did not solve that asymmetry: exact-head
  review measured 194 checker decision lines against 92 symmetric resolver
  adjudication lines, before counting another 92 semantic validation lines and
  49 semantic comparison lines excluded from the published ratio. It was
  reverted at `adf7e8d`.
- A self-consistent packet rebound cannot be distinguished structurally when
  the packet's case observations contain no independently custodial
  realization-specific fact. Identity recomputation detects stale
  serialization, not producer authenticity.
- Foreign/unconsumed outcomes, unsupported ambiguity policy, wrong-obligation
  matching, and duplicate authored candidates all produced further
  counterexamples in the second experiment.
- A shared generated rule table can correlate semantic defects even when its
  interpreters are separate.
- A certificate can become a disguised producer assertion unless the checker
  derives every acceptance-critical field from independently available inputs.
- The bounded TypeScript resolving experiment compared all three prescribed
  recuts. Honest checker/production adjudication ratios were 229.6% for the
  declarative table, 114.9% for the certificate, and 230.6% for the
  structural/semantic recut. All accepted the fully re-digested rebound; the
  certificate also accepted a self-consistent eligibility lie. See
  `research/independent-checker-recut-experiment.md`.

## Dependent work

- design spec 0003 and claim CLM-0002;
- execution authorization based on a resolution claim;
- future package and deployment verification;
- any attempt to present resolution consistency as independently checked.

## Resolving experiment

The disposable, read-only prototype comparison is complete:

1. one declarative rule table with two independently implemented evaluators;
2. one minimal certificate format with a checker that validates only the
   certificate and exact input bindings;
3. one recut claim that separates structural packet validation from semantic
   eligibility recomputation and explicitly limits subject custody to facts
   available independently of the producer.

For each, measure adjudication-only nonblank/noncomment lines, mutation score,
forbidden dependency closure, correlated inputs, and failure explanations.
Reject any option that passes by enlarging the production denominator,
excluding semantic checker branches, sharing an adjudication implementation,
or trusting producer-owned eligibility fields.

No option met the decision criteria. The next resolving experiment is one
minimal `ObservationCustody` commitment for the broken realization, produced by
an authority independent of the checked producer. If that authority cannot be
named without circularity, revise the frozen claim to internal consistency and
remove the impossible authenticity requirement.

## Decision criteria

Select an option only if it satisfies the original behavioral and mutation
corpus, preserves typed evidence meanings, and meets the frozen 70% gate without
measurement gaming. Otherwise reopen the semantic claim itself through an
explicit design-spec revision.

The “otherwise” branch is now active. No implementation option is selected.
