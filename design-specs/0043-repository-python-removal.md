# Design spec 0043: Repository Python removal

Status: frozen

Problem owner: operator and main integration agent

Semantic frontier: final TypeScript and Effect v4 runtime cutover

Design-Lens-Version: open-semantic-system-v1

Migrates-Feature-IDs: 0010-typescript-effect-v4-runtime

## Open semantic system design lens

### Boundary and warranted state

The repository owns its checked-in source, commands, tests, package metadata,
Nix environment, CI configuration, and navigation index. External reference
checkouts and host services remain environmental inputs.

### Semantic inputs

The accepted feature-0010 contract, pre-removal reference-custody observations,
repository files, Bun and Node runtime observations, and Git/Nix check results
are explicit inputs to this final cutover.

### Semantic outputs

The output is one repository whose active implementation and validation paths
use TypeScript, Bun, and Effect v4, plus fixed evidence that preserves the
accepted observations formerly supplied by the transitional Python oracle.

### Effect protocols and uncertainty

Filesystem, process, Git, locking, clock, and network interactions retain the
typed Effect boundaries established by feature 0010. Removing a differential
oracle does not turn bounded examples into a proof of universal equivalence.

### Components and orthogonal structures

Portable reference-custody programs, Bun and Node live layers, golden
observations, repository checks, Nix source invariants, documentation, and
navigation metadata remain separately inspectable components.

### Bounded autonomy and resources

The migration deletes only repository-owned transitional Python artifacts.
It neither rewrites external checkouts nor broadens network, deployment, or
host authority. Acceptance runs one complete suite and one Nix observation.

### Evidence, assumptions, and unsupported claims

Golden observations, cross-runtime tests, adversarial fixtures, static checks,
and Nix derivations retain their distinct evidence categories. Passing them
does not prove host identity, Effect stability, or behavior outside the tested
bounds.

## User journey

A contributor enters the pinned environment and uses Bun commands for project
modeling, semantic execution, reference custody, tests, and repository checks.
No repository-owned Python package, script, test, cache, or Nix dependency is
needed to build, validate, or operate Semantic Systems.

## Falsifiable claim

The cutover is accepted exactly when:

1. tracked `src/`, `tests/`, and `scripts/` contain no Python file and
   `pyproject.toml` is absent;
2. active CI, Nix, package, and check commands invoke no Python tool;
3. representative accepted catalog digests and canonical lock bytes remain
   fixed independently of the implementation under test;
4. Bun and Node observe the same bounded reference-custody CLI journeys;
5. the complete Bun corpus, TypeScript, lint, formatting, project projections,
   commit policy, and Nix source invariants pass on one exact head; and
6. current documentation and navigation metadata describe TypeScript as the
   active repository language.

The claim is falsified by a compatibility shim, a weakened rejection or
custody oracle, a hidden Python invocation, regenerated evidence derived only
from the implementation under test, or an active metadata surface that still
directs contributors to Python.

## Acceptance

Run:

```bash
just accept 0043-repository-python-removal
```

The executable acceptance delegates to the frozen feature-0010 migration
acceptance so the final owner observes the identical checks rather than
forking a second definition of completion.

## Unsupported claims

This feature does not claim that Python is unsuitable for unrelated projects,
that no system service on the host uses Python, or that the finite preserved
observations prove every possible implementation equivalence.
