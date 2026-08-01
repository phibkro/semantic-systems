# Completed plan 0049: Effect Schema public snapshot boundary

Canonical frozen contract:
[`design-specs/0049-effect-schema-public-snapshot-boundary.md`](../../design-specs/0049-effect-schema-public-snapshot-boundary.md).
This execution record cannot redefine that contract.

Status: implementation and local acceptance complete; integration pending

Owner: Semantic Systems Control Room boundary engineer

## Dependencies

- accepted 0017 Control Room reconstruction and public snapshot custody;
- accepted main `835412b59b49ebd3c7bf362727f3a2da66c760f8`;
- pinned `effect@4.0.0-beta.102`, TypeScript `7.0.2`, Bun, Oxfmt, and Oxlint; and
- the adjacent accepted Effect Schema portfolio-snapshot pattern.

## Owned paths

- `design-specs/0049-effect-schema-public-snapshot-boundary.md`
- `plans/completed/0049-effect-schema-public-snapshot-boundary.md`
- `model/work/effect-schema-public-snapshot-boundary.json`
- `scripts/accept/0049-effect-schema-public-snapshot-boundary.ts`
- `src/project-model/public-export.ts`
- `tests/public-export.test.ts`
- `apps/control-room/src/model.ts`
- `apps/control-room/src/snapshot.ts`
- `apps/control-room/src/snapshot.test.ts`
- derived generated project-model views

Forbidden: canonical JSON or digest changes, cache-key changes, fetch/XState
redesign, portfolio snapshot code, deployment/provider code, workflow changes,
adjacent repositories, other worktrees, and operator-owned `AGENTS.md`.

## Implementation posture

- Reuse installed Effect v4 Schema; add no dependency and copy no upstream code.
- Keep one authoritative public Schema shared by producer and browser.
- Use strict excess-property decoding and identity codecs without coercion.
- Keep exact timestamp syntax plus the existing PBK calendar predicate; do not
  substitute the broader `Schema.DateTimeUtcFromString` codec.
- Preserve public/cache bytes, guard signatures, candidate classifications,
  SHA-256 verification, last-known-valid custody, and UI orchestration.
- Prefer deletion over an additional abstraction layer.

## Execution sequence

1. Freeze the contract, plan, work record, and acceptance journey.
2. Define authoritative public schemas and derive their TypeScript types.
3. Replace handwritten browser guards and cache JSON parsing/encoding.
4. Add strict nested, numeric, temporal, identity, endpoint, and byte-parity
   counterexamples.
5. Regenerate derived project views and run focused gates.
6. Run exact feature acceptance, review the diff, commit, and commission
   independent exact-head review.

## Acceptance command

```bash
bun scripts/accept/0049-effect-schema-public-snapshot-boundary.ts
```

## Evidence ledger

- 2026-08-01: reuse audit found approximately 165 lines of handwritten key
  inventories and validators in `snapshot.ts`; the adjacent portfolio snapshot
  already demonstrates strict Effect Schema decoding on the same app runtime.
- 2026-08-01: installed source confirms `Schema.decodeUnknownExit`,
  `Schema.fromJsonString`, `Schema.Natural`, `Schema.Int`, patterns, custom
  filters, and recursive `onExcessProperty: "error"` are available in
  `effect@4.0.0-beta.102`.
- 2026-08-01: generic Effect DateTime decoding was rejected because it accepts
  and normalizes a broader language than the frozen whole-second UTC bytes.
- 2026-08-01: focused producer and browser tests, root and app type checks,
  root and app lint, model validation, generated-view checks, 77 Control Room
  tests, nine mobile Chromium journeys, payload scanning, and the 896-pass root
  suite all completed without failure; the one configured external-oracle test
  remained explicitly skipped.
- 2026-08-01: independent review found that default Schema encoding could
  discard excess cache fields and that the accepted candidate remained marked
  in progress. Strict encode options now reject rather than normalize a nested
  excess field, and the work record and projections are terminal.

## Completion state

Implementation, local product verification, and independent-review
corrections are complete. Exact-head approval, integration onto the newer
`origin/main`, protected checks, and merge remain integration-owned boundaries.
