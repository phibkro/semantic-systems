# Plan 0001-inventory-resolution-tracer: inventory realization resolution tracer

Canonical problem contract:
[`design-specs/0001-inventory-resolution-tracer.md`](../../design-specs/0001-inventory-resolution-tracer.md).
This file is the mutable execution record; it must not redefine that contract.

## Semantic claim and user-visible scenario

The frozen claim and one-command journey are defined in the linked design spec.
The observable command will normalize the inventory theory, evaluate
conformance evidence for lawful and broken realizations, resolve under a named
policy, execute only the selected realization, and explain the result.

## Current repository state

- Baseline commit: `c47bfc7` (`chore: import semantic systems bootstrap`).
- Model baseline: 90 entities, 127 relations, 22 work items.
- Baseline validation: zero errors and one warning,
  `claim.kernel.safety` unsupported.
- Baseline generation gate: all eight generated views stale.
- Baseline host tools: `ruff`, `pyright`, and `pytest` unavailable.
- Pinned Nix flake evaluates successfully and supplies the missing tools.
- Live derived ready frontier has five items; the committed stale view showed
  only three.

## Allowed semantic changes

- Freeze the inventory rules listed in design spec 0001.
- Add `ReleaseRejected` to the inventory event contract.
- Accept `decision.theory-identity` only as scoped `theory-norm-v0`.
- Distinguish example-test and property-test evidence in new artifacts.
- Add policy, deployment-lock, explanation, and conformance-result entities
  required by this bullet.

## Frozen boundaries

- Kernel, CBPV, effect calculus, ownership, actor, STM, CRDT, registry
  transport, signature, and proof semantics are unchanged.
- Python is a bootstrap adapter, not the semantic authority.
- Existing unsupported kernel claims remain unsupported and visible.
- Generated files are changed only by the generator.

## Implementation slices and dependencies

1. Complete this contract and create the failing oracle.
2. Commit contract/oracle so delegated work has a stable subject.
3. Delegate the bounded Python reference implementation in an isolated
   worktree after slice 1 is frozen.
4. Integrate the worker's committed artifact serially.
5. Update canonical graph sources and regenerate views.
6. Commission an independent read-only adversarial review.
7. Address findings, run the full Nix-backed gate, demonstrate, and close.

## Delegated work

- `semantic-fable` (A0, complete): tracer-cut advice and `lang-bang` pattern
  analysis. No repository writes were accepted.
- `semantic-sonnet` (A3, complete): bounded Python implementation in an
  isolated worktree against the frozen oracle; main agent gated and
  cherry-picked commit `2a607840`.
- `inventory-adversarial-review` (A0, complete): independent read-only semantic
  review. Its duplicate-ID, hidden-assumption, evidence-subject, explanation,
  unbound-operation, undeclared-type, and graph-drift findings were reproduced
  and addressed.

## Acceptance commands

```bash
nix flake check
nix develop --command ruff check .
nix develop --command ruff format --check .
nix develop --command pyright
nix develop --command pytest
nix develop --command ./scripts/check.sh
PYTHONPATH=src python -m semantic_tracer demo examples/inventory
```

## Evidence requirements

- Example/conformance-test evidence must bind exact computed identities.
- Test output establishes only the tested cases and invariant checks.
- Independent review searches for counterexamples and unsupported upgrades.
- No proof claim is in scope.

## Known assumptions and uncertainties

- `theory-norm-v0` treats binder spelling as significant.
- Python builtin operation bindings are a Stage A execution adapter.
- Conformance cases are finite and do not establish universal correctness.
- External evidence import, revocation, and signature verification are deferred.
- See `uncertainties/0001-theory-normalization-binders.md`.

## Risks and kill criteria

The authoritative kill criteria are in design spec 0001. Additional delivery
risk: if the reference implementation needs actor, STM, parser, or registry
machinery, reject the expansion and recut to the data-level seams.

## Progress log

- 2026-07-29: Read canonical documentation and current graph/code.
- 2026-07-29: Baseline recorded; generated views found stale.
- 2026-07-29: Initialized Git and committed supplied bootstrap as `c47bfc7`.
- 2026-07-29: Fable recommended pure inventory plus a standing broken
  realization; main agent accepted the cut.
- 2026-07-29: `lang-bang` patterns accepted: reference-oracle chain,
  law×realization conformance, standing negative fixture, structured terminal
  outcomes, and generated drift gates.
- 2026-07-29: Pinned Nix environment added; evaluation passes.
- 2026-07-29: Froze contract, authored role-separated fixtures, and created the
  executable oracle. Targeted pytest fails at collection with the expected
  `ModuleNotFoundError: semantic_tracer` before implementation.
- 2026-07-29: Integrated the Sonnet implementation and tightened exact theory
  targeting, selected-assumption aggregation, explanation data, and CLI exits.
- 2026-07-29: Independent review found two high-severity counterexamples:
  duplicate realization IDs could execute a rejected candidate, and malformed
  assumptions could bypass a denying policy. Both now fail closed.
- 2026-07-29: Prevented example recipes from self-labeling as proof; bound the
  recipe to the exact theory identity; rejected mismatched obligations,
  duplicate suites, unbound operations, and duplicate declaration IDs.
- 2026-07-29: Split pure and broken evidence results by exact subject, made the
  recipe explicitly non-evidence, and added an executable graph-identity drift
  check.
- 2026-07-29: Expanded the counterexample corpus to nine cases and exposed
  explanation details and developer-change guidance in the one-command demo.
- 2026-07-29: Final Nix-backed gate passed: flake evaluation, Ruff lint and
  formatting, strict Pyright, 25 full tests, `scripts/check.sh`, model
  validation (112 entities, 167 relations, zero errors), and all eight
  generated-view checks. The intentionally unsupported
  `claim.kernel.safety` warning remains visible.
- 2026-07-29: Accepted identities are theory
  `sha256:456b5f8d991ce08c400c6b1688216834ad0460ab57ad14ef99cb5b4866a158ba`,
  pure realization
  `sha256:8fbc8156ae30ecfa37c71e9c25ec3a86608bdb491c9427c190affd607e0dc5c4`,
  and broken realization
  `sha256:e30c8e4be3a26655ed8b6019c6c4b557367bf64d53e1b248b95f801a08e3b06c`.

## Decisions and deviations

- Chose inventory over monoid because it exercises state, effects, event trace,
  execution, and explanation while reusing the declared project frontier.
- Deferred actor from the first bullet; it becomes the next realization against
  the same reference fixtures.
- Scoped identity v0 to data-level declarations; alpha normalization is not
  falsely claimed.
- Added explicit `Reservation` and `Reason` declarations after review exposed
  unresolved references in the authored contract. This changed the exact
  theory and realization identities; the bound recipe and graph were updated
  together and are now guarded by a test.
- Kept policy eligibility distinct from evidence validity: a policy change
  does not invalidate a completed test result.

## Semantic diff

- Added `ReleaseRejected`, explicit `Reservation` and `Reason` types, and the
  nine-case finite oracle.
- Added deterministic `theory-norm-v0`; display metadata and declaration order
  do not participate, laws do, and duplicate declaration IDs reject.
- Added exact-theory realization identities, a replaceable Python operation
  adapter, per-realization example-test evidence, assumption-aware policies,
  ambiguity rejection, selected-only execution, and structured explanation.
- Did not change the kernel, normalized core, proof semantics, actor/STM
  runtimes, package transport, or registry trust model.

## Evidence statement

- Claim: under the committed artifacts and development policy, exactly one
  realization is eligible and its execution matches the declared trace.
- Artifact: nine-case per-realization conformance results plus 21 tracer tests.
- Category: `example_test`; no proof or property-test claim.
- Assumptions: Python builtin operation registry, exact fixture integer
  arithmetic, and finite-suite adequacy for development selection.
- Not established: universal inventory correctness, alpha-equivalent identity,
  imported evidence, signatures, revocation, or production-runtime behavior.
- Invalidated by: theory, realization, recipe, adapter, runner, or recorded
  exact-binding changes. Policy changes alter eligibility only.

## Completion state

Complete. The next exposed uncertainty is alpha-equivalent binder identity in
`theory-norm-v1`; it remains recorded in
`uncertainties/0001-theory-normalization-binders.md`.

- 2026-08-02: Historical lifecycle heading migrated verbatim from the pre-migration plan:
  # Completed plan 0001: inventory realization resolution tracer
