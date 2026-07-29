# Semantic Systems agent map

## Thesis

Programs depend on semantic theories, not concrete representations. Realizations
provide executable behavior plus typed evidence and explicit assumptions.
Deployment resolution selects realizations under semantic, operational,
platform, evidence, and trust policies.

## Non-negotiable invariants

- Keep the trusted core small.
- Specify theories before realizations.
- Never equate proof, analysis, model checking, testing, benchmarking,
  runtime validation, assertion, or assumption.
- Keep assumptions transitive and visible.
- Treat effects as capability contracts and handlers as interpretations.
- Keep ownership, dependency, derivation, causality, and observation distinct.
- Treat generated views as projections of canonical sources.
- Require an executable tracer bullet for every important abstraction.
- Expose unsupported claims and explain automated decisions.
- Advance independent semantic frontiers concurrently when their contracts,
  files, and acceptance gates do not overlap. Serialize only true dependency
  edges, shared semantic-boundary decisions, and final integration.

## Navigate

- `docs/constitution.md` — governing semantics
- `docs/stratified-design.md` — system strata
- `docs/metamodel.md` — canonical graph vocabulary
- `docs/*-spec.md` — subsystem contracts
- `model/` — canonical project graph
- `src/semantic_project_model/` — bootstrap graph tooling
- `design-specs/` — frozen problem contracts
- `plans/active/` — mutable execution state linked to one design spec
- `examples/` — executable tracer bullets and fixtures
- `generated/` — deterministic projections; never edit by hand

## Validate

Enter the pinned environment with `nix develop`, then run:

```bash
./scripts/check.sh
PYTHONPATH=src python -m semantic_project_model report
```

Targeted commands are documented in `CONTRIBUTING.md`. Report checks that were
not run or unavailable; never infer success.

## Current tracer bullet

`design-specs/0001-inventory-resolution-tracer.md` is the completed contract.
`plans/completed/0001-inventory-resolution-tracer.md` records its execution and
evidence. The next semantic uncertainty is binder equivalence in normalized
theory identity; see `uncertainties/0001-theory-normalization-binders.md`.
Do not silently expand `theory-norm-v0` while that question remains open.

## Delegation

Delegate only after the relevant contract is frozen. Every assignment must name
exact read/write paths, forbidden paths, assumptions, executable acceptance
commands, expected deliverables, and autonomy level. Use separate Git worktrees
for concurrent writers. The integrating agent owns semantic decisions, reviews
committed artifacts on a clean tree, and commissions independent review.
