# Active plan 0026: Semantic surface language

Canonical frozen contract:
[`design-specs/0026-semantic-surface-language.md`](../../design-specs/0026-semantic-surface-language.md).
This execution record cannot redefine that contract.

Status: implementation candidate; exact acceptance passed

Owner: delegated Semantic surface-language engineer

## Dependencies

- accepted 0018 kernel calculus and checker;
- accepted 0020 strict agent-facing kernel JSON boundary;
- accepted 0022 reference interpreter; and
- Apache-2.0 lang-bang Pratt-rule and named-core elaboration prior art at
  `5b8e032bcffefb23a3a153d3f5cea99050e589c1`.

## Owned paths

- `design-specs/0026-semantic-surface-language.md`
- `plans/active/0026-semantic-surface-language.md`
- `model/work/semantic-surface-language.json`
- `src/surface-language/**`
- `tests/semantic-surface-language*.test.ts`
- `examples/surface-language/**`
- `scripts/accept/0026-semantic-surface-language.ts`

Forbidden: changing 0018, 0020, or 0022 semantics; editing operator-owned
`AGENTS.md`; adding packages without a demonstrated gap; pushing, merging, or
deploying.

## Implementation posture

- Use the installed Effect 4.0.0-beta.102 and TypeScript 7.0.2 APIs.
- Use Effect Schema for the external source boundary and tagged Effect errors
  for expected failures.
- Keep lexer/parser algorithms pure and total; use Effect at boundary and
  phase composition seams.
- Reify actual precedence rules as data and retain executable associativity
  counterexamples.
- Elaborate only names and canonical list order; delegate all kernel judgments
  to the existing strict decoder and checker.
- Reuse the lang-bang rule-table and named-core techniques with provenance, not
  source or language decisions.

## Execution sequence

1. Freeze this contract, plan, model item, and initially red acceptance.
2. Implement bounded source schemas, tokens, spans, and lexer diagnostics.
3. Implement the named AST and complete grammar with reified Pratt rules.
4. Implement separate value/resumption scope resolution.
5. Validate every constructed document through the strict 0020 decoder.
6. Compose the 0018 check observation without re-deriving semantics.
7. Add constructor, rejection, precedence, ambiguity, scope, and interpreter
   agreement tests.
8. Add Bun and genuine Node selected-fixture parity.
9. Run exact acceptance, dependent acceptance, and full integration gates.
10. Commit one clean conventional feature and request independent review.

## Acceptance command

```bash
bun scripts/accept/0026-semantic-surface-language.ts
```

## Evidence ledger

- 2026-07-31: operator directed language work to establish an interpreter
  before an optimized compiler, with differential interpreter/compiler
  properties as the later correctness oracle.
- 2026-07-31: operator selected recursive JSON as the frozen agent-facing
  kernel interface and asked for a readable named surface language similar in
  whole-language discipline to lang-bang.
- 2026-07-31: inspected lang-bang's Apache-2.0 rule-table Pratt parser and
  named-core-to-de-Bruijn seam at the pinned 0018 oracle revision. Reused the
  techniques, not its grammar or source.
- 2026-07-31: no parser generator or new dependency was selected. The grammar
  has two small precedence families and the existing stack already supplies
  Effect Schema and the kernel/interpreter composition boundaries.
- 2026-07-31: the implementation candidate covers every current kernel type,
  value, and computation constructor; its 16 focused Bun journeys and genuine
  Node parity passed. The configured pinned lang-bang oracle, 0020/0022
  dependent acceptance, strict lint, TypeScript 7 with Effect diagnostics,
  formatting, model generation, and full `just check` passed in the exact 0026
  acceptance run. The sole model warning remains the pre-existing unsupported
  `claim.kernel.safety`; this feature makes no safety-proof claim.
- 2026-07-31: operator direction keeps the native build identity
  Unison-shaped rather than making Nix the language build engine. This slice
  preserves that seam: names and spans stop at the surface AST, the elaborated
  kernel document has deterministic canonical bytes, and definition
  dependencies, recursive groups, domain-separated hashing, and build policy
  remain owned by a later feature.
