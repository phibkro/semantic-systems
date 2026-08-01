# Active plan 0035: reproducible action/observation receipt

Canonical frozen contract:
[`design-specs/0035-reproducible-action-observation-receipt.md`](../../design-specs/0035-reproducible-action-observation-receipt.md).
This execution record cannot redefine that contract.

Status: frozen contract; implementation in progress

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

## Review questions

- Can recipe identity absorb environment, observation, or deployment state?
- Can environment presentation order affect identity?
- Can a caller forge an observation or closure reference and refresh an outer
  identity?
- Does any field imply a host, Nix, Cloudflare, or deployment observation?
