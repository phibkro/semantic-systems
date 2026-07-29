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

Enter the pinned environment with `nix develop`, then run the fast loop while
iterating and the integration loop before opening or updating a pull request:

```bash
./scripts/check-fast.sh
./scripts/check.sh
PYTHONPATH=src python -m semantic_project_model report
```

For one frozen feature, run its exact acceptance script:

```bash
./scripts/accept/<id>-<slug>.sh
```

A missing required tool fails these gates; it is never downgraded to a
warning. `nix flake check` re-runs the hermetic subset (Python static checks,
tests, and commit-policy conformance) as real sandboxed derivations. Commit
messages and pull-request titles follow the Conventional Commits policy in
`commitlint.config.ts`; see `CONTRIBUTING.md` for the full loop and commit
provenance. Targeted commands are documented in `CONTRIBUTING.md`. Report
checks that were not run or unavailable; never infer success.

## Current frontiers

Inventory resolution 0001 is complete. Active frozen contracts are reference
research 0002, independent resolution checking 0003, and reference-source
custody 0004. Their plans under `plans/active/` own mutable execution state.
Binder equivalence remains uncertainty 0001; do not silently expand
`theory-norm-v0`.

## Delegation

Delegate only after the relevant contract is frozen. Every assignment must name
exact read/write paths, forbidden paths, assumptions, executable acceptance
commands, expected deliverables, and autonomy level. Use separate Git worktrees
for concurrent writers. At most three delegated writers may be active
concurrently; each must own an isolated worktree and a frozen, non-overlapping
contract. Treat the frozen contract as a deep-module boundary: a small, stable
semantic interface hiding substantial implementation freedom and surfacing
composable abstractions. The integrating agent owns semantic decisions, reviews
committed artifacts on a clean tree, and commissions independent review.

## Model routing

- Prefer GPT-5.6 Sol for audits, adversarial review, semantic analysis, and
  other complex reasoning.
- Prefer Sonnet 5 for bounded mechanical implementation after the contract,
  owned paths, and executable acceptance commands are frozen.
- Let already-running delegated work finish unless it is blocked or has drifted
  outside its contract; apply this routing to new assignments.
- Model output is advisory or contributory evidence, never semantic authority.
  The integrating agent still gates committed artifacts and accepts decisions.

## Completion and merge

For nontrivial features, follow design spec 0005: one frozen spec, one active
plan, one acceptance script, and one completion PR. The main integration agent
may merge after exact-head gates, independent review, preview, and evidence
audit pass; operator-owned external effects still require approval. Report the
merged commit and preview to the operator, then close harvested Herdr tabs and
remove only clean, integrated worktrees.
