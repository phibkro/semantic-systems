# Corrected independent resolution-checker recut experiment

Date: 2026-07-30

Contract: `design-specs/0003-independent-resolution-checker.md`

Uncertainty: `uncertainties/0004-independent-checker-recut.md`

Corrected source inspected read-only:
`3b65bc76eb8514376df90ea3534f1763c535c37d`

Rejected prior implementation: `a373ae955bae3b986ef028571cc14b79fc19f4ae`

## Correction

The first version of this experiment was rejected by exact-head adversarial
review because it answered a stronger question than frozen design spec 0003
asks.

It treated a self-consistent observation rebound as an authenticity challenge
and silently required independent `ObservationCustody`. Spec 0003 instead fixes
the authored inputs and canonical project-model bindings, checks consistency
against those inputs, and explicitly disclaims truth or authenticity of
producer observations.

The first lab also:

- compressed the canonical nine-case result to two cases;
- omitted the canonical broken-result binding of `7/9` and the
  `insufficient-stock` and `missing-stock-is-zero` counterexamples;
- credited stale certificate digests as semantic mutation rejection; and
- used a tautological arithmetic assertion as its symmetry oracle.

The corrected experiment includes the existing correlated canonical evidence,
reissues certificates after producer-controlled semantic changes, separates a
digest-only control, and checks unique non-overlapping regions against named
frozen responsibilities.

`ObservationCustody` may be a future authority extension. It is not a
prerequisite for design spec 0003.

## Question and options

Can any of uncertainty 0004's three prescribed recuts satisfy the frozen
mutation corpus, forbidden-capability closure, checker responsibilities, and
honest 70% checker-to-production adjudication size gate?

The disposable TypeScript lab compared:

1. a shared declarative rule table with independently written evaluators;
2. a minimal resolution certificate with exact whole-input binding; and
3. a recut claim separating structural validation from semantic eligibility
   recomputation.

The decision cores are ordinary total TypeScript. Effect was not added because
the lab contains no capability boundary.

## Exact corrected result

| Option | Production | Checker | Ratio | Semantic mutations | Responsibilities | Rebound | 70% gate |
|---|---:|---:|---:|---:|---:|---|---|
| Declarative rule table | 81 | 229 | 282.7% | 21/21 rejected | 7/7 | rejected | fail |
| Minimal certificate | 67 | 164 | 244.8% | 18/21 rejected | 5/7 | rejected | fail |
| Structural/semantic recut | 72 | 209 | 290.3% | 21/21 rejected | 7/7 | rejected | fail |

Counts are nonblank, noncomment physical lines inside explicit marked regions.
Production denominators include policy decisions, terminal selection, exact
selected identity, and assumption projection. No serializer, reporter, model
adapter, fixture, test, measurement code, or structural decoder enlarges a
denominator.

Checker numerators include every implemented checker-side responsibility:
semantic comparison, exact packet binding, canonical evidence agreement,
candidate coverage, terminal checks, and selected identity/assumption checks.
Structural decoding and explanations are reported separately, not hidden in a
production denominator.

The rule table has an additional 19-line correlated semantic contract. Even
counting it symmetrically gives `(229 + 19) / (81 + 19) = 248%`; the size gate
still fails.

## Corrected canonical rebound

The strongest rebound copies all nine passing observations from the pure
packet to the authored broken subject, updates every represented
producer-controlled binding, recomputes the packet identity, and lets each
producer re-derive the complete claim or certificate.

Both packets then appear eligible, so every producer consistently derives the
terminal resolution `rejected: ambiguous_candidates`. Every checker still
returns invalid because the forged broken packet derives `9/9` with no
counterexamples while the fixed canonical adapter input binds that exact
subject to:

```text
7/9:insufficient-stock,missing-stock-is-zero
```

The stable violation is `model_evidence_mismatch`.

This detects inconsistency with a correlated canonical runtime-validation
record. It does not establish that either the canonical summary or producer
observations are true, authentic, independently witnessed, signed, or current.
That limitation is already explicit in frozen spec 0003.

## Mutation classification

The corrected 21-case semantic corpus refreshes packet identities and
certificate bindings after producer-controlled changes. A separate control
changes only the certificate digest and is classified as
`digest_only_rejection`; it is excluded from the semantic score.

The recomputing rule-table and recut checkers reject every semantic mutation,
including:

- recipe/result substitution and category relabeling;
- changed case truth, subject, eligibility, reasons, terminal fields, and
  assumptions;
- candidate omission and duplication;
- policy and canonical-model drift;
- foreign packets, wrong obligations, unsupported ambiguity, and duplicate
  authored candidates;
- a reissued producer eligibility lie; and
- the fully re-derived all-passing rebound.

The certificate accepts three refreshed producer lies:

- a changed reason set;
- an omitted selected assumption; and
- a self-consistent eligibility manipulation.

Its other 18 rejections contain independently recomputed semantic or canonical
violations, rather than only stale-digest failures. The certificate therefore
remains disqualified both by trusted acceptance-critical fields and by size.

## Responsibility and closure checks

Every counted region must have one ordered start/end pair, name at least one
frozen responsibility, and not overlap another region in the same numerator
or denominator. The seven responsibilities are:

1. exact artifact bindings;
2. complete unique candidate coverage;
3. derived evidence truth and counts;
4. candidate eligibility and reasons;
5. terminal result;
6. selected identity and assumption projection; and
7. canonical-model agreement.

Rule table and recut cover 7/7. The certificate covers 5/7 because it trusts
eligibility/reasons and selected assumptions. A hard assertion prevents it
from being reported responsibility-complete.

The deterministic dependency scanner follows every current relative import,
including type-only imports. Manual review confirmed that no checker closure
imports a production evaluator, certificate issuer, evidence runner, operation
registry, domain transition, execution module, demo, filesystem, network,
subprocess, plugin loader, mutation capability, or source-worktree module.

All three share a lab-local canonical JSON and SHA-256 helper. That is an
explicit correlated-TCB assumption. Measurement filesystem reads remain
outside every checker closure.

## Conclusion

Select no option under frozen design spec 0003.

The rule-table and recut options satisfy the corrected mutation,
responsibility, and capability gates but independently fail the 70% size gate.
The certificate additionally trusts acceptance-critical producer fields.
Option 3 is the smallest responsibility-complete checker surface, but it is
still 290.3% of its production adjudication surface.

No result establishes CLM-0002. The next design work must address the honest
size asymmetry or explicitly recut the checked claim through a reviewed spec
revision. It must not use observation authenticity as an unapproved reason to
change the current contract.

## Reuse and evidence limits

The corrected lab reused its disposable architecture implementations,
mutation runner, marked-region measurement, closure scanner, and canonical
identity helper. It adapted, without importing:

- canonical `9/9` and `7/9` evidence summaries from
  `model/evidence/inventory-tracer.json`;
- nine case IDs from `examples/inventory/evidence/conformance-v0.json`; and
- aggregate derivation patterns from `src/tracer/evidence.ts`.

No external dependency, generator, schema library, Effect layer, or new
infrastructure was needed. No network or external code was used.

The focused mutations are example tests. Executing the checkers and matrix is
bounded runtime validation and source measurement, not proof.

## Bounded validation

The integrating agent independently reran:

```bash
bun test /tmp/semantic-checker-recut-lab
bun /tmp/semantic-checker-recut-lab/matrix.ts
```

Observed: 15 tests passed, 0 failed, 150 assertions. The matrix reproduced the
exact ratios, mutation classifications, responsibility coverage, canonical
rebound violation, and clean forbidden closures above. No Pagu, network, Nix,
hydration, broad tests, fuzzing, or model checking was used.
