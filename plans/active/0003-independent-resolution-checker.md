# Active plan 0003: independent resolution-result checker

Canonical problem contract:
[`design-specs/0003-independent-resolution-checker.md`](../../design-specs/0003-independent-resolution-checker.md).
This mutable execution record must not redefine the frozen contract.

## Semantic claim

The falsifiable claim, deep-module boundary, evidence limits, semantic diff,
and kill criteria are frozen in design spec 0003.

## Current state

- Inventory tracer 0001 already normalizes exact theory and realization
  identities, produces typed finite test results, resolves policy, executes one
  selected realization, and emits structured explanations.
- The current resolver imports the evidence runner and operation bindings, so
  the evidence producer and eligibility authority are not independent.
- `EvidenceResult.to_dict()` omits full case results and counterexample details.
- Canonical model identities and case counts agree today, but the agreement is
  hand-copied and guarded only by tests.
- Independent adversarial review identified these seams before this contract
  was frozen.

## Contract-owned implementation slices

1. Oracle and mutation corpus.
2. Lossless evidence result and evidence-production packet.
3. Production resolver consumes packets rather than executing recipes.
4. Serialized resolution claim.
5. Independent checker and forbidden-import gate.
6. Execution gate and visible CLI.
7. Inventory canonical-model binding adapter.
8. Main-agent semantic integration and generated graph updates.
9. Independent adversarial review.

Slices 1, 2, 5, and 7 may be explored concurrently against this contract.
Resolver/demo integration is serialized after packet and checker interfaces are
stable. Final integration is owned by the main agent.

## Delegated implementation contract

Autonomy: A3, integration-ready implementation in an isolated worktree.

Required reading:

- design spec 0003;
- design spec and completed plan 0001;
- `src/semantic_tracer/`;
- `tests/test_inventory_tracer.py`;
- inventory examples;
- current canonical inventory model files.

Allowed writes:

- `src/semantic_tracer/`;
- `tests/test_resolution_checker.py`;
- narrowly required edits to `tests/test_inventory_tracer.py`;
- `examples/inventory/checker-cases/` if fixtures materially clarify the
  mutation corpus.

Forbidden writes:

- `model/`, `generated/`, `docs/`, `decisions/`, `claims/`, `plans/`,
  `design-specs/`;
- inventory theory, domain semantics, transition/replay adapters;
- evidence category or policy meaning.

Acceptance:

```bash
nix develop --command pytest tests/test_resolution_checker.py tests/test_inventory_tracer.py
nix develop --command ruff check .
nix develop --command ruff format --check .
nix develop --command pyright
```

Deliver:

- committed integration-ready change;
- semantic-diff note;
- commands run and exact results;
- checks not run;
- independence/size measurement;
- remaining assumptions and uncertainties.

## Main-agent integration

The main agent reviews committed content, reconciles terminology, updates the
canonical graph and claims registry, regenerates views, runs full checks, and
commissions independent review. Agent-produced metadata does not grant
validity.

## Evidence requirements

- Mutation tests are `example_test`.
- Checker execution is `runtime_validation`.
- Shared canonicalization is a visible assumption.
- No proof, universal correctness, authenticity, or production-suitability
  claim is permitted.

## Risks

- The checker duplicates resolver branches rather than reducing trust.
- Lossless evidence serialization becomes a second mutable representation.
- Producer diagnostics are mistaken for independently verified facts.
- Project-model binding leaks into the generic checker.
- Compatibility pressure preserves the old coupled resolver boundary.

## Progress log

- 2026-07-29: Independent read-only analysis compared the frozen tracer,
  implementation, tests, and adversarial review.
- 2026-07-29: Main agent froze design spec 0003 before implementation
  delegation.

## Decisions and deviations

- Multiple semantic frontiers may proceed under decisions 0004 and 0005 because
  this tracer's contract and write surface are independent of reference
  research.
- The production resolver may retain producer diagnostics in explanations, but
  absence of a valid result—not the diagnostic alone—causes ineligibility.

## Completion state

Open. Complete only after the visible checker-gated scenario, mutation corpus,
independence/size gate, canonical graph integration, independent review, and
full repository validation pass.
