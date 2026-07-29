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

Observed result: the accepted custody implementation at commit `e8d771c`
passes 68 focused custody tests and the 93-test repository gate. The real
offline `local.lang-bang` observation binds commit
`5b8e032bcffefb23a3a153d3f5cea99050e589c1`, tree
`2156309abd48d19e433af8b302238a8424c360ab`, and the recorded license digest.
This is example-test and one local runtime-validation observation, not proof
of origin, authorship, legal compatibility, crash atomicity, or portability.

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

Observed result: pending implementation and pilot.

Invalidation: changes to required gates, merge authority, completion notice,
cleanup rules, or PR-to-spec identity require the pilot checks to rerun.

## CLM-0005 — public-safe project control room

Hypothesis: an installable phone-first PWA can project the canonical project
graph and accepted control state from an exact commit without becoming a
second source of truth, leaking private inputs, or displaying stale/offline
state as current.

Expected observation: the deployed Control Room exposes system, semantic,
evidence, work, and pulse views; every item links to canonical identity and
exact commit; the public payload contains only allowlisted fields; and update,
stale, offline, and invalid states are visibly distinct.

Counterexample: arbitrary model attributes or local paths reach the public
artifact; the browser derives evidence meaning; a bad refresh replaces the last
valid snapshot; displayed facts lack provenance; or a Pages snapshot is called
live local state.

Evaluation method: deterministic export fixtures, schema validation,
secret/path/script sentinels, digest and rollback mutations, phone-sized
browser/PWA tests, deployed probes, and independent semantic/security review.

Success threshold: every design-spec 0006 acceptance condition through the
default Pages deployment passes on the exact committed artifact; custom-domain
health is either verified or remains an explicit external blocker.

Consequence if falsified: do not publish or update the site; retain the last
valid deployment, expose the failed gate, and recut the exporter or deployment
boundary without weakening privacy or provenance.

Observed result: local implementation at commit `50d00a6` passed deterministic
export, allowlist and sentinel scans, 150 repository tests, six UI behavior
tests, and three mobile Chromium/PWA scenarios. Independent review nevertheless
rejected publication because the service worker could hide newer version data,
the required status filter was absent, and this observation was initially
attached to CLM-0003 instead of this claim. Those counterexamples are now the
correction oracle; the claim remains open pending a green corrected artifact,
independent re-review, and default Pages deployment.

Invalidation: any public schema, exporter, canonical model, freshness rule,
service-worker update algorithm, workflow, or deployment-target change requires
the relevant export, privacy, browser, and deployment gates to rerun.
