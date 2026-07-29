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

Observed result: pending implementation.

Invalidation: any change to the evidence-result schema, resolution-claim
schema, policy rules, identity algorithm, checker algorithm, or canonical
binding adapter requires the full mutation and independence gates to rerun.
