# RFC 0002: Realization and Technology Portfolio

## Status

Proposed research baseline.

## Decision

Adopt a portfolio architecture centered on project-owned normalized semantic
contracts.

Recommended initial roles:

- Rust for production compiler, runtimes, package tools, and language server;
- Lean 4 for high-assurance proof evidence;
- Redex or K for selective executable-semantics experiments;
- typed Python for bootstrap and research adapters;
- Datalog/Soufflé for recursive analysis when the graph outgrows direct code;
- project-owned multi-level IR with optional MLIR/LLVM bridges;
- WebAssembly Components for portable executable boundaries;
- OCI for artifact transport;
- in-toto/Sigstore/SLSA formats for authentication and provenance;
- TypeScript for the interactive project explorer.

## Invariants

1. External tools do not define semantic contract identity.
2. Every external integration has a versioned adapter boundary.
3. Generated views and indexes are rebuildable.
4. Evidence records exact subjects, assumptions, tools, and scope.
5. WIT/interface compatibility is not treated as proof of behavioral laws.
6. Build provenance is not treated as semantic correctness evidence.
7. Optimizers and proof search remain outside the smallest trusted checker.

## Consequences

The project accepts duplicated realizations and some cross-language integration
cost in exchange for independent checking, replaceability, and better alignment
between trust claims and actual artifacts.

## Revisit conditions

Revisit the portfolio if:

- the inventory tracer bullet cannot be expressed without excessive adapter
  duplication;
- a selected technology forces its internal identity into public contracts;
- independent checking proves impractical;
- contributor or build costs outweigh the evidence and interoperability value;
- a simpler technology satisfies the same boundaries.
