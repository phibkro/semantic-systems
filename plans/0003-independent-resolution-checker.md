# Plan 0003-independent-resolution-checker: independent resolution-result checker

Canonical problem contract:
[`design-specs/0003-independent-resolution-checker.md`](../design-specs/0003-independent-resolution-checker.md).
This mutable execution record must not redefine the frozen contract.

## Semantic claim

The falsifiable claim, deep-module boundary, evidence limits, semantic diff,
and kill criteria are frozen in design spec 0003.

## Current state

- Inventory tracer 0001 already normalizes exact theory and realization
  identities, produces typed finite test results, resolves policy, executes one
  selected realization, and emits structured explanations.
- Evidence production now runs before resolution. The resolver consumes typed
  producer outcomes from the neutral `evidence-result.ts` contract; its
  transitive import closure reaches neither the evidence runner, realization
  operations, execution, nor I/O.
- Evidence JSON now preserves every case result and detail while deriving
  counts and counterexamples. The frozen `evidence_result_v1` artifact kind,
  schema version, exact recipe identity, exact theory/realization/obligation
  bindings, declared assumptions, producer identity, and complete case-result
  algebra are implemented. The resolver revalidates every bound successful
  packet through that parser before eligibility rather than trusting a
  structurally typed producer value.
- `resolution_claim_v1` is integrated. Its neutral typed builder and strict
  parser preserve the complete candidate set, exact subjects and policy
  identity, evidence or diagnostic payload, claimed reasons and eligibility,
  terminal selection, and selected assumptions with deterministic
  presentation-only ordering. Module-private provenance plus deep-frozen
  non-aliasing copies prevent emitter forgery and post-validation mutation.
  Legal own `__proto__` JSON keys remain ordinary data at every payload depth.
- Exact-head Fable 5 review of source commit `886a813` returned `RESOLVED` with
  no Blocker, Major, or Minor findings after strengthened nested-payload,
  forgery, parse/emit/parse, deep-freeze, and non-aliasing probes. Integrated
  commits are `310c4dd`, `b2772ef`, and `bd0e6c3`; full repository validation
  passes 228 tests with 1,200 assertions plus TypeScript, severe Oxlint,
  formatting, and diff hygiene at `48b388b`.
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
- Exact-head semantic analysis found two contradictions requiring this
  design-spec recut before slice 5. The generic checker has no authored recipe
  input, so it can validate `recipeIdentity` presence and propagation but
  cannot bind it to recipe source. It also has no execution, canonical-model,
  custody, signature, or authentication authority, so a fully refreshed
  self-consistent observation rebound is indistinguishable at that boundary
  from an authentic observation. Recipe-source custody is now a separate
  adapter, and fully refreshed observation authenticity is an explicit
  evidence limit rather than a fabricated generic-checker oracle.

## Contract-owned implementation slices

1. Oracle and mutation corpus.
2. Lossless evidence result and evidence-production packet. **Complete for the
   current tracer:** the fixed artifact/category/schema, producer and exact
   semantic bindings, lossless case algebra, derived aggregates, content
   identities, strict parser, and producer diagnostics are implemented.
3. Production resolver consumes packets rather than executing recipes.
   **Complete for the current tracer.**
4. Serialized resolution claim. **Complete and independently reviewed.**
5. Independent checker and forbidden-import gate.
6. Execution gate and visible CLI.
7. Inventory canonical-model binding adapter.
8. Main-agent semantic integration and generated graph updates.
9. Independent adversarial review.

Slices 1, 2, 5, and 7 may be explored concurrently against this contract.
Resolver/demo integration is serialized after packet and checker interfaces are
stable. Final integration is owned by the main agent.

## Completed delegated slice contract: serialized resolution claim

Slice 4 is frozen against design spec 0003. Autonomy is A3:
integration-ready implementation in one isolated worktree based on the exact
integration head containing this plan-freeze update. It must not begin checker,
CLI, execution-gate, model-binding, or generated-view work.

Required reading:

- design spec 0003, especially `resolution_claim_v1`;
- completed plan 0001;
- `src/tracer/evidence-result.ts`, `resolver.ts`, `demo.ts`, `canonical.ts`,
  `realization.ts`, and `json.ts`;
- focused inventory tracer tests and inventory policy/realization fixtures;
- rejected prior-art claim builder at `a373ae9:src/tracer/resolver.ts`, without
  importing its rejected packet, checker, or model-binding semantics.

Owned writes:

- new neutral `src/tracer/resolution-claim.ts`;
- narrowly required production mapping in `src/tracer/resolver.ts`;
- narrowly required `DemoResult`/JSON projection in `src/tracer/demo.ts`;
- `tests/inventory-tracer.test.ts`;
- `src/tracer/evidence-result.ts` only if a small reusable strict producer-
  diagnostic parser is necessary.

Forbidden writes:

- `model/`, `generated/`, `docs/`, `decisions/`, `claims/`, `plans/`,
  `design-specs/`, examples, fixtures, acceptance scripts, or toolchain files;
- checker, checker report, CLI, execution, loader, theory, realization,
  evidence producer, domain, operation, or runtime-entrypoint semantics;
- evidence category, policy, identity, theory, or transition meaning.

Required artifact behavior:

- a neutral typed `resolution_claim_v1` with fixed
  `artifact_kind: "resolution_claim"` and schema version 1;
- exact theory `{id, identity}`, required obligation, policy
  `{id, content_identity}`, complete candidates, terminal status, selected
  `{id, identity}` or null, and projected selected assumptions;
- each candidate carries realization ID/identity, theory targeting, authored
  realization assumptions, exactly one evidence result or producer diagnostic,
  claimed eligibility, and a claimed reason set;
- candidate and reason ordering is presentation-only. Emission is
  deterministic; duplicate candidate IDs and duplicate reason codes fail
  rather than being silently collapsed. Distinct authored candidate IDs may
  share one content identity and must remain distinct: realization identity
  deliberately excludes display ID/name, and the accepted ambiguity scenario
  depends on preserving both authored candidates;
- selected assumptions are the deterministic unique projection of the selected
  realization and evidence assumptions; rejected claims project `[]`;
- construction rejects internally inconsistent selected status/subject
  bindings instead of fabricating a claim;
- a strict parser validates fixed literals, exact closed envelopes, nonempty
  identifiers, candidate-ID uniqueness, evidence/diagnostic exclusivity,
  embedded evidence through `parseEvidenceResult`, status/selection
  consistency, and derived selected-assumption consistency available from the
  claim itself. Coverage against authored inputs and policy truth remains the
  later independent checker's responsibility;
- the neutral claim module imports neither resolver, demo, execution,
  producer, operations, domain semantics, loader, filesystem, nor network
  capabilities.

Focused acceptance:

```bash
bun test tests/inventory-tracer.test.ts
bun run typecheck
git diff 2ed10a0..HEAD --check
```

Required executable oracles:

- positive selected and rejected claims round-trip losslessly;
- exact policy content identity and selected realization identity are visible;
- selected assumptions are unique and deterministic;
- reversing candidate and reason presentation order does not change normalized
  claim meaning;
- wrong kind/version, unknown claim/candidate fields, empty bindings, duplicate
  candidate IDs/reasons, evidence-plus-diagnostic, neither payload, malformed
  embedded evidence, inconsistent status/selected subject, and stale
  selected-assumption projection fail with stable messages;
- two distinct authored candidate IDs with one content identity round-trip
  without collapse and remain available to the rejected ambiguity claim;
- the claim module's transitive import closure satisfies the forbidden
  capability/module boundary.

Deliver:

- one committed integration-ready change;
- exact commit and bounded gate results;
- semantic-diff note;
- evaluated/reused prior art and provenance;
- checks not run and all deviations;
- remaining assumptions and uncertainties.

## Next delegated resolving experiment: declarative shared policy

This experiment is frozen against revised design spec 0003 and uncertainty 0004. Autonomy is A3: produce a committed, reviewable experiment result in one
isolated worktree based on the exact integration head containing this freeze.
It is not authorized to change production resolution or implement slice 5.

Owned writes:

- `research/experiments/independent-checker-policy/**`;
- `research/independent-checker-shared-policy-experiment.md`.

Forbidden writes:

- all `src/`, `tests/`, `scripts/`, `examples/`, `model/`, `generated/`,
  `claims/`, `decisions/`, `design-specs/`, `plans/`, `uncertainties/`, Nix,
  package, hook, CI, and toolchain files;
- production resolver, claim, evidence, recipe, execution, CLI, canonical-model
  adapter, or runtime semantics;
- evidence categories, reason meanings, policy semantics, identity v0, theory
  normalization, or the 70% threshold.

Required experiment architecture:

1. Define one bounded typed declarative contract containing the current policy
   predicates and reason vocabulary as data, with no evaluator functions.
2. Compile or interpret that contract through two independently authored
   implementations: one production adjudicator and one checker comparator.
   They may share only the declarative contract, neutral data types, and
   canonical JSON/identity assumptions. They must not import each other or a
   shared evaluator.
3. Exercise a faithful `resolution_claim_v1`/checker-report shape containing
   every frozen field. Candidate, reason, and violation order are
   presentation-only. The generic checker consumes every evidence packet
   exactly once and has no recipe-source, canonical-model, execution, or
   observation-authentication authority.
4. Keep a thin inventory canonical-binding adapter outside the generic checker.
   It may report disagreement with the custodied `7/9` broken record but must
   not label either observation authentic or forged.
5. Build an AST-based exhaustive surface classifier from explicit production
   and checker entrypoints. Every reachable validity-affecting executable
   region must be counted or receive one identical named exclusion. Annotation
   or filename allowlists may seed expectations but are not discovery
   authority.
6. Add a negative control in which an otherwise reachable, unclassified
   validity branch makes measurement fail. Marker-only or arithmetic-only
   controls do not satisfy this requirement.

Symmetric measurement:

- compare complete validity-affecting canonical source surfaces;
- count the shared declarative semantic contract on both sides;
- for generated evaluators, count the contract plus the respective canonical
  compiler/generator source, not both that source and its generated projection;
- for runtime interpreters, count the contract plus each independent
  interpreter;
- include structural parsing, authored identity recomputation, complete
  candidate/packet coverage, evidence aggregate derivation, policy
  adjudication/comparison, terminal selection, and selected-assumption
  projection wherever each side owns them;
- exclude only identical nonsemantic presentation, capability composition, and
  shared canonical JSON/hash runtime regions under the same named rule;
- report raw counts and the exact cross-multiplied result. Pass only when
  `checker * 10 <= production * 7`.

Required executable oracles:

- exact positive selected and rejected full-v1 fixtures;
- reversed candidate, reason, and violation presentation order remains valid
  and normalizes identically;
- missing, duplicate, foreign, malformed, or unconsumed evidence packets reject;
- stale theory, realization, obligation, policy, recipe-identity propagation,
  aggregate, claim, selected subject, and selected-assumption fields reject;
- changed reason sets or eligibility reject after all producer-owned identities
  are refreshed;
- two distinct authored IDs sharing one content identity remain distinct and
  produce ambiguity;
- `__proto__` and `constructor` obligation IDs use own-property policy lookup,
  never inherited properties;
- a fully refreshed self-consistent rebound is not reported as generically
  detectable forgery; the separate canonical adapter reports only disagreement;
- forbidden dependency/capability closure rejects production resolver,
  producer, execution, model, filesystem, network, process, runtime-runner, and
  non-`effect` bare imports in the generic checker;
- the unclassified-validity-path negative measurement control fails.

Focused acceptance:

```bash
bun test research/experiments/independent-checker-policy
bunx tsc -p research/experiments/independent-checker-policy/tsconfig.json --noEmit
bunx oxlint --deny-warnings --report-unused-disable-directives \
  research/experiments/independent-checker-policy
bunx oxfmt --check research/experiments/independent-checker-policy \
  research/independent-checker-shared-policy-experiment.md
bun research/experiments/independent-checker-policy/measure.ts
git diff --check
```

The measurement command exits successfully when it produces a complete,
internally consistent result; its structured output separately records
`selected` or `rejected`. A ratio above 70% must produce `rejected`, and the
tests must assert that rejection without making the repository gate itself
spuriously red.

Stop rule:

- Stop after the first exhaustive symmetric measurement.
- If the ratio exceeds 70% or any frozen oracle fails, do not optimize, weaken,
  expand the denominator, or begin production implementation. Commit the
  bounded counterevidence and report the exact failed criterion.
- If every oracle passes at or below 70%, commit the candidate experiment for
  main-agent review; it still grants no production authority.

Deliver:

- one focused experiment commit and exact head;
- structured raw measurement and pass/reject decision;
- full oracle and forbidden-closure results;
- exhaustive region-classification artifact and negative control;
- evaluated/reused prior art with license/provenance;
- semantic-diff and correlated-TCB note;
- checks not run, deviations, assumptions, and remaining uncertainty.

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

- 2026-07-30: completed the final frozen declarative shared-policy experiment.
  Its exhaustive recorded measurement rejected the architecture at 764/489
  (156.2%). Fresh Fable 5 review reproduced every gate and accepted the commit
  only as counterevidence. Review found missing aggregate, payload-kind, and
  diagnostic-content checks plus a 41-line asymmetric production exclusion;
  the conservative corrected ratio is still 764/530 (144.2%), and the missing
  checker work would only increase the numerator. Integrated the experiment as
  `219ee7c` and its explicit review limitations as `1d30fcf`. No production
  checker was selected and CLM-0002 remains unsupported.
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
- 2026-07-30: integrated the independently reviewed producer/resolver
  separation as `cc5047e`, `b4dffe4`, `4df14b5`, and `591e6e8`. Evidence
  production now emits typed success or diagnostic outcomes before resolution;
  successful outcomes bind the authored realization ID, exact realization
  content identity, theory identity, and governed obligation. Missing,
  duplicate, foreign, or ambiguous outcomes, stale inner bindings, and
  misbound diagnostics fail visibly; invalid preflights do not resolve or
  execute realization operations. Evidence serialization is lossless over all
  nine case results. A fully refreshed forged result remains explicitly
  deferred.
- 2026-07-30: exact-head independent review of the four-commit slice returned
  `RESOLVED` after reproducing 33 focused tests with 145 assertions, TypeScript,
  and diff hygiene. It independently enumerated the resolver closure as
  `resolver.ts`, `evidence-result.ts`, `explanation.ts`, `json.ts`,
  `realization.ts`, `theory.ts`, and `canonical.ts`; `effect` is its only bare
  import. The TypeScript-lexer oracle covers static, side-effect, re-export,
  type-only, multiline, no-semicolon, dynamic-string, import-equals, and nested
  imports and permits only the bare module `effect`.
- 2026-07-30: completed `evidence_result_v1` slice 2 and integrated it as
  `2d8f124`, `ba3ce95`, `8b3324e`, `e7dba9d`, and `9144e9a`. The result
  contract now has fixed artifact/category/schema literals, exact recipe,
  theory, realization, obligation, assumption, and producer bindings, a
  discriminated pass/failure case algebra, strict unknown-field and nonempty
  checks, lossless failure details, recomputed aggregates, and recomputed
  content identity. Recipe/theory validation precedes adapters and case work;
  arbitrary adapter defects retain reference custody instead of becoming
  producer diagnostics.
- 2026-07-30: an exact-head review of the pre-integration source commit
  `2a2fec8` returned `RESOLVED` with no Blocker, Major, or Minor findings after
  reproducing 50 focused tests with 295 assertions, TypeScript, and diff
  hygiene. The review first exposed that structural injected results bypassed
  parser invariants; the accepted correction makes resolution Effectful,
  preserves wrapper/binding error precedence, and parser-validates every bound
  successful packet before eligibility. The same gates pass on integrated head
  `9144e9a`. Broad and Nix validation remain deferred under severe I/O PSI.
- 2026-07-30: while implementing slice 4, the bounded worker exposed a
  plan-level contradiction: the initial slice text rejected repeated
  realization content identities, but design spec 0003 requires complete
  authored-candidate coverage and the accepted ambiguity tracer represents two
  distinct authored IDs whose display-insensitive content identities are
  equal. The main agent stopped the worker before commit and corrected this
  execution contract to require unique authored candidate IDs while preserving
  repeated content identities. The frozen design spec was unchanged at that
  checkpoint.
- 2026-07-30: completed and integrated slice 4 as `310c4dd`, `b2772ef`, and
  `bd0e6c3`. Initial review found that structural callers could bypass
  validation and that embedded evidence obligations were not bound to the
  claim obligation; both routes now share one finalizer, and only
  module-provenance-minted immutable claims emit. A second independent review
  exposed plain-assignment loss of legal own `__proto__` payload keys. The
  accepted correction uses define-semantics consistent with canonicalization
  and adds a falsifiable producer/detail regression. Exact-head Fable 5 review
  returned `RESOLVED`; the broad integrated suite passes 228 tests and 1,200
  assertions.
- 2026-07-30: explicit contract recut before slice 5 preserves every check
  derivable from declared inputs, moves authored-recipe source binding to a
  recipe-custody adapter, separates stale subject inconsistency from fully
  refreshed observation forgery, retains slice-6 execution and slice-7
  canonical-model ownership, replaces the stale Python command family with
  Bun, and leaves the symmetric 70% gate unchanged. The preferred next
  experiment is the existing declarative shared-policy fallback, not another
  direct checker implementation.

## Decisions and deviations

- Multiple semantic frontiers may proceed under decisions 0004 and 0005 because
  this tracer's contract and write surface are independent of reference
  research.
- The production resolver may retain producer diagnostics in explanations, but
  absence of a valid result—not the diagnostic alone—causes ineligibility.
- The closure oracle intentionally fails loud on unsupported relative path
  resolution. Exotic dynamic forms such as no-substitution template imports,
  an extra parenthesized specifier, and bare CommonJS `require` remain a known
  low-severity oracle surface; they must be closed before treating the
  forbidden-import gate as complete slice-5 evidence.
- The generic checker must reject stale or internally inconsistent result
  rebinding, including mismatched theory, realization, obligation, claim,
  aggregate, or result-identity fields. It cannot distinguish a fully refreshed
  self-consistent forged observation from an authentic observation. Slice 7 may
  reject disagreement with a separately custodied canonical-model record, but
  that is canonical consistency rather than forgery detection. Observation
  provenance, freshness, witnessing, signatures, and authenticity are deferred
  to a separately named future observation-custody and authentication frontier.
- Authored recipes are not added to the generic checker input. The checker
  validates nonempty recipe identity, its contribution to evidence-result
  identity, and exact propagation into the claim. Binding that identity to an
  authored recipe belongs to a separate recipe-custody adapter whose inputs
  include the authored recipe.
- Recipe custody is not canonical-model binding. The former compares authored
  recipe content with a result; the latter remains slice 7 and compares an
  already checked resolution with canonical inventory state.
- Execution and the visible CLI remain slice 6. This recut grants the generic
  checker no execution capability.
- `produceEvidence` still selects from the raw recipe collection by reading
  `suite.theory` before validating the selected envelope. This inherited
  collection-ingestion discrepancy is explicit and deferred; it must not be
  mistaken for validation of every unselected recipe. The accepted slice does
  validate the exact selected recipe before adapters or execution.
- Do not reinterpret the size metric, expand the resolver denominator, or
  merge a known-red acceptance gate. The next slice is a fresh design
  experiment, not incremental patching of `b9cea28`.
- The preferred bounded experiment is a declarative shared policy contract with
  generated or independently compiled producer/checker evaluators. A direct
  checker implementation must not begin unless that experiment demonstrates an
  exhaustive symmetric surface at or below 70%, or a later reviewed contract
  change explicitly replaces the gate. The shared policy becomes a visible
  correlated semantic assumption and does not remove independent parsing,
  authored identity recomputation, evidence aggregate derivation, coverage,
  terminal, selected-assumption, deterministic-violation, or capability gates.
- Two delegated review lanes disclosed accidental no-op or temporary Python
  invocations while falsifying slice-4 mutations, despite the operator's
  migration instruction. They changed no repository artifact and subsequent
  work used TypeScript/Bun or shell-native read-only tools. Pagu was never used.
- Fable review recorded an inherited resolver edge outside slice 4:
  `requirements[evidence.obligation]` reads inherited properties. Pathological
  authored obligation IDs such as `__proto__` fail closed but can produce the
  wrong reason code, while `constructor` fails loudly. The next declarative
  policy experiment must use own-property lookup and include these identifiers
  as adversarial fixtures.

## Completion state

Stopped under the frozen contract. The resolving experiment and canonical
negative result are complete, but the production checker is not. Resume only
after an explicit reviewed design revision replaces the incompatible 70%
size/trust claim or freezes a materially different architecture. Do not reopen
incremental checker implementation against the current contract.

- 2026-08-02: Historical lifecycle heading migrated verbatim from the pre-migration plan:
  # Active plan 0003: independent resolution-result checker
