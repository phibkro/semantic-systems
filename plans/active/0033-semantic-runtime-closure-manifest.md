# Active plan 0033: semantic runtime-closure manifest

Canonical frozen contract:
[`design-specs/0033-semantic-runtime-closure-manifest.md`](../../design-specs/0033-semantic-runtime-closure-manifest.md).
This execution record cannot redefine that contract.

Status: contract frozen; implementation absent

Owner: primary Semantic Systems language lead

## Dependencies

- merged 0027 semantic artifact store;
- merged 0030 declared reachability analysis receipt;
- accepted 0019 normalized-core semantic and artifact identities; and
- installed Effect 4.0.0-beta.102, TypeScript 7.0.2, Bun 1.3.13, and genuine
  Node 24.

## Owned paths

- `design-specs/0033-semantic-runtime-closure-manifest.md`
- `plans/active/0033-semantic-runtime-closure-manifest.md`
- `model/work/semantic-runtime-closure-manifest.json`
- `src/language-build/runtime-closure.ts`
- the narrow snapshot-parameterized 0030 helper and export refactor in
  `src/language-build/reachability.ts` and `src/language-build/index.ts`
- `tests/language-build-runtime-closure.test.ts`
- `tests/language-build-runtime-closure-node.test.ts`
- `scripts/accept/0033-semantic-runtime-closure-manifest.ts`
- `examples/language-build/runtime-closure/**`
- derived generated project views

Forbidden: changing 0019 identity rules; changing 0027 store mutation or
snapshot semantics; changing the public 0030 receipt; inferring dependency
edges; implicitly selecting artifact variants; serializing 0032 bytecode;
running external actions; editing operator-owned `AGENTS.md`; or adding Python
or shell source.

## Implementation posture

- Reuse 0027 snapshot custody and 0030 normalization, identity, and receipt
  validation. Do not create a second reachability checker.
- Capture receipt bytes and selection JSON before the one store observation.
- Use Effect Schema at the selection and manifest boundaries and tagged Effect
  failures through the composition root.
- Keep Crypto and SemanticStore requirements visible; select no live Layer in
  the portable module.
- Keep normalization and exact-set comparison as total private leaf functions.
- Preserve both authority labels and embed the complete accepted analysis.
- Search accepted repository patterns and installed Effect sources before
  introducing any helper or dependency.

## Execution sequence

1. Commit this frozen contract, plan, model item, and executable red acceptance.
2. Extract a private snapshot-parameterized 0030 validation seam without
   changing its public output or tests.
3. Implement strict selection capture, one-snapshot validation, exact member
   coverage, artifact membership, manifest identity, and canonical bytes.
4. Implement strict manifest-byte validation against one store snapshot.
5. Add positive, permutation, variant, stale/forged, missing/extra/duplicate,
   wrong-owner, one-snapshot, bounds, immutability, and digest counterexamples.
6. Add genuine Node/Bun byte parity and minimized named fixtures where useful.
7. Run focused tests, 0027/0030 seam tests, TypeScript 7, lint, formatting,
   project projections, and the complete repository gate at one clean head.
8. Commission revision-pinned independent review and correct findings at their
   owning boundary.
9. Publish one completion PR and merge only after exact hosted replay passes.

## Acceptance command

```bash
bun scripts/accept/0033-semantic-runtime-closure-manifest.ts
```

## Evidence ledger

- 2026-08-01: the operator selected nested kernel, compiler, and build-system
  feedback loops with distinct semantic-value and package/action granularities.
- 2026-08-01: the operator selected Nix as the reproducible outer environment
  while retaining native semantic-value identity inside the language system.
- 2026-08-01: accepted 0027 established semantic/artifact reuse and accepted
  0030 established a bounded caller-declared runtime closure.
- 2026-08-01: 0033 freezes only the exact join needed to say which semantic
  inputs and artifact variants belong together. It deliberately stops before
  action execution, Nix paths, compiled bytecode persistence, or deployment.
- 2026-08-01: true multi-shot continuation reuse remains outside this feature;
  the manifest implementation owns no continuation capture or background work.

## Review questions

- Can any public path observe the store twice for one manifest operation?
- Can a stale or forged analysis survive by refreshing the outer identity?
- Can names, unreachable values, or wrong-owner artifacts enter members?
- Are input and output aliases fully snapshotted and immutable?
- Does any wording or API imply execution or compiler-derived edge authority?
