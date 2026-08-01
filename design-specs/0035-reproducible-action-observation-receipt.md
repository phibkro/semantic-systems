# Design spec 0035: reproducible action/observation receipt

Status: frozen for one bounded host-neutral closure-inspection journey

Date: 2026-08-01

Depends-On-Feature-IDs: 0033-semantic-runtime-closure-manifest

Design-Lens-Version: open-semantic-system-v1

## Problem

Feature 0033 names an exact compiler-to-build runtime closure, but it does not
execute an action or record an observation. A later build or deployment system
needs a reproducible bridge from that closure to action semantics without
making a recipe, an environment declaration, an observed result, and mutable
deployment state look like one identity.

The smallest honest bridge is a closed host-neutral interpreter that can
inspect an accepted closure. It must emit a canonical observation receipt while
claiming neither host execution nor deployment.

## Felt journey

A caller supplies a valid 0033 closure, a recipe asking whether one exact
semantic/artifact pair is a member, and a declared environment with the
required inspection capability. The interpreter validates the closure,
executes the query, and emits canonical bytes that say `present: true`.

Repeating the action or permuting declared capabilities produces equal bytes.
Adding an unused capability preserves the recipe identity and result but
changes the environment and execution identities. Removing the required
capability returns a typed rejection. Changing the observation or claiming a
deployment and refreshing only an outer digest cannot validate.

## Open semantic system design lens

### Boundary and warranted state

0035 owns strict recipe and declared-environment decoding, capability
admission, deterministic interpretation over one revalidated 0033 manifest,
domain-separated identities, canonical receipt bytes, and exact receipt
revalidation.

The receipt warrants that the bundled reference interpreter evaluated the
embedded closed recipe against the identified, revalidated runtime closure
under the embedded declared capability set. The environment is a caller
declaration, not a probe of a host. The observation is a deterministic result,
not evidence that a process, Nix derivation, Cloudflare Worker, or deployment
ran.

### Semantic inputs

`executeReproducibleAction(storeSnapshotJson, closureManifestBytes,
recipeJson, environmentJson)` accepts four unknown values. The closure bytes
are admitted by 0033 against the explicit snapshot JSON witness. Recipe and
environment must be primitive JSON strings no larger than 1,048,576 UTF-8
bytes, depth 64, or 16,384 JSON values. They use duplicate-key scanning and
strict Effect Schema decoding.

The closed recipe algebra is:

```text
closure.member-count
closure.artifact-present(semantic_identity, artifact_identity)
```

The declared environment is:

```text
{
  format: "semantic.action-environment",
  version: 1,
  runtime: "semantic.host-neutral-reference",
  capabilities: Capability[]
}
```

Capabilities are drawn from the two-operation closed registry, are unique,
sorted for meaning, and are limited to 16. Each recipe has exactly one
required capability. Extra admitted capabilities do not grant new action
syntax.

`validateReproducibleActionReceiptBytes(storeSnapshotJson,
closureManifestBytes, receiptBytes)` captures and strictly decodes the receipt,
revalidates the supplied closure through 0033, and deterministically recomputes
the complete receipt from its embedded recipe and environment.

### Semantic outputs

Success returns an immutable receipt plus defensive-copy canonical bytes. The
receipt keeps these relations explicit:

```text
recipe + recipe_identity
declared_environment + environment_identity
runtime_closure_manifest_identity
execution_identity(recipe, environment, closure, interpreter procedure)
observation
deployment_observation = { status: "not-observed" }
receipt_identity
```

`recipe_identity` hashes only the normalized recipe. `environment_identity`
hashes only the normalized declared environment. `execution_identity` binds
the procedure, recipe, environment, and closure identities. `receipt_identity`
binds the complete historical receipt payload except itself. No identity
contains an ambient path, clock, process identifier, random value, mutable
deployment state, or caller presentation order.

Observations are a corresponding closed union: member count returns the
recomputed manifest member count; artifact presence returns a boolean for the
exact pair. Deployment status has only `not-observed` in v1.

### Effect protocols and uncertainty

`Crypto.Crypto` is the only external Effect requirement and owns SHA-256
observations. Digest failures remain typed. Recipe, environment, capability,
receipt, and inherited 0033 failures remain distinguishable. The interpreter
does no filesystem, process, network, clock, random, console, retry, queue, or
background-fiber work.

Equal admitted inputs are idempotent. There is no retry or compensation
protocol because the action is finite and pure after the explicit digest and
0033 validation capabilities are provided.

### Components and orthogonal structures

```text
snapshot JSON + closure bytes --> exact 0033 validation --> closure manifest
recipe JSON ------------------> closed recipe ------------+
environment JSON -------------> capability admission ----+--> interpreter
                                                            |
                                                            v
                                                   observation receipt
```

Closure derivation, recipe intent, capability declaration, execution
derivation, observation, and deployment observation are separate relations.
The transition from a 0033 build-input closure to an 0035 action observation
crosses semantic layers; embedding identities preserves rather than replaces
the upstream authority.

### Bounded autonomy and resources

- recipe, environment, and receipt representations are at most 1,048,576
  UTF-8 bytes, depth 64, and 16,384 JSON values;
- the environment contains at most 16 unique capabilities;
- the action algebra has two finite, non-recursive constructors;
- membership inspection visits at most the 1,024 members admitted by 0033;
- the operation has no concurrency, retry, queue, continuation, or persistent
  lifetime; and
- output must fit the same 1,048,576-byte limit.

### Evidence, assumptions, and unsupported claims

Effect Schema and typed failures are runtime-validation evidence. Bun and
genuine Node parity are test observations over the checked fixtures. Property
tests observe canonical capability-order invariance and identity separation.
Exact receipt recomputation observes resistance to forged result fields.

The caller-declared environment is an assertion. No test proves deployment,
host compatibility, Nix reproducibility, or Cloudflare behavior. Those claims
remain unsupported and are stated as such in the receipt.

## Deep-module contract

```text
executeReproducibleAction(snapshotJson, closureBytes, recipeJson, environmentJson)
validateReproducibleActionReceiptBytes(snapshotJson, closureBytes, receiptBytes)
```

Only `Crypto.Crypto` remains visible. The module exports schemas, bounds,
identity domains, immutable result types, and tagged expected failures.

## Oracle-first counterexamples

- valid member-count and present/absent membership recipes execute and round
  trip through canonical validation;
- capability order cannot affect canonical bytes;
- an extra capability changes only environment/execution/receipt identities,
  not recipe identity or observation;
- a missing, duplicate, unknown, or over-limit capability rejects;
- malformed, duplicate-key, excess-property, or over-limit JSON rejects before
  interpretation;
- stale or forged closure bytes remain 0033 failures;
- modified observation, identity, closure reference, or deployment status
  cannot validate; and
- hostile byte lookalikes cannot trigger caller accessors.

## Acceptance

`bun scripts/accept/0035-reproducible-action-observation-receipt.ts` must run
focused Bun tests, genuine Node parity, the 0033 seam, TypeScript 7 with Effect
diagnostics, Oxlint, Oxfmt, deterministic project projections, and the complete
repository gate.

## Kill or redesign criteria

Redesign if the action requires ambient host discovery, recursive/unbounded
syntax, mutable deployment state, or trust in a caller-supplied observation. A
future real executor must use a separate effect protocol and observation
authority; it must not widen this reference interpreter by relabeling it.

## Non-goals

No process or command execution; filesystem or network effects; Nix or
Cloudflare integration; artifact publication; deployment mutation; scheduling;
bytecode persistence; host probing; timestamps; logs; multi-shot continuations;
or proof of runtime behavior.

## Semantic diff

0035 adds one reproducible action/observation layer over accepted 0033 closure
identity. It does not change kernel, compiler, store, reachability, runtime
closure, deployment, or infrastructure semantics.
