# Active plan 0022: kernel reference interpreter

Canonical frozen contract:
[`design-specs/0022-kernel-reference-interpreter.md`](../../design-specs/0022-kernel-reference-interpreter.md).
This execution record cannot redefine that contract.

Status: contract frozen; implementation intentionally absent

Owner: primary Semantic Systems language lead

## Dependencies

- accepted 0018 checker and bounded CBPV abstract machine;
- accepted 0019 canonical JSON machinery;
- frozen 0020 agent-facing JSON contract and implementation; and
- operator decision that the interpreter precedes the optimized compiler and
  acts as its differential property-testing oracle.

## Owned paths

- `design-specs/0022-kernel-reference-interpreter.md`
- `plans/active/0022-kernel-reference-interpreter.md`
- `model/work/kernel-reference-interpreter.json`
- `src/kernel-interpreter/**`
- `tests/kernel-reference-interpreter*.test.ts`
- `scripts/accept/0022-kernel-reference-interpreter.ts`
- direct property-testing dependencies in `package.json` and `bun.lock`

Forbidden: changing the frozen 0018 calculus, duplicating typing rules,
starting compiler optimization, exposing machine token authority, committing
Python or shell programs, or touching operator-owned `AGENTS.md`.

## Implementation posture

- Compose existing decoder, projection, checker, and evaluator APIs.
- Keep the interpreter total, deterministic, portable, and unoptimized.
- Use Effect Schema at the public observation boundary and fast-check for
  generated evidence.
- Compare canonical semantic observations, never internal reduction traces.
- Retain exact seeds and minimized failures as reproducible evidence.

## Execution sequence

1. Commit this frozen contract, plan, work item, and red acceptance.
2. Define the closed run-observation Schema and canonical encoding.
3. Implement bytes-to-decode-to-check-to-evaluate composition.
4. Add grammar-aware valid and deliberate-invalid arbitraries.
5. Add selected examples for every observation variant.
6. Add property tests for determinism, phase separation, and canonical
   round-tripping.
7. Add genuine Node parity and architecture-boundary checks.
8. Run 0018 through 0022 acceptance and the full repository gate.
9. Independently review the observation boundary before integration.

## Acceptance command

```bash
bun scripts/accept/0022-kernel-reference-interpreter.ts
```

At the design checkpoint, contract artifacts pass and acceptance then fails on
the absent `src/kernel-interpreter/index.ts` implementation artifact.

## Evidence ledger

- 2026-07-31: operator selected interpreter-first language development.
- 2026-07-31: operator selected generated valid and invalid programs evaluated
  by both interpreter and compiler as the future compiler-correctness oracle.
- 2026-07-31: the contract excludes implementation traces from equivalence and
  treats exhaustion as inconclusive.
- 2026-07-31: no compiler or optimization was introduced at contract freeze.
