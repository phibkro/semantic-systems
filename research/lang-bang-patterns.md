# `lang-bang` patterns relevant to Semantic Systems

This is a read-only pattern analysis, not a code-import plan. No source is to be
copied verbatim and `lang-bang` is not a semantic authority for this project.

## Patterns to adapt

1. **Proof rides the reference.** `Bang/Core/Semantics/Eval.lean` defines the
   source evaluator, while agreement results in
   `Bang/Backend/AbstractMachine.lean` and `Bang/Reify/CalcReifySim.lean` tie
   derived engines back to it. Here, the pure inventory transition becomes the
   reference trace oracle for later actor and STM realizations.
2. **Law × realization conformance.** ADR-0108,
   `examples/codec-contract/`, `lawInstancesOf` in
   `Bang/Frontend/TypeCheck.lean`, and `tools/test-law.sh` enumerate law checks
   per realization and retain `BrokenShift` as a required failing fixture.
   Here, every inventory realization runs the same suite and
   `realization.inventory.broken` remains permanent.
3. **Explicit correctness descent.** ADR-0026 and ADR-0040 distinguish verified,
   tested, and unsafe/assumed paths. Here, policy consumes typed evidence and
   never turns test success into proof.
4. **Generated drift gates.** ADR-0042 and the generated proof-state tooling
   repair stale ledgers from canonical sources. Here,
   `semproj generate --check` remains mandatory; the stale bootstrap views are
   evidence that the gate matters.
5. **Consumer-gated slices.** `paths/PATH-semantic-contracts.md` adds the next
   semantic mechanism only when a real consumer exposes the constraint. Here,
   actor and STM follow the pure resolver bullet against the same oracle.
6. **Defined terminal outcomes.** ADR-0063 models escape as an explainable
   result rather than an unclassified stuck state. Here, domain rejection,
   evidence rejection, and ambiguity are first-class explanation nodes.

## Project-specific baggage to reject

- Do not import the Lean/Mathlib proof stack before a stable proof seam needs it.
- Do not adopt `lang-bang`'s kernel primitives or STM privilege as this
  project's semantics.
- Do not copy capability dispatch machinery or its single-language monolith
  shape.
- Do not replicate its large script vocabulary or create a second work-tracking
  system beside the canonical graph.

## Revisit

Re-read the referenced patterns before adding actor trace agreement, external
proof evidence, or a generated conformance-suite compiler.
