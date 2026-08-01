# Active plan 0042: user-defined algebra frontier

Canonical frozen contract:
[`design-specs/0042-user-defined-algebra-frontier.md`](../../design-specs/0042-user-defined-algebra-frontier.md).
This execution record cannot redefine that contract.

Status: tracer implementation in progress

Owner: primary Semantic Systems language lead

## Dependencies

- accepted minimal kernel calculus 0018;
- accepted agent-facing kernel JSON 0020;
- accepted surface language 0026; and
- existing STM law tracer 0014, whose runtime promotion is now gated by this
  feature.

## Owned paths

- this design spec, plan, work item, decision record, and exact acceptance
  script;
- `src/algebra-frontier/**`;
- `tests/algebra-frontier.test.ts`; and
- derived project-model views.

Forbidden: changing kernel syntax or execution, surface grammar, STM model
semantics, deployment, unrelated work, or adding committed Python/shell
programs.

## Implementation posture

- Encode the promotion policy and report as bounded Effect Schema data.
- Keep classification pure and keep observation claims explicit inputs.
- Represent runtime realization alternatives rather than selecting one by
  preference.
- Use the report to repair the STM dependency graph without declaring the
  unresolved substrate accepted.

## Execution sequence

1. Freeze the promotion and workbench boundary.
2. Add the immutable report and pure promotion classifier.
3. Add focused counterexamples and schema/custody tests.
4. Update the project dependency graph and deterministic projections.
5. Run exact acceptance and the complete clean-head gate.
6. Commission independent Opus 5 medium review, correct findings, and
   integrate.

## Acceptance command

```bash
just accept 0042-user-defined-algebra-frontier
```

## Evidence ledger

- 2026-08-01: the 0018 kernel audit found value thunks, finite effect rows,
  graded binders, one-shot resumptions, and deep handlers, but no established
  region non-escape or cancellation/finalization semantics.
- 2026-08-01: LangBang concurrency and STM decisions support ordinary
  one-shot concurrency handlers and keep concurrent STM's shared heap at the
  runtime boundary.
- 2026-08-01: scoped-effects prior art supports treating lexical scopes as
  higher-order/parameterized theories and permits elaboration to first-order
  operations plus handlers in some calculi; applicability to 0018 remains an
  open obligation.
- 2026-08-01: STM retains both owner-actor and shared-memory realization
  families, so atomic implementation machinery is not promoted to language
  syntax by default.
