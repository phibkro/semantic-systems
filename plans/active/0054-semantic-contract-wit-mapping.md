# Plan 0054-semantic-contract-wit-mapping: semantic contract to WIT mapping

Canonical frozen contract: [`design-specs/0054-semantic-contract-wit-mapping.md`](../../design-specs/0054-semantic-contract-wit-mapping.md).
This mutable plan records implementation state and does not redefine the frozen contract.

Feature base: `8fd6b46`

## Scope and custody

This lane owns only:

- `src/wit-mapping/**`;
- `examples/wit-mapping/**`;
- `tests/wit-mapping.test.ts`;
- `scripts/accept/0054-semantic-contract-wit-mapping.ts`; and
- this plan.

The canonical project model, generated views, frozen design specification, package manifests, and adjacent feature lanes remain read-only.

## Design decisions

- The decoder is a closed, immutable boundary for `semantic.wit-mapping-input/v1`. It validates package identifiers, identities, WIT names, world references and direction, declaration uniqueness, type references, recursive-type rejection, Unicode scalar and collection bounds, and unsupported type forms before generation.
- The normalized type algebra has explicit primitives, list/option/result/tuple, named and borrowed resource handles, and native `stream<T>` and `future<T>`. It does not parse or narrow thunks, higher-order functions, open effect rows, unbounded integers, or recursive shapes.
- The renderer sorts declaration families and world directions by Unicode code points while preserving ordered record fields, variant cases, flags, tuple elements, and function parameters. It emits current WIT `async func`, `stream<T>`, and `future<T>` directly.
- Resource constructors, methods, statics, owned names, and `borrow<resource>` uses remain structural WIT shape. Resource ownership, usage grade, and drop assumption are companion manifest dimensions rather than theory claims.
- The manifest retains theory and complete-contract identities, WIT identity, world direction, item mappings, exhaustive law/effect/grade/assumption/evidence rows, and the five frozen unsupported-claim classes. WIT identity hashes exact UTF-8 WIT bytes; manifest identity hashes canonical UTF-8 manifest bytes through Effect `Crypto`.
- Bun and genuine Node entrypoints share the pure report seam and emit one canonical summary. The acceptance composition root uses the existing command helper for pinned tool and repository gates.

## Implementation sequence

1. Define the closed input/output vocabulary, bounds, diagnostics, typed mapper failures, and canonical encoders.
2. Implement strict decoding, normalized type validation, cross-reference checks, and immutable snapshots.
3. Implement canonical WIT rendering, exhaustive companion mapping, output limits, and Effect Crypto identities.
4. Add the inventory tracer descriptor, frozen WIT/manifest/summary goldens, and Bun/Node composition roots.
5. Add focused behavioral tests for async/stream/future, direction, ownership, exhaustive dimensions, law-only identity, reordered parity, and fail-closed diagnostics.
6. Add the exact acceptance script for goldens, pinned `wasm-tools` parser observations, parity, predecessor and project-model gates, and type/lint/format checks.
7. The integrating lead runs the exact acceptance command, reviews the owned diff, and integrates the commit without changing forbidden artifacts.

## Acceptance command

```bash
nix develop -c bun scripts/accept/0054-semantic-contract-wit-mapping.ts
```

## Evidence ledger

- 2026-08-02: frozen 0054 contract inspected at parent commit `8fd6b46`; no existing WIT mapping module was present.
- 2026-08-02: mapper source, inventory descriptor, goldens, focused tests, acceptance program, and plan were created only in the delegated ownership paths.
- 2026-08-02: direct Bun smoke generation and Bun entrypoint execution passed; bare `node` was unavailable outside the pinned environment and was intentionally not substituted.
- 2026-08-02: formatter, linter, typecheck, full tests, exact acceptance, wasm-tools, finite-sum predecessor, and semproj gates were intentionally left to the integrating lead.

## Assumptions and limits

The descriptor links to a complete semantic contract and trusted source key supplied by another subsystem. WIT syntax parsing is delegated to pinned `wasm-tools` at acceptance; parser success is not Semantic theory realization, proof, evidence sufficiency, runtime conformance, scheduling, fairness, cancellation, ordering, delivery, backpressure, liveness, ownership-calculus correctness, cleanup correctness, or external-effect authentication.
