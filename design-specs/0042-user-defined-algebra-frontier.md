# Design spec 0042: user-defined algebra frontier

Status: frozen for tracer implementation

Date: 2026-08-01

Depends-On-Feature-IDs: 0018-minimal-kernel-calculus,
0020-agent-facing-kernel-json, 0026-semantic-surface-language

Design-Lens-Version: open-semantic-system-v1

## Problem

Semantic Systems names algebraic effects, handlers, laws, actors, and STM, but
it does not yet state how a user-defined algebra graduates from an experiment
to reusable theory, surface-language ergonomics, or a kernel/runtime
primitive. Without a promotion boundary, a useful library can enlarge the
trusted core merely because its syntax is repetitive. Conversely, keeping all
algebras as opaque TypeScript libraries would prevent the language and its
agents from inspecting, composing, testing, or discovering their semantics.

Resource lifecycle and concurrency expose the missing distinctions. A scoped
resource operation needs generative identity, affine ownership, cleanup on
every exit, and explicit transfer. Concurrent STM needs retry and atomic
publication, but can be realized either by a single-owner actor or by a
shared-memory runtime. Calling `release` the inverse of `acquire`, or calling
STM a kernel feature, would erase those operational differences.

Feature 0042 freezes an executable, agent-readable frontier report. It does
not add syntax or choose the final concurrency substrate. It makes the
promotion tests, workbench capabilities, candidate laws, realization
alternatives, and unresolved kernel obstructions explicit so the next tracer
can target the smallest warranted language change.

## Felt journey

A language designer asks whether STM, structured concurrency, or scoped
resources belong in the kernel. The report answers each question at four
distinct layers:

1. can users define a lawful theory and handler;
2. has repeated use justified surface syntax;
3. can that syntax elaborate faithfully to the current core; and
4. which runtime capabilities must a realization receive?

The same report lists the facilities a user needs to author and discover a new
algebra. An agent can inspect the report without reading prose and cannot
mistake a surface candidate for a kernel requirement.

## Open semantic system design lens

### Boundary and warranted state

The feature owns one immutable `semantic.algebra-frontier/v1` report and a pure
promotion classifier. It warrants the declared distinctions and dependency
edges. It does not warrant that a candidate algebra is sound, useful, fast, or
implemented.

The current 0018 kernel remains authority for executable terms. The report may
identify an obstruction but cannot change kernel syntax. A later feature must
provide a counterexample or proof obligation before promoting a primitive.

### Semantic inputs

The promotion classifier receives four explicit observations:

```text
lawful_userland_model
repeated_ergonomic_demand
faithful_surface_elaboration
kernel_obstruction_established
```

These are claims supplied by research or executable evidence. The classifier
does not fabricate them from popularity, implementation difficulty, or a
preferred syntax. `faithful_surface_elaboration` and
`kernel_obstruction_established` cannot both be true for the same current-core
target; the classifier reports that input as contradictory and blocks both
later promotion layers.

### Semantic outputs

The classifier returns independent userland, surface, and kernel decisions.
The report contains:

- the promotion ladder and its gates;
- theory-workbench capabilities and owning layers;
- resource lifecycle, structured concurrency, and STM candidates;
- laws and non-laws for each candidate;
- alternative runtime capability sets; and
- unresolved questions and unsupported claims.

`blocked` means a prerequisite is absent or the supplied observations are
contradictory. `defer` means the observations are consistent but the layer's
threshold is not met. `candidate` means the declared threshold is met and
still requires review; it is not acceptance.

### Effect protocols and uncertainty

No candidate is promoted to the kernel unless an obstruction to faithful
elaboration is established. Repeated ergonomic demand can nominate surface
syntax only after a lawful userland model and a faithful elaboration exist.

The report calls acquire/release a lifecycle or finalization algebra, not an
inverse algebra. Acquisition can fail, release can fail, and external effects
cannot generally be undone. Cleanup is an ownership protocol with at-most-once
finalization and explicit compensation where required.

### Components and orthogonal structures

```text
algebra signature + equations + composition
                    |
                    v
          handlers / interpretations ----> runtime capabilities
                    |
                    v
       evidence + canonical reflection ----> discovery projections
                    |
                    v
             promotion observations ----> library / surface / kernel gates
```

Theory identity, implementation identity, capability authority, evidence,
ergonomic adoption, and kernel expressiveness remain separate structures.

### Bounded autonomy and resources

The report is finite static data. Its exported Schema bounds strings to 2,048
code units, statement collections to 32, runtime alternatives to 8, and the
fixed workbench, candidate, and precedent collections to 8, 3, and 2 entries.
Unsupported claims are bounded to 16 entries. The emitted report publishes
all seven limits alongside the data it constrains.
The classifier performs no I/O, recursion, search, code generation, or effect
execution. Arrays and records are deeply frozen before crossing the module
boundary.

### Evidence, assumptions, and unsupported claims

Repository architecture inspection establishes that the 0018 kernel has
thunks, graded binders, operations, one-shot resumptions, and deep handlers.
It does not establish non-escaping region tokens or finalization under a
future cancellation semantics. The current kernel also prevents internal
resumptions from entering data structures. One-shot use is therefore
compatible with ordinary scheduling but does not yet supply an in-language
scheduler queue; an external runtime scheduler or a different elaboration
must discharge that obligation.

Local LangBang decisions and primary literature on scoped effects,
higher-order handlers, concurrency compilation, and STM handlers are design
evidence. They do not prove this calculus sound. The report must retain these
uncertainties rather than upgrading them to accepted language decisions.

## Promotion ladder

Every algebra begins in userland. The three promotion thresholds are:

```text
userland theory
  requires: signature, equations, interpretation, executable evidence

surface construct
  additionally requires: repeated ergonomic demand and faithful elaboration

kernel primitive
  additionally requires: an established semantic obstruction to elaboration
  and a smaller overall trusted boundary after promotion
```

Runtime primitives are orthogonal. A library effect may need privileged host
capabilities without requiring kernel syntax. Several realizations may use
different capability sets while satisfying one theory.

ADTs and monadic context are precedents: broad use justified surface syntax
and derivation support. They are not precedents for turning every useful
abstraction into a machine primitive.

## User theory workbench

The minimum authoring and discovery surface has eight separable capabilities:

1. **Signature** — named type parameters, sorts, typed operations, grades, and
   effect rows.
2. **Equations** — quantified terms and declared equality; law declarations
   are not silently oriented rewrite rules.
3. **Composition** — theory parameterization, sum/extension, hiding, renaming,
   and explicit collision diagnostics.
4. **Interpretation** — handlers or folds from one theory to values and
   residual effects, with capability requirements visible.
5. **Scope and identity** — fresh nominal region/capability identities,
   affine use, and explicit ownership transfer.
6. **Evidence** — examples, generators, shrinkers, observational equivalence,
   law suites, proofs, model checks, and counterexamples with honest evidence
   categories.
7. **Reflection** — a canonical bounded manifest containing the signature,
   laws, handlers, assumptions, evidence, examples, source correspondence, and
   content identities.
8. **Discovery** — typed queries over those manifests and generated human- and
   agent-readable documentation.

The surface language owns authoring syntax for signatures, equations, and
composition. The typed core owns their normalized meaning and checks equality
and interpretations; this is why equation syntax begins at the surface while
equation authority belongs to the core. The build system owns canonical
artifacts and identities. Control Room owns projections and discovery. The
runtime owns only capabilities selected by a realization. Capability names
are bounded references into a separate extensible vocabulary, not authority
created by this report.

## Resource lifecycle candidate

Candidate surface shape:

```text
with acquire(arguments) as resource in body
move resource to target_scope
release resource
```

Required laws:

- acquisition creates a fresh live identity or returns failure without one;
- a live affine token has one cleanup owner;
- explicit release consumes that ownership and removes its registered
  finalizer;
- normal return, typed failure, and cancellation run every remaining
  finalizer at most once in reverse registration order;
- finalizer failure does not skip later finalizers and is reported explicitly;
- a resource cannot escape its region without an explicit ownership transfer;
- transfer removes source cleanup authority before granting target authority;
  and
- a parent cannot finalize a resource while an owned child may still use it.

The current thunk and deep-handler forms may encode a scoped operation. The
unresolved obstruction is static non-escape plus cleanup across cancellation,
not the mere presence of lexical sugar.

Retained realization families are a lexical scope handler with a finalizer
stack and a single-owner resource actor whose clients hold transferable
handles. They expose different scheduling and lifetime costs while preserving
the same ownership laws.

## Structured concurrency candidate

Candidate userland effect operations are `spawn`, `join`, `yield`, and
`request_cancel`. Message `send` and receive protocols belong to an actor
theory layered above the minimal task theory unless evidence requires them.

Required laws include:

- every child is owned by one scope unless explicitly transferred;
- scope exit settles or requests cancellation of all owned children;
- join observes one terminal outcome;
- cancellation is an idempotent, monotone request rather than a claim of
  immediate termination;
- scheduler choice and happens-before observations are explicit;
- ordinary concurrency consumes one-shot continuations; and
- schedule replay is distinct from replay of external observations.

One-shot semantics is necessary but not sufficient for an in-language
scheduler: 0018 internal resumptions cannot currently be stored in a queue.
The first tracer must compare an external scheduler that retains opaque
suspensions with any proposed core elaboration rather than silently assuming
resumption storage.

Candidate runtime capabilities are fresh task identity, enqueue, suspend,
wake, and cancellation delivery. These can back ordinary effect handlers and
need not be source or kernel forms.

## STM candidate

STM remains a library theory whose retryable body is restricted to pure and
transactional operations. It may not acquire, release, or perform irreversible
effects because conflict and wake-up rerun the transaction description.
The existing executable 0014 model supplies bounded evidence for the userland
law model, including typed abort as distinct from retry. It does not settle the
final library decision, arbitrary serializability, or progress; those remain
downstream of this substrate gate.

Feature 0014 is an evidence source, not an ordering dependency of 0042. Its
accepted bounded tracer predates this contract, while its unresolved runtime
promotion is blocked by 0042. Recording it as a `Depends-On-Feature-ID` would
therefore create a false cycle in the work graph.

Two retained realization families demonstrate that STM semantics do not imply
one kernel representation:

1. a single-owner transaction-domain actor serializes validation, publication,
   dependency registration, and wake-up over message passing; and
2. a shared-memory handler uses linearizable validate/publish plus dependency
   park/wake capabilities.

The actor realization favors a small substrate and deterministic semantics;
the shared-memory realization may offer more parallelism. Their performance
and progress properties differ and remain realization metadata.

## Oracle-first counterexamples

1. Popularity alone promotes an algebra to the surface or kernel.
2. Surface syntax is proposed without a lawful userland model.
3. A kernel primitive is proposed without an elaboration obstruction.
4. A handler's runtime capability is misreported as kernel syntax.
5. `release` is treated as a mathematical inverse of `acquire`.
6. A resource token escapes without cleanup authority moving with it.
7. Parent cleanup races an owned child still using the resource.
8. Cancellation claims immediate termination or skips finalizers.
9. STM permits irreversible attempt effects that can repeat.
10. STM requires shared-memory atomics even when an owner-actor realization
    satisfies the same theory.
11. A declared law is silently used as a terminating rewrite rule.
12. A generated documentation page becomes semantic authority over its
    canonical theory manifest.

## Acceptance

Feature 0042 is accepted when one clean head passes its exact acceptance
script, focused classifier and report tests, TypeScript 7 Effect diagnostics,
Oxlint, Oxfmt, project-model validation, generated-view equality, the complete
repository gate, and independent Opus 5 medium review of the exact candidate.

## Kill or redesign criteria

Recut if the report conflates surface and kernel promotion, requires STM to
have one realization, treats cleanup as reversible external execution, hides
runtime capabilities, or cannot represent scoped/higher-order algebra
requirements separately from flat operation signatures.

## Non-goals

No theory syntax parser, proof language, type-class search, row-polymorphic
inference, region checker, task scheduler, resource runtime, STM runtime,
multishot continuation, optimizer, deployment, or claim that the current
kernel is already sufficient.

## Semantic diff

Semantic Systems gains an executable promotion policy and an agent-readable
map of the facilities required for users to author and discover algebras. STM
is explicitly downstream of the concurrency/resource substrate investigation,
while useful surface syntax no longer implies kernel promotion.
