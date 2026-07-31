# Partial independent resolution-checker recut screen

Date: 2026-07-30

Contract: `design-specs/0003-independent-resolution-checker.md`

Uncertainty: `uncertainties/0004-independent-checker-recut.md`

Exact source reviewed read-only:
`916918b2107d7595add3266a55696f4cc136b93c`

Rejected prior implementation: `a373ae955bae3b986ef028571cc14b79fc19f4ae`

## Status

This disposable TypeScript lab is a partial architecture screen, not a
completed resolving experiment and not an implementation of frozen design
spec 0003.

It is useful counterevidence against the three concrete prototypes as written.
It does not establish exhaustive checker sizes, complete mutation or
responsibility coverage, impossibility of any recut, or CLM-0002.

No option is selected.

## Question screened

Do the current disposable implementations of uncertainty 0004's three
prescribed recuts show enough promise to continue unchanged?

The lab compared:

1. a shared declarative rule table with independently written evaluators;
2. a minimal resolution certificate with exact whole-input binding; and
3. a recut claim separating structural validation from semantic eligibility
   recomputation.

The decision cores are ordinary total TypeScript. Effect was not added because
the lab contains no capability boundary.

## Review history

The first report was rejected because it silently strengthened design spec
0003's fixed-input consistency claim into observation authentication,
compressed the canonical nine cases to two, omitted the canonical broken
binding of `7/9`, credited stale certificate digests as semantic rejection, and
used a tautological arithmetic assertion as a symmetry oracle.

The first correction restored the canonical evidence and refreshed semantic
mutations. Exact-head review then found that it trusted stored authored theory,
realization, recipe, and policy identities and excluded validity-affecting
structural decoding from the checker numerator.

The second correction added authored-identity probes, executable lab-local
responsibility witnesses, and annotated-region composition checks. A fresh
exact-head review reproduced every configured count but found four remaining
frozen-contract gaps:

1. the numerator oracle discovers only pre-annotated regions and cannot detect
   validity-affecting runtime code omitted from both annotations and
   configuration;
2. the reduced claim and report omit required frozen fields, so the lab corpus
   is not complete contract coverage;
3. rule-table and recut reject presentation-only candidate or reason
   permutations; and
4. canonical inventory-model binding is folded into the generic checkers
   instead of a separate thin adapter.

The integrating agent therefore stopped extending the disposable lab and
downgraded its evidence rather than letting a measurement prototype become an
unbounded implementation side quest.

## Reproduced configured results

| Option | Production | Configured checker | Configured ratio | Lab semantic corpus | Lab responsibility witnesses | Rebound | 70% gate |
|---|---:|---:|---:|---:|---:|---|---|
| Declarative rule table | 81 | 329 | 406.2% | 25/25 rejected | 7/7 | rejected | fail |
| Minimal certificate | 67 | 301 | 449.3% | 22/25 rejected | 5/7 | rejected | fail |
| Structural/semantic recut | 72 | 309 | 429.2% | 25/25 rejected | 7/7 | rejected | fail |

These checker totals include every annotated validity region configured by the
lab, including structural decoding and 47 lines of authored-identity
recomputation. They omit shared canonical JSON/SHA-256/equality runtime code
and cannot demonstrate that no unannotated validity path exists.

The values are therefore conservative configured lower bounds for these
prototypes, not exhaustive ratios for conforming implementations.

All three lower bounds already exceed the frozen 70% gate. That falsifies the
current implementations; it does not prove that a substantially redesigned
implementation of an option cannot pass.

The rule table also has a separately reported 19-line shared semantic contract.
Even adding that contract symmetrically gives
`(329 + 19) / (81 + 19) = 348%`.

## Evidence retained

### Canonical rebound

The fixture carries all nine canonical case IDs and binds the authored broken
realization to:

```text
7/9:insufficient-stock,missing-stock-is-zero
```

The strongest rebound copies all nine passing pure observations to the broken
subject, refreshes producer-controlled fields and packet identity, and lets
each producer rederive its artifact. Every producer emits
`rejected: ambiguous_candidates`. Every checker then rejects the forged broken
packet with `model_evidence_mismatch`.

This is consistency with a correlated canonical runtime-validation record. It
does not establish that either observation is true, authentic, independently
witnessed, signed, or current. Frozen spec 0003 already disclaims those
properties; `ObservationCustody` is not its prerequisite.

### Refreshed mutation classifications

The reduced 25-case lab corpus refreshes producer-controlled packet and
certificate bindings after semantic changes. It includes four
producer-rederived stale authored-identity probes. Every option rejects those
four with the corresponding recomputed identity violation.

A separate certificate-digest-only control is classified
`digest_only_rejection` and excluded from the semantic score.

The certificate still accepts three refreshed semantic lies:

- changed candidate reasons;
- omitted selected assumption; and
- self-consistent eligibility manipulation.

The `25/25`, `22/25`, and `25/25` scores describe this reduced lab corpus only.
They are not the frozen mutation corpus because the reduced claim/report omit
required fields.

### Capability closure

The deterministic dependency scanner follows current relative imports,
including type-only imports. No lab checker closure imports a production
evaluator, certificate issuer, evidence runner, operation registry, domain
transition, execution module, demo, filesystem, network, subprocess, plugin
loader, mutation capability, or source worktree.

All options share lab-local canonical JSON and SHA-256. That is a visible
correlated-TCB assumption, not independent proof.

## Contract gaps that remain open

The disposable artifacts do not faithfully implement:

- exact theory ID, obligation, and policy ID in the claim;
- candidate theory targeting, realization assumptions, and embedded evidence
  result or producer diagnostics;
- a checker report containing recomputed terminal selection and separate
  model-binding status;
- presentation-only candidate and reason ordering; or
- a thin inventory binding adapter outside the generic checker.

The annotated numerator audit also cannot discover runtime code lacking a
marker. A future measurement must classify every executable checker-closure
region as counted or explicitly excluded and demonstrate that an unmarked
validity path fails the oracle.

## Conclusion

Reject all three current prototypes.

Uncertainty 0004 remains open. The next bounded step is either:

1. a faithful claim/report prototype with a separate canonical adapter,
   positive ordering oracles, and exhaustive executable-region
   classification; or
2. an explicit reviewed recut of the checked claim and size criterion.

No production checker code was integrated. No result establishes CLM-0002.

## Reuse and evidence limits

The lab reused its disposable prototype structure, mutation runner,
marked-region measurement, closure scanner, and canonical identity helper. It
adapted, without importing:

- canonical `9/9` and `7/9` evidence summaries from
  `model/evidence/inventory-tracer.json`;
- nine case IDs from `examples/inventory/evidence/conformance-v0.json`; and
- aggregate derivation patterns from `src/tracer/evidence.ts`.

No external dependency, generator, schema library, Effect layer, network, or
external source code was used.

The focused mutations are `example_test` evidence. Executing the checkers and
matrix is bounded `runtime_validation` and source measurement, not proof.

## Bounded validation

The integrating agent and fresh exact-head reviewer independently reran:

```bash
bun test /tmp/semantic-checker-recut-lab
bun /tmp/semantic-checker-recut-lab/matrix.ts
```

Observed: 17 tests passed, 0 failed, 233 assertions. The configured matrix
reproduced the exact lower bounds and reduced-corpus results above. No Pagu,
network, Nix, hydration, broad repository tests, fuzzing, or model checking was
used.
