# Decision 0007: algebras graduate through explicit layers

## Question

How do user-defined algebras gain ergonomic language support without turning
every useful abstraction into a trusted kernel primitive?

## Alternatives

1. Bless common algebras directly in the kernel.
2. Keep every algebra as an opaque host-language library.
3. Start with a law-bearing userland theory, promote repeated patterns to
   surface syntax only with a faithful elaboration, and promote to the kernel
   only after an obstruction to elaboration is established.

## Chosen option

Option 3. Library theory, surface construct, kernel primitive, and runtime
capability are separate classifications.

A useful algebra may receive syntax without receiving a kernel form. A library
handler may require privileged runtime capabilities without making those
capabilities source constructs. The promotion evidence and remaining
assumptions are retained in the canonical theory artifact.

## Rationale

ADTs and monadic context show that repeated lawful patterns can warrant
ergonomic syntax and derivations. They do not show that syntax must be a
machine primitive. This ladder preserves a small kernel while allowing the
surface language to become pleasant and allows multiple realizations to
satisfy one theory.

Resource lifecycle and STM are the first stress tests. Acquire/release is a
scoped ownership protocol rather than a general inverse. STM can run through a
single-owner actor or shared-memory atomic substrate. Neither observation
warrants immediate kernel promotion.

## Confidence

High for the separation of layers. Moderate for the current kernel's ability
to elaborate scoped resource operations; region escape and cleanup across
cancellation remain open.

## Reversibility

High before syntax ships. A versioned surface construct can later elaborate to
a different core representation if its observable theory and migration remain
explicit. Kernel promotion is deliberately harder to reverse.

## Affected entities

Theory manifests, surface syntax, elaboration, runtime capability selection,
resource and concurrency research, STM laws and runtime, Control Room
discovery, and package/build identities.

## Reopening condition

Reopen when a lawful algebra cannot be expressed or interpreted with the
available theory workbench, when a surface elaboration fails to preserve its
laws, or when a measured trusted-boundary reduction justifies a kernel
primitive.
