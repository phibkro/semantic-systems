# Semantic Systems agent map

The operator-wide charter in `~/.codex/AGENTS.md` applies. In particular, never
use Pagu. Older project documents that prescribe Pagu describe superseded
infrastructure and are not an active execution path.

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
- Before freezing a software-system design, apply the
  [open semantic system design lens](docs/open-semantic-system-design.md):
  declare warranted state, typed inputs, artifacts versus effect requests,
  returned observations, orthogonal component graphs, and bounded autonomy.
- Advance independent semantic frontiers concurrently when their contracts,
  files, and acceptance gates do not overlap. Serialize only true dependency
  edges, shared semantic-boundary decisions, and final integration.

## Navigate

- `docs/constitution.md` — governing semantics
- `docs/stratified-design.md` — system strata
- `docs/metamodel.md` — canonical graph vocabulary
- `docs/*-spec.md` — subsystem contracts
- `model/` — canonical project graph
- `src/project-model/` — Bun/Effect v4 project graph tooling
- `design-specs/` — frozen problem contracts
- `features/<id>/` — canonical authored feature dossiers
- `examples/` — executable tracer bullets and fixtures
- `generated/` — deterministic projections; never edit by hand

## Validate

Enter the pinned environment with `nix develop`, then use one of the four
bounded repository workflow commands:

```bash
just setup
just check
just verify
just start <feature-id>
```

`just check` may repair only Oxfmt output, Oxlint safe fixes, and deterministic
generated views. It reports changed paths and fails on undeclared or
non-idempotent repairs. `just verify` is observe-only, requires a clean tracked
tree at an exact base and head, and never repairs evidence. Hooks and CI use
observe-only execution.

Validate one live dossier with its explicit feature lifecycle command:

```bash
bun run semproj -- feature validate --feature <feature-id>
```

Artifact hashes are checked against file contents, and every derived lifecycle
dimension reports its source. A missing required tool fails its gate; it is
never downgraded to a warning. `nix flake check` runs repository-source
invariants and commit-policy conformance as real sandboxed derivations. Commit
messages and pull-request titles follow the Conventional Commits policy in
`commitlint.config.ts`; see `CONTRIBUTING.md` for the full loop and provenance.
Report checks that were not run or unavailable; never infer success.

## Current frontiers

Inventory resolution 0001 is complete. Active frozen contracts are reference
research 0002, independent resolution checking 0003, reference-source custody
0004, the autonomous development loop 0005, and the TypeScript/Effect Control
Room reconstruction 0017. The executable semantic-system kernel 0016 is
integrated and accepted. Active feature dossiers under `features/` own authored
execution state. Binder equivalence remains uncertainty 0001; do not silently
expand `theory-norm-v0`.

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

Every developer or engineer assignment must also:

- Work like a lazy senior engineer: search before hand-writing infrastructure.
- Reuse or adapt license-compatible upstream code and techniques with
  attribution; reused code is never semantic authority.
- Automate deterministic, bounded, repeatable work when it is cheaper to own.
- Stop automating when it becomes an unbounded side quest.
- Report which scaffold, command, dependency, or prior art was evaluated, what
  was reused, and why relevant established options were rejected.

When a Herdr lifecycle sequence is known in advance, encode the whole sequence
in one bounded Bun program that uses `herdr-mcp/client`. The program owns the
connection, stable agent and turn IDs, exact waits, receipts, and cleanup. Do
not serialize predictable lifecycle steps as repeated interactive CLI calls.
Reserve the CLI for exploration and decisions that genuinely require operator
input between steps.

## Model routing

- Prefer GPT-5.6 Sol for audits, adversarial review, semantic analysis, and
  other complex reasoning.
- Prefer Sonnet 5 for bounded mechanical implementation after the contract,
  owned paths, and executable acceptance commands are frozen.
- Use native subagents for GPT-family lanes by default and Herdr for Anthropic
  lanes. Follow an explicit operator request to use another harness for a
  particular lane, and never claim a named model or effort unless verified.
- Launch delegated Claude Code sessions with `--permission-mode auto`. Do not
  use `dontAsk`: it converts routine read-only shell and network operations
  into silent evidence gaps instead of routing them through the permission
  classifier.
- Let already-running delegated work finish unless it is blocked or has drifted
  outside its contract; apply this routing to new assignments.
- Model output is advisory or contributory evidence, never semantic authority.
  The integrating agent still gates committed artifacts and accepts decisions.

## Preferred implementation stack

Start applicable new work with TypeScript 7, Bun, Effect v4, Oxfmt, Oxlint, the
Oxlint Effect plugin, and Alchemy v2 for infrastructure. This is a preferred
default rather than an unconditional constraint; record the technical reason
for deliberate divergence. Python may be used for disposable one-off
investigation but not committed as project source or scripts.

## Completion and merge

For nontrivial features, follow design spec 0005: one frozen spec, one stable
plan, one canonical feature record, one acceptance script, and one completion
PR. Complete work by changing only its canonical record from `in_progress` to
`complete` with typed completion evidence; do not move the plan or edit its
heading/status prose. The main integration agent
may merge after exact-head gates, independent review, preview, and evidence
audit pass; operator-owned external effects still require approval. Report the
merged commit and preview to the operator, then close harvested Herdr tabs and
remove only clean, integrated worktrees. Local hooks are advisory. GitHub checks
become required only through externally configured branch protection and merge
queue; review resolution and post-merge Herdr cleanup remain main-agent gates,
not repository-inferred facts.
