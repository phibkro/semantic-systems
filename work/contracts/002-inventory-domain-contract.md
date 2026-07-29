# Work Contract: Inventory Domain Contract

## Objective

Finish a representation-independent domain machine suitable for pure, actor,
and STM realizations.

## Inputs

- `examples/inventory/machine.pseudo`
- `domain.inventory.machine`
- `invariant.inventory.nonnegative`
- `theory.machine`

## Outputs

- complete state, message, and event definitions;
- transition table for every message and state condition;
- rejection semantics;
- invariant statement;
- executable pure examples;
- unresolved domain questions as explicit decisions.

## Allowed scope

- `examples/inventory/**`
- inventory semantic entities and evidence obligations

## Forbidden scope

- actor mailbox implementation;
- STM conflict algorithm;
- concrete map representation;
- external payment behavior.

## Acceptance

1. Every message yields an explicit event sequence.
2. The invariant uses only abstract domain concepts.
3. Pure transition fixtures cover success and rejection paths.
4. The contract contains no actor- or STM-specific storage assumptions.

## Delegation

Delegate with mandatory domain review. The task has high locality and
testability but defines the semantic reference for later realizations.
