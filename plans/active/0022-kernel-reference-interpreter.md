# Active plan 0022: kernel reference interpreter

Canonical frozen contract:
[`design-specs/0022-kernel-reference-interpreter.md`](../../design-specs/0022-kernel-reference-interpreter.md).
This execution record cannot redefine that contract.

Status: implementation candidate; exact acceptance pending

Owner: primary Semantic Systems language lead

## Dependencies

- accepted 0018 checker and bounded CBPV abstract machine;
- accepted 0019 canonical JSON machinery;
- frozen 0020 agent-facing JSON contract and implementation; and
- operator decision that the interpreter precedes the optimized compiler and
  acts as its differential property-testing oracle.

## Owned paths

- `design-specs/0022-kernel-reference-interpreter.md`
- `plans/active/0022-kernel-reference-interpreter.md`
- `model/work/kernel-reference-interpreter.json`
- `src/kernel-interpreter/**`
- `tests/kernel-reference-interpreter*.test.ts`
- `examples/kernel-json/*.kernel-run.json.golden`
- `scripts/accept/0022-kernel-reference-interpreter.ts`
- direct property-testing dependencies in `package.json` and `bun.lock`

Forbidden: changing the frozen 0018 calculus, duplicating typing rules,
starting compiler optimization, exposing machine token authority, committing
Python or shell programs, or touching operator-owned `AGENTS.md`.

## Implementation posture

- Compose existing decoder, projection, checker, and evaluator APIs.
- Keep the interpreter total, deterministic, portable, and unoptimized.
- Use Effect Schema at the public observation boundary and fast-check for
  generated evidence.
- Compare canonical semantic observations, never internal reduction traces.
- Retain exact seeds and minimized failures as reproducible evidence.

## Execution sequence

1. Commit this frozen contract, plan, work item, and red acceptance.
2. Define the closed run-observation Schema and canonical encoding.
3. Implement bytes-to-decode-to-check-to-evaluate composition.
4. Add grammar-aware valid and deliberate-invalid arbitraries.
5. Add selected examples for every observation variant.
6. Add property tests for determinism, phase separation, and canonical
   round-tripping.
7. Add genuine Node parity and architecture-boundary checks.
8. Run 0018 through 0022 acceptance and the full repository gate.
9. Independently review the observation boundary before integration.

## Acceptance command

```bash
bun scripts/accept/0022-kernel-reference-interpreter.ts
```

The implementation candidate composes the accepted decoder, checker, and
machine. Its focused Bun properties and genuine Node golden parity are green.
Exact feature acceptance and independent review remain before integration.

## Evidence ledger

- 2026-07-31: operator selected interpreter-first language development.
- 2026-07-31: operator selected generated valid and invalid programs evaluated
  by both interpreter and compiler as the future compiler-correctness oracle.
- 2026-07-31: the contract excludes implementation traces from equivalence and
  treats exhaustion as inconclusive.
- 2026-07-31: no compiler or optimization was introduced at contract freeze.
- 2026-07-31: added seeded grammar-aware valid and invalid properties with
  shrinking through fast-check 4.9.0.
- 2026-07-31: Bun and genuine Node 24 emitted byte-identical selected
  `semantic.kernel-run` golden observations.
- 2026-07-31 (post-merge correction): independent review of the merged
  feature found three blockers and one open decision. Corrections:
  - the `expected`/`actual` diagnostic-fact projection (`portableFact`)
    recognized only symbol keys and accessors; `Date`, `Map`, `Set`, and any
    other exotic- or inherited-prototype object silently rendered as an
    empty record instead of being rejected, and its cycle-only repeated-
    reference guard released each object once its subtree finished, so a
    non-cyclic alias (the same object referenced twice, not self-
    referential) was duplicated rather than rejected. The design spec now
    states the closed fact-kind and repeated-reference rule explicitly; the
    implementation adds a prototype check and makes the repeated-reference
    guard persistent for the whole projection, matching the 0019/0020
    convention, and is exported as its own tested unit.
  - supplied `bounds` were not total: a non-object `bounds`, `bounds.json`,
    or `bounds.evaluation` (for example `null`, passed explicitly rather
    than omitted) reached direct property access and raised an uncaught
    `TypeError` instead of returning a closed observation; and several
    numeric bound fields were read from the caller's object more than once
    across their validation and use, which a hostile accessor could answer
    inconsistently across reads. The fix reads every bound field exactly
    once into a snapshot, validates that snapshot, and falls back
    component-wise to the exact version 1 default — never wider — for
    anything missing, wrongly typed, or out of range.
  - the generated-evidence corpus exercised only `return`-of-a-value and one
    fixed single-operation handler shape, and its invalid-mutation
    properties covered only representation and scope violations, while the
    model and plan implied broader "grammar-aware" coverage. The correction
    adds `let`, `force`/`thunk`, and `lambda`/`apply` term-constructor
    coverage and deliberate type-mismatch and affine-usage-violation invalid
    mutations, and the design spec now states precisely what the version 1
    corpus does and does not cover, deferring full grammar and grade
    coverage to the differential-compiler property suite this contract
    already requires.
  - `KernelBackend`, named only in the differential-compiler contract prose,
    was undecided as an exported symbol. Decision: it stays future-only.
    Version 1 has exactly one implementation (the reference interpreter);
    exporting a conformance interface with no second conformer would be a
    premature abstraction. `KernelBackend` is introduced by the feature that
    adds the second, compiled backend.
  - considered and rejected: adding a second, document- or value-scoped
    public entry point to make the bounds and fact-boundary fixes easier to
    exercise directly. The frozen contract already commits to one bytes-only
    entry point; the fixes above are internal to it, and the tested unit
    extracted for the fact boundary is exported for direct testing without
    widening the byte-boundary entry point itself.
- 2026-07-31 (correction slice 0024): independent review rejected integration
  head 87c532e with a reproduced blocker: a representation-valid
  `type.argument-mismatch` produced a check-rejected `KernelRunObservation`
  that failed `isKernelRunObservation`, and both canonical run encoders
  threw. The root cause was the 0020 observation decoder (reserved
  diagnostic-fact references never registered with the shared-table
  authority; see the 0020 plan's sixth correction), not an interpreter
  defect, and is fixed at the 0020 boundary. On this slice:
  - the generated type-mismatch and affine-duplication invalid-program
    properties now assert every produced observation passes
    `isKernelRunObservation`, both canonical encoders agree, and the
    canonical text re-validates after `JSON.parse`;
  - a committed byte-exact `rejected-type-mismatch` kernel-run golden pins a
    type-fact check rejection (nonempty shared type table, reserved
    `type_index` facts) and joins the Bun golden test, genuine Node parity,
    and the acceptance artifact list;
  - `toPortableFact`'s array projection accepted an enumerable numeric own
    key at or beyond the snapshotted `length` and silently omitted it — two
    non-interchangeable host values projecting to one canonical fact, which
    the fact-boundary contract forbids. Such keys now reject outright, with
    hostile-proxy counterexamples (phantom tail key, at-length boundary
    key) committed alongside the existing sparse-array rejection;
  - assessed at this slice, then disproved by post-0025 exact-head review:
    `isKernelRunObservation` performed a shape walk while the canonical
    encoders separately snapshotted the whole observation. Interpreter-produced
    observations are deeply frozen and never triggered the disagreement, but
    the public guard and encoders did not accept the same caller-supplied set:
    an alias shared between `expected` and `actual` passed two independent fact
    predicates and then failed the whole-observation snapshot, while a valid
    0020 check observation above the projector's ad hoc 10,000-object ceiling
    passed the guard and failed both encoders. The later correction below
    replaces this assessment with executable counterexamples.
- 2026-07-31 (correction slice 0025): the 0024 residual — an accepted
  observation whose open diagnostic-fact record keys were inserted out of
  code-point order failing its own canonical byte decode with
  `decode.type-table-order` — was confirmed real and fixed at the 0020
  boundary (see the 0020 plan's seventh correction): open fact records are
  traversed and materialized in `compareCodePoints` key order, the canonical
  encoding's own key order, on both the decode and observe seams. This is a
  clarification of the frozen contract, not a semantic version change: the
  canonical byte grammar already fixed the key order, so agents must not
  infer insertion order for any fact-record traversal, including
  interpreter-produced kernel-run observations that embed check
  observations. No interpreter code changed on this slice; the 0022
  acceptance run re-verifies the kernel-run goldens byte-exactly against
  the corrected boundary.
- 2026-08-02 (post-0025 custody correction): exact-head inspection reproduced
  another open-record collision at the inherited 0020 boundary. An own
  diagnostic-fact key named `__proto__` passed strict value decoding, but
  materialization through an ordinary `{}` assignment invoked
  `Object.prototype.__proto__` instead of creating an own data property. The
  accepted observation therefore lost the key and canonicalized as an empty
  record. Both the decoder and checker-observation translator now materialize
  open fact records into null-prototype records, preserving every permitted
  string key as inert data. A focused value-decode, canonical-byte-decode, and
  byte-identical re-encode regression covers the exact counterexample.
- 2026-08-02 (post-0025 interpreter custody correction): exact-head static
  review returned `READY` for `a162f70ea663b7025a990e210e93e053753cbfd7`,
  while identifying caller-facing guard/encoder set disagreement and several
  custody gaps. Both disagreements were reproduced before correction: a
  cross-field alias made the guard return true while both encoders threw, and
  an independently decoded 0020 check observation with more than 10,000
  object/array nodes made the guard return true while both encoders threw.
  `snapshotKernelRunObservation` now owns one strict whole-observation
  projection used by the public guard and both encoders. Its node and depth
  budget is derived from the frozen 0020 observation budget plus the two
  `semantic.kernel-run` wrapper records; individual runtime facts use the
  existing 0020 observation limits instead of an undocumented narrower
  10,000-node/64-depth ceiling. The public index no longer exports the
  test-only `toPortableFact` seam. The architecture test scans all four
  interpreter modules for ambient authority, and the 0020 acceptance gate
  explicitly holds the generated type-mismatch input document. The own
  `__proto__` regression now covers object, scalar, and null values. Focused
  evidence after correction: 68 Bun tests / 5,658 expectations, TypeScript,
  and strict Oxlint pass.
