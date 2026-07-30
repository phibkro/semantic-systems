# Uncertainty 0004: recutting the independent resolution checker

## Resolution

Resolved negatively for the frozen design-0003 contract on 2026-07-30.

The final declarative shared-policy experiment recorded a checker surface of
764 included lines against 489 production lines (156.2%). Independent review
found an asymmetric 41-line production exclusion and several missing checker
validations. Counting all 41 lines yields a conservative 764/530 = 144.2%;
adding the missing checker responsibilities can only increase that ratio. Both
values remain far above the unchanged 70% gate.

The experiment is integrated only as rejected counterevidence at `219ee7c`;
its exact-head mutation and measurement limitations are recorded at `1d30fcf`
and in `research/independent-checker-shared-policy-experiment.md`. No
production checker option is selected and CLM-0002 is not established. The
checker implementation frontier is stopped until an explicit reviewed design
revision changes the size/trust claim or provides a materially different
architecture.

## Former hypothesis

A compact declarative policy contract may remove duplicated eligibility and
reason branches from independently compiled production and checker evaluators.
It becomes a visible correlated semantic assumption and cannot replace
independent parsing, authored-identity recomputation, complete candidate and
packet coverage, evidence aggregate derivation, terminal recomputation,
selected-assumption projection, deterministic violations, or capability
separation.

It was unknown whether that architecture could satisfy the unchanged symmetric
70% checker-to-production adjudication gate. Every disposable prototype
exceeded the gate under conservative configured lower bounds.

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
- Identity recomputation detects stale or internally inconsistent
  serialization, not a fully refreshed self-consistent observation rebound.
  The canonical broken-result binding of `7/9` with two named counterexamples
  can report disagreement with the strongest `9/9` rebound only through the
  separate slice-7 adapter. That comparison authenticates neither observation.
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

## Completed resolving experiment

The reviewed authority recut and final declarative shared-policy experiment are
complete. The experiment used two independently authored evaluators:

1. represent the frozen policy predicates and reason vocabulary as bounded
   typed data;
2. compile or interpret that data independently for production adjudication and
   checker comparison without sharing an evaluator implementation;
3. exercise the complete current `resolution_claim_v1` and checker-report
   fields, presentation-only ordering, complete packet consumption, and a
   separate canonical-binding adapter;
4. classify every validity-affecting executable region reachable from both
   entrypoints under identical inclusion and exclusion rules;
5. require a negative control proving that an unclassified validity path makes
   measurement fail; and
6. stop immediately if the exhaustive symmetric ratio exceeds 70%.

Measure the exact ratio, frozen mutation corpus, forbidden dependency closure,
correlated inputs, and failure explanations. Reject any result that enlarges
the production denominator, excludes checker parsing or comparison branches,
shares an adjudication implementation, trusts producer-owned eligibility, or
folds recipe custody, canonical binding, execution, or observation
authentication into the generic checker.

Observation custody remains a separate future authority extension. It is not a
prerequisite or repair for design spec 0003.

## Applied decision criteria

Select the declarative architecture only if it satisfies the full behavioral
and mutation corpus, preserves typed evidence meanings and separated
authorities, and meets the frozen 70% gate without measurement gaming.
Otherwise stop the checker implementation frontier and reopen the size/trust
claim through another explicit reviewed design-spec revision.

The current prototypes and final experiment are rejected because even the
review-corrected conservative surface fails the size gate and the behavioral
gaps fail the frozen contract. No implementation option is selected.
