# Active plan 0037: one-shot external effect replay

Canonical frozen contract:
[`design-specs/0037-one-shot-external-effect-replay.md`](../../design-specs/0037-one-shot-external-effect-replay.md).
This execution record cannot redefine that contract.

Status: contract frozen; implementation in progress

Owner: primary Semantic Systems language lead

## Dependencies

- accepted strict kernel JSON and checked-program custody from 0020;
- accepted reference interpreter and external suspension custody from 0022;
- accepted independent compiler and VM from 0032;
- installed Effect 4.0.0-beta.102, TypeScript 7.0.2, Bun 1.3.13, and Node 24.

## Owned paths

- this design spec, plan, work item, and exact acceptance script;
- `src/kernel-execution/external-observations.ts`;
- narrow additive exports and adapters in `src/kernel-interpreter/**`;
- compiled suspension custody and resume in `src/kernel-bytecode/**`;
- `tests/kernel-external-effect-replay*.test.ts`; and
- derived generated project-model views.

Forbidden: changing kernel typing or effect semantics, importing the reference
machine into bytecode code, exposing compiled graphs or continuation state,
multi-shot cloning, treating JSON thunk tags as executable, deployment,
operator-owned `AGENTS.md`, or committed Python/shell programs.

## Implementation posture

- Reuse the existing portable-fact snapshot, strict Effect Schemas, shared
  preparation seam, reference external token, compiled custody gate, canonical
  encoders, and differential comparator patterns.
- Keep script driving and first-order type matching total and backend-neutral.
- Keep backend resumption behind lexical process custody.
- Preserve every existing public first-suspension byte exactly.
- Add no dependency and copy no upstream source.

## Execution sequence

1. Commit the frozen contract, plan, work item, and red acceptance.
2. Add strict observation-script and effect-run schemas plus canonical encoding.
3. Add the backend-neutral bounded driver and reference adapter.
4. Retain compiled VM state behind opaque one-shot suspension custody and add
   the compiled adapter.
5. Add focused, adversarial, generated, differential, and Node/Bun journeys.
6. Run exact acceptance and the complete repository gate on one clean head.
7. Commission exact-head independent review, correct findings, and integrate.

## Acceptance command

```bash
bun scripts/accept/0037-one-shot-external-effect-replay.ts
```

## Evidence ledger

- 2026-08-01: frontier audit found both public backends stop at the first
  external suspension; only the reference machine retains resumable custody.
- 2026-08-01: operator direction keeps resumptions affine and treats true
  multi-shot continuation cloning as an explicit resource hazard.
- 2026-08-01: the local “Effect Handlers All the Way Down” paper and LangBang
  decisions informed the separation between the operation request, delimited
  continuation, and handler interpretation; no source code was copied.
- 2026-08-01: the first tracer bullet admits only first-order observation data.
  Opaque thunk display values cannot substitute for executable thunk custody.
