---
format: semantic.feature-artifact/v1
feature_id: 0001-inventory-resolution-tracer
kind: specification
legacy_entity_id: work.inventory-resolution-tracer
---
# Design spec 0001: inventory realization resolution tracer

Status: complete

Problem owner: main research and integration agent

Semantic frontier: data-level theory identity, pure inventory semantics, typed
evidence policy, deterministic resolution, and structured explanation

## User journey

A developer runs one command and sees an authored inventory theory normalized
to an exact identity, a lawful pure realization accepted under a development
policy, a deliberately broken realization rejected by conformance evidence, the
selected realization execute a reserve/release scenario, and an explanation of
the evidence and assumptions behind every decision.

## Falsifiable semantic claim

For a fixed inventory theory, candidate set, conformance suite, and evidence
policy, resolution deterministically selects exactly one realization if and
only if that realization targets the exact normalized theory identity and
satisfies every required obligation with an accepted evidence category; the
selected realization then produces the reference state/event trace, while
rejected candidates retain structured reasons.

## Values

- The authored contract is representation-independent.
- The reference transition is the execution oracle for later actor and STM
  realizations.
- Evidence categories remain distinct; passing tests never becomes proof.
- Rejections and ambiguity are defined outcomes, not missing values.
- Exact identities and explanation objects are machine-inspectable.

## Frozen contract boundary

### Inventory domain

State contains available stock by item and active reservations by reservation
identifier. Quantities are integers.

Messages:

- `Reserve(item, quantity)` requests a fresh reservation identifier.
- `Release(reservation_id)` releases one active reservation.

Events:

- `Reserved(reservation_id, item, quantity)`
- `Released(reservation_id)`
- `ReservationRejected(item, quantity, reason)`
- `ReleaseRejected(reservation_id, reason)`

Rules:

1. A positive reservation not exceeding available stock succeeds, subtracts
   stock, records the reservation, and emits `Reserved`.
2. Missing stock is observed as zero.
3. Zero or negative quantity rejects with `invalid_quantity` and does not
   request a fresh identifier.
4. Insufficient stock rejects with `insufficient_stock`.
5. A colliding identifier rejects with `duplicate_reservation_id`; uniqueness
   remains a handler guarantee rather than an implicit fact.
6. Releasing an active reservation restores its quantity, removes it, and emits
   `Released`.
7. Releasing an unknown or already released identifier rejects with
   `unknown_reservation`.
8. Rejections leave state unchanged.

Invariant: available stock is non-negative and every active reservation has a
positive quantity.

Observation: exact event sequence and final state from a declared initial
state, message sequence, and deterministic fresh-identifier input.

### Normalized identity v0

The identifier is `sha256:<lowercase hex>` over UTF-8 canonical JSON using
sorted object keys, compact separators, Unicode preservation, and rejected
non-finite numbers.

The theory semantic payload contains:

- normalization version `theory-norm-v0`;
- abstract types;
- operation signatures;
- effects;
- laws;
- invariants;
- observations;
- obligations.

Top-level declaration collections are ordered by stable declaration ID before
encoding. Documentation, display names, source paths, and authoring order do
not participate. Binder spelling remains significant in v0 and is an explicit
limitation until normalized core terms exist. Changing a law, invariant,
observation, or obligation changes identity.

A realization identity includes the exact theory identity, representation
contract, operation bindings, handled effects, platform requirements, and
declared assumptions.

### Evidence and policy

A conformance-suite recipe is not itself evidence. Executing it against one
exact realization produces an evidence result bound to the exact theory and
realization identities, obligation, producer, cases, result, and assumptions.

The development policy accepts `example_test`, `property_test`, or `proof` for
the inventory preservation obligation. The high-assurance counter-policy
accepts only `proof`. A failed suite, missing evidence, stale subject, or
unaccepted category rejects the candidate. Tests are never relabeled as proof.

Zero eligible candidates rejects. More than one eligible candidate without an
explicit policy choice rejects as ambiguous; lexical or load order must not
select silently.

### Structured explanation

Resolution returns data, not only prose. Each explanation node contains a
stable rule code, outcome, subject, details, and child nodes. It must answer:
what happened, why, which rule applied, which evidence was used, which
assumptions remain, which alternatives were rejected, and what can change the
outcome.

### Execution boundary

The bootstrap runner may bind manifest operation keys to typed Python reference
functions. Those bindings are a replaceable Stage A adapter, not semantic
identity supplied by Python. Only the selected realization may execute.

## Oracle and acceptance

The oracle is created before implementation in
`tests/test_inventory_tracer.py` and the conformance fixtures under
`examples/inventory/`.

The tracer is accepted when:

1. formatting and top-level declaration order do not change theory identity;
2. changing a law changes theory identity;
3. the reference realization passes every conformance case;
4. the standing broken realization fails and is rejected with named reasons;
5. deleting evidence rejects all candidates;
6. a proof-only policy rejects test evidence without upgrading it;
7. two eligible candidates reject as ambiguous;
8. the locked reference execution exactly matches the declared trace and final
   state;
9. evidence subjects equal the computed theory and realization identities;
10. the canonical graph records the claim, realizations, evidence, policy,
    deployment, and work result;
11. generated views are current and `./scripts/check.sh` succeeds inside the
    pinned Nix environment.

One visible reproduction command:

```bash
PYTHONPATH=src python -m semantic_tracer demo examples/inventory
```

## Explicit non-goals

No parser, surface language, kernel calculus, actor runtime, STM runtime, proof
adapter, registry service, package signatures, refinement compatibility, or
production Rust implementation.

## Falsifiers and kill criteria

- If v0 cannot be deterministic without defining core-term equivalence, stop
  and put normalized core ahead of resolver work.
- If resolver determinism requires hidden global order, stop and revise the
  policy schema.
- If the broken realization passes, the oracle or fixture is inadequate.
- If removing or invalidating evidence leaves selection unchanged, the evidence
  gate is decorative and the bullet fails.
- If any output describes tests as proof, evidence typing has failed.
