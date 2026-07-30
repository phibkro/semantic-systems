# Active plan 0003: independent resolution-result checker

Canonical problem contract:
[`design-specs/0003-independent-resolution-checker.md`](../../design-specs/0003-independent-resolution-checker.md).
This mutable execution record must not redefine the frozen contract.

## Semantic claim

The falsifiable claim, deep-module boundary, evidence limits, semantic diff,
and kill criteria are frozen in design spec 0003.

## Current state

- Inventory tracer 0001 already normalizes exact theory and realization
  identities, produces typed finite test results, resolves policy, executes one
  selected realization, and emits structured explanations.
- The current resolver imports the evidence runner and operation bindings, so
  the evidence producer and eligibility authority are not independent.
- `EvidenceResult.to_dict()` omits full case results and counterexample details.
- Canonical model identities and case counts agree today, but the agreement is
  hand-copied and guarded only by tests.
- Independent adversarial review identified these seams before this contract
  was frozen.
- The first committed implementation experiment is preserved at `b9cea28`.
  Its behavioral, mutation, forbidden-import, Ruff, format, and Pyright gates
  pass, but its checker decision surface remains larger than the permitted
  70% bound. The experiment is rejected for integration.
- The TypeScript recut at `a373ae9` is also rejected and was reverted by
  `adf7e8d` after exact-head independent review. Its published 68.07% ratio
  asymmetrically counted resolver serialization/reporting while excluding
  checker-side semantic validation. The honest adjudication comparison was
  already 194 checker lines versus 92 resolver lines before another 92
  checker-input validation lines and 49 semantic-diff lines were included.
- The same review found foreign outcomes could remain unconsumed, policy
  matching diverged, duplicate authored candidates were accepted, and the
  dependency oracle was not transitive. It also raised an observation-custody
  concern that the corrected uncertainty experiment later separated from this
  contract's fixed-input consistency claim. No evidence from that experiment
  establishes CLM-0002.
- The first uncertainty-0004 prototype screen is complete, but the resolving
  experiment remains open. Configured checker/production lower bounds were
  406.2% (declarative rule table), 449.3% (minimal certificate), and 429.2%
  (structural/semantic recut). Exact-head review showed that the
  annotation-dependent numerator oracle is not exhaustive, the reduced
  claim/report omit frozen fields, presentation-only ordering is mishandled,
  and canonical inventory binding is not a separate adapter. All options still
  reject four producer-rederived stale authored identities and the strongest
  fully re-derived rebound through the canonical broken-result binding of
  `7/9` and its two named counterexamples; the certificate accepts three
  refreshed semantic lies. These are partial lower-bound and example-test
  results, not complete frozen-contract coverage. No current prototype is
  selected and no result establishes CLM-0002. The bounded evidence is recorded
  in
  `research/independent-checker-recut-experiment.md`.

## Contract-owned implementation slices

1. Oracle and mutation corpus.
2. Lossless evidence result and evidence-production packet.
3. Production resolver consumes packets rather than executing recipes.
4. Serialized resolution claim.
5. Independent checker and forbidden-import gate.
6. Execution gate and visible CLI.
7. Inventory canonical-model binding adapter.
8. Main-agent semantic integration and generated graph updates.
9. Independent adversarial review.

Slices 1, 2, 5, and 7 may be explored concurrently against this contract.
Resolver/demo integration is serialized after packet and checker interfaces are
stable. Final integration is owned by the main agent.

## Delegated implementation contract

Autonomy: A3, integration-ready implementation in an isolated worktree.

Required reading:

- design spec 0003;
- design spec and completed plan 0001;
- `src/semantic_tracer/`;
- `tests/test_inventory_tracer.py`;
- inventory examples;
- current canonical inventory model files.

Allowed writes:

- `src/semantic_tracer/`;
- `tests/test_resolution_checker.py`;
- narrowly required edits to `tests/test_inventory_tracer.py`;
- `examples/inventory/checker-cases/` if fixtures materially clarify the
  mutation corpus.

Forbidden writes:

- `model/`, `generated/`, `docs/`, `decisions/`, `claims/`, `plans/`,
  `design-specs/`;
- inventory theory, domain semantics, transition/replay adapters;
- evidence category or policy meaning.

Acceptance:

```bash
nix develop --command pytest tests/test_resolution_checker.py tests/test_inventory_tracer.py
nix develop --command ruff check .
nix develop --command ruff format --check .
nix develop --command pyright
```

Deliver:

- committed integration-ready change;
- semantic-diff note;
- commands run and exact results;
- checks not run;
- independence/size measurement;
- remaining assumptions and uncertainties.

## Main-agent integration

The main agent reviews committed content, reconciles terminology, updates the
canonical graph and claims registry, regenerates views, runs full checks, and
commissions independent review. Agent-produced metadata does not grant
validity.

## Evidence requirements

- Mutation tests are `example_test`.
- Checker execution is `runtime_validation`.
- Shared canonicalization is a visible assumption.
- No proof, universal correctness, authenticity, or production-suitability
  claim is permitted.

## Risks

- The checker duplicates resolver branches rather than reducing trust.
- Lossless evidence serialization becomes a second mutable representation.
- Producer diagnostics are mistaken for independently verified facts.
- Project-model binding leaks into the generic checker.
- Compatibility pressure preserves the old coupled resolver boundary.

## Progress log

- 2026-07-29: Independent read-only analysis compared the frozen tracer,
  implementation, tests, and adversarial review.
- 2026-07-29: Main agent froze design spec 0003 before implementation
  delegation.
- 2026-07-29: Dispatched an A3 Sonnet implementation to isolated worktree
  `/tmp/semantic-resolution-checker-0003` on branch
  `work/resolution-checker-0003`. The first visible command succeeds, but the
  uncommitted checker is not accepted and its initial decision surface exceeds
  the frozen size gate.
- 2026-07-29: Stopped the implementation lane after commit `b9cea28` preserved
  the failed experiment. Five gate classes passed, but the required size gate
  did not; repeated recuts did not bring the checker decision core below 70%.
  The commit is not integration-ready and grants no evidence to CLM-0002.
- 2026-07-29: Opened uncertainty 0004 to compare a declarative generated rule
  contract, certificate validation, and a narrower claim boundary without
  weakening independent observation.
- 2026-07-30: A TypeScript recut at `a373ae9` passed its local focused gate but
  independent exact-head review found two frozen-contract kill criteria and
  four additional semantic/oracle defects. In particular, its 194/285 size
  result compared asymmetric surfaces; the symmetric resolver decision region
  was 92 lines, while checker input validation and semantic comparison had
  been excluded. The reviewer also constructed accepted foreign-outcome,
  self-consistent rebound, wrong-obligation, unsupported-ambiguity, and
  duplicate-authored-candidate counterexamples. Main integration reverted the
  experiment at `adf7e8d`, retained both commits as evidence, and returned the
  frontier to uncertainty 0004 rather than weakening or reinterpreting the
  frozen gate.
- 2026-07-30: the first uncertainty-0004 report was rejected by exact-head
  adversarial review because it silently strengthened fixed-input consistency
  into observation authentication, omitted the canonical `7/9` broken-result
  binding, credited stale certificate digests as semantic rejection, and used
  a tautological symmetry oracle.
- 2026-07-30: corrected the disposable experiment against the complete
  nine-case canonical fixture. A second exact-head review rejected that
  correction because stored authored identities were still trusted and
  validity-affecting structural decoding was omitted from the numerator.
- 2026-07-30: completed a second bounded correction. Seventeen focused tests
  and 233 assertions exercise the positive path, 25 refreshed semantic
  mutations, all four producer-rederived stale authored identities, transitive
  forbidden-capability closure, executable witnesses for all seven
  responsibilities, an eight-region numerator-composition oracle with a
  negative omission regression, and the strongest fully re-derived rebound.
  All options reject the rebound through canonical-model disagreement.
- 2026-07-30: a third fresh exact-head review reproduced all configured values
  but rejected their complete-contract interpretation. It found that the
  numerator oracle cannot detect unmarked runtime validity code, the reduced
  artifacts omit frozen claim/report fields, presentation-only ordering is
  rejected, and model binding is inside the generic checker. The prior ratios
  are retained only as configured lower bounds and the lab-local mutation and
  responsibility scores as partial example tests. No production checker code
  was integrated. The next experiment must faithfully implement the frozen
  artifacts and adapter boundary or explicitly revise the design spec.

## Decisions and deviations

- Multiple semantic frontiers may proceed under decisions 0004 and 0005 because
  this tracer's contract and write surface are independent of reference
  research.
- The production resolver may retain producer diagnostics in explanations, but
  absence of a valid result—not the diagnostic alone—causes ineligibility.
- Do not reinterpret the size metric, expand the resolver denominator, or
  merge a known-red acceptance gate. The next slice is a fresh design
  experiment, not incremental patching of `b9cea28`.

## Completion state

Open. Complete only after the visible checker-gated scenario, mutation corpus,
independence/size gate, canonical graph integration, independent review, and
full repository validation pass.
