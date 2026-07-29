# Active plan 0001: inventory realization resolution tracer

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
- Mechanical implementation worker: pending contract/oracle commit.
- Independent adversarial reviewer: pending integration.

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

## Decisions and deviations

- Chose inventory over monoid because it exercises state, effects, event trace,
  execution, and explanation while reusing the declared project frontier.
- Deferred actor from the first bullet; it becomes the next realization against
  the same reference fixtures.
- Scoped identity v0 to data-level declarations; alpha normalization is not
  falsely claimed.

## Completion state

Open. On acceptance, move this record to `plans/completed/`, mark corresponding
work and evidence current in `model/`, and identify the next uncertainty.
