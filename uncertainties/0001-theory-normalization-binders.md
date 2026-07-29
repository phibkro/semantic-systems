# Uncertainty 0001: binder equivalence in theory normalization
## Current hypothesis

Binder spelling can remain identity-significant in `theory-norm-v0` if the
limitation is explicit and all v0 contracts use stable named declarations.

## Supporting evidence

The first tracer contains only data-level declarations with stable IDs; its
needed invariances are formatting and top-level declaration order. Versioned
identity permits a later algorithm without pretending compatibility.

## Counterevidence

The compiler semantics specification expects alpha-equivalence treatment.
Logically equivalent authored laws can receive different v0 identities when
only binder names change.

## Dependent work

Imported proof evidence, cross-package theory equivalence, semantic diff, and
normalized-core package publication must not assume v0 alpha invariance.

## Resolving experiment

Once normalized law terms exist, encode two alpha-equivalent contracts and one
capture-changing contract. Require the former to share identity and the latter
to differ under `theory-norm-v1`.
