# Active plan 0002: reference baselines deep research

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

## Delegated work

- Fable 5 workflow lead: running in Herdr tab
  `semantic-reference-fable`; its custom workflow is the sequential control
  established before the concurrency clarification.
- Native `/deep-research` comparison lane: completed in
  `semantic-deep-research-fable`; 109 inherited Fable 5/high agents.
- Workflow Sonnet/Opus children: running under explicit model routing in the
  custom lane.
- Independent main-agent verification: pending synthesis.

## Expected artifacts

- `research/reference-baselines/portfolio.md`
- `research/reference-baselines/enforcement-ladder.md`
- `research/reference-baselines/adoption-experiments.md`
- `research/reference-baselines/workflow-comparison-rubric.md`
- `references/sources.toml` plus a generated exact-commit lock
- source/provenance records or cards chosen by the accepted workflow
- a reusable `.claude/workflows/` command only after the pilot script is
  inspected and proves useful
- canonical graph entities for accepted references, decisions, uncertainties,
  and follow-on work

## Acceptance commands

```bash
nix flake check
nix develop --command ./scripts/check.sh
PYTHONPATH=src python -m semantic_project_model validate
PYTHONPATH=src python -m semantic_project_model generate --check
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
- The workflow will be saved only after inspecting its generated script and
  validating the pilot output.

## Completion state

Open. Complete only after source-backed artifacts, independent verification,
canonical graph integration, generated views, and the next adoption experiment
are accepted.
