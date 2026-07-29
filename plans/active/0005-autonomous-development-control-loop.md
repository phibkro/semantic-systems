# Active plan 0005: autonomous development control loop

Canonical problem contract:
[`design-specs/0005-autonomous-development-control-loop.md`](../../design-specs/0005-autonomous-development-control-loop.md).
This mutable execution record must not redefine the frozen contract.

## Semantic claim

The falsifiable process claim, authority boundary, feedback ladder, evidence
limits, semantic diff, and kill criteria are frozen in design spec 0005.

## Current state

- The repository has required-tool fast and integration loops; required tools
  fail closed in the pinned environment rather than degrading to warnings.
- Pull requests have a machine-readable feature contract, completion template,
  exact-head checkout, feature acceptance dispatch, and commit/title policy.
- Merge-group and main-push ranges replay acceptance for changed feature plans,
  while narrow zero-plan maintenance ranges are reported without representing
  feature acceptance.
- `nix flake check` exports real project checks for Python integration and
  commit-policy conformance, with noncanonical cache inputs filtered from both
  Git-flake and `path:.` evaluation.
- Local commit, pre-commit, and pre-push hooks are checked in and explicitly
  installed after the script-disabled frozen dependency install. They remain
  advisory and bypassable.
- GitHub branch protection now requires the three exact workflow contexts on
  an up-to-date branch, applies them to administrators, requires linear
  history and resolved conversations, and forbids force pushes and deletion.
- Pilot PR #1 passed all protected head checks and squash-merged as `9ff36d6`.
  Its main-push integration and feature-acceptance replay passed. Commit policy
  alone false-rejected the GitHub-generated squash body because a feature
  report paragraph exceeded an inherited 100-character prose limit.
- The correction retains Conventional Commit identity in the validated title
  while disabling the nonsemantic body-wrapping rule. Its protected repair PR,
  successful main-push replay, plan closure, and Herdr/worktree cleanup remain
  open.

## Implementation slices

1. Development-loop guide and PR completion template.
2. Required-tool fast and integration scripts.
3. Feature acceptance-script convention.
4. CI jobs with exact-head reporting.
5. Conventional Commit and lightweight contract/PR metadata validation from
   one checked-in configuration.
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
- 2026-07-29: Verified the retired inventory worktree was clean and its commit
  patch-equivalent to integrated main, then removed the worktree. Retained its
  local branch pending deliberate branch-history cleanup.
- 2026-07-29: Operator proposed cybernetic systems as a model for loops,
  feedback, and evaluation; recorded as uncertainty 0003 and incorporated into
  the frozen control-loop contract.
- 2026-07-29: Explicitly revised design spec 0005 at operator request with the
  deterministic hook matrix: save/watch, pre-commit, pre-push, PR head, review,
  merge result, main push, release, schedule, and agent completion. Client
  hooks remain advisory; exact-head and merge-result server gates authorize
  publication.
- 2026-07-29: Clarified that red is executable behavior design: intended,
  forbidden, boundary, invariant, and adversarial observations are encoded
  before implementation and must fail for the intended semantic reason.
- 2026-07-29: Audited all 30 commits with Gitleaks 8.30.1 and a manual
  publication scan, then made `phibkro/semantic-systems` public at operator
  request. Verified GitHub secret scanning and push protection are enabled.
- 2026-07-29: Operator required Conventional Commits. Added the frozen
  local-`commit-msg` plus PR-range/title and merge-queue enforcement contract;
  CI remains authoritative and commit syntax remains metadata rather than
  semantic evidence.
- 2026-07-29: Located Clamor's existing versioned `ConventionalCommits` block
  at commit `a8f52a02de1fc1eb3ad408e94adabfb5a9b54621`, block v1.0.0, digest
  `sha256:f75a4a63e677b8bc6c10f90858aa18d75d84bed0e424949642dc13424ec402f1`.
  It is currently plan-only, so implementation will materialize its inspected
  claims with a checked provenance edge rather than inventing another hook
  stack or claiming Clamor applied it.
- 2026-07-29: Sonnet produced commit
  `da10eb4e812652770abc95500687eb3a08651fb9`. Main-agent checks established
  that its fast and integration loops pass, TypeScript is exactly 7.0.2,
  Actionlint accepts the workflow, all three action SHAs match their official
  tags, and forced Nix derivation rebuilds executed 38 Python tests plus the
  commit-policy conformance check.
- 2026-07-29: Independent adversarial review rejected `da10eb4` as
  integration-ready. CI never invoked feature acceptance; its only acceptance
  script was intentionally red; Commitlint default ignores admitted merge,
  revert, and version messages; editing a PR title did not retrigger CI; Bun
  and the installed Nix release were not pinned; `main` remained unprotected;
  required lifecycle hooks were absent; executable-bit and configured-input
  drift passed provenance checks; and a root `node_modules` directory changed
  Nix-test behavior.
- 2026-07-29: The correction recut keeps the useful check implementation but
  treats every reproduced bypass as a required failing oracle. Branch
  protection remains a serial external integration step after corrected check
  names are exercised on a real PR.
- 2026-07-29: The correction reached commits
  `306d2acbfbaadb7cabe441de302222219b2e8a16` and
  `df0d3c6f4d567977f617628c1d5e19ad4b1167b8`. Main-agent gates passed with
  40 focused feature-policy tests, 65 full tests, static/tooling checks,
  model/generated consistency, acceptance 0005, and both Nix derivations.
- 2026-07-29: A separate final read-only review rejected `df0d3c6`. Git rename
  detection exposed only destination paths, allowing a nontrivial file or
  feature plan to move under `generated/` and be accepted as trivial. The
  review also showed that ignored `.research-cache` content changes the
  `nix flake check path:.` verdict and can enter the Nix store; the documented
  `bun install --ignore-scripts` path leaves all local hooks dormant; and this
  plan's current-state bullets remained stale after their implementation.
- 2026-07-29: The next bounded correction must observe both sides of
  renames/copies, behaviorally exclude noncanonical ignored caches from both
  flake source forms, explicitly activate hooks after the safe ignored-script
  install, update current state without rewriting history, and bind CI locale,
  timezone, and Python hash seed where the frozen contract requires a
  deterministic verdict.
- 2026-07-29: The correction suite first recorded 14 intended red observations:
  absent feature authority, placeholder PR identity, default-ignored commit
  messages, stale mutable PR metadata, dynamic runtime selection, missing
  lifecycle hooks, zero-filesystem-write overclaiming, executable/configured
  input/upstream provenance drift, and root-cache Nix filtering. Production
  correction added a real PR feature validator, range/release acceptance
  dispatcher, acceptance 0005, strict local Commitlint execution, pinned
  environment assertions, pre-push and fast pre-commit hooks, expanded
  transition CI, adapted provenance checks, and cache-isolated validation.
- 2026-07-29: First cybernetic measurement on the correction worktree observed
  approximately 5.5 seconds for 35 focused process oracles, 4.5 seconds for the
  fast loop, 7.6 seconds for the 60-test integration loop, and 5.9 seconds for
  acceptance 0005. These are single-machine runtime observations, not stable
  performance claims.
- 2026-07-29: Sensor audit: pytest exercises feature-policy and dispatcher
  counterexamples; Actionlint checks workflow structure; Ruff, Oxfmt, Oxlint,
  Pyright, TypeScript 7, model validation, generated equality, and provenance
  observe different artifact classes. Correlation remains: tests and
  implementation share repository assumptions, while provenance and its
  checker are co-versioned. Independent review and the committed-artifact gate
  remain necessary.
- 2026-07-29: Control disturbances and gaming risks remain visible. The
  `trivial` path allowlist is deliberately conservative and may false-reject
  legitimate maintenance. A nonempty PR section can contain a false statement,
  so metadata validation cannot replace review. Edited/labeled PR events
  invalidate stale metadata checks, but branch protection, merge queue, review
  resolution, operator feedback, and Herdr cleanup are external state that
  repository code must not fabricate.
- 2026-07-29: Main-agent integration review found two further change-sensor
  bypasses: range mode accepted a nontrivial change with no plan, and the Git
  diff excluded deletions. Three new red counterexamples reproduced a direct
  nontrivial zero-plan range, a `trivial` implementation deletion, and a
  deleted feature plan. The sensor now observes the complete committed change
  set and permits a zero-plan range only when every path belongs to the same
  narrow trivial allowlist.
- 2026-07-29: Final independent review reproduced rename-source false
  acceptance, ignored-cache influence on `path:.`, dormant fresh-clone hooks,
  stale current-state prose, and implicit process environment values. The
  correction added red oracles before production changes, inventories both
  sides of detected renames/copies, filters every current noncanonical cache
  directory, documents and exercises explicit hook installation, refreshes
  this current-state section, and binds UTC, C.UTF-8, and Python hash seed zero
  in authoritative CI and pinned Nix environments.
- 2026-07-29: The real pre-push journey exposed Git hook-local environment
  variables leaking into temporary fixture repositories and mutating the
  shared local Git metadata. No remote update occurred. Main and feature refs,
  worktree content, and repository configuration were restored to independently
  verified commits; the hook now clears every `git rev-parse --local-env-vars`
  variable before the pinned integration gate, with a hermetic regression
  oracle that passes in both checkout and Nix source contexts.
- 2026-07-29: Opened pilot PR #1. Its first server run correctly rejected a
  completed custody feature's stale `0004` acceptance wrapper as a second
  feature identity. Removed that out-of-scope file; the corrected head passed
  all three GitHub jobs plus local 141-test integration, acceptance 0005, the
  actual pre-push path, and both Nix source forms.
- 2026-07-29: Configured `main` protection with strict required contexts
  `fast + integration (nix)`, `feature contract + acceptance`, and
  `commit message + PR title policy`; enforcement includes administrators,
  linear history, resolved conversations, and disabled force pushes/deletion.
  Pilot PR #1 then passed the protected checks and squash-merged as `9ff36d6`.
- 2026-07-29: Main-push run `30484693324` passed the pinned Nix integration
  loop and replayed acceptance 0005, but its commit-policy job false-rejected
  the GitHub-generated squash body for one feature-report line over 100
  characters. A red regression reproduced the post-merge-only failure.
  The correction disables body line length as a semantic gate, retains title,
  type, subject, and authored-message policy, and records the adaptation in
  the checked Clamor provenance graph.

## Decisions and deviations

- PRs are completion artifacts for nontrivial features, not fragments opened
  merely to expose activity.
- Main-agent merge authority is bounded by exact gates and operator-owned
  effects, not by blanket autonomy levels.
- Live plans, visible Herdr tabs, pushed commits, and concise commentary provide
  progress transparency; the merged PR is the durable final report.
- Conventional-commit mechanics come from the Clamor block; Semantic Systems
  supplies project-specific allowed types and authoritative CI integration.
- Commit `da10eb4e812652770abc95500687eb3a08651fb9` is explicitly not accepted
  evidence for design spec 0005. Its passing gates establish only the verified
  positive subset above; they do not establish feature-gate authority or the
  frozen lifecycle contract.
- Commits `306d2acbfbaadb7cabe441de302222219b2e8a16` and
  `df0d3c6f4d567977f617628c1d5e19ad4b1167b8` are also not accepted
  integration evidence. Their green suites establish the named positive
  sensors and deletion/zero-plan rejection, but not rename-source authority,
  cache-independent path-flake behavior, or fresh-clone hook attachment.

## Completion state

Open. Complete only after one real feature is accepted and merged through the
new loop, operator feedback is delivered, cleanup is verified, and the first
cybernetic evaluation is recorded.
