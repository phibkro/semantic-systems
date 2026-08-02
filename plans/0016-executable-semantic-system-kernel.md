# Plan 0016-executable-semantic-system-kernel: executable semantic system kernel

Canonical frozen contract:
[`design-specs/0016-executable-semantic-system-kernel.md`](../design-specs/0016-executable-semantic-system-kernel.md).
This mutable execution record cannot redefine that contract.

Owner: primary Semantic Systems lead

## Dependency

Feature 0016 depends on the accepted meaning and authoring worksheet of feature 0015. The final candidate was reconstructed on independently accepted and
integrated 0015 head `02547b02a0ec9f0dbd8d6851eb8e99b5ec82ccca`.

## Discovery evidence

- `src/tracer/domain.ts` contains accepted inventory commands-as-`Message`,
  events, guards, reference transition, and replay semantics that can be
  adapted.
- `src/actor/runtime.ts` supplies the accepted Effect v4 actor ownership,
  mailbox, transfer, scope, and bounded trace realization. It must not be
  copied or weakened.
- `src/tracer/loader.ts` and `src/project-model/loader.ts` demonstrate the
  installed Effect v4 Schema decoding pattern.
- `scripts/oxlint/semantic-effect-rules.ts` already enforces portable semantic
  code domains and should be extended rather than replaced.
- The 0015 enforcement ladder distinguishes what contract shape, types,
  runtime decoding, lint, tests, execution observations, and independent review
  can establish.
- The rejected STM head showed why public structural values cannot carry
  handler settlement authority. The semantic component description therefore
  needs private construction custody plus runtime validation.
- The ChatGPT browser-process race showed why one actor/mailbox owner is a
  realization of resource custody, not an automatic consequence of a logical
  session type.

## Owned paths

- `design-specs/0016-executable-semantic-system-kernel.md`
- `plans/completed/0016-executable-semantic-system-kernel.md`
- `scripts/accept/0016-executable-semantic-system-kernel.ts`
- `src/semantic-system/**`
- `tests/semantic-system-*.test.ts`
- one inventory semantic-system fixture under `examples/`
- bounded adapter additions under `src/actor/` only if the accepted actor API
  cannot be reused without them
- focused additions to `scripts/oxlint/semantic-effect-rules.ts` and its tests
- project-model declarations and generated views required to expose this
  frontier

Forbidden paths and meanings include changing accepted inventory guards/events,
weakening actor ownership/mailbox/lifecycle claims, expanding
`theory-norm-v0`, introducing platform authority into portable modules,
claiming OTP or language soundness, editing generated views by hand, and
unrelated reference-custody or resolution semantics.

## Implementation posture

- Search and reuse the existing inventory seam, actor runtime, Effect v4 Schema
  and Layer idioms, canonical JSON utilities, and semantic lint domain before
  adding infrastructure.
- Keep the public module smaller than its implementation: no raw constructor,
  mutable registry, adapter internals, or Effect runtime entrypoint exports.
- Prefer immutable data and pure functions. Effect v4 owns interpretation,
  scope, and runtime capabilities, not hidden domain meaning.
- Use a bounded direct tracer, not a generic workflow engine.
- Record evaluated prior art, versions, licenses, and exact reused techniques;
  do not copy unattributed code.
- Stop generator, package extraction, language syntax, or generalized
  supervision work when it exceeds the frozen tracer.

## Execution sequence

1. Freeze this contract, plan, and intentionally red acceptance.
2. Add oracle-first category, custody, schema, query-purity, interpreter, and
   bound tests.
3. Implement the smallest canonical description and pure kernel.
4. Implement the exact Effect interpreter registry and bounded direct driver.
5. Adapt accepted inventory semantics into the open request/observation
   tracer.
6. Reuse the accepted actor runtime for a second realization and compare
   normalized semantic results.
7. Derive the declared component/protocol graph.
8. Run exact acceptance and full integration at a clean head.
9. Commission adversarial semantic/API review and correct every rejected head.
10. Integrate only after 0015 and 0016 exact-head acceptance, then record the
    future-language elaboration frontier separately.

## Acceptance command

```bash
bun scripts/accept/0016-executable-semantic-system-kernel.ts
```

Missing artifacts, tools, genuine Node parity, inherited feature acceptance, or
unsupported authority claims fail the gate.

## Evidence ledger

- 2026-07-30: operator selected a library/kernel as the executable bridge while
  a dedicated language is still being designed.
- 2026-07-30: initial repository inspection selected existing inventory,
  actor-runtime, Effect Schema, lint-domain, and canonical-output patterns for
  reuse. No upstream code has been copied.
- 2026-07-30: exact acceptance failed before implementation for the intended
  reason: missing `src/semantic-system/index.ts`.
- 2026-07-30: implemented the schema-backed privately constructed component
  description, pure reaction/query kernel, exact Effect interpreter registry,
  bounded direct driver, derived declared graph, inventory open protocol, and
  accepted-actor adapter. Inventory domain decisions reuse
  `prepareReferenceTransition`; actor ownership reuses `src/actor/runtime.ts`.
  No upstream code was copied and no new dependency or scaffold was needed.
- 2026-07-30: focused evidence passed with 25 Bun tests / 92 expectations,
  strict typecheck and lint, plus a genuine Node test observing the same frozen
  normalized journey bytes as Bun.
- 2026-07-30: exact feature acceptance passed. It includes 17 focused
  semantic-system tests / 93 expectations, genuine Node portability, inventory
  0001 regression tests, actor 0012 and 0013 exact acceptance, typecheck,
  strict lint, formatting, model validation, and generated-view drift checks.
  These are runtime validation and regression evidence, not proof, language
  soundness, OTP semantics, external exactly-once behavior, or observation
  truth.
- 2026-07-30: pre-review self-audit corrected two contract gaps: the public
  interpreter boundary now snapshots and exactly validates the complete effect
  request envelope before invoking a handler, and the derived graph now
  includes explicit reaction/query handler nodes, `realizes` edges, and
  unsupported-claim disclosures. The empty actor-normalization case is
  excluded by a nonempty tuple rather than an ambient throw. Exact acceptance
  remained green after the correction.
- 2026-07-30: independent read-only review rejected exact head `0df09da`.
  Concrete executions showed that a mismatched observation could settle a
  pending inventory request, command replay could repeat a completed external
  effect, a genuine registry could cross between same-ID component versions,
  structural extras could overwrite canonical envelope fields, and several
  validation throws became Effect defects rather than typed failures. The
  driver retained an overflowing effect batch beyond its queue-stock bound and
  omitted the promised causal trace; graph edges erased exact progress bounds;
  the portable-authority gate lacked transitive closure evidence; and no 0016
  project-model frontier existed. Exact acceptance and the full 351-test suite
  passed, demonstrating that the registered oracle was incomplete rather than
  that the findings were regressions.
- 2026-07-31: the correction binds observations to the exact pending request
  correlation and causation, retains completed command identities, binds
  registries to the exact privately constructed component instance,
  reconstructs canonical envelopes rather than spreading untrusted fields,
  and translates the reviewed request-envelope and kernel validation failures
  into the typed Effect channel. The direct driver stages reaction batches
  transactionally within the queue bound
  and emits one causal trace; derived graphs preserve exact progress
  declarations. The authority test now walks the transitive import closure.
- 2026-07-31: project-model declarations for the component and executable
  frontier were added and all eight generated projections were regenerated
  from those canonical sources. Additional custody probes reject raw
  accessors, functions, classes, cycles, and hostile proxies before schema
  decoding can observe them; inherited object-property names cannot impersonate
  pending action identities. No new dependency or upstream code was needed.
- 2026-07-31: corrected exact acceptance passed with 30 focused tests/164
  expectations, genuine Node parity, inherited inventory and actor gates,
  typecheck, severe lint, formatting, model validation at 122 entities/177
  relations, and eight generated views. Full integration passed with 356 Bun
  tests/1,844 expectations, zero Effect diagnostics, and 68 transitional Python
  custody checks. This head remains provisional because it is descended from a
  rejected 0015 candidate; it must be reconstructed on the independently
  accepted and integrated 0015 head, rerun, committed at a clean head, and
  independently reviewed before 0016 integration.
- 2026-07-31: the frozen 0016 chain was reconstructed onto independently
  accepted 0015 integration head `02547b0`. The only source/test conflict was
  additive: both the accepted STM domain and the semantic-system domain remain
  covered by the portable Effect lint boundary. Canonical project-model truth
  required one deterministic regeneration of the delegation-frontier view,
  which now reports eight ready work items.
- 2026-07-31: reconstructed exact acceptance passes with 31 focused tests/165
  expectations, including genuine Node parity and inherited inventory/actor
  gates. Full integration passes with 390 Bun tests/2,159 expectations, zero
  Effect diagnostics, model validation at 122 entities/177 relations, eight
  checked generated views, and 68 transitional Python custody checks. Clean
  exact-head independent review remains pending.
- 2026-07-31: independent exact-head review rejected `f276059` because an
  interpreter that returned a malformed observation draft or died inside its
  Effect could escape as an Effect defect, while actor/direct normalization
  omitted effect requests and diagnostics. The same review independently
  reproduced all gates and confirmed that the accepted-base reconstruction,
  the other nine prior correction families, generated views, queue bounds,
  cross-instance registry custody, inherited STM/lens behavior, and Bun/Node
  parity remained intact.
- 2026-07-31: the interpreter seam now checks that handlers return an Effect,
  translates untyped Effect causes to an explicit unknown interpreter outcome,
  validates and decodes the complete observation draft before dereferencing
  it, and rejects malformed programs or drafts through the typed channel.
  Actor/direct normalization now compares state, events, artifacts, effect
  requests, and diagnostics. The import-closure test was renamed to the exact
  runtime-adapter property it observes; ambient-authority evidence remains the
  separate severe lint gate. Focused correction tests pass 18 tests/91
  expectations. Exact 0016 acceptance passes 33 tests/180 expectations with
  genuine Node parity and all inherited feature gates. Full `just check`
  passes installation, Effect setup/diagnostics, formatting, severe lint,
  typecheck, commit policy, all tests, 68 transitional Python custody checks,
  model validation at 122 entities/177 relations with the one pre-existing
  visibly unsupported claim, and all eight generated-view checks.
- 2026-07-31: independent Fable 5 high-effort exact-head review ACCEPTED clean
  `7901f635a10287dd78a10880da8d928559acf0f5`. It independently reran exact
  0016 acceptance (33 focused tests/180 expectations), full integration (392
  Bun tests/2,174 expectations plus 68 transitional Python custody checks),
  genuine Node parity, and every prior malformed-draft, non-Effect, defect,
  typed-failure, interruption, no-replay, actor-normalization, and transitive
  import-closure probe. It found no blocking defects. One low finding was that
  structured interruption had only live probe evidence rather than a committed
  focused regression; actor bookkeeping beyond the contracted projection and
  duplicate runtime oracle literals were informational.
- 2026-07-31: the accepted interruption behavior is now pinned in the focused
  driver suite: a blocked interpreter is interrupted only after entering,
  its finalizer runs, and its exit cause remains interruption-only instead of
  becoming an unknown interpreter outcome. No production behavior changed.
- 2026-07-31: clean candidate
  `6942c53aedee61a8e889f344619aa4753d6a6167` passed exact 0016 acceptance
  with 34 tests/183 expectations and full integration with 393 Bun tests/2,177
  expectations, zero Effect diagnostics, and 68 transitional Python custody
  checks. A narrow Fable 5 exact-head re-review ACCEPTED the committed
  interruption regression as race-free and discriminating, independently
  reproduced the focused, exact, and full gates, and reported no blocking or
  low-severity findings.
- 2026-07-31: candidate `6942c53` was merged without conflict as
  `362f2ecd451c4f7b8c7cfef313dc49db11d0bf36`, whose parents are the exact
  accepted 0015 integration head `02547b0` and the exact accepted 0016
  candidate. On that merge head, exact 0016 acceptance again passed 34
  tests/183 expectations with genuine Node parity; full `just check` again
  passed 393 Bun tests/2,177 expectations, zero Effect diagnostics, and 68
  transitional Python custody checks. Final integration-custody audit remains
  pending.
- 2026-07-31: final read-only Fable 5 integration-custody audit ACCEPTED exact
  ledger head `3a4a61ab9c9f8a45cce6c4f37802c53e039244e8`. It independently verified
  the clean head, exact two-parent topology, candidate/merge tree identity,
  plan-only ledger delta, and ledger truth, then reproduced exact acceptance
  at 34 tests/183 expectations and full integration at 393 Bun tests/2,177
  expectations plus 68 transitional custody checks. A lingering write-capable
  process was isolated to the superseded candidate worktree rather than the
  audited primary tree; both trees remained clean, and the process, completed
  Herdr workspace, and integrated worktree were removed after review.
- 2026-08-02: Historical leading status migrated verbatim from the pre-migration plan:
  Status: complete; integrated and independently accepted on the accepted 0015 base
