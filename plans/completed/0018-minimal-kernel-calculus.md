# Plan 0018-minimal-kernel-calculus: minimal kernel calculus

Canonical frozen contract:
[`design-specs/0018-minimal-kernel-calculus.md`](../../design-specs/0018-minimal-kernel-calculus.md).
This mutable record cannot change that contract.

Owner: primary Semantic Systems lead

## Dependencies

- accepted open-semantic-system design lens 0015.
- accepted primary head `135d9f2d7a53990108b77b12da8904be7b501952`.
- accepted decision `decision.one-shot`.
- research vocabulary in `docs/compiler-semantics-spec.md`.
- Apache-2.0 oracle `lang-bang` at
  `5b8e032bcffefb23a3a153d3f5cea99050e589c1`.
- TypeScript 7, Bun, Effect v4, Oxfmt, and Oxlint from migration 0010.

The feature does not depend on the normalized-core artifact format. The small
calculus supplies vocabulary that the later format work needs.

## Discovery evidence

- `docs/compiler-semantics-spec.md` requires explicit values, computations,
  effects, handlers, continuation multiplicity, and usage grades.
- `docs/runtime-concurrency-spec.md` selects one-shot resumptions for the first
  runtime.
- `model/semantic/core.json` separates CBPV, usage, and effect theories.
- `src/semantic-system/` contains runtime-schema, custody, bounded-driver, and
  Bun/Node patterns. The calculus can reuse techniques, not domain meaning.
- `src/stm/` contains finite pure-report and portable-closure gate patterns.
- `lang-bang` defines independent Lean representations for value/computation
  syntax, finite-set rows, QTT grades, and a reference evaluator.
- `bang-lang` at `54b0a27b993d59f8ff28d99a66a1aeec3be03e37`
  has no visible license file. It is behavior evidence only.

No upstream source was copied during contract work.

## Owned paths

- `design-specs/0018-minimal-kernel-calculus.md`
- `plans/completed/0018-minimal-kernel-calculus.md`
- `scripts/accept/0018-minimal-kernel-calculus.ts`
- `src/kernel-calculus/**`
- `tests/kernel-calculus-*.test.ts`
- one bounded fixture family under `examples/kernel-calculus/`
- the `work.kernel-spec` entry in `model/work/work.json`
- generated projections from that canonical model change
- focused additions to `scripts/oxlint/semantic-effect-rules.ts` and its tests

Forbidden changes include surface syntax, normalized identity,
`theory-norm-v0`, inventory rules, actor or STM semantics, package resolution,
deployment behavior, generated-view edits, and unrelated cleanup.

## Implementation posture

- Search current schema, custody, canonical-report, portable-closure, and
  command-runner patterns before new infrastructure is written.
- Keep the public entry point smaller than the implementation.
- Define the checker from the frozen judgments, not from TypeScript
  assignability.
- Use immutable finite data and a bounded pure machine.
- Keep checked-program and resumption authority behind private constructors.
- Record all adapted `lang-bang` techniques with the exact commit and license.
- Do not copy code from the unlicensed `bang-lang` repository.
- Stop work that expands into a parser, compiler service, scheduler, or proof.

## Execution sequence

1. Freeze the contract, this plan, the work item, and red acceptance.
2. Add row, grade, decode, and static-rejection oracles.
3. Implement the finite AST and operation signature.
4. Implement the algorithmic checker and retained derivations.
5. Add internal one-shot handler clauses and the bounded machine.
6. Add external suspension and private one-shot resume custody.
7. Add normalized reports and genuine Node parity.
8. Add pinned differential fixtures for the `lang-bang` overlap.
9. Run exact acceptance and full integration at one clean head.
10. Commission independent semantic and API review.
11. Correct each rejected exact head before integration.

## Acceptance command

```bash
bun scripts/accept/0018-minimal-kernel-calculus.ts
```

The gate fails on missing artifacts, missing counterexamples, ambient runtime
authority, Node divergence, model drift, or an unrun required tool.

## Evidence ledger

- 2026-07-31: the operator asked for language work while Control Room
  reconstruction continued on a separate path.
- 2026-07-31: repository research selected one finite CBPV-style calculus.
  The contract excludes syntax, identity, recursion, runtime plurality, and
  backends.
- 2026-07-31: `lang-bang` was selected as the strongest local differential
  oracle. Its exact head is Apache-2.0 and remains independent.
- 2026-07-31: `bang-lang` was retained as informal behavior evidence only
  because no license file was present.
- 2026-07-31: no provider, network, deployment, or external repository effect
  occurred during contract work.
- 2026-07-31: exact 0018 acceptance failed for the intended reason. The
  implementation entry point `src/kernel-calculus/index.ts` does not exist.
- 2026-07-31: the frozen checkpoint passes TypeScript typecheck, strict Oxlint,
  model validation at 123 entities and 179 relations, and all eight generated
  view checks. The existing unsupported kernel-safety claim remains visible.
- 2026-07-31: the reference implementation added immutable AST and signature
  construction, bounded inert-data decoding, explicit grade and finite-set row
  operations, retained algorithmic derivations, private checked-program
  custody, a bounded deep-handler machine, internal and external one-shot
  custody, normalized reports, and a genuine Node parity oracle.
- 2026-07-31: implementation reused the repository's Effect Schema boundary,
  WeakSet/WeakMap custody, canonical JSON, and portable-closure lint patterns.
  The finite grade, row, value/computation, and provenance fixtures adapt
  independently tested ideas from Apache-2.0 `lang-bang` at
  `5b8e032bcffefb23a3a153d3f5cea99050e589c1`; no upstream source was copied.
  The unlicensed `bang-lang` repository was not read or copied.
- 2026-07-31: the frozen syntax has four handler operands but separately
  requires rejection of a claimed output row that hides a foreign label.
  Handler terms therefore contain no claimed row. `checkEffectAssertion` is a
  separate checker judgment over a privately custodied checked program and an
  asserted row. The program's inferred row remains authoritative, a hidden
  inferred label reports `effect.foreign-tunneling`, and any other unequal row
  reports `effect.row-mismatch`. The zero-fuel counterexample is also honored
  as the sole non-positive fuel bound, while the trace-retention bound remains
  positive.
- 2026-07-31: rejection follow-up retained checker-derived latent thunk types
  under private runtime custody, replaced lossy exhaustion summaries with
  deterministic finite graph snapshots, made operation-pair keys collision
  free, replaced locale collation with code-point ordering, and made public
  result schemas validate semantic structure or private custody.
- 2026-07-31: the `lang-bang` overlap now executes the existing local
  `Source.eval` oracle binary against a stable source fixture. The test requires
  exact upstream head `5b8e032bcffefb23a3a153d3f5cea99050e589c1`,
  unchanged oracle source paths, and its Apache-2.0 license before recording
  the observation; it performs no network access and copies no upstream source.
- 2026-07-31: exact acceptance passed with 27 focused Bun oracles, one genuine
  Node oracle, TypeScript 7 typecheck, strict Oxlint, focused Oxfmt, the
  semantic-effect rules, project-model validation at 123 entities and 179
  relations, and all eight generated-view checks. Project-model validation
  retained the pre-existing unsupported kernel-safety warning.
- 2026-07-31: full `just check` passed with 422 Bun tests and 68 Python tests,
  formatting, strict lint, TypeScript typecheck, commit policy, model
  validation, and generated-view checks. No provider, network, deployment, or
  external repository effect occurred.
- 2026-07-31: rejection correction acceptance passed with 30 focused Bun
  oracles, one genuine Node oracle, the independently executed pinned
  `lang-bang` observation, TypeScript 7 typecheck, strict Oxlint, focused
  Oxfmt, semantic-effect rules, project-model validation, and all generated
  view checks. Full `just check` then passed in the Nix dev shell with 425 Bun
  tests and 68 Python tests. The pre-existing unsupported kernel-safety warning
  remains visible. No provider, network, deployment, or external repository
  mutation occurred.
- 2026-07-31: final rejection correction made raw check and evaluation schemas
  whole-observation custody gates. Copies that recombine genuine programs,
  tokens, or snapshots with forged fields are not observations. Separately
  named normalized-report schemas validate exact structural keys and reject
  retained authority. Runtime-value predicates now reject cycles, excessive
  depth, and excessive node counts without defects.
- 2026-07-31: the pinned `lang-bang` test now materializes a clean detached Git
  worktree at the exact commit and verifies its head, whole-worktree
  cleanliness, license, and Lean toolchain. It links only the local ignored
  Lake cache, then runs Lake with `--rehash --no-cache`, followed by a
  `--no-build` freshness check, before executing `Source.eval`. Network
  protocols and proxies are denied for the build process. Lake can refresh
  only shared ignored `.lake/build` artifacts; those are declared derived local
  oracle output, not source or project evidence mutations. The temporary
  worktree is removed after the observation.
- 2026-07-31: independent final review accepted candidate
  `d436176d3b652b81b19ec81716dcde88dda848ca`. Clean integration at
  `f461cb38960493c044459c58374d6d1aa12bda3b` passed exact feature acceptance
  and the full repository gate. The accepted program custody seam now unblocks
  normalized-core format 0019.
- 2026-07-31: the completed plan moved to the durable ledger after normalized
  core 0019 integrated without changing the accepted 0018 contract.
- 2026-08-02: an exact downstream acceptance run exposed a test-infrastructure
  timeout, not a semantic failure: the clean offline Lean oracle build needed
  5.89 seconds on the live host, beyond Bun's five-second default, while the
  same pinned source, toolchain, license, offline policy, and expected
  observation passed. The test now declares a bounded 30-second timeout for
  that cold external build; no oracle input, output, or authority changed.
- 2026-08-02: Historical leading status migrated verbatim from the pre-migration plan:
  Status: integrated and accepted
