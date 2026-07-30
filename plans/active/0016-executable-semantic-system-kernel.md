# Active plan 0016: executable semantic system kernel

Canonical frozen contract:
[`design-specs/0016-executable-semantic-system-kernel.md`](../../design-specs/0016-executable-semantic-system-kernel.md).
This mutable execution record cannot redefine that contract.

Status: implementation candidate complete; exact feature acceptance green;
awaiting independent exact-head adversarial review after dependency 0015 is
accepted and the candidate is committed cleanly

Owner: primary Semantic Systems lead

## Dependency

Feature 0016 depends on the accepted meaning and authoring worksheet of feature 0015. This worktree currently descends from exact 0015 candidate
`513bd855f051986b9ebc0d00919d242a6ed119c5`; it must be rebased or
reconstructed on the independently accepted and integrated 0015 head before
0016 integration.

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
- `plans/active/0016-executable-semantic-system-kernel.md`
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
  semantic-system tests / 89 expectations, genuine Node portability, inventory
  0001 regression tests, actor 0012 and 0013 exact acceptance, typecheck,
  strict lint, formatting, model validation, and generated-view drift checks.
  These are runtime validation and regression evidence, not proof, language
  soundness, OTP semantics, external exactly-once behavior, or observation
  truth.
