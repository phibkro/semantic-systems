# Uncertainty 0003: cybernetic development evaluation

## Current hypothesis

Semantic Systems can model both its development process and recursive runtime
components as explicit controllers: goals provide reference signals,
observations provide feedback, gates compare observations with obligations,
and bounded actions change the system.

This may improve the project graph by making feedback latency, sensor coverage,
controller authority, disturbances, and unobserved state explicit without
collapsing semantic meaning into process metrics.

## Supporting evidence

- The project already separates claims, evidence, gates, assumptions, work,
  runtime, observation, and responsibility.
- Tracer bullets define falsifiable reference behavior and feedback.
- Independent checking reduces correlated observation paths.
- Components are already treated as recursive open systems.
- Current agent work exposes real delays, noisy summaries, shared-state
  disturbances, and possible self-validation.

These are project observations, not yet evidence for any particular
cybernetic theory.

## Counterevidence and risks

- Control-system metaphors can erase agency, interpretation, and semantic
  disagreement.
- Good regulator, requisite variety, viable-system, and perceptual-control
  results have different hypotheses and should not be blended casually.
- Optimizing measured throughput or gate pass rate can damage semantic learning.
- Delayed high-gain correction can cause rework and oscillation.
- Multiple correlated sensors can look independent while sharing one defect.
- A graph rich enough to describe a controller may still be unable to predict
  its behavior.

## Downstream work that depends on it

- development feedback-loop design and evaluation;
- agent orchestration and autonomy boundaries;
- explanation and observability;
- runtime component recursion;
- evidence-policy design;
- resource and concurrency control;
- generated work and operational views.

## Resolving experiment

For three completed features, record:

- contract-to-first-signal and signal-to-correction latency;
- every sensor and the failure modes it observes;
- shared dependencies between sensors;
- disturbances and recovery actions;
- false acceptance, false rejection, and escaped falsifiers;
- rework cycles and metric-gaming opportunities.

Compare a plain checklist view with a controller view. The cybernetic model is
useful only if it predicts or exposes at least one actionable failure mode that
the checklist misses without hiding evidence categories or human authority.

Kill or narrow the model if it merely renames existing workflow concepts,
encourages metric optimization, or requires one universal controller for
semantically distinct systems.

## First observation (2026-07-29, feature 1 of 3)

The real 0005 pilot supplies the first observation for this resolving
experiment. It exposes a feedback boundary, but does not establish any
cybernetic theory.

### Latency and feedback boundary

- Pilot PR #1's exact head passed all three protected checks before merge.
  The commit-policy sensor then false-rejected the GitHub-generated squash body
  only on post-merge run `30484693324`, because one feature-report paragraph
  exceeded an inherited 100-character prose limit.
- The correction signal therefore arrived after merge. Recovery required a
  second protected PR, PR #2, which squash-merged as `e00e8f9`; the separate
  post-repair main-push replay `30485774751` then passed all three required
  contexts, including acceptance 0005 replay.
- Exact wall-clock contract-to-first-signal and signal-to-correction durations
  were not recorded. The available local correction-worktree timing sample was
  approximately 5.5 seconds for 35 focused process oracles, 4.5 seconds for
  the fast loop, 7.6 seconds for the 60-test integration loop, and 5.9 seconds
  for acceptance 0005. These are single-machine `runtime_validation`
  observations, not stable performance or lifecycle-latency claims.

### Sensors and dependencies

- The observed sensors were pinned fast/integration (Nix), feature-contract
  validation plus acceptance 0005, commit-message and PR-title policy, and the
  post-repair main-push replay. They observe different artifact classes, but
  the PR-head sensors could not observe the platform-generated squash body
  later checked by the main-push policy job.
- Fast/integration and acceptance share repository implementation, fixture,
  and pinned-environment assumptions. Provenance and its checker are
  co-versioned. Branch protection, merge-queue state, operator feedback,
  review state, and Herdr/worktree cleanup are external state; repository
  code must not fabricate those observations.
- The pilot's claimed independent process review was the main agent's own
  documented counterexample rounds against pre-merge commits, not a separate
  GitHub reviewer. The review API recorded no requested review for either
  merged PR (`reviewDecision` empty, zero reviews), so reviewer independence
  remains unestablished and correlated defects may escape.

### Disturbance, recovery, and gaming risk

- The disturbance was platform-generated squash prose interacting with an
  inherited body-length rule. Recovery through a protected repair PR rather
  than a direct `main` edit preserved the authority boundary.
- One false rejection is recorded; no false acceptance is recorded for this
  pilot. One repair cycle is observed. No metric-gaming exploit was observed,
  but pass rate and short local timings could be optimized without semantic
  learning, a nonempty PR report can contain a false statement, and the
  conservative `trivial` allowlist can false-reject legitimate maintenance.
  These are gaming opportunities and sensor limits, not evidence of a
  successful exploit.

Gate runs are `runtime_validation`; the operator completion notice and the
Herdr/worktree cleanup are `assertion` observations about session and host
state. This is one pilot observation, not a theory result or a checklist
replacement. The hypothesis remains open until two more completed features are
measured the same way and a plain checklist view is compared with the
controller view without hiding evidence categories or human authority.
