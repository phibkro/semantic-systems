# Plan 0051-kernel-finite-sums: kernel finite sums and case

Canonical frozen contract:
[`design-specs/0051-kernel-finite-sums.md`](../../design-specs/0051-kernel-finite-sums.md).
This mutable plan records execution state and cannot redefine that contract.

Feature base: `c6ce0615eab168ce7c8800b70270737709f6167d`

Owner: primary Semantic Systems lead

## Discovery evidence

- Accepted features 0018, 0019, 0020, and 0022 provide one complete direct,
  normalized, JSON, and reference-interpreter pipeline.
- The active calculus has products but no sum value type, injection, or case
  elimination. No existing contract or implementation owns that extension.
- `semantic.kernel-json`, `semantic.kernel-check`,
  `semantic.normalized-core`, and `semantic.kernel-run` version 1 are closed.
  Adding new variants under those markers would silently change a frozen
  identity.
- The v1 JSON Schema SHA-256 is
  `43760534c0c08a3ab9626f624cd1789c3803002d26f3bb73a6c048b57926eee8`.
- Apache-2.0 `lang-bang` at
  `5b8e032bcffefb23a3a153d3f5cea99050e589c1` supplies independently checked
  prior art for `inl`, `inr`, a one-binder de Bruijn case, and exclusive branch
  resource accounting. Its core rule uses one exact shared branch context.
- Semantic Systems infers upper-use vectors rather than checking an authored
  exact context. Feature 0051 therefore adapts the exclusive-branch technique
  as pointwise least upper bound. It does not copy upstream source.
- The upstream case rule has no at-least-once floor. That floor applies to
  computation sequencing. Feature 0051 retains this distinction: direct case
  scrutinizes a value; a computed scrutinee passes through existing `let`.
- Independent pre-implementation review found that the first freeze omitted the
  scrutinee contribution to resumption use, the strict checked-observation
  vocabulary members, the five versioned identity domains, and direct v2
  bounds and machine-projection gates. The lead corrected the frozen contract
  before accepting any implementation.

## Owned paths

The implementing lead owns the version 2 cutover in:

- `src/kernel-calculus/**`;
- `src/kernel-json/**`;
- `src/normalized-core/**`;
- `src/kernel-interpreter/**`;
- existing kernel, normalized-core, and reference-interpreter tests under `tests/`;
- one dedicated `tests/kernel-finite-sums.test.ts`;
- active examples under `examples/kernel-calculus/`, `examples/kernel-json/`, and `examples/normalized-core/`;
- `spec/kernel-json/kernel-json-v2.schema.json`;
- `scripts/accept/0018-minimal-kernel-calculus.ts`;
- `scripts/accept/0019-normalized-core-format.ts`;
- `scripts/accept/0020-agent-facing-kernel-json.ts`;
- `scripts/accept/0022-kernel-reference-interpreter.ts`; and
- `scripts/accept/0051-kernel-finite-sums.ts` only if an implementation-discovered correction is required.

The implementing lead must not modify:

- `spec/kernel-json/kernel-json-v1.schema.json`;
- any 0018, 0019, 0020, or 0022 design spec or completed plan;
- `design-specs/0051-kernel-finite-sums.md` without an explicit lead-owned contract correction;
- `plans/completed/0051-kernel-finite-sums.md`;
- model records or generated project views;
- packages or dependencies;
- STM, actor, inventory, resolver, project-model, or Control Room sources; or
- operator-owned `AGENTS.md`.

## Required implementation posture

- Start from the existing pipeline. Add no parallel calculus or compatibility interpreter.
- Keep the v1 JSON Schema byte-identical and inactive.
- Make every active kernel, document, check, normalized-core, run, and machine marker exactly version 2.
- Reject v1 through active decoders before deep inspection.
- Preserve every existing v1 term's behavior after marker migration.
- Add only binary sum, typed injections, and value-scrutinee case.
- Make absent-side injection types explicit; add no inference metavariables.
- Add pointwise grade and usage join as a separate operation from sequential addition.
- Compute both usage dimensions as `q * scrutinee + join(left, right)`;
  ordinary and resumption vectors obey the same sequential-versus-exclusive
  distinction.
- Join possible branch effects and require exact branch computation-type equality.
- Keep checked-program, runtime-value, environment, and resumption custody private.
- Extend every exhaustive switch, recursive clone/equality/type check, schema, decoder, projection, canonical encoder, identity payload, property generator, shrinker, report, and Node journey.
- Preserve deterministic left-to-right child ordering.
- Add no surface language, names, patterns, recursion, fallback, telemetry, or optimization.
- Record the exact `lang-bang` commit and Apache-2.0 provenance. Copy no upstream source.

## Execution sequence

1. Add failing direct sum/case checker and machine oracles.
2. Extend grade join, AST constructors, recursive equality/clone, binder origins, checker derivation, runtime values, case transition, and direct reports.
3. Cut normalized-core active types, projections, decoding, canonical identity payloads, examples, and Node parity to version 2.
4. Add the checked-in v2 JSON Schema and an embedded portable representation while preserving the v1 schema bytes.
5. Cut kernel JSON active types, bounds traversal, strict decode, canonical encode, checked view, examples, and Node parity to version 2.
6. Cut the reference interpreter observations and grammar-aware generated cases to version 2 and add consuming contexts for sums.
7. Add the smallest right-injection/case tracer with raw, checked, normalized, and run observations.
8. Migrate prior active examples, tests, and acceptance programs to version 2 markers without weakening their claims.
9. Run focused gates, the exact 0051 gate, exact predecessor gates, and full integration.
10. Commission independent semantic and implementation review at the exact implementation head.
11. Correct all Critical and Important findings.
12. Record typed completion evidence only after exact-head acceptance and review pass.

## Acceptance commands

```bash
bun test tests/kernel-finite-sums.test.ts tests/kernel-calculus-checker.test.ts tests/kernel-calculus-machine.test.ts tests/kernel-calculus-oracle.test.ts tests/kernel-calculus-custody.test.ts tests/kernel-json-format.test.ts tests/kernel-json-check-view.test.ts tests/kernel-json-custody.test.ts tests/kernel-json-diagnostic-fact-custody.test.ts tests/kernel-json-observation-bounds.test.ts tests/normalized-core-format.test.ts tests/normalized-core-custody.test.ts tests/kernel-reference-interpreter.test.ts
node --test tests/kernel-calculus-node.test.ts tests/kernel-json-node.test.ts tests/normalized-core-node.test.ts tests/kernel-reference-interpreter-node.test.ts
bun run typecheck
bun run lint
bun run format:check
bun scripts/accept/0051-kernel-finite-sums.ts
bun scripts/accept/0018-minimal-kernel-calculus.ts
bun scripts/accept/0019-normalized-core-format.ts
bun scripts/accept/0020-agent-facing-kernel-json.ts
bun scripts/accept/0022-kernel-reference-interpreter.ts
bun run semproj -- validate
bun run semproj -- generate --check
just check
git diff --check
```

## Evidence ledger

- 2026-08-02: direct repository inspection found the complete extension seam
  and the version-identity boundary. Existing closed v1 formats cannot be
  changed in place truthfully.
- 2026-08-02: independent local prior-art inspection established exact
  `lang-bang` provenance, branch-binder and substitution technique, and its
  limits. Its proof applies to its exact shared-context calculus, not to this
  implementation. The upstream grade-zero erasure statement remains
  incomplete.
- 2026-08-02: contract frozen at primary base
  `c6ce0615eab168ce7c8800b70270737709f6167d`. Implementation, acceptance,
  integration, and independent review remain pending.

- 2026-08-02: independent contract review returned `CHANGES_REQUIRED` before
  implementation acceptance. The freeze was corrected to bind the full
  resumption formula, closed v2 rule/diagnostic vocabularies, exact bounds,
  `/v2` identity domains, effect-carrying sum types, external resumption, and
  machine snapshots. No implementation was accepted under the earlier text.

- 2026-08-02: the finite-sum pipeline was integrated at
  `bc505b152f7f7d7f613fbf66f79d8ed515058219`.
- 2026-08-02: the first implementation review found ten defects. The correction
  at `cbbdda63ca530f9a2b1e7fc34f10a107fb886a40` closed all Critical and
  Important findings.
- 2026-08-02: exact feature acceptance passed on a clean detached worktree at
  `cbbdda6`. The focused gates passed 23 tests with 80 expectations and 183
  tests with 5,227 expectations.
- 2026-08-02: five genuine Node tests passed. They cover checked, normalized,
  and run observations that contain finite sums.
- 2026-08-02: full `just check` passed with 720 tests and 16,257 expectations.
  Type checks, strict lint, formatting, commit policy, and all predecessor gates
  also passed.
- 2026-08-02: project-model validation checked 138 entities and 194 relations.
  It reported one pre-existing unsupported-claim warning. Nine generated views
  matched their canonical sources.
- 2026-08-02: independent exact-head review of `cbbdda6` returned `ACCEPTED`.
  It found no Critical or Important defect. The reviewer ran no tests.
- 2026-08-02: this evidence is runtime validation, tests, static analysis, and
  review assertion. It is not proof of safety, normalization, termination, or
  grade-zero observational erasure.
- 2026-08-02: Status: complete. The implementation and integration head is
  `cbbdda6`.
