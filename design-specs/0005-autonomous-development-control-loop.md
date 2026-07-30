# Design spec 0005: autonomous development control loop

Status: active

Problem owner: operator and main research/integration agent

Semantic frontier: development governance, verification, merge authority, and
operator feedback

## User journey

The operator delegates an outcome and can observe its contract and progress
without supervising routine execution. When a feature is complete, one pull
request explains how to experience it, shows evidence from the exact commit,
and is merged autonomously only after every gate passes. The operator receives
a concise completion notice, while stale agents and worktrees are cleaned up.

## Falsifiable claim

Every nontrivial feature merged under this loop has:

1. exactly one frozen design spec and one matching execution plan;
2. one feature branch and pull request;
3. fast, integration, and feature-acceptance gates run against the exact PR
   head;
4. an independent review or counterexample search;
5. a semantic diff and evidence statement that preserve unsupported claims;
6. a reproducible preview command;
7. an operator completion notice; and
8. no harvested agent session or integrated worktree left live.

The claim is falsified by a merged feature with stale or missing checks,
self-issued semantic validity, an unrecorded contract change, absent completion
feedback, or leaked finished execution state.

## Frozen deep-module contract

### One unit of intent

A nontrivial feature is one user-visible or semantically falsifiable journey.
It owns one numeric ID across:

```text
design-specs/<id>-<slug>.md
plans/active/<id>-<slug>.md
scripts/accept/<id>-<slug>.ts
one feature branch
one pull request
```

The plan is mutable execution state. The design spec is the frozen problem
contract. Learning may revise the spec only through an explicit semantic diff,
invalidation statement, and renewed review.

Trivial formatting, typo, generated refresh, and mechanically equivalent
maintenance may skip the feature loop, but must still pass integration checks.

A cross-cutting carrier or toolchain migration may update existing contract
artifacts under one owning feature only when its frozen design spec contains
one exact `Migrates-Feature-IDs:` declaration. Every declared ID must change,
every changed secondary contract ID must be declared, and range replay runs
the owning acceptance program rather than obsolete migrated programs.
Undeclared, duplicate, cyclic, ownerless, or stale migration scope fails
closed. The declaration is scope metadata, not semantic approval.

### Feedback ladder

The repository exposes three nested loops:

1. **Fast loop** — seconds: formatting/lint, focused type or parse checks,
   targeted tests, model validation, and generated drift relevant to the edit.
   Its red phase is executable behavior design, not merely test authorship:
   state intended observations, forbidden observations, boundary behavior,
   invariants, and adversarial counterexamples; then verify each oracle fails
   for the intended reason before implementing the smallest conforming change.
2. **Integration loop** — minutes: all static checks, full tests, model
   validation, and generated-view consistency in the pinned Nix environment.
3. **Feature loop** — tracer-sized: the exact acceptance script, visible
   end-to-end preview, independent review, evidence/assumption audit, and PR
   checks on the exact commit.

Deep assurance—proofs, fuzzing, model checking, schedule exploration,
benchmarks, reproducibility, or cross-platform builds—is required only when
the feature claim depends on it.

The implementation loop is:

```text
falsifiable behavior inventory
-> executable positive, rejection, and adversarial oracles
-> red for the intended semantic reason
-> smallest implementation
-> focused green
-> neighboring integration green
```

A test that repeats an implementation detail, passes before the behavior
exists, or cannot distinguish the intended failure from an unrelated crash
does not establish the oracle.

Missing required tools fail a gate. They are not warnings. Host convenience
checks may report unavailable tools, but only the pinned gate can authorize
merge.

### Deterministic event hooks

Checks attach to the transition they can observe:

| Event                      | Required observation                                       | Authority                |
| -------------------------- | ---------------------------------------------------------- | ------------------------ |
| Spec frozen                | unique ID, falsifiers, ownership, dependencies, acceptance | implementation may start |
| File save/watch            | focused parse, type, format, and red/green oracle          | advisory                 |
| Commit message             | checked-in Conventional Commits policy                     | bypassable local guard   |
| Pre-commit                 | fast read-only checks and targeted tests                   | bypassable local guard   |
| Pre-push                   | pinned integration suite and architecture boundaries       | bypassable local guard   |
| PR open/synchronize/reopen | exact-head integration and feature acceptance              | required server gate     |
| Review/finding resolution  | independent counterexample and assumption audit            | required semantic gate   |
| Merge queue `merge_group`  | prospective merged-tree acceptance                         | publication gate         |
| Push to `main`             | accepted scenario replay and projection consistency        | post-merge drift signal  |
| Release tag                | reproducibility and claim-specific deep assurance          | release authority        |
| Schedule/dependency update | drift, fuzzing, model checking, benchmark trend            | opens work only          |
| Agent done                 | committed-artifact gate, harvest, and safe cleanup         | cleanup authority only   |

Client hooks improve latency but never authorize merge because they are
bypassable. Server gates verify without modifying: they do not format, repair,
or regenerate away drift.

Every authoritative verdict binds the exact commit, pinned environment, fixed
seed or recorded schedule, virtualized time where relevant, explicit locale
and timezone, and hermetic inputs. Network observations become separately
locked artifacts. Cache keys may alter latency but not the verdict. Path
filters may skip provably unaffected work; uncertainty falls back to the larger
gate.

Specialized triggers include:

- a new or changed design contract requires the
  `open-semantic-system-v1` shape: declared boundary/warranted state, semantic
  inputs and outputs, effect uncertainty, orthogonal component structures,
  bounded autonomy, and evidence limits;
- contract changes invalidate bound implementations and evidence;
- canonical model changes require generated-view equality;
- generated changes without their canonical source edge are rejected;
- evidence metadata changes re-run category, subject, and assumption checks;
- dependency/lock changes re-run custody and reproducibility checks;
- architecture-boundary changes re-run forbidden-import and capability tests.

### Commit identity and changelog signal

Every new commit and pull-request title conforms to Conventional Commits. One
checked-in commitlint configuration defines the grammar for the local
`commit-msg` hook, pull-request commit range, merge queue, and squash title.
The allowed types include the standard change types plus the project's
meaningful `research`, `design`, `governance`, and `plans` categories.

The hook/config/package scaffolding is materialized from Clamor's versioned
`ConventionalCommits` block rather than independently designed here. A checked
provenance record binds the upstream repository commit, block version and
digest, and project input values. Conformance tests detect local or upstream
drift. Until Clamor exposes a safe apply interface, this repository owns the
materialized files and the main agent serially integrates the inspected plan.

Commit syntax is a static metadata check, not evidence that a change is
semantically compatible. CI is authoritative because local hooks are
bypassable. A single invalid message reports the exact commit and violated
rule; CI does not rewrite history or silently repair the title.

### Cybernetic evaluation model

The loop is evaluated as a control system:

- design-spec falsifiers are the reference signal;
- the repository and implementation process are the controlled system;
- tests, analysis, review, and runtime scenarios are sensors;
- gates compare observations with the contract;
- edits, rework, and work dispatch are control actions;
- dependency drift, nondeterministic agents, and concurrency are disturbances.

The first evaluation records:

- feedback latency by loop;
- which failure modes each sensor can and cannot observe;
- correlated sensors that may self-validate;
- false acceptance and false rejection;
- rework or oscillation caused by delayed/noisy feedback;
- metrics that can be gamed without satisfying the user journey.

No single metric becomes semantic authority. This model remains a research
hypothesis under uncertainty 0003.

### Pull-request gate

The PR description is the durable completion report and contains:

- design spec and semantic claim;
- user-visible preview command and expected observation;
- semantic diff;
- exact checks run on the PR head;
- evidence categories and supporting artifacts;
- assumptions and unsupported claims;
- independent reviewer/counterexamples;
- deviations and next uncertainty.

Required GitHub checks must identify the tested commit. A green result for an
ancestor does not authorize merge. No unresolved review finding may remain.

### Autonomous merge authority

The main research/integration agent may merge a completed feature without
waiting for operator approval when:

- the implementation conforms to the frozen contract;
- all required checks pass on the exact head;
- independent review is resolved;
- the preview works in the pinned environment;
- evidence has not been upgraded beyond its artifacts;
- generated views and plans are current; and
- the action has no operator-owned external effect.

Operator approval remains required for changing the project thesis, weakening
evidence or trust meanings, incompatible public identity changes, legal or
license judgments, secrets, paid/shared infrastructure, public deployment,
irreversible data migration, or materially destructive action.

### Completion feedback

After merge, the main agent sends one concise operator notice:

```text
feature and PR/commit
what is now experienceable
one preview command
checks and evidence categories
assumptions / what remains unsupported
next uncertainty
cleanup status
```

The notice reports the committed referent, not an agent summary. It is
informational: verified in-scope work does not wait for acknowledgement.

### Execution-state cleanup

An agent is not complete until its output is harvested and gated. Then:

1. close its Herdr tab;
2. integrate or explicitly reject its commit;
3. remove a clean integrated worktree;
4. delete the obsolete local feature branch when safe; and
5. record remaining reusable artifacts or failures.

Never remove an uncommitted or unintegrated worktree merely because its agent
appears idle.

## Oracle first

The first oracle is one real feature PR—preferably tracer 0003 or custody 0004.
It intentionally injects these failures before merge:

- acceptance script missing or mismatched to the spec ID;
- generated view stale;
- check result bound to an ancestor commit;
- unsupported evidence described as proof;
- independent review missing;
- preview command failing;
- finished Herdr tab and integrated worktree left open.

Each failure must block or visibly invalidate completion.

## Acceptance

1. Contributor and agent guidance describe the same loop.
2. Fast, integration, and acceptance commands are executable in Nix.
3. CI runs required checks on pull requests and exposes the tested SHA.
4. The PR template captures every required completion field.
5. One real feature passes the loop and is autonomously merged.
6. Its completion notice is delivered with a reproducible preview.
7. Finished sessions and integrated worktrees are cleaned.
8. The cybernetic evaluation records latency, sensor coverage, correlation,
   disturbances, and gaming risks without claiming proof.

## Evidence claim and limits

CI and acceptance runs are `runtime_validation`; static tools are
`static_analysis`; scenario and mutation tests retain their actual test
categories; review is `assertion`. Passing the loop establishes that recorded
gates accepted one exact commit. It does not prove semantic correctness,
complete test coverage, reviewer independence, supply-chain safety, or absence
of correlated defects.

## Kill criteria

- A feature can merge without a frozen contract or exact-head gates.
- An agent can validate its own semantic claim by editing metadata.
- Process metrics replace the user-visible oracle.
- Slow gates are placed in the fast loop without evidence they belong there.
- PR ceremony creates fragments rather than one experienceable feature.
- Autonomous merge crosses an operator-owned boundary.
- Completion feedback lacks a reproducible referent.
- Cleanup can discard unintegrated work.

## Semantic diff

This contract grants bounded merge authority after exact, inspectable gates and
adds explicit completion feedback and execution cleanup. It changes no language
semantics, evidence category meaning, or trust claim.

Revision 1, 2026-07-29: the operator added deterministic lifecycle hooks. This
strengthens where existing gates run and clarifies their authority; it does not
change the merge-authority boundary or evidence meanings.

Revision 2, 2026-07-30: the operator selected executable Bun TypeScript for
repository-owned orchestration and Just as the declarative task surface.
Acceptance identity now ends in `.ts`; the validator, dispatcher, hooks, CI,
tests, contributor commands, and all existing acceptance programs are
invalidated until they agree on that extension and runtime. This changes the
execution carrier, not the feature identity, merge-authority boundary, or
evidence meanings.

Revision 3, 2026-07-30: design spec 0015 adds a shape-only observation to the
PR contract gate. Any selected or explicitly migrated design spec changed in
the PR range must contain exactly one
`Design-Lens-Version: open-semantic-system-v1` marker and the required
non-placeholder worksheet sections. Unchanged legacy contracts remain valid.
This makes system boundaries and claims reviewable; it does not establish
semantic correctness, change merge authority, or change evidence meanings.
