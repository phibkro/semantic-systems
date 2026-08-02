# Project claims registry

## CLM-0001 — evidence-aware inventory resolution

Hypothesis: for fixed inventory artifacts and policy, the resolver selects the
lawful pure realization exactly when accepted evidence covers every required
obligation, rejects the standing broken realization with structured reasons,
and executes the selected realization with the reference trace.

Expected observation: the demo selects `realization.inventory.pure`, reports
passing `example_test` evidence bound to exact identities, rejects
`realization.inventory.broken`, and ends with the declared events and state.

Counterexample: missing or stale evidence still permits selection; the broken
realization passes; two eligible candidates are silently ordered; or the
proof-only policy accepts test evidence.

Evaluation method: deterministic conformance fixtures, identity mutation tests,
policy counter-tests, CLI snapshot assertions, and independent adversarial
review.

Success threshold: every design-spec acceptance condition passes on the
committed artifact in the pinned Nix environment.

Consequence if falsified: do not accept or publish the tracer claim; revise the
identity, oracle, or policy boundary named by the failing counterexample.

Observed result (2026-07-29): the pure realization passed 9/9 finite cases and
the standing broken realization passed 7/9. Development policy selected only
the pure realization; proof-only policy rejected both. This is `example_test`
evidence under visible Python-adapter, integer-arithmetic, and fixture-coverage
assumptions. It does not establish universal correctness.

Invalidation: any change to the theory, realization, recipe, adapter, or runner
requires the command and exact-binding drift test to pass again. Policy changes
change eligibility, not the historical test result.

## CLM-0002 — independently checkable resolution

Hypothesis: for frozen inventory inputs, a materially smaller checker that does
not execute realizations or import the production resolver can independently
re-derive exact evidence bindings, candidate eligibility, terminal selection,
assumption projection, and canonical-model agreement before execution.

Expected observation: the positive development claim reports `Checker: valid`
and executes only afterward; every single-field mutation in design spec 0003
reports a stable violation and prevents execution.

Counterexample: a recipe is accepted as evidence; a result is rebound to
another realization; stored aggregate, eligibility, or selection fields are
trusted; a candidate or assumption is omitted; policy/model drift passes; or
the checker imports the production resolver or execution machinery.

Evaluation method: lossless serialization round trips, deterministic mutation
fixtures, forbidden-import checks, an independence/size gate, visible CLI
execution, canonical-model drift checks, and independent adversarial review.

Success threshold: every design-spec 0003 acceptance condition passes in the
pinned environment and the committed checker remains within its independence
and size boundary.

Consequence if falsified: execution and publication remain blocked; split the
decision rules into a declarative generated table or recut the checker boundary
rather than weakening independence.

Observed result (2026-07-29): experiment `b9cea28` passed the behavioral,
mutation, forbidden-import, lint, format, and type gates but failed the frozen
checker-size gate. It is rejected for integration and does not establish this
claim. Uncertainty 0004 records the recut alternatives.

Observed result (2026-07-30): TypeScript recut `a373ae9` was independently
rejected and reverted at `adf7e8d`. Its reported 68.07% size ratio compared
asymmetric surfaces (194 checker lines against a 285-line resolver file that
included excluded serialization/reporting); the resolver's symmetric
adjudication region was 92 lines before excluded checker validation and
semantic-diff code were counted. Review also found accepted foreign outcomes,
an unsupported self-consistent rebound claim, policy-matching drift, duplicate
authored candidates, and a non-transitive dependency oracle. This is
counterevidence, not runtime validation, and does not establish the hypothesis.

Invalidation: any change to the evidence-result schema, resolution-claim
schema, policy rules, identity algorithm, checker algorithm, or canonical
binding adapter requires the full mutation and independence gates to rerun.

## CLM-0003 — reproducible reference-source custody

Hypothesis: for a catalogued Git source with explicit custody fields, the
reference tool can bind exact committed source and license bytes once, then
materialize and verify those same bytes offline without permitting branch,
catalog, checkout, or license drift.

Expected observation: after `local.lang-bang` is locked at commit A and its
branch advances, offline materialization and strict status still verify A and
report exact origin, commit, tree, license digests, and acquisition strength.

Counterexample: branch movement changes content without a lock update; catalog
or license drift passes; a dirty or wrong checkout passes; offline mode opens
the network; failed work damages valid custody; or normal validation requires a
reference checkout.

Evaluation method: deterministic temporary-Git fixtures, mutation and failure
injection, byte-identical no-op lock tests, explicit offline checks, the visible
local-source command, and independent adversarial review.

Success threshold: every design-spec 0004 acceptance condition passes in the
pinned environment and normal validation passes with `.references/` absent.

Consequence if falsified: do not treat source cards as provenance-ready; keep
the catalog queued and redesign custody rather than weakening exactness.

Observed result: pending implementation.

Invalidation: any change to the catalog custody fields, canonical record
identity, lock schema, Git acquisition rules, license hashing, or custody-state
derivation requires the full fixture and offline gates to rerun.

## CLM-0004 — gated autonomous feature completion

Hypothesis: a feature process with a frozen contract, nested feedback loops,
exact-head gates, independent review, bounded merge authority, completion
feedback, and cleanup permits routine autonomous merges without hiding
unsupported claims or consuming operator approval for correctness.

Expected observation: one real tracer feature is merged after all design-spec
0005 gates, its preview reproduces the result, the operator receives a concise
commit-linked notice, and no harvested agent session or integrated worktree
remains.

Counterexample: stale CI authorizes merge; the agent grants validity to its own
metadata; a falsifier escapes; feedback lacks a reproducible referent; an
operator-owned effect is crossed; or cleanup discards or leaks work.

Evaluation method: CI failure injection, exact-SHA comparison, independent
review, visible preview, evidence audit, post-merge cleanup inspection, and the
three-feature cybernetic evaluation in uncertainty 0003.

Success threshold: every design-spec 0005 acceptance condition passes on the
pilot feature and no operator-owned boundary is crossed.

Consequence if falsified: suspend autonomous merges for the affected feature
class, preserve the failed artifact, and strengthen or recut the named sensor
or authority boundary.

Observed result (bounded pilot evidence, 2026-07-29): pilot PR #1
squash-merged as `9ff36d6` after its exact head passed the three protected
checks. Its first post-merge run (`30484693324`) passed the pinned Nix
integration loop and replayed acceptance 0005, but the commit-policy sensor
false-rejected GitHub-generated squash prose over an inherited 100-character
body limit; this is a recorded false rejection, not successful completion.

Repair PR #2 passed `fast + integration (nix)`, `feature contract + acceptance`,
and `commit message + PR title policy` on its exact head and squash-merged as
`e00e8f9`. This is `runtime_validation` for the protected repair-PR checks and
merge result. The separate post-repair main-push replay `30485774751` then
passed all three required contexts on the exact post-repair `main` head,
including a real acceptance-0005 replay and the commit-policy range check;
this is separate `runtime_validation` for the post-repair replay.

The active-session operator completion notice separately named both PRs, their
merge and repair commits, the preview command, exact checks, evidence
categories, assumptions, and next uncertainty. This is an `assertion` about
notice delivery. The harvested Herdr tab was closed, and scratch worktrees
`/tmp/semantic-development-loop-0005` and
`/tmp/semantic-development-loop-0005-close` were observed absent after clean
integrated removal; local feature branches were retained as history. This is
an `assertion` about external session/host cleanup.

No separate GitHub PR review was requested for either merged PR
(`reviewDecision` empty, zero reviews on both); the independent process review
used by the pilot was the main agent's own documented counterexample rounds,
so reviewer independence is not established. The current-history audit found
closure commit `7ab468d` stranded: parent `e00e8f9` is in current history, but
`7ab468d` is not an ancestor of current head
`46ba730521f2d2560feeff8184e8672e0a2983ed`. This is `static_analysis`, not
new pilot execution.

At exact current head `46ba730521f2d2560feeff8184e8672e0a2983ed`, the supplied
exact `0005` acceptance evidence passed 28 tests/303 assertions, Actionlint,
commit policy, and contract checks. The supplied full `just check` at the same
head passed through the 0048 run with 676 tests/17,200 assertions. This is
`runtime_validation` supplied by the integrating lead; it does not establish
review, protection, push, or merge for this correction. The pilot remains one
observation, and uncertainty 0003's three-feature comparison remains open.

The feature record remains `in_progress` pending integration and rereview of
this correction; this bounded evidence does not establish the independent-
review success threshold.

Invalidation: changes to required gates, merge authority, completion notice,
cleanup rules, or PR-to-spec identity require the pilot checks to rerun.
