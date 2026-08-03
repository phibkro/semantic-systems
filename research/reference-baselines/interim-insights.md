# Interim reference-baseline insights

Status: historical snapshot as of 2026-07-29. Superseded by `portfolio.md`,
`enforcement-ladder.md`, `adoption-experiments.md`, and the checked-in
refinement packet; retained without rewriting its point-in-time claims.

## Development implications

1. **Prefer small independent checkers over verified producers.** CompCert
   translation validation and proof-assistant kernels suggest that complex
   untrusted machinery can produce artifacts gated by a smaller checker. The
   smallest local experiment is an independent validator that re-derives a
   tracer resolution from the frozen policy and evidence.
2. **Spend assurance effort on seams.** Authored-to-normalized contracts,
   evidence recipes to exact results, resolver output to executed realization,
   and canonical models to generated views are higher-risk than components
   already protected by a checker.
3. **Scope every guarantee and name its trusted base.** Static effect absence,
   proof checking, compiler preservation, and test results apply only under
   explicit models, implementations, handlers, runtimes, and assumptions.
4. **Treat enforcement as a ladder.** Convention, runtime validation, testing,
   static checking, generation, model checking, and proof remain distinct.
   Record the highest rung reached and why the next rung is unavailable.
5. **Keep reference semantics separate from optimized realizations.** A slow
   oracle plus differential evidence can support several faster
   implementations without letting any one representation define meaning.
6. **Advance type-system capabilities one contract at a time.** A candidate
   learning path is HM inference, explicit System F, decidable refinements,
   indexed/lightweight dependency, and full dependent checking. System F is
   polymorphic rather than dependent, but supplies a useful elaboration seam.
7. **Measure compiler layout choices.** Arenas, interning, structure-of-arrays,
   compact IDs, and incremental queries are hypotheses until a project-shaped
   benchmark establishes cache, memory, allocation, and diagnostic trade-offs.
8. **Preserve diagnostic causality.** Explanations should trace source spans
   through normalized declarations and applied rules to failed obligations,
   evidence decisions, rejected alternatives, and corrective actions.
9. **Allocate research budgets per comparison class.** A global top-claim cap
   biases early clusters. Coverage quotas, typed output schemas, and visible
   unverified overflow are required for broad portfolio research.
10. **Keep reference custody reproducible.** Bibliography, source intent,
    generated exact-commit locks, disposable checkouts, project cards, and
    adoption experiments have separate authoritative roles.

## Native `/deep-research` baseline

The native workflow completed in 15 minutes 41 seconds with:

- 109 Fable 5/high agents;
- peak concurrency 10;
- 27 fetched sources, 26 primary;
- 134 extracted claims;
- 25 claims selected for three-vote verification;
- 25 confirmed claims and nine merged findings;
- zero agent failures or retries;
- approximately 7.9 million subagent output tokens.

Its verification was strong, but it missed the frozen gates for twelve-project
coverage, license fields, complete project cards, and explicit stage routing.
Prompted model assignments had no effect because the native workflow's agent
calls inherit the parent model and effort.

## Current priority sequence

1. Separate evidence recipes from exact evidence results and gate model/result
   identity drift.
2. Build the independent resolver-result checker.
3. Resolve normalized binder identity.
4. Run a measured compiler data-layout experiment.
5. Advance the type-system ladder only when a consumer demonstrates the next
   expressiveness requirement.

## What remains unestablished

- The custom routed workflow has not yet completed.
- Rust, Oxc, TigerBeetle, diagnostics, Power of Ten, and Meadows claims were
  fetched but not verified by the native workflow's fixed claim budget.
- No compiler representation or dependent-type design has been selected.
- The proposed independent checker has not been implemented or measured.
