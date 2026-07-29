# Research Pattern Catalog

This catalog records patterns that fit the project's semantic goals. Patterns
are tools, not commitments.

| Pattern | Use in this project | Main caution |
|---|---|---|
| Small trusted kernel | Check normalized core and proof evidence | A small codebase can still implement an unsound specification |
| Untrusted producer, trusted checker | Elaborator, optimizer, solver, resolver produce checkable artifacts | Certificates must actually be cheaper and simpler to check |
| Proof-carrying artifact | Ship evidence with realizations and deployments | Proofs cover only their stated policy and assumptions |
| Translation validation | Validate each lowering or optimization result | Relational validators may be incomplete or expensive |
| Differential semantics | Compare independent evaluators and handlers | Agreement does not prove both are correct |
| Lossless green tree | Preserve source for IDEs and refactoring | Semantic nodes need stable identities beyond tree pointers |
| Bidirectional elaboration | Control dependent and effectful inference | Annotation policy must remain ergonomic |
| Demand-driven queries | Incremental compiler and project analysis | Hidden I/O or mutable state breaks reproducibility |
| Multi-level IR | Preserve concepts until each lowering can discharge them | Too many IRs increase maintenance unless boundaries are clear |
| CBPV semantic IR | Separate values, computations, effects, and order | Administrative syntax should not leak into user ergonomics |
| Quantitative usage | Erasure, ownership, captures, protocols | One grade algebra may not suit every domain |
| Algebraic effect theory | Separate operations from handlers and laws | Some effects have global semantic properties beyond equations |
| One-shot continuation default | Fit affine resources and efficient handlers | Multi-shot use cases require explicit alternatives |
| Functional core / effectful shell | Pure domain transitions and reproducible tooling | External systems still need carefully specified handlers |
| TEA-style domain machine | Messages, state, events, commands | Large systems require decomposition and protocol boundaries |
| Actor-owned state | Isolate mutable authority | Ordering and delivery guarantees are not universal |
| STM as library effect | Composable local atomic state | I/O, affine capture, starvation, and distribution remain hard |
| Commit actions as data | Execute irreversible effects only after commit | Exactly-once external behavior still needs idempotency/protocols |
| Aggregate ownership | Manage cyclic graphs through an enclosing owner | Escaping elements require copy, promotion, or handles |
| Weak observation | Model dependencies that do not control lifetime | Dependency/invalidation semantics are richer than weak pointers |
| CRDT law package | Derive convergent replicated realizations | Convergence alone does not preserve domain invariants |
| CALM-guided analysis | Identify coordination-free monotone computation | Real systems need explicit completeness and failure assumptions |
| Invariant-confluence obligation | Decide when coordination is needed for invariants | Proof may be difficult and operation set must be precise |
| ML-style explicit signatures | Separately check theories and realizations | Recursive linking and identity semantics require care |
| Backpack-style package holes | Defer realization selection while typechecking clients | Richer laws/effects must extend ordinary signatures |
| Content-addressed contracts | Attach evidence to exact semantics | Canonicalization mistakes create unstable or misleading identity |
| Semantic diff | Explain compatibility and evidence invalidation | Equivalence may be undecidable; conservative output is required |
| OCI artifact transport | Reuse registries for packages and evidence | OCI is transport, not semantic package resolution |
| in-toto attestation | Bind authenticated claims to exact artifacts | Authentication does not validate claim truth |
| SLSA provenance | Record build process and inputs | Build integrity is distinct from semantic correctness |
| Wasm Component boundary | Portable typed composition and sandboxing | WIT captures interface shape, not laws or effects |
| Datalog analysis plane | Recursive graph, effect, work, and evidence queries | Closed-world negation and incremental updates require discipline |
| Rebuildable projection | Keep diagrams, indexes, and caches derived | Regeneration must be deterministic and cheap enough |
| Structured explanation | Reuse diagnostics across CLI, LSP, UI, and agents | Explanation schemas can become coupled to internal algorithms |
| Deterministic simulation | Explore actors, STM, clocks, and schedules | Bounded schedule exploration is not exhaustive correctness |
| Evidence policy as package | Make trust requirements reproducible and composable | Policy conflicts and authority need explicit governance |
| Agent work contract | Delegate bounded tasks with acceptance oracles | Agents should not silently make high-blast-radius semantic decisions |

## Pattern combinations

### Trusted semantic pipeline

```text
lossless source
-> elaboration evidence
-> checked normalized core
-> validated lowering
-> evidence-carrying artifact
```

### Plural runtime pipeline

```text
pure domain machine
-> abstract effects
-> actor / STM / CRDT handlers
-> deterministic simulation and conformance
-> selected deployment
```

### Evidence-aware ecosystem

```text
theory identity
-> realization obligations
-> heterogeneous evidence
-> trust policy
-> deployment lock
-> signed provenance
```

### Agent-ready development

```text
typed project graph
-> derived ready frontier
-> bounded work contract
-> isolated execution
-> products and attestation
-> deterministic validation
-> human review where required
```
