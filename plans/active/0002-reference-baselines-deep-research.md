# Plan 0002-reference-baselines-deep-research: reference baselines deep research

Canonical problem contract:
[`design-specs/0002-reference-baselines-deep-research.md`](../../design-specs/0002-reference-baselines-deep-research.md).
This file is the mutable execution record and must not redefine that contract.

## Semantic claim

The frozen claim is in design spec 0002. The operational question is whether a
custom, complexity-routed Claude Code workflow produces more adoption-ready
knowledge than a generic deep-research report while using frontier models only
where their reasoning materially changes the result.

## Current repository state

- Tracer bullet 0001 is complete and establishes exact identity, typed
  evidence, policy resolution, execution, explanation, and graph drift gates.
- `docs/technology-portfolio.md` already recommends Rust, Lean 4, Redex/K,
  lossless trees, incremental queries, and project-owned IRs, but many
  recommendations lack pinned reference studies and falsifiable adoption
  experiments.
- `research/lang-bang-patterns.md` is the first reference-pattern card, but it
  predates the common schema in design spec 0002.
- Claude Code 2.1.219 supports dynamic workflows, per-agent model routing,
  resumable script-backed phases, up to 1,000 total agents, and a configurable
  workflow size guideline.
- The operator clarified that read-only fan-out is resource-bound rather than
  limited by shared-tree write contention. Concurrent writers require explicit
  ownership and isolated worktrees.
- `lang-bang` is locally available at commit
  `5b8e032bcffefb23a3a153d3f5cea99050e589c1`.
- `semantic-packages` is locally available at commit
  `d0fa6d0b2d6d14756c26f793255beae325197895`.

## Frozen boundaries

- No kernel, theory identity, evidence meaning, normalized core, runtime, or
  package-contract changes.
- No implementation code is copied in this research bullet.
- External projects are references and realizations, never semantic
  authorities.
- Generated project views remain projections of `model/`.

## Workflow decision

Use a custom dynamic workflow, borrowing the bundled `/deep-research`
search–fetch–cross-check–synthesize pattern.

Reason: the generic workflow is optimized for one cited report; this project
needs heterogeneous structured cards, explicit Sonnet/Opus/Fable routing,
license and trust fields, enforceability and leverage analysis, and a reusable
experiment backlog.

## Pilot slices

1. Fable review of this plan and workflow architecture.
2. Mechanical primary-source packets:
   - Koka and Lean 4;
   - Rust/rust-analyzer and VoidZero/Oxc;
   - TigerBeetle, Power of Ten, and Meadows.
3. Opus comparative reviews:
   - semantics and trust;
   - compiler data layout, allocation, incrementality, and diagnostics;
   - enforceability ladder and systems leverage.
4. Fable synthesis into a ranked adoption portfolio.
5. Main-agent source verification, integration, and acceptance.

## Delegated work record

- The Fable 5 workflow lead completed the sequential structured control run;
  its accepted artifacts and defects are recorded below.
- The native `/deep-research` comparison completed in
  `semantic-deep-research-fable` with 109 inherited Fable 5/high agents.
- The controlled routed treatment completed as workflow `wf_a3592134-285`,
  task `wj3mrs8y3`. Its script differed from the native workflow only in
  metadata and explicit stage routing: Fable/high scope, Opus/medium search,
  Sonnet/medium fetch, Sonnet/medium verification, and Fable/high synthesis.
- Sonnet/Opus children contributed under that routing. Their output remains
  contributory evidence, not authority.
- Main-agent integration and independent review results are recorded in the
  completion ledger below. Live process or session state is not canonical here.

## Expected artifacts

- `research/reference-baselines/portfolio.md`
- `research/reference-baselines/enforcement-ladder.md`
- `research/reference-baselines/adoption-experiments.md`
- `research/reference-baselines/workflow-comparison-rubric.md`
- `research/reference-baselines/workflow-comparison.md`
- `research/reference-baselines/interim-insights.md`
- `research/semantic-packages-patterns.md`
- `references/sources.toml` plus a generated exact-commit lock
- source/provenance records or cards chosen by the accepted workflow
- `scripts/accept/0002-reference-baselines-deep-research.ts`
- a reusable `.claude/workflows/` command only after the pilot script is
  inspected and proves useful
- canonical graph entities for accepted references, decisions, uncertainties,
  and follow-on work

## Acceptance commands

```bash
nix develop --command just accept 0002-reference-baselines-deep-research
nix flake check
nix develop --command just check
bun run semproj -- validate
bun run semproj -- generate --check
```

Research-specific acceptance is the checklist in design spec 0002.

## Evidence requirements

- Primary sources establish project facts.
- Cross-project conclusions are labeled inference.
- Recommendations are design judgments, not imported proof.
- Performance claims retain benchmark hardware, version, workload, and
  comparison scope.
- License compatibility is a recorded constraint, not an informal memory.
- Agent consensus does not upgrade evidence category.

## Known assumptions

- Official project documentation and repositories are available to research
  agents.
- Model aliases `sonnet`, `opus`, and `fable` resolve to the intended Claude 5
  family in the installed environment.
- Read-only parallelism preserves source ownership; quality depends on phase
  barriers, provenance, and independent verification rather than serial
  admission.
- A representative pilot is sufficient to evaluate the workflow before broad
  fan-out.

## Risks

- Source aggregation can erase qualifiers or provenance.
- Project popularity can be mistaken for semantic fit.
- Benchmark results can be generalized beyond their workload.
- The routing classifier can send ambiguous work to an underpowered model.
- Hundreds of low-value agents can produce less knowledge than a dozen
  carefully scoped comparisons.

## Progress log

- 2026-07-29: Verified Claude Code 2.1.219 workflow and custom-agent
  capabilities from the installed CLI and official documentation.
- 2026-07-29: Compared `/deep-research` with custom dynamic workflows and chose
  the latter as the outer orchestrator.
- 2026-07-29: Froze design spec 0002 and the pilot's model-routing,
  provenance, scale, and acceptance boundaries.
- 2026-07-29: Operator clarified that live concurrency is resource-bound;
  read-only fan-out does not share mutation contention, while writers require
  ownership and worktree isolation.
- 2026-07-29: Ran native `/deep-research` as an A/B baseline. It completed in
  15m41s with 109 Fable 5/high agents, 25 verified claims, nine project
  findings, and zero agent failures; it missed coverage, license, project-card,
  and model-routing gates.
- 2026-07-29: Froze the workflow comparison rubric before the custom result.
- 2026-07-29: Added the checked-in reference source catalog and ignored
  materialization-cache rule; external clone traffic remains deferred until
  the running workflow releases resources.
- 2026-07-29: Harvested `semantic-packages` as design ancestry and explicit
  counterexample material at its observed commit.
- 2026-07-29: Saved provisional development insights and the native
  `/deep-research` telemetry before dispatching the controlled model-routed
  treatment.
- 2026-07-29: Launched controlled routed treatment `wf_a3592134-285` with
  native mechanics and budgets unchanged. The research output classifies
  reuse as substantially as-is, adapted behind a project-owned boundary, or
  fresh implementation/semantic synthesis.
- 2026-07-29: Routed treatment completed in 11m13s with 107 agents and zero
  errors. Runtime models resolved to Fable ×2, Opus ×5, and Sonnet ×100. It was
  28% faster than the all-Fable control but both failed full-class coverage
  because the unchanged global top-25 verification cap starved later classes.
- 2026-07-29: Recorded the operational comparison without upgrading its
  provisional semantic findings. The next heterogeneous workflow must allocate
  verification capacity per comparison class rather than by one global rank.
- 2026-07-29: Re-ran the repository baseline in the pinned Nix environment:
  Ruff, format, Pyright, 25 tests, model validation, and all eight generated
  views passed. The existing unsupported `claim.kernel.safety` warning remains
  visible. Host-only execution still lacks Ruff, Pyright, and pytest.
- 2026-07-29: Replaced the blanket single-semantic-frontier constraint with
  decision 0004's dependency-aware parallel frontier. Independent contracts
  may progress concurrently; shared boundaries and final integration remain
  serialized.
- 2026-07-29: Recorded decision 0005: frozen contracts coordinate parallel work
  as shallow interfaces to deep modules, hiding implementation choices while
  exposing composable semantics and evidence obligations.
- 2026-07-29: Recorded the type-system refinement ladder as uncertainty 0002,
  without expanding the active semantic frontier.

## Decisions and deviations

- “Hundreds of agents” means total resumable tasks across batches, not hundreds
  live concurrently.
- The custom pilot remains sequential because it was already well underway
  when the operator clarified concurrency. Its elapsed time is retained as a
  control, not a policy recommendation.
- The native workflow ignores model/effort routing in its prompt because its
  agent calls inherit the lead session. This is a measured baseline limitation,
  not a configuration to adopt.
- Explicit stage routing is accepted for future heterogeneous research, while
  the global top-25 verification mechanism is rejected for portfolios that
  require coverage across distinct comparison classes.

## Completion state

Open. Complete only after source-backed artifacts and custody, RX1–RX4
acceptance, RX5's bounded N/A observation, explicit D1–D4 deferrals,
independent review, canonical graph integration, and generated views are
accepted.

- 2026-07-29: The structured Fable-led control workflow completed 14/14 child
  tasks with zero child errors, 17 cited project cards, 119 typed claims, 12
  accepted method candidates, and 12 ranked experiments. The workflow took
  2h07m at live concurrency 1 and 1.61M subagent tokens.
- 2026-07-29: The run surfaced its own input defect: args arrived as a JSON
  string, project context was empty, and target-boundary mapping was forced to
  a default. Preserved the complete payload and resumable script in ignored
  `.research-cache/` with checksums, and checked in the partial synthesis at
  `research/reference-baselines/pilot-control-synthesis.md`. The portfolio
  remains incomplete until the cached repair re-runs boundary-aware synthesis.
- 2026-08-02: Historical lifecycle heading migrated verbatim from the pre-migration plan:

  # Active plan 0002: reference baselines deep research

- 2026-08-02: Reconciled the cached portfolio against the current
  TypeScript/Bun/Effect repository. The historical packet remains immutable;
  current boundary and enforcement claims were re-derived in the portfolio,
  ladder, and experiments.
- 2026-08-02: Integrated the separately verified six-project type-system
  refinement ladder. The corpus now has representative entries in all six
  required areas, while uncovered projects and per-card uncertainties remain
  explicit.
- 2026-08-02: Recut RX1-RX3 as current experiments. RX1 passed: three fresh
  Bun and three genuine Node runtime trials, each with separate validation and
  generation processes, produced byte-identical ten-view trees and CLI streams.
  This machine check establishes the present determinism precondition only.
- 2026-08-02: RX2 passed under Bun 1.3.13 and genuine Node v24.18.0 with
  distinct Effect platform layers and matching semantic observations. The
  real-graph probe emitted nine registered opaque markers; the positive and
  permanent negative fixtures preserved `incomplete` and clean-but-wrong
  `recorded_complete` behavior across 12 tests. Observed wiring elapsed 56
  minutes, below the two-day kill threshold. This establishes behavior only
  relative to the recorded graph plus supplied register.
- 2026-08-02: Feature closure remains blocked on broader source custody and
  independent review of the integrated portfolio. RX4 is the next runnable
  experiment.
- 2026-08-02: RX5 hit its frozen N/A criterion. The current tracer emits
  human-readable evidence summaries but persists no `evidence_result_v1`
  artifact across a process boundary. A fresh Bun demo process left a
  temporary nine-file inventory tree byte-identical and emitted no serialized
  evidence artifact. The experiment did not manufacture persistence.
- 2026-08-03: Implemented the RX3 ambient-capability wall. The canonical
  source inventory checks an exact, owner-bearing 21-entry runtime-adapter
  register. It rejects runtime-bearing portable imports and
  portable-to-adapter imports. The plugin covers static module forms, named
  runtime globals, console, clock, entropy, timers, fetch, Effect execution,
  and the documented JSON and total-function scopes.
- 2026-08-03: Independent review of the first exact-head candidate found
  runtime-loader, `globalThis`, reproducibility, scope-disclosure, and hot-path
  gaps. The correction uses Node's maintained builtin classifier, covers
  re-exports and string-literal loaders, avoids unconditional scope walks, and
  adds `scripts/experiments/0002-capability-wall.ts`. Aliases, reflection,
  dynamic non-literal names, and package trees outside canonical `src/` remain
  explicit limits.
- 2026-08-03: The canonical `just accept
0002-reference-baselines-deep-research` runner reported this historical
  feature as pre-loop and non-runnable. RX3 therefore relies on its committed
  experiment, focused rule tests, repository gates, and independent review.
  It has no feature-loop acceptance-program claim.
- 2026-08-03: Implemented RX4 in the bounded owned paths. The typed
  enforcement register inventories AGENTS.md invariants, CONTRIBUTING gates,
  package scripts, and all active `scripts/check*.ts` command surfaces,
  distinguishing artifact-backed enforcement from explicit `review-only`
  entries.
- 2026-08-03: `ValidationIssue.code` now uses one finite exported registry.
  `tests/enforcement-register.test.ts` derives fixture mutations from the
  loaded canonical graph and checks both directions: no emitted code is
  undocumented, and every registered code has a producing fixture.
- 2026-08-03: `scripts/experiments/0003-enforcement-register.ts` seeds isolated
  Oxfmt, Oxlint warning, invalid-model, and generated-view-drift failures,
  checks the expected non-zero observations, audits generated files plus the
  two canonical lock documents for positional identity fields, and verifies
  scoped cleanup plus byte identity across the declared repository scan. The
  ignored roots and the identity audit's named scope remain explicit; neither
  observation is proof about future schemas, dynamic values, or unscanned
  consumers.
- 2026-08-03: Parent validation observed six focused register tests with 996
  assertions, all four seeded gates exiting `1` with the intended diagnostic,
  ten generated files, five locked sources, no positional field in the bounded
  audit, byte-identical state across the declared repository scan after scoped
  cleanup, and the full integration gate at 795 tests with 18,762 assertions.
  The existing unsupported-claim warning remains explicit. These checks are
  test, static, and runtime evidence, not proof.
- 2026-08-03: The feature lifecycle moved from historical `pre_loop` to
  `managed` validation and gained
  `scripts/accept/0002-reference-baselines-deep-research.ts`. The runnable
  feature acceptance now covers RX1–RX4, seven adopted source locks, model
  validation, and generated-view drift. This supersedes the earlier
  non-runnable observation without rewriting it.
- 2026-08-03: Source custody now records twelve lock entries. Koka, Lean 4,
  lean4checker, Rowan, Salsa, miette, and LSP — every remote repository that
  supports an adopted method — have strict origin-verified commit, tree, and
  license observations. Unlocked catalog entries are non-supporting inputs.
- 2026-08-03: Remote cache hydration changed from per-blob lazy fetches to one
  bounded no-filter fetch followed by transport-denied closure verification.
  Independent review exposed annotated-tag ambiguity in online
  materialization; peeled-ref precedence, movement-window coverage, and
  end-to-end annotated-tag materialization corrected it.
- 2026-08-03: The first integrated-portfolio closure review found stale claim
  counts, an overstated Power of Ten c05 frequency, an unrecorded LSP license
  conflict, weak Salsa provenance, and stale lifecycle prose. The corrected
  portfolio retains the historical ledger, records the direct-read scope and
  conflicts, and awaits independent rereview before completion.
