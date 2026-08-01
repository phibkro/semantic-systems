# Active plan 0045: resource lifecycle effect projection

Design contract:
[`design-specs/0045-resource-lifecycle-effect-projection.md`](../../design-specs/0045-resource-lifecycle-effect-projection.md).

## Objective

Project accepted resource-lifecycle scripts into ordinary readable surface
effects and grade-`1` cleanup thunks, then replay both affine backends and
compare cleanup transfer, order, and multiplicity with the 0044 oracle.

## Frozen implementation slice

- strict 0044 input reuse and 32-event, 16-resource, 48-request, and
  48-generated-let bounds;
- deterministic string table and fixed eight-int event payloads;
- generated existing surface syntax with lifecycle operations, grade-`1`
  cleanup thunks, affine binder moves, and forced finalization requests;
- existing surface compilation and independent reference/bytecode replay;
- exact raw-event decoding, binder ledger, cleanup-law comparison, and backend
  comparison;
- strict derived report Schema, canonical encoding, and revalidation;
- focused Bun, genuine Node, generated, mutation, and full-repository gates;
- work-model and generated-view update; and
- independent exact-head release review.

## Owned paths

- `design-specs/0045-resource-lifecycle-effect-projection.md`
- `plans/active/0045-resource-lifecycle-effect-projection.md`
- `model/work/resource-lifecycle-effect-projection.json`
- `scripts/accept/0045-resource-lifecycle-effect-projection.ts`
- `src/resource-lifecycle-projection/**`
- `tests/resource-lifecycle-effect-projection*.test.ts`
- generated model views affected by the new work item

Changes outside these paths require an explicit contract correction before
implementation continues.

## Execution order

1. Independently challenge the frozen representation and claims.
2. Implement schemas, string-table construction, payload encoding/decoding,
   cleanup binder planning, and source generation.
3. Compose the tracer, compiler, and two replay paths; preserve their separate
   authority in the report.
4. Derive cleanup comparisons and strictly revalidate the complete report.
5. Add oracle counterexamples, exact boundaries, generated scripts, Node
   parity, and one injected backend divergence.
6. Run the exact feature acceptance, complete repository gate, Nix checks, and
   independent exact-head review.
7. Publish only after all required evidence agrees at one clean head.

## Acceptance command

```bash
nix develop --command bun scripts/accept/0045-resource-lifecycle-effect-projection.ts
```

## Completion record

Implementation candidate complete. The projection reuses the frozen 0044
tracer, strict Effect Schemas and canonical codecs, existing surface compiler,
and independent reference/bytecode replay without changing a lower language
module or adding a dependency. Focused Bun tests cover the exact 48-let path,
all exit causes, transfer, early release, blocked close, live affine omission,
failed acquisition/finalization, Unicode tables, caller custody, forged and
perturbed reports, generated cleanup order, and the checker counterexamples.

The exact acceptance pipeline passes the focused Bun suite, genuine Node
journey, TypeScript 7 Effect diagnostics, Oxlint, Oxfmt, project-model
validation, generated-view equality, commit policy, and complete repository
gate. Independent exact-head review and integration remain the lead's gates.
