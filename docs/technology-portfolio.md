# Technology Portfolio and Selection Rationale

## Status

This is a recommended technology strategy, not an irreversible implementation
plan. Each recommendation is attached to an architectural role and a
replacement boundary.

## Selection criteria

Technologies are evaluated against the project's values:

| Criterion | Meaning |
|---|---|
| Semantic fit | The technology naturally expresses the relevant distinction |
| Trust containment | Its complexity can remain outside the smallest trusted base |
| Artifact quality | It can emit stable, inspectable, independently checkable artifacts |
| Incrementality | It supports responsive edit-analyze-explain loops |
| Interoperability | It has explicit boundaries rather than shared implicit state |
| Reproducibility | Inputs, versions, outputs, and assumptions can be recorded |
| Longevity | The project can retain its data if the technology is replaced |
| Contributor accessibility | A new contributor can understand and modify the subsystem |
| Operational suitability | Performance, concurrency, deployment, and maintenance fit |

## Production host: Rust

### Recommended role

Use Rust for the production compiler, package resolver, runtime components,
local daemon, and language server.

### Why it aligns

- Ownership and borrowing make memory and concurrency boundaries explicit.
- It provides predictable native execution without requiring a tracing
  collector.
- Sum types, pattern matching, traits, and explicit error handling map well to
  compiler construction.
- A workspace can keep syntax, core, elaboration, checking, packages, runtimes,
  and tools independently testable.
- It has mature support for Wasm tooling and low-level systems integration.

### Boundary

Rust data structures are not canonical language semantics. Every durable
contract must have a host-independent normalized form. Rust traits are not the
project's theory system; they implement internal component interfaces.

### Principal risks

- The host's ownership model may bias language design toward Rust-like answers.
- Type-level encodings can become harder to inspect than explicit semantic
  data.
- Compile times and dependency growth require deliberate workspace boundaries.

Mitigation: specify semantics independently, serialize core forms, and use
cross-checking against a reference evaluator.

## Formal proof system: Lean 4

### Recommended role

Use Lean as the primary producer and checker of high-assurance mathematical
evidence:

- metatheory of stable core fragments;
- theory laws;
- realization conformance;
- proof-producing derivations;
- selected translation validators;
- reusable mathematical structures through Mathlib where appropriate.

### Why it aligns

Lean combines a small proof-checking kernel with a capable programming and
metaprogramming environment. Its output terms can be checked independently of
proof search and tactic execution.

### Boundary

The project owns obligation identities and logical translations. A Lean theorem
is evidence for a project proposition only through an adapter that records:

- translated definitions;
- theorem identity;
- Lean and library versions;
- axioms and trusted declarations;
- artifact digest;
- exact project obligation discharged.

### Principal risks

- Formalization can dominate project velocity.
- Semantic duplication can drift between Lean and the production compiler.
- Advanced proof automation may conceal assumptions from non-specialists.

Mitigation: formalize seams and invariants first, generate shared definitions
where useful, and retain executable differential tests.

## Executable semantics laboratory: Redex or K

### Recommended role

Use one selectively as a research oracle rather than as the permanent language
runtime.

**Redex** is attractive for rapidly defining reduction relations, typing rules,
random testing, and small abstract interpreters.

**K** is attractive when a configuration-and-rewrite model can generate an
interpreter, symbolic execution, state exploration, or verification tools from
one executable semantics.

### Selection rule

- Prefer Redex for small calculi and rapid semantic iteration.
- Prefer K for larger operational configurations or experiments where generated
  language tools materially reduce work.
- Use neither when the production reference evaluator and Lean model already
  provide sufficient independent agreement.

### Boundary

Both systems exchange traces, counterexamples, and conformance results with the
project. Their internal term formats are not package identities.

## Project tooling and research scripting: TypeScript, Bun, and Effect v4

### Recommended role

Use the repository-pinned TypeScript toolchain for:

- project-model import and validation;
- research data transformation;
- report generation;
- external-tool adapters;
- short-lived experiments.

Use ordinary total TypeScript functions for pure semantic work and Effect
Schema, typed errors, and injected platform services at untrusted and
capability-bearing boundaries. Bun is the default runtime; Node supplies an
independent live-layer observation where the contract requires portability.
Disposable one-off experiments need not become repository source.

### Boundary

TypeScript programs generate or consume canonical project artifacts.
Generated views and indexes remain rebuildable; runtime success remains test
evidence rather than semantic authority.

## Syntax architecture: lossless immutable trees

### Recommended pattern

Adopt a lossless concrete syntax tree using immutable green nodes with typed
wrappers and ephemeral contextual views. Preserve comments, whitespace, errors,
and exact source spans.

This enables:

- formatting without semantic reparse loss;
- robust IDE operations on incomplete programs;
- structural sharing across edits;
- stable source-to-core explanations;
- refactoring and generated edits.

A Rowan-style library is a plausible Rust realization, but the pattern is more
important than the package choice.

## Incremental computation: demand-driven query system

### Recommended pattern

Model compiler and project-tooling computations as memoized queries whose
inputs and dependencies are explicit. Recompute only affected results after an
edit.

Candidate queries include:

```text
parse(file)
elaborate(module)
normalize(theory)
obligations(realization)
evidence_for(obligation, policy)
select_realization(deployment)
lower(definition, target)
```

A Salsa-style red-green incremental engine is a strong Rust candidate. Keep the
query interface project-owned so a custom or different engine remains possible.

## Recursive relational analysis: Datalog and Soufflé

### Recommended role

Use typed Datalog for cross-cutting facts and recursive analyses that would be
awkward as imperative graph traversals:

- transitive theory dependencies;
- impact of assumptions;
- evidence coverage;
- realization compatibility;
- work readiness and critical paths;
- capability reachability;
- call/effect/ownership analyses;
- CALM-style monotonicity support analyses.

Soufflé is suitable when datasets or analyses outgrow the current TypeScript
graph engine. Its fact schema should be generated from the canonical project
model.

### Boundary

Datalog derives relations; it does not author semantic truth. Negative or
non-monotone queries must state their closed-world assumptions explicitly.

## Storage: source files plus rebuildable indexes

### Recommended role

- Git-tracked source remains authoritative for authored contracts and decisions.
- Content-addressed blobs remain authoritative for normalized published
  artifacts.
- SQLite or embedded storage provides local indexes, caches, and query results.
- A graph database is optional for hosted exploration, never required to read a
  package.

This avoids making the project's conceptual graph dependent on one database
product.

## Compiler IR portfolio

### Project-owned IRs

The semantic path should remain project-owned:

1. lossless syntax;
2. resolved high-level representation;
3. explicit normalized core;
4. typed CBPV representation;
5. ownership/effect/representation lowering;
6. control-flow or SSA representation;
7. target representation.

### MLIR and LLVM

MLIR is a useful optional bridge for reusable analyses, domain-specific
dialects, staged lowering, and heterogeneous targets. LLVM remains a useful
native backend.

Neither should be the first semantic core. Mapping into them loses project
concepts unless those concepts have already been discharged, erased, or
represented by explicit dialect operations and attributes.

### Translation boundary

Every lowering states:

```text
source semantics
preserved observations
introduced assumptions
undefined or target-specific behavior
validation or proof strategy
```

## Portable deployment: WebAssembly Component Model

### Recommended role

Use Wasm Components as the preferred portable deployment and foreign
realization boundary.

Useful properties include:

- typed import/export interfaces;
- nested composition;
- language-independent canonical ABI;
- owned and borrowed resource handles;
- capability-oriented worlds;
- isolation from shared linear memory across component boundaries.

### Boundary

WIT describes interface shape, not semantic behavior. Generate WIT from the
externally representable subset of a semantic theory, then ship laws, effects,
assumptions, and evidence as companion project metadata.

A component satisfying WIT is structurally compatible; it realizes a theory
only after the required semantic evidence is accepted.

## Artifact transport: OCI-compatible registries

### Recommended role

Use OCI distribution as a transport layer for:

- theory artifacts;
- realizations;
- runtime components;
- evidence bundles;
- source bundles;
- documentation and indexes.

OCI's digest-addressed blobs, generic artifacts, subject relationships, and
referrer discovery fit evidence attached to exact package artifacts.

### Boundary

OCI manifests do not define package semantics. The project defines media types,
package manifests, canonical identities, and verification policy.

## Attestation and signatures

### in-toto

Use the in-toto attestation model as inspiration and likely transport for typed
claims bound to exact artifact subjects. Custom predicates can represent:

- theory realization evidence;
- proof-check results;
- model-check bounds;
- analyzer findings;
- conformance-test results;
- benchmark environments;
- trust-policy decisions.

### Sigstore

Use Sigstore bundles where ecosystem-compatible signing, certificate identity,
transparency-log inclusion, and portable verification material are valuable.

### SLSA

Use SLSA vocabulary and provenance for how an artifact was built. Do not
conflate SLSA build provenance with semantic correctness evidence; the two may
reference each other.

## Interactive tooling: TypeScript web client

### Recommended role

A TypeScript client is appropriate for:

- recursive component exploration;
- semantic and evidence graph views;
- source/core/proof cross-navigation;
- deployment comparison;
- agent work queues;
- live compiler explanations.

The framework should remain a replaceable UI concern. The important contract is
an introspectable query API and stable graph identifiers.

A GraphQL-like typed and introspective service may be useful for hosted
exploration, but local CLI and file access must remain sufficient for basic use.

## Development and build environment

Prefer principles over one build product:

- pinned toolchains;
- hermetic or reproducible CI environments;
- generated dependency locks;
- no network access during semantic checking where practical;
- recorded compiler, solver, proof-system, and runtime versions;
- build provenance and signed release artifacts;
- independent verification commands.

## Explicitly deferred selections

Do not yet standardize:

- one parser generator;
- one graph database;
- one SMT solver;
- one native code backend;
- one distributed actor framework;
- one web UI framework;
- one cloud registry vendor;
- one build-system product.

Those decisions should follow a tracer bullet that exposes their actual
constraints.
