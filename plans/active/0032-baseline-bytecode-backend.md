# Active plan 0032: baseline bytecode backend

Canonical frozen contract:
[`design-specs/0032-baseline-bytecode-backend.md`](../../design-specs/0032-baseline-bytecode-backend.md).
This execution record cannot redefine that contract.

Status: contract frozen; implementation absent

Owner: primary Semantic Systems language lead

## Dependencies

- accepted 0018 kernel checker and reference abstract machine;
- accepted 0020 strict agent-facing kernel JSON bytes and check view;
- accepted 0022 reference interpreter and canonical `semantic.kernel-run`
  observation;
- fast-check 4.9.0 for deterministic generated evidence; and
- installed Effect 4.0.0-beta.102, TypeScript 7.0.2, Bun 1.3.13, and genuine
  Node 24.

## Intended implementation ownership

- this design spec, plan, work item, and exact acceptance script;
- `src/kernel-execution/**` for the shared strict preparation seam;
- the narrow 0022 interpreter refactor required to consume that seam;
- `src/kernel-bytecode/**` for compiler, opaque custody, VM, projection, and
  public entry point;
- `tests/kernel-bytecode-backend*.test.ts`;
- `examples/kernel-bytecode/**` for minimized mismatch fixtures; and
- derived generated project-model views.

Forbidden: changing 0018 language semantics; adding a second decoder or typing
rule; importing or calling the 0018 machine from compiler/VM code; optimizing;
exposing a durable bytecode format; deriving cross-value dependency authority;
editing portfolio data or operator-owned `AGENTS.md`; or committing Python or
shell programs.

## Implementation posture

- Search installed Effect v4 sources and accepted repository patterns before
  adding an abstraction; keep exact beta APIs pinned.
- Use Effect Schema at external byte/configuration boundaries and tagged Effect
  failures until the composition root.
- Keep total instruction selection and stepping as small pure modules.
- Refactor representation/check preparation once and prove 0022 canonical
  observations did not change.
- Mint checked and compiled custody only inside their owning modules; test
  runtime forgery and mutation, not TypeScript privacy alone.
- Compile to the smallest finite instruction/block graph that covers the frozen
  0018 grammar. Do not optimize.
- Execute through an independent bounded VM with explicit fuel and stack bounds.
- Generate valid cases by grammar and type, then apply one deliberate invalid
  mutation with a named expected phase.
- Compare exact canonical 0022 bytes; treat either inconclusive result as
  non-agreement.
- Preserve seed, path, and minimized canonical bytes for every mismatch.
- Evaluate existing repository scaffolds and dependencies before hand-writing;
  record reused patterns and license provenance for any upstream technique.

## Execution sequence

1. Commit this frozen contract, plan, work item, and executable red acceptance.
2. Extract the shared strict preparation seam and prove all 0022 goldens remain
   byte-identical.
3. Define private instruction/block and compiled-custody values with finite
   construction bounds.
4. Implement direct baseline compilation for every 0018 constructor and grade.
5. Implement the independent VM and project outcomes to the existing run
   observation.
6. Add source-graph, custody, bounds, and observation-variant tests.
7. Add grammar-directed valid generation and deliberate invalid mutations with
   explicit coverage counters.
8. Add differential agreement, inconclusive rejection, and deliberately
   perturbed-backend properties with replayable shrinking.
9. Add genuine Node/Bun byte parity and committed minimized fixtures.
10. Run 0018, 0020, 0022, 0032, and full repository acceptance at one clean
    head.
11. Commission revision-pinned independent review before integration.

## Acceptance command

```bash
bun scripts/accept/0032-baseline-bytecode-backend.ts
```

At contract freeze, this command must pass contract and project-model checks,
then fail with `missing baseline bytecode backend implementation artifact`.

## Evidence ledger

- 2026-08-01: operator selected interpreter-first development and differential
  property testing as the compiler correctness strategy.
- 2026-08-01: frontier audit found that the current kernel is already CBPV-style;
  the next honest feature is an independent baseline compiler/VM, not “CBPV
  lowering.”
- 2026-08-01: the frozen contract keeps bytecode process-local and opaque so the
  first implementation does not become a durable wire-format promise.
- 2026-08-01: the frozen oracle compares only canonical 0022 observations,
  rejects inconclusive pairs, and requires a perturbed-backend counterexample.
- 2026-08-01: implementation is intentionally absent at the contract checkpoint.
