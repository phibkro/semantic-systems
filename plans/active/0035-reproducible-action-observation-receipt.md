# Active plan 0035: reproducible action/observation receipt

Canonical frozen contract:
[`design-specs/0035-reproducible-action-observation-receipt.md`](../../design-specs/0035-reproducible-action-observation-receipt.md).
This execution record cannot redefine that contract.

Status: accepted for integration at implementation head `7e11b0f`

Owner: delegated Semantic Systems language engineer

## Dependencies

- accepted 0033 semantic runtime-closure manifest;
- accepted normalized-core canonical JSON and SHA-256 custody; and
- Effect 4.0.0-beta.102, TypeScript 7.0.2, Bun 1.3.13, and genuine Node 24.

## Owned paths

- `design-specs/0035-reproducible-action-observation-receipt.md`
- `plans/active/0035-reproducible-action-observation-receipt.md`
- `model/work/reproducible-action-observation-receipt.json`
- `src/language-build/reproducible-action.ts`
- `src/language-build/index.ts` for 0035 exports only
- `tests/language-build-reproducible-action.test.ts`
- `tests/language-build-reproducible-action-node.test.ts`
- `scripts/accept/0035-reproducible-action-observation-receipt.ts`
- derived generated project views

Forbidden: changing 0033 validation or identity; executing host commands;
adding ambient paths, time, process, network, deployment mutation, Python, or
shell source; editing operator-owned `AGENTS.md`.

## Implementation sequence

1. Freeze this contract and executable red acceptance.
2. Implement strict schemas, bounded representation capture, normalization,
   capability admission, identities, the closed reference interpreter, and
   exact canonical validation.
3. Add focused Bun properties and genuine Node parity.
4. Run the 0033 seam, TypeScript, lint, formatting, projections, and complete
   repository gate.
5. Record exact-head evidence and request independent review before integration.

## Acceptance command

```bash
bun scripts/accept/0035-reproducible-action-observation-receipt.ts
```

## Evidence ledger

- 2026-08-01: 0033 deliberately stopped at a compiler-to-build closure and
  established no execution or deployment claim.
- 2026-08-01: the operator selected reproducibility across build, action, and
  deployment layers while retaining distinct granularities and semantic
  identities.
- 2026-08-01: this contract chooses the smallest executable next slice: a
  finite reference interpreter over accepted closure data. Real host execution
  remains a future effect protocol rather than an implied capability.
- 2026-08-01: implementation `cd93238` passed 10 focused Bun tests with 66
  assertions, genuine Node golden parity, all 16 inherited 0033 tests with 75
  assertions, TypeScript 7 with Effect diagnostics, Oxlint, Oxfmt, strict model
  validation, and deterministic generated views. The complete repository run
  reached 755 passes and one expected skip but did not pass: under host load it
  reported one curator readiness failure and two 5-second reference-custody
  timeouts. These failures are outside the 0035 paths; they remain an explicit
  integration-gate retry rather than being relabeled as acceptance.
- 2026-08-01: integration head `7e11b0f` observes receipt and SHA-256 digest
  byte lengths through intrinsic typed-array accessors before any defensive
  allocation or copy. The exact acceptance passed 11 focused Bun tests with 71
  assertions, genuine Node parity, all 16 inherited 0033 tests with 75
  assertions, the complete repository suite with 759 passes, one declared
  skip, zero failures, and 18,985 expectations, plus all 68 reference checks,
  TypeScript 7 Effect diagnostics, Oxlint, Oxfmt, commit policy, model
  validation, and generated-view equality.
- 2026-08-01: an independent read-only review of exact implementation head
  `7e11b0f` found no release blocker and approved integration. The reviewer
  confirmed semantic-layer honesty, full identity recomputation, exact 0033
  closure revalidation, closed capability admission, pre-allocation byte and
  digest bounds, immutable custody, and Bun/Node portability. A direct hostile
  digest-lookalike regression remains a non-blocking future coverage addition;
  the intrinsic typed-array boundary already rejects that shape.

## Review questions

- Can recipe identity absorb environment, observation, or deployment state?
- Can environment presentation order affect identity?
- Can a caller forge an observation or closure reference and refresh an outer
  identity?
- Does any field imply a host, Nix, Cloudflare, or deployment observation?
