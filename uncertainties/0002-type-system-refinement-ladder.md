# Uncertainty 0002: type-system refinement ladder

## Current hypothesis

Semantic Systems should expose type-system capabilities as separately
inspectable theory profiles that refine one another only through explicit,
checked relations. It should not grow one universal trusted type system.

A candidate learning order is:

1. Hindley–Milner inference;
2. explicit System F / rank-n polymorphism;
3. a decidable SMT-backed refinement fragment;
4. indexed types, GADTs, or lightweight dependent typing;
5. full dependent types checked by a small kernel.

System F is a polymorphic calculus, not a dependent type theory. It is included
because it supplies a useful explicit elaboration boundary before refinements
or term-indexed types.

## Supporting evidence

- The project already separates authored theories, realizations, evidence, and
  trust policy.
- Lean and Rocq demonstrate elaboration by complex untrusted machinery followed
  by small-kernel checking.
- Liquid Haskell and Flux are candidate references for decidable refinement
  obligations without immediately adopting full dependent type checking.
- `lang-bang` supplies a nearby example of graded and effect-typed semantics,
  but its kernel remains project-specific.

## Counterevidence and risks

- Expressiveness does not form one total order: effects, ownership, grades,
  refinements, and dependency interact along different axes.
- System F type inference is not generally decidable, so surface syntax and
  annotation policy are part of the rung.
- SMT-backed refinements inherit solver, encoding, timeout, and model-reporting
  assumptions.
- Full dependency can entangle runtime computation, proof erasure,
  normalization, effects, and termination.
- A capability ladder can become a feature roadmap without a consumer that
  falsifies the need for each rung.

## Downstream work that depends on it

- normalized theory identity for binders and type-level terms;
- proof-evidence adapters;
- compiler elaboration and diagnostic architecture;
- effect and ownership interaction;
- package compatibility across type-system profiles.

## Resolving experiment

After binder identity is stable, define one tiny polymorphic theory twice:

- an explicitly typed System F form;
- a surface form elaborated into it.

The oracle compares normalized contracts and explanation traces. A later,
separate experiment adds one decidable refinement obligation and records the
generated solver query as typed evidence.

Success requires the new profile to add an observable guarantee without
changing the lower-rung contract or silently enlarging the trusted core.

Kill the ladder design if profiles cannot state distinct checking,
decidability, erasure, effect, and trust obligations without collapsing into a
single language-specific kernel.
