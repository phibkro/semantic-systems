# Package and Evidence Model

## Package roles

- theory;
- mathematical model;
- executable realization;
- handler;
- evidence;
- adapter;
- runtime;
- application;
- deployment.

## Contract identity

A normalized contract identity should include abstract types, operations, laws,
observational semantics, and declared obligations. Human-readable versions
remain useful, but evidence attaches to exact identities.

## Evidence record

```text
obligation
contract identity
realization identity, where relevant
evidence category
producer and version
artifact digest
assumptions
scope or bound
creation time
```

## Trust policies

A deployment profile states acceptable evidence for each property. A
development profile might permit assertions and tests; a high-assurance profile
may require checked proof and reject unresolved assumptions.

Evidence categories are multidimensional. A proof of functional correctness
does not establish performance, and a benchmark does not establish memory
safety.
