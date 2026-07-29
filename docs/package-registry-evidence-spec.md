# Package, Registry, and Evidence Design Specification

## Objective

Packages should distribute semantic knowledge and executable realizations
separately while allowing consumers to determine exactly what is implemented,
what evidence exists, and what assumptions are accepted.

## Package roles

| Role | Primary contents |
|---|---|
| Theory | Abstract types, operations, laws, effects, invariants, observations |
| Model | Mathematical instance and proof evidence |
| Realization | Concrete representation and executable operations |
| Handler | Interpretation of an effect theory |
| Evidence | Proofs, analyses, tests, model checks, benchmarks, assertions |
| Adapter | Translation between theories, versions, platforms, or languages |
| Runtime | Scheduler, allocator, actor, STM, CRDT, or host implementation |
| Application | Domain machines and theory dependencies |
| Deployment | Selected realizations, targets, policies, and configuration |

A physical distribution artifact may contain several related roles, but the
manifest must keep them logically distinct.

## Interfaces, theories, and realizations

The package system should borrow the strongest idea from ML-style modules and
Backpack-like separate typechecking: dependencies are expressed against
explicit interfaces rather than concrete implementations.

The project extends this model:

```text
interface shape
+ effects
+ laws
+ invariants
+ observational contract
+ evidence obligations
= theory contract
```

A realization can be checked independently against a normalized theory before
being linked into an application.

## Contract identity

### Semantic identity

A theory identity hashes a deterministic normalized form including:

- abstract type declarations;
- operation signatures;
- effect requirements;
- laws and invariants;
- observation and equivalence declarations;
- required obligations;
- declared opaque boundaries;
- normalization-version identifier.

Documentation, source formatting, repository path, and evidence are not part of
the theory identity unless explicitly declared semantically relevant.

### Realization identity

A realization identity includes:

- represented theory identity;
- concrete representation contract;
- executable operation artifact identities;
- required handlers and capabilities;
- platform and ABI constraints;
- declared semantic assumptions.

Build-specific binaries receive separate artifact identities so one realization
may have several target builds.

### Human versioning

Semantic versions remain discovery and migration aids. Exact compatibility and
evidence attachment use content identities.

## Compatibility

Distinguish:

- **identity compatibility**: exact normalized theory;
- **refinement compatibility**: one contract proves it satisfies another;
- **adapter compatibility**: an explicit adapter realizes a mapping;
- **source compatibility**: existing source still elaborates;
- **binary compatibility**: calling and representation boundaries remain valid;
- **evidence compatibility**: evidence still targets the exact obligations;
- **behavioral compatibility**: declared observations are preserved.

Do not infer behavioral substitutability from matching function signatures.

## Theory refinement

A refinement package provides a mapping and evidence:

```text
StrongerTheory realizes/refines BaseTheory
```

The mapping states:

- type correspondence;
- operation implementation;
- effect changes;
- law derivations;
- observation preservation;
- additional assumptions.

This supports reusable theories without forcing inheritance-like nominal
hierarchies.

## Evidence object model

Each evidence item should contain:

```text
subject identities
obligation identity
claim type
evidence category
producer identity and version
inputs and environment
result or certificate
scope, bounds, and coverage
assumptions
creation time
signature or authentication material
```

### Evidence categories

- checked proof;
- imported proof certificate;
- derived structural evidence;
- static analysis result;
- bounded or finite model check;
- property test result;
- example/conformance test result;
- benchmark;
- runtime validation;
- assertion;
- assumption.

### Evidence composition

Evidence can depend on other evidence. For example:

```text
realization law proof
    depends on
standard theory proof
    and
translation adapter correctness
```

The resolver computes a support graph rather than flattening evidence into a
badge.

### Evidence expiry and invalidation

Evidence becomes stale when:

- its exact subject changes;
- a relied-on assumption is withdrawn;
- an analyzer or proof system version is revoked;
- a platform model changes;
- a bound no longer covers the deployment;
- a trust policy changes.

Content addressing makes invalidation precise, but policy and tool revocation
still require external metadata.

## Proof-carrying package pattern

A package may carry machine-checkable evidence accepted by a consumer's small
checker. The consumer need not trust the package producer's compiler or proof
search.

This generalizes proof-carrying code:

```text
package artifact
+ semantic contract identity
+ evidence bundle
+ declared assumptions
```

The consumer selects a policy and verifies the bundle before linking or
execution.

## Build provenance versus semantic evidence

Keep separate:

- **build provenance**: how, where, and from which inputs an artifact was built;
- **semantic evidence**: why the artifact realizes a theory or satisfies an
  invariant;
- **verification summary**: a trusted verifier's policy decision over evidence.

SLSA-style provenance can establish the build process but cannot by itself prove
that `Map` laws hold. A proof can establish a law but says nothing about whether
the distributed binary was built from the proved source. Both may be required.

## Attestation transport

### in-toto model

An in-toto-style statement is a suitable envelope for authenticated metadata
bound to artifact subjects. The project can define predicate schemas for:

- semantic proof;
- translation validation;
- model-check result;
- analyzer report;
- conformance suite;
- benchmark;
- deployment resolution;
- assumption waiver.

### Signatures

A DSSE-like signing envelope avoids confusing payload types and signatures.
Sigstore bundles are useful when the project wants portable certificate,
transparency-log, and timestamp verification material.

Authentication does not make a claim true; it identifies who or what produced
the claim and protects it from modification.

## Registry architecture

### Distribution layer

An OCI-compatible registry can store arbitrary content-addressed artifacts and
associate evidence or metadata with a subject through referrer relationships.

Suggested artifact families:

```text
theory manifest
normalized semantic core
realization manifest
target executable or Wasm component
evidence attestation
source bundle
documentation bundle
deployment lock
```

### Discovery layer

The project registry index adds semantic queries:

- find realizations of a theory;
- find handlers eliminating an effect;
- find evidence satisfying a policy;
- compare platform requirements;
- find adapters between theory versions;
- trace assumptions transitively;
- find all deployments affected by a revoked claim.

This index is derived from signed manifests and may be rebuilt.

### Verification layer

A client performs:

1. digest verification;
2. signature and attestation verification where required;
3. normalized contract checking;
4. compatibility/refinement checking;
5. evidence-policy evaluation;
6. target and capability checking;
7. deployment lock production.

## Trust policies

Policies are packageable contracts.

Example dimensions:

```text
memory safety
functional laws
protocol safety
build provenance
source review
runtime isolation
performance bounds
license and governance
```

Each dimension defines acceptable evidence categories, producers, freshness,
bounds, and assumptions.

Policies may be composed, but conflicts must be reported explicitly.

## Resolution

The resolver selects a graph of realizations under:

- semantic theory requirements;
- effect and handler requirements;
- ownership and resource constraints;
- target platform;
- interoperability format;
- evidence policy;
- operational preferences;
- user selections.

The output is a deployment lock containing exact identities and a human-readable
explanation of rejected and selected alternatives.

Resolution must be deterministic under identical inputs and policy.

## WIT and foreign packages

WIT is useful for machine-checkable component interfaces, but it specifies
shape rather than behavior. A foreign component package therefore contains:

```text
WIT interface/world
project theory mapping
component artifact
realization manifest
evidence and assumptions
```

Resource handles can represent owned or borrowed external resources. Richer
project concepts such as effects, laws, refinements, and quantitative usage
remain companion semantic metadata.

## Package authoring workflow

1. Author or import a theory.
2. Normalize and assign exact identity.
3. Implement or bind a realization.
4. Generate obligations.
5. Produce any combination of proof, analysis, tests, and assertions.
6. Build target artifacts with provenance.
7. Attach signed evidence to exact subjects.
8. Publish to a content-addressed registry.
9. Run independent consumer verification.

## Migration

A package change should generate a semantic diff:

- added or removed operations;
- strengthened or weakened laws;
- effect changes;
- representation changes;
- changed assumptions;
- evidence invalidated;
- adapter opportunities.

Migration tools should operate from this diff rather than semantic-version
numbers alone.

## Initial registry tracer bullet

Publish locally:

- inventory theory;
- pure realization;
- actor realization;
- asserted actor-runtime guarantee;
- tested conformance evidence;
- deployment policy;
- locked inventory deployment.

Then add STM as a third realization and show that the resolver rejects or
accepts it as its evidence improves.
