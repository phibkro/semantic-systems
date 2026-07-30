# Declarative shared-policy checker experiment: result

Date: 2026-07-30

Exact base head: `f20539a91613cf7b472333a1e2b383195505b42f`

Contract: `design-specs/0003-independent-resolution-checker.md`

Uncertainty: `uncertainties/0004-independent-checker-recut.md`

Plan slice: `plans/active/0003-independent-resolution-checker.md`, "Next
delegated resolving experiment: declarative shared policy"

Owned artifacts: `research/experiments/independent-checker-policy/**` and
this file. No `src/`, `tests/`, `examples/`, `model/`, `generated/`,
`design-specs/`, `plans/`, `uncertainties/`, Nix, package, hook, CI, or
toolchain file was written.

## Result

**Rejected.** The exhaustive symmetric ratio is **156.2%** (checker 764
included lines vs. production 489), against the frozen gate `checker * 10
<= production * 7`. This is bounded counterevidence, not a passing
candidate: per the stop rule, the experiment stopped after the first
exhaustive measurement and made no attempt to optimize, weaken the oracle,
expand the production denominator, or begin production implementation.

This does not establish CLM-0002. No production checker code was
integrated. The declarative shared-policy architecture, faithfully
implemented against the full frozen artifact/report shape, still fails the
70% checker-to-production size gate — consistent with every prior
experiment against this contract (`b9cea28`, `a373ae9`, and the three
uncertainty-0004 prototype screens all exceeded 70% as well).

## Structured raw measurement

Computed by `bun research/experiments/independent-checker-policy/measure.ts`
against the exact committed source (post-`oxfmt`), via the AST-based
exhaustive classifier (`classifier.ts`) and the hand-authored region
manifest (`manifest.ts`):

| Closure entry        | File                 | Included lines | Excluded lines | Included categories (lines)                                                                                                                                                       |
| -------------------- | -------------------- | -------------: | -------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `production.ts`      | `production.ts`      |            415 |            106 | structural_parsing 185, policy_adjudication 62, terminal_selection 82, identity_recomputation 46, candidate_coverage 36, evidence_aggregate_derivation 2, assumption_projection 2 |
| `production.ts`      | `shared-types.ts`    |              0 |             99 | —                                                                                                                                                                                 |
| `production.ts`      | `policy-contract.ts` |             74 |             33 | contract 74                                                                                                                                                                       |
| `production.ts`      | `canonical.ts`       |              0 |             21 | —                                                                                                                                                                                 |
| **production total** |                      |        **489** |                |                                                                                                                                                                                   |
| `checker.ts`         | `checker.ts`         |            690 |             96 | structural_parsing 372, report_assembly 207, identity_recomputation 53, policy_adjudication 52, evidence_aggregate_derivation 2, assumption_projection 4                          |
| `checker.ts`         | `shared-types.ts`    |              0 |             99 | —                                                                                                                                                                                 |
| `checker.ts`         | `policy-contract.ts` |             74 |             33 | contract 74                                                                                                                                                                       |
| `checker.ts`         | `canonical.ts`       |              0 |             21 | —                                                                                                                                                                                 |
| **checker total**    |                      |        **764** |                |                                                                                                                                                                                   |

Excluded categories, both closures: `import` (29 in each of `production.ts`/
`checker.ts`, 1 in `policy-contract.ts`, 1 in `canonical.ts`), `type_only`
(36/67 in `production.ts`/`checker.ts`, 99 in `shared-types.ts`, 32 in
`policy-contract.ts`, 1 in `canonical.ts`), `canonical_json_hash_runtime`
(19 in `canonical.ts`), and `nonsemantic_presentation` (41, `production.ts`
only — `evidenceToJson`/`candidateToJson`/`claimToJson`; the checker never
serializes anything back to JSON, so it has no counterpart region).

```
ratio: checker/production = 764/489 = 156.2%
gate: checker*10 <= production*7 -> 7640 <= 3423 = false
decision: rejected
```

Both closures resolve to exactly four files each (`{production,checker}.ts`

- `shared-types.ts` + `policy-contract.ts` + `canonical.ts`); neither
  closure's bare-import set contains anything (`bareImports: []` for both) —
  not even `node:crypto`, since hashing is an injected `HashFn` capability
  (see "Correlated TCB" below), not an import inside either measured closure.

The declarative contract (`policy-contract.ts`) is counted symmetrically on
both sides (74 lines each), as the plan requires ("count the shared
declarative semantic contract on both sides") — it is not a knob that could
be inflated to pass the gate, since it adds identically to both the
numerator and the denominator.

## Why the declarative-contract architecture still fails the gate

The contract removes duplicated _eligibility-branch_ logic (both
`evaluateCandidate`/`evaluatePrecondition`/`evaluateRequirement` in
`production.ts` and `checkPrecondition`/`checkRequirement`/
`recomputeEligibility` in `checker.ts` walk the same
`PRECONDITION_RULES`/`REQUIREMENT_RULES`/`TERMINAL_RULES` tables instead of
hand-duplicating branches), but the checker's _irreducible extra
responsibilities_ dominate the ratio regardless:

- **`report_assembly` (207 lines, checker-only).** Production never parses
  its own output — `adjudicate` builds a `ResolutionClaim` once and
  `claimToJson` only serializes it. The checker must independently
  structurally validate an _untrusted_ serialized claim end-to-end
  (`parseClaim`/`parseClaimCandidate`/`parseIdentityPair`, closed-key-set
  checks, candidate-ID uniqueness, evidence/diagnostic exclusivity) before
  it can compare anything, then assemble and return a `CheckerReport` with
  every stale-field violation. This is structurally the same _kind_ of work
  `resolution-claim.ts`'s real `parseResolutionClaim` does in the frozen
  production tracer — the checker doing it independently is exactly what
  design spec 0003 requires, not an accident to trim.
- **`structural_parsing` (372 vs. 185 lines).** The checker parses the same
  theory/realization/policy/evidence-packet shapes production does, _plus_
  the claim shape production never parses, _plus_ its own independent
  closed-key-set validation for every embedded envelope (evidence,
  producer diagnostic, identity pair, candidate) since it cannot trust
  anything the claim asserts.
- **`identity_recomputation` (53 vs. 46 lines)** and **`policy_adjudication`
  (52 vs. 62 lines)** are close — the shared rule table did narrow this gap
  to near-parity, as intended — but they are not where the size difference
  comes from.

In short: the ~275-line gap is concentrated almost entirely in
`report_assembly` + the claim-parsing slice of `structural_parsing` — both
inherent to "the checker validates an untrusted serialized artifact
end-to-end that production only ever builds, never parses." A declarative
rule table cannot remove this asymmetry because it was never duplicated
adjudication logic to begin with.

## Oracle results

All required executable oracles pass (`bun test
research/experiments/independent-checker-policy`: 46 pass, 0 fail, 119
`expect()` calls across `production-checker.test.ts` and
`classifier.test.ts`):

- exact positive selected (`development` policy → pure realization
  selected) and rejected (`high-assurance` policy → both realizations
  rejected on category) full-artifact fixtures round-trip and validate;
- reversed candidate and reason-code presentation order (using the
  high-assurance claim, where the broken candidate genuinely carries two
  reason codes) normalizes to an identical checker verdict and violation
  set;
- missing, duplicate, foreign (unconsumed), and malformed (empty
  `case_results`) evidence packets all reject with stable violation codes
  (`missing_evidence_packet`, `duplicate_evidence_packet`,
  `foreign_evidence_packet`, `malformed_authored_input`);
- stale theory ID/identity, required obligation, policy ID/content
  identity, candidate realization identity, recipe-identity propagation,
  evidence aggregate (`passed_cases`), embedded evidence identity, selected
  subject, and selected-assumption projection each reject with a distinct
  stable violation code;
- changed eligibility and changed reason set (independently) reject after
  every producer-owned identity is otherwise fresh;
- two distinct authored realization IDs sharing one content identity
  (`pure` / `pure-copy`) remain distinct in both the claim and the checker
  report, and correctly produce `ambiguous_candidates`;
- `__proto__` and `constructor` obligation IDs are governed correctly when
  declared as an own policy key, and correctly fall through to
  `obligation_not_governed` — never an inherited `Object.prototype`
  member — when absent (`policy.requirements` is a `Map` populated only
  from `Object.keys` of the authored JSON, which never surfaces inherited
  properties);
- **the spec-level evidence limit**: a fully re-derived rebound of the
  pure realization's nine passing cases onto the broken realization's exact
  identity (every subject field genuinely refreshed and self-consistent) is
  **not** reported invalid by the generic checker (`report.valid === true`)
  — production itself cannot distinguish the rebound either and correctly
  reports `ambiguous_candidates` rather than fabricating a winner. The
  separate `canonical-binding-adapter.ts`, given a custodied record
  declaring the real `7/9` split with counterexamples
  `insufficient-stock`/`missing-stock-is-zero`, reports `disagree` — never
  "forged" or "authentic". The honest (unrebound) claim against the same
  canonical record reports `agree`.

## Forbidden dependency/capability closure

Both `production.ts`'s and `checker.ts`'s transitive closures resolve to
exactly `{production|checker}.ts`, `shared-types.ts` (type-only, excluded),
`policy-contract.ts` (declarative data, counted), and `canonical.ts`
(canonical JSON + injected-hash identity, excluded as shared TCB). Neither
closure reaches the other, `canonical-binding-adapter.ts`, `fixtures.ts`,
`hash-provider.ts`, `measure.ts`, `classifier.ts`, or `manifest.ts` — and
neither closure has any bare (non-relative) import at all, `node:crypto`
included: hashing is an injected `HashFn` parameter (see "Correlated TCB"),
not an import reachable from either measured closure.

An early integration pass had `canonical.ts` importing `node:crypto`
directly; a main-agent review correctly flagged that a symmetric size
exclusion for `canonical.ts` does not exempt it from the forbidden-
dependency-closure oracle, since the oracle covers the whole transitive
closure, not just the entrypoint file. The fix moved the concrete SHA-256
implementation to `hash-provider.ts`, imported only by test/measurement
code, with `canonical.ts`/`production.ts`/`checker.ts` depending only on
the `HashFn` type.

## Exhaustive region-classification artifact and negative controls

`classifier.ts` discovers every top-level `import`/`const`/`function`/
`interface`/`type` declaration via the real TypeScript scanner
(`typescript/unstable/ast`, token-based — not regex, not annotations) and
requires every discovered `const`/`function` region to carry an explicit
`manifest.ts` classification; `interface`/`type`/`import` are auto-excluded
by `SyntaxKind` alone. Six independent negative controls
(`classifier.test.ts`) prove failure modes a purely additive or
annotation-seeded classifier would miss:

1. **Unclassified region.** A `const`/`function` region present in a real
   closure but absent from the manifest throws (`classifyClosure`), both
   in isolation (`classifySource`) and through a real temp-file closure.
2. **Mixed type-only/runtime file.** A fixture mixing an `interface` (auto-
   excluded) and a `const` (unclassified) in one file proves the `type_only`
   exemption is per-declaration, not per-file — prompted by an early
   integration finding that `shared-types.ts` itself briefly leaked runtime
   exports (`ARTIFACT_KIND_EVIDENCE_RESULT` etc.) before being corrected to
   stay strictly type-only, with those constants moved into
   `policy-contract.ts`.
3. **Unrecognized top-level construct.** `class`, `let`, `var`, `enum`,
   `namespace`, `export default`, and a bare re-export each throw
   (`discoverRegions`) rather than silently vanishing from both totals —
   the exact gap a prior review found in an earlier annotation-dependent
   numerator oracle (`uncertainties/0004-independent-checker-recut.md`).
4. **Two declarations on one physical line.** `classifySource` assigns
   every touched physical line to exactly one region via a single sweep and
   throws on a cross-region collision, so two declarations sharing one line
   cannot be double-counted into the total.
5. **Transitive forbidden bare import through a shared module.**
   `buildClosure`, given a real temp-file entrypoint that imports a
   "shared" file which itself imports `node:fs`, discovers `node:fs` in
   `bareImports` and confirms the shared file is in the closure — proving
   traversal reaches through pass-through modules, the exact shape
   `canonical.ts` has in the real closures.
6. **Unsupported dynamic import / bare `require`.** A dynamic
   `import(variable)` (non-string-literal argument) and a bare
   `require("node:fs")` outside `import X = require(...)` both throw,
   closing the exact "exotic dynamic forms" gap
   `plans/active/0003`'s own decisions log already flags as deferred for
   the real production forbidden-import oracle.

A further tokenizer-safety finding, discovered empirically while building
the classifier: a plain `Scanner.scan()` loop (no parser-level template
re-scan orchestration) corrupts all tokenization past the first `${...}`
substitution in an interpolated template literal. `production.ts`,
`checker.ts`, and `canonical.ts` therefore use string concatenation instead
of template interpolation throughout; `classifier.test.ts` reproduces the
corruption on a minimal fixture as a documentary regression, and a separate
test confirms all five measured-closure files tokenize cleanly.

## Provenance and prior art evaluated

- **Scaffold/generator search**: none exists in this repository for a
  region-based source-size classifier; built from scratch using the
  already-installed `typescript` 7.0.2 package's `unstable/ast` scanner
  export (`createScanner`, `computeLineStarts`) — the same primitive
  `tests/inventory-tracer.test.ts`'s `scanImportSpecifiers`/forbidden-
  import-closure oracle already uses. `discoverRegions`'s termination logic
  (`consumeSemicolonDeclaration`/`consumeBracedDeclaration`) and the import-
  closure walker (`buildClosure`/`scanImportSpecifiers`) are new, adapted
  from that established pattern rather than copied.
- **`typescript/unstable/sync`/`async` client-server API** (a fuller parsed
  AST) was evaluated and rejected: it talks to a native out-of-process
  host, which is heavier and more fragile than this bounded experiment
  warrants, and the repository's own established oracle
  (`scanImportSpecifiers`) already uses the plain scanner, not this API —
  matching existing convention over introducing a new one.
- Canonical JSON/SHA-256 identity algorithm adapted (not imported) from
  `src/tracer/canonical.ts`.
- Canonical fixture data (theory identity exclusion of `id`, realization
  identity exclusion of `id`/`name`, the nine case IDs, the `7/9` broken
  split with counterexamples `insufficient-stock`/`missing-stock-is-zero`)
  adapted from `examples/inventory/**` and
  `model/evidence/inventory-tracer.json`, per the established disposable-
  lab convention recorded in
  `research/independent-checker-recut-experiment.md`.
- The rejected `a373ae9:src/tracer/resolver.ts` field-mapping shape (noted
  as already evaluated and adapted by the accepted slice-4
  `resolution-claim.ts`) was not separately re-consulted here; this
  experiment's `production.ts`/`checker.ts` are independent fresh
  implementations against the frozen artifact contract, not derivatives of
  that rejected experiment.
- No external dependency, code generator, schema library, network access,
  or Nix/Pagu tooling was used. No Python was used anywhere in this
  experiment.

## Semantic diff

This experiment does not change theory meaning, laws, effects, identity
v0, evidence categories, policy rules, inventory behavior, or any frozen
production module. It is entirely new code under
`research/experiments/independent-checker-policy/` and this report; nothing
in `src/`, `tests/`, `examples/`, `model/`, `design-specs/`, `plans/`, or
`uncertainties/` was modified. It supplies one additional data point
against uncertainty 0004's open question — the declarative-contract
architecture, faithfully implemented, still exceeds the 70% gate — and
does not itself revise the frozen 70% threshold, the compared surfaces, or
any kill criterion.

## Correlated trusted-computing-base (TCB) assumptions

- **Canonical JSON + hash algorithm.** `canonical.ts`'s `canonicalize`/
  `canonicalJson` (recursive key-sorting, non-finite-number rejection) and
  the choice to use the _same_ injected `HashFn` on both the production and
  checker sides are a visible, shared, unproven assumption — not
  independent proof of hashing/canonicalization correctness. This mirrors
  design spec 0003's own disclosure for the real tracer.
  `canonical.ts` is excluded from the size measurement under the named
  `canonical_json_hash_runtime` rule precisely because it is this shared
  TCB, not decision logic — but it is still walked by the forbidden-
  dependency-closure oracle (see above); exclusion from the _size_
  measurement is not exemption from the _capability_ oracle.
- **The declarative contract itself** (`policy-contract.ts`) is a second,
  explicitly counted (not hidden) correlated assumption: both sides trust
  the same rule tables to correctly encode the frozen policy predicates. A
  defect in the shared table would affect both sides identically and
  invisibly to this comparison — which is exactly why it is counted
  symmetrically rather than amortized once.
- **Fixture/test-support code** (`fixtures.ts`, `hash-provider.ts`)
  independently recomputes theory/realization identity payload shaping
  (excluding `id`/`name` fields) to construct valid test data; since
  `canonical.ts`'s key-sorting canonicalization makes any two structurally
  equal JSON payloads hash identically regardless of construction order,
  this recomputation is guaranteed consistent with both
  `production.ts`'s and `checker.ts`'s own copies without being imported
  from either.

## Command outcomes

All run from the repository root against the exact committed tree (post-
`oxfmt`):

```
$ bun test research/experiments/independent-checker-policy
46 pass, 0 fail, 119 expect() calls. Ran 46 tests across 2 files.

$ bunx tsc -p research/experiments/independent-checker-policy/tsconfig.json --noEmit
(clean, exit 0)

$ bunx oxlint --deny-warnings --report-unused-disable-directives research/experiments/independent-checker-policy
(clean, exit 0)

$ bunx oxfmt --check research/experiments/independent-checker-policy research/independent-checker-shared-policy-experiment.md
All matched files use the correct format.

$ bun research/experiments/independent-checker-policy/measure.ts
(prints the full table above; decision: rejected; exit 0 — the command
succeeds whenever it produces a complete, consistent measurement, per its
own docstring: "selected"/"rejected" is a structured output field, not the
process exit code)

$ git diff --check
(no whitespace errors)
```

## Checks not run

- `bun run semproj -- validate` / `generate --check`, `just fast`, `just
check`, broad repository `bun test`, `ruff`, `actionlint`, and Nix/flake
  validation were not run: this experiment's contract forbids touching any
  file those commands validate, and the delegated acceptance surface is
  exactly the six commands listed in "Command outcomes" above.
- No browser, network, Pagu, or Python execution of any kind.
- No independent adversarial review of this experiment has yet occurred;
  that remains for the main integration agent per `AGENTS.md`'s
  delegation model.

## Deviations from the assignment as initially planned

- The initial `discoverRegions`/`consumeDeclaration` design treated "bracket
  depth returns to 0" as a universal region terminator; this silently
  mis-truncated every arrow-function `const` at its own parameter list's
  closing paren (verified empirically), corrupting the region boundaries
  entirely. Corrected to two explicit terminator rules
  (`consumeSemicolonDeclaration` for `const`/`type`/`import`,
  `consumeBracedDeclaration` for `function`/`interface`) before any
  measurement was taken from the buggy version.
- `shared-types.ts` briefly declared runtime `const` exports
  (`ARTIFACT_KIND_EVIDENCE_RESULT` and siblings) alongside its
  `interface`/`type` declarations, which would have made the file-level
  `type_only` framing in its header false. Caught before measurement;
  those constants moved to `policy-contract.ts` (correctly counted, not
  exempted), and a dedicated regression test
  (`classifier.test.ts`, "mixed type-only/runtime file") now guards against
  this exact class of mistake structurally, not just by convention.
  `canonical.ts` originally imported `node:crypto` directly; corrected to
  an injected `HashFn` capability (see "Correlated TCB" and "Forbidden
  dependency/capability closure" above) so neither measured closure has any
  bare import.
- The classifier's first cut recognized only five top-level forms and
  silently skipped anything else (`let`/`var`/`class`/`enum`/`namespace`/
  `export default`/re-exports), and summed per-region line-touch sets
  independently (risking double-counting a physical line shared by two
  declarations), and its import-closure scanner silently failed to record
  a specifier for any unrecognized `import`/dynamic-import/`require` form.
  All three were corrected to fail closed (throw) before this report's
  measurement was taken, with dedicated negative controls added for each.
- One dead branch in `checker.ts` (`duplicate_candidate`) was removed:
  `parseClaim` already rejects a duplicate candidate ID as `malformed_claim`
  before `compare` can reach that later check, so it was unreachable. This
  is a code-quality fix, not a behavior change — a duplicate candidate ID
  still rejects, just via the earlier `malformed_claim` path, which the
  test suite already exercises via `parseClaim`'s own duplicate-ID guard
  (design spec 0003 still requires "a candidate omitted or duplicated" to
  be rejected, and it is).
- All three of these corrections were requested via main-agent review
  mid-implementation, before any committed measurement; no committed
  numbers in this report reflect the pre-correction (buggy) classifier.

## Assumptions and remaining uncertainty

- This experiment measures one specific, faithful implementation of the
  declarative-contract architecture against the frozen artifact/report
  shape. It does not prove the architecture family can never pass the gate
  under a different responsibility split — only that this implementation,
  built to satisfy every required oracle and the full frozen contract
  surface, does not.
- The dominant gap (`report_assembly` + claim-side `structural_parsing`) is
  structural to "the checker validates an untrusted serialized artifact the
  production side only ever builds" — the same shape design spec 0003
  itself requires (`resolution-claim.ts`'s real `parseResolutionClaim` vs.
  `buildResolutionClaim`). Any future attempt to close this gap without
  removing that responsibility split would need to either shrink what the
  checker independently validates (weakening independence) or find that
  some of `checker.ts`'s validation is itself excludable as "structural
  parsing owned by a shared boundary" — which the frozen measurement rule's
  explicit inclusion of "structural parsing... wherever each side owns
  them" does not currently permit.
- Per uncertainty 0004's decision criteria, this result does NOT select the
  declarative architecture for integration. Uncertainty 0004 remains open;
  the next step is a main-agent decision to either (a) accept that no
  faithful implementation of the frozen contract can satisfy the unchanged
  70% gate and reopen the size/trust claim through an explicit reviewed
  design-spec revision, or (b) commission a materially different
  architecture this experiment has not tried.
- No claim of proof, universal correctness, authenticity, or production
  suitability is made anywhere in this experiment. Mutation tests here are
  `example_test` evidence; executing the checker/classifier/measurement is
  bounded `runtime_validation` and source measurement, not proof.
