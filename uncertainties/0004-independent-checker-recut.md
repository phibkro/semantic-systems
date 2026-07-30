# Uncertainty 0004: recutting the independent resolution checker

## Current hypothesis

The current authored inputs and canonical project-model binding are sufficient
for a non-executing checker to reject the strongest fully re-derived rebound as
a fixed-input inconsistency. They do not authenticate producer observations,
and frozen design spec 0003 does not require them to do so.

The unresolved obstacle is a combination of size asymmetry and faithful
contract coverage. All three current disposable prototypes exceed the 70%
checker-to-production adjudication limit even under configured lower-bound
counts. The certificate also trusts acceptance-critical producer fields.

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
- Identity recomputation alone detects stale serialization, not semantic
  inconsistency. The corrected experiment demonstrates that the existing
  canonical broken-result binding of `7/9` with two named counterexamples
  distinguishes the strongest `9/9` rebound under the frozen fixed-input
  contract. That comparison still does not authenticate either observation.
- Foreign/unconsumed outcomes, unsupported ambiguity policy, wrong-obligation
  matching, and duplicate authored candidates all produced further
  counterexamples in the second experiment.
- A shared generated rule table can correlate semantic defects even when its
  interpreters are separate.
- A certificate can become a disguised producer assertion unless the checker
  derives every acceptance-critical field from independently available inputs.
- The partial bounded TypeScript screen compared current implementations of
  all three prescribed recuts. Configured checker/production lower bounds were
  406.2% for the declarative table, 449.3% for the certificate, and 429.2% for
  the structural/semantic recut. The annotation-dependent numerator oracle
  cannot establish exhaustive counting.
- All prototypes rejected four producer-rederived stale authored-identity
  probes and the fully re-derived rebound through canonical-model
  disagreement. The certificate accepted refreshed reason-set,
  selected-assumption, and eligibility lies.
- Exact-head review found that the reduced claim/report omit frozen fields,
  rule-table and recut reject presentation-only permutations, and the canonical
  inventory adapter is folded into the generic checkers. The lab mutation and
  responsibility scores are therefore partial, not frozen-contract coverage.
  See
  `research/independent-checker-recut-experiment.md`.

## Dependent work

- design spec 0003 and claim CLM-0002;
- execution authorization based on a resolution claim;
- future package and deployment verification;
- any attempt to present resolution consistency as independently checked.

## Resolving experiment

The first disposable prototype screen is complete, but the resolving
experiment remains open:

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

No current prototype met the decision criteria. The next resolving work is
either a faithful claim/report prototype with a separate canonical adapter,
positive presentation-order oracles, and exhaustive executable-region
classification, or an explicit recut of the checked claim through a reviewed
design-spec revision. Observation custody may be explored as a separate future
authority extension, but it is not a prerequisite or a repair for frozen
design spec 0003.

## Decision criteria

Select an option only if it satisfies the original behavioral and mutation
corpus, preserves typed evidence meanings, and meets the frozen 70% gate without
measurement gaming. Otherwise reopen the semantic claim itself through an
explicit design-spec revision.

The “otherwise” branch is not yet justified as a claim recut: the current
prototypes are incomplete. They are nevertheless rejected because even their
configured lower-bound surfaces fail the size gate and their behavioral gaps
fail the frozen contract. No implementation option is selected.
