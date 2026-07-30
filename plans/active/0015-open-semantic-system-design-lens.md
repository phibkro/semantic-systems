# Active plan 0015: open semantic system design lens

Canonical frozen contract:
[`design-specs/0015-open-semantic-system-design-lens.md`](../../design-specs/0015-open-semantic-system-design-lens.md).
This mutable execution record cannot redefine that contract.

Status: contract drafted; red shape gate pending

Owner: primary Semantic Systems lead

## Discovery evidence

- The operator-supplied conversation sharpens the existing constitution into
  one open-system design lens: epistemic state, typed speech acts, derived
  artifacts, open effect protocols, returned observations, bounded autonomy,
  and orthogonal system graphs.
- `docs/constitution.md`, `docs/stratified-design.md`,
  `docs/runtime-concurrency-spec.md`, and `docs/pattern-catalog.md` already
  contain compatible fragments, but no mandatory authoring worksheet.
- `AGENTS.md` is the always-read surface for repository agents.
- `scripts/check-feature-contract.ts` is the existing PR contract-shape
  authority. It already distinguishes changed feature identities and contract
  migrations, so extending that boundary is cheaper and clearer than creating
  an unrelated validator.
- No design-spec template or repository Agent Skill currently exists.
- The installed agent-browser exploration demonstrated that ambient browser
  focus is shared mutable state: another worker changed the active tab between
  two commands. The exact-tab batch succeeded. This is a concrete example of
  why ownership, process container, and session identity must remain distinct.

## Owned paths

- `design-specs/0015-open-semantic-system-design-lens.md`
- `plans/active/0015-open-semantic-system-design-lens.md`
- `scripts/accept/0015-open-semantic-system-design-lens.ts`
- `docs/open-semantic-system-design.md`
- `design-specs/TEMPLATE.md`
- compact additions to `AGENTS.md`, `docs/constitution.md`, and
  `docs/pattern-catalog.md`
- shape-only design-lens changes in `scripts/check-feature-contract.ts`
- focused gate tests in `tests/development-control-loop.test.ts` or a dedicated
  `tests/open-semantic-system-design-lens.test.ts`
- revision-only migration note in
  `design-specs/0005-autonomous-development-control-loop.md`

Forbidden paths and meanings include language semantics, theory normalization,
runtime actor/STM behavior, evidence category meanings, merge authority,
Workgraph implementation, Reef implementation, browser credentials/session
state, and unrelated project-model changes.

## Implementation posture

- Reuse the existing feature-contract parser, visible-content logic, and
  migration range semantics.
- Keep the static gate honest: validate required shape, never prose meaning.
- Prefer one exported pure validator with table-driven mutation tests.
- Keep always-loaded agent guidance short; detailed examples belong in the
  canonical document.
- Record primary prior art and the operator conversation as provenance without
  treating either as project authority.
- Defer cross-repository distribution to Reef and skill packaging rather than
  creating another uninstalled documentation island.

## Execution sequence

1. Freeze this contract, active plan, and intentionally red acceptance.
2. Add the canonical design-lens document, template, and concise AGENTS
   reminder.
3. Extend the feature-contract gate for changed selected/migrated specs.
4. Add mutation-oriented focused tests for all frozen counterexamples.
5. Record the bounded 0005 gate migration and pattern-catalog vocabulary.
6. Run exact acceptance and the full integration loop.
7. Commission independent semantic/governance review at the exact clean head.
8. Integrate only an accepted head, then record Reef/skill portability as a
   separate frontier.

## Evidence ledger

- 2026-07-30: complete shared conversation observed through one explicitly
  labeled, exact `agent-browser` tab-session `t19`; only that owned tab was
  closed after extraction.
- 2026-07-30: public web retrieval exposed only the title
  `CQRS and System Architectures`; rendered browser text supplied the actual
  design input.

## Acceptance command

```bash
bun scripts/accept/0015-open-semantic-system-design-lens.ts
```

Missing required artifacts or tools fail.
