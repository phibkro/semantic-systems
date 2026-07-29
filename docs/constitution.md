# Project Constitution

## Thesis

Programs depend on semantic theories rather than concrete representations.
Realizations implement those theories, evidence records why each realization
should be trusted, and deployment packages select compatible realizations under
explicit semantic, operational, platform, and trust constraints.

## Principles

1. **Small trusted core.** Surface features elaborate into a compact semantic
   foundation.
2. **Theories before realizations.** Reusable programs depend on operations,
   laws, invariants, and observations rather than storage layouts.
3. **Evidence is typed.** Proofs, analyses, model checks, tests, benchmarks,
   runtime checks, assertions, and assumptions remain distinguishable.
4. **Assumptions are transitive and visible.**
5. **Effects express capability requirements; handlers supply interpretations.**
6. **Ownership expresses authority over existence.** Dependency, derivation,
   causality, and observation are separate relations.
7. **Concurrency mechanisms have distinct roles.** Actors isolate authority,
   STM composes local atomicity, CRDTs merge suitable replicated state, and
   coordination handles non-monotone global decisions.
8. **Proof evidence is erasable unless runtime evidence is explicitly requested.**
9. **Components are recursive open systems.** A component can be treated as a
   boundary or expanded into an internal system.
10. **Every abstraction must justify itself through an executable tracer bullet.**

## Modelling rule

Architecture, semantics, evidence, work, runtime, deployment, and organization
are separate linked graphs. Generated diagrams are views, not independent
sources of truth.
