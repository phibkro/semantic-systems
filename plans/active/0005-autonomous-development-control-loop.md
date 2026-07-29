# Active plan 0005: autonomous development control loop

Canonical problem contract:
[`design-specs/0005-autonomous-development-control-loop.md`](../../design-specs/0005-autonomous-development-control-loop.md).
This mutable execution record must not redefine the frozen contract.

## Semantic claim

The falsifiable process claim, authority boundary, feedback ladder, evidence
limits, semantic diff, and kill criteria are frozen in design spec 0005.

## Current state

- The private repository has one GitHub Actions workflow running Ruff, format,
  Pyright, pytest, model validation, and generated-view checks.
- `scripts/check.sh` runs the integration suite, but silently warns when Ruff
  or Pyright are missing.
- Strict Ruff and Pyright configuration already exists.
- Design specs and execution plans exist, but there is no PR template,
  acceptance-script convention, exact-head contract check, or documented
  autonomous merge boundary.
- Completed Herdr tabs required manual cleanup; three harvested tabs were
  closed on 2026-07-29.
- GitHub reports that `main` currently has no branch protection. Required-check
  enforcement must be configured only after the final workflow check names are
  stable, then exercised by the pilot PR.
- `nix flake check` currently passes only flake evaluation for the local
  `x86_64-linux` dev shell and formatter; the flake exports no project test
  derivation yet. It must not be reported as an integration-test gate until
  `checks` actually run repository validation.
- The active checker exposed a correlated-sensor failure mode when resolver and
  checker briefly shared the same adjudication function.

## Implementation slices

1. Development-loop guide and PR completion template.
2. Required-tool fast and integration scripts.
3. Feature acceptance-script convention.
4. CI jobs with exact-head reporting.
5. Lightweight contract/PR metadata validation.
6. Branch/ruleset inspection and minimal required-check configuration.
7. Pilot on one completed tracer.
8. Independent adversarial review.
9. Cybernetic evaluation and first measurements.

Slices 1, 2, 4, and 8 may be implemented independently behind the frozen
contract. Workflow and branch-rule integration serialize after command names
and required checks are stable.

## Allowed semantic changes

- Development process, CI, PR reporting, merge authorization, notification,
  and cleanup rules defined in design spec 0005.

## Frozen boundaries

- Language and theory semantics;
- evidence category meanings;
- identity and trust policy;
- operator-owned external effects;
- active feature contracts 0002–0004.

## Acceptance commands

At minimum:

```bash
nix develop --command ./scripts/check-fast.sh
nix develop --command ./scripts/check.sh
nix develop --command ./scripts/accept/<pilot-id>.sh
nix flake check
```

The pilot PR must also demonstrate exact-head CI, preview, review, merge,
completion feedback, and cleanup.

## Evidence requirements

- Script and CI execution are `runtime_validation`.
- Static tools retain `static_analysis`.
- The pilot's tests retain their stated categories.
- Independent process review is `assertion`.
- Cybernetic conclusions remain hypotheses until measured across repeated
  features.

## Risks

- Process checks become ceremony without observing functionality.
- A PR-body parser creates brittle false failures.
- Fast and integration loops duplicate work without latency measurements.
- Self-merge becomes self-validation.
- Notifications report agent claims rather than commits.
- Cleanup mistakes idle for integrated.
- Metrics invite Goodhart-style optimization.

## Progress log

- 2026-07-29: Operator granted bounded autonomous merge authority after
  functionality is verified and required feedback when features finish.
- 2026-07-29: Closed completed semantic advisory, inventory worker, and routed
  deep-research Herdr tabs after their outputs were harvested.
- 2026-07-29: Operator proposed cybernetic systems as a model for loops,
  feedback, and evaluation; recorded as uncertainty 0003 and incorporated into
  the frozen control-loop contract.

## Decisions and deviations

- PRs are completion artifacts for nontrivial features, not fragments opened
  merely to expose activity.
- Main-agent merge authority is bounded by exact gates and operator-owned
  effects, not by blanket autonomy levels.
- Live plans, visible Herdr tabs, pushed commits, and concise commentary provide
  progress transparency; the merged PR is the durable final report.

## Completion state

Open. Complete only after one real feature is accepted and merged through the
new loop, operator feedback is delivered, cleanup is verified, and the first
cybernetic evaluation is recorded.
