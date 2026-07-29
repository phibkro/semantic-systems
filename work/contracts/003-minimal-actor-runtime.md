# Work Contract: Minimal Actor Runtime

## Objective

Implement the smallest deterministic actor runtime capable of executing the
inventory actor realization.

## Inputs

- `theory.actor`
- `theory.machine`
- accepted one-shot-handler decision
- inventory message sum and pure transition once available

## Outputs

- typed actor references;
- mailbox queue;
- deterministic single-threaded scheduler;
- uniquely owned actor state;
- simulation trace;
- tests for message order and state isolation.

## Allowed scope

- `runtime/actors/**`
- actor conformance tests
- actor-specific adapters

## Forbidden scope

- distributed actors;
- work stealing;
- persistence;
- STM;
- multi-threaded optimization.

## Acceptance

1. Only the owning actor can mutate actor state.
2. Simulation runs are deterministic.
3. Mailbox order is visible in a trace.
4. The inventory actor can be tested against pure-transition fixtures.
5. Runtime interfaces remain independent of the inventory domain.

## Delegation

Delegate with review. Implementation is bounded and testable, but its public
runtime interface should receive architecture review before stabilization.
