# Active plan 0038: surface effect replay

Canonical frozen contract:
[`design-specs/0038-surface-effect-replay.md`](../../design-specs/0038-surface-effect-replay.md).
This execution record cannot redefine that contract.

Status: frozen; implementation pending

Owner: primary Semantic Systems language lead

## Dependencies

- accepted 0026 named surface parser, elaborator, and strict kernel compilation;
- accepted 0037 one-shot external effect replay for reference and bytecode; and
- merged main `44dce33c1e16245edc3914007d14e85b8073c819`.

## Owned paths

- this design spec, plan, work item, example, and exact acceptance script;
- `src/surface-execution/**`;
- `tests/surface-effect-replay*.test.ts`; and
- derived generated project-model views.

Forbidden: changing surface grammar, kernel typing/effect semantics, existing
surface or kernel observation formats, backend continuation representations,
custom execution bounds, deployment, operator-owned `AGENTS.md`, or committed
Python/shell programs.

## Implementation posture

- Reuse the accepted public composition seams; derive no parser, checker,
  interpreter, compiler, VM, or canonicalization rule.
- Decode the external script once before either backend sees it.
- Compile source and encode its strict kernel document once.
- Keep backend observations separate and add no agreement claim.
- Keep execution composition outside the portable surface-language closure.
- Add no dependency and copy no upstream source.

## Execution sequence

1. Commit the frozen contract, plan, model item, and red executable acceptance.
2. Add the one-capture composition module and immutable result container.
3. Add one readable unhandled-effect example.
4. Add positive, rejection, moving-input, generated, architectural, and Node
   journeys.
5. Run focused gates and exact acceptance on a clean head.
6. Commission independent exact-head review, correct findings, and integrate.

## Acceptance command

```bash
just accept 0038-surface-effect-replay
```

## Evidence ledger

- 2026-08-01: merged 0037 supplies the first affine external replay boundary,
  but agents must still manually elaborate readable source to kernel bytes.
- 2026-08-01: seam audit found that invoking each backend directly on an
  unknown script would observe a moving input twice and could fabricate a
  mismatch. The frozen composition therefore owns one inert script capture.
- 2026-08-01: no library or generator is needed; the accepted Effect program,
  canonical kernel encoder, and two replay entry points already provide the
  complete implementation vocabulary.
