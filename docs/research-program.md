# Research and Development Program

## Parallel tracks

### Semantics

- formal core calculus;
- effect and handler rules;
- quantitative usage and ownership;
- proof erasure;
- theory realization and observational equivalence;
- actor, STM, CRDT, and protocol semantics.

### Compiler

- parser and elaborator;
- typed core checker;
- interpreter;
- obligation generator;
- realization and evidence resolver;
- lowering and backends.

### Ecosystem

- package and evidence formats;
- content-addressed contracts;
- registries;
- proof-system and analyzer adapters;
- standard theories and conformance suites.

### Evaluation

- inventory domain machine;
- pure, actor, and STM realizations;
- later CRDT and coordinated variants;
- comparison of reusable laws, evidence, optimization, and ergonomics.

## Feature gate

Every proposed feature must answer:

1. What semantic distinction does it express?
2. Can current primitives express it adequately?
3. Is it kernel functionality, recognized abstraction, or sugar?
4. What are its typing and operational rules?
5. How does it interact with effects, ownership, proofs, and polymorphism?
6. What runtime machinery is required?
7. Which nontrivial program benefits?
8. What evidence would justify removing it?

## First publishable result

One inventory program depends on abstract theories and runs under pure, actor,
and STM realizations. The resolver accepts or rejects deployments according to
evidence policy, and every generated artifact records selected realizations and
assumptions.
