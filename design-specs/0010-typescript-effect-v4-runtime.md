# Design spec 0010: TypeScript, Bun, and Effect v4 runtime

Status: frozen

Problem owner: operator and main integration agent

Semantic frontier: repository implementation language and effect boundary

Migrates-Feature-IDs: 0002-reference-baselines-deep-research, 0005-autonomous-development-control-loop, 0007-reuse-first-engineering

## User journey

A contributor enters the pinned development environment and uses one coherent
TypeScript toolchain for the project model, semantic tracer, reference custody,
tests, and repository checks. Bun is the default runtime and Node is a
supported alternative selected by replacing Effect platform layers. Failures
remain typed data until the CLI boundary, and capabilities such as filesystem,
process, clock, and network access are explicit Effect services or effects.

No repository-owned Python runtime, package, test, cache, or Nix dependency is
needed to validate, generate, test, or operate Semantic Systems.

## Falsifiable claim

The migration is complete exactly when:

1. the project-model, tracer, and reference-custody CLIs preserve their
   accepted behavior, deterministic artifacts, rejection behavior, and exit
   status under Bun, and the project-model and tracer portable programs have
   equivalent Bun and Node live-layer observations;
2. untrusted JSON and TOML cross an Effect Schema boundary before entering the
   semantic core;
3. fallible I/O, subprocess, locking, and network operations expose typed
   failures through Effect rather than throwing across module boundaries;
4. `effect` is pinned to the explicitly reviewed v4 release and no v3 API is
   accepted;
5. Bun tests cover the former Python acceptance surface plus migration
   counterexamples;
6. the fast, integration, acceptance, and Nix gates invoke no Python tool; and
7. repository-owned `src/`, `tests/`, and `scripts/` contain no `.py` files and
   `pyproject.toml` is absent.

The claim is falsified by output drift hidden as a generated refresh, a
weakened validation or custody rejection, an untyped thrown boundary failure,
an Effect v3 resolution, a Python compatibility shim, or a gate that passes
without exercising the replacement.

Vendored or acquired reference checkouts under `.references/` are external
evidence and are not rewritten by this migration.

## Frozen deep-module contract

### Runtime and dependency baseline

- Default runtime and package manager: the repository-pinned Bun release.
- Alternative runtime: the repository-pinned Node release. Runtime-specific
  packages provide only live platform layers; semantic programs do not import
  Bun or Node capability APIs.
- Language: strict TypeScript with the repository-pinned TypeScript release.
- Effect: exact `effect@4.0.0-beta.102`, the npm `beta` tag observed on
  2026-07-30. Because v4 is pre-stable, upgrades are explicit reviewed changes,
  never a range update.
- Formatting and linting: Oxfmt and Oxlint. Correctness, suspicious, and
  performance categories are denied, with explicit reviewed exceptions.
- Effect-specific type diagnostics use `@effect/tsgo`, the Effect language
  service distribution for TypeScript 7. Fast repository-specific syntax and
  architecture rules use a local Oxlint plugin authored with
  `effect-oxlint`; neither substitutes for the other.
- Tests: `bun test`.

The Effect project and `effect-smol` v4 implementation were evaluated as
license-compatible MIT prior art. Existing Bun, TypeScript, Oxfmt, and Oxlint
scaffolding is reused. No second CLI, schema, test, or task framework is added
unless a later slice demonstrates a capability that Effect v4 and Bun cannot
provide.

### Architecture boundary

Pure graph algorithms, normalization, resolution decisions, and deterministic
rendering remain ordinary total TypeScript functions. Effect is used where it
adds semantic information:

- `Schema` for untrusted document boundaries;
- `Effect` error channels for fallible operations;
- portable Effect platform services for filesystem, Git process, lock, clock,
  terminal, and network capabilities, with Bun and Node live layers selected
  only at runtime composition entrypoints;
- scopes for acquired resources and cleanup;
- structured concurrency for bounded parallel work.

Using Effect does not relabel tests as proofs, assumptions as validation, or
runtime success as semantic authority.

Ordinary Oxlint rules cannot establish Effect type properties. The
Effect-specific static boundary therefore has two complementary gates:

- type-aware `@effect/tsgo` diagnostics, including floating effects and invalid
  error or requirements channels; and
- syntax/architecture rules that reject runtime capability imports in the
  portable core, Effect execution outside composition entrypoints, untyped
  external JSON decoding, and ambient nondeterminism where an Effect service
  exists.

Custom-rule suppressions must state the local reason and unused suppressions
fail lint.

### Migration slices

Migration proceeds in behavior-preserving vertical slices:

1. **Project model** — load, validate, report, schedule, generate, and
   generated-view drift checking.
2. **Inventory tracer** — canonicalization, theory/realization loading,
   evidence, resolution, execution, explanations, and CLI.
3. **Independent checker** — recut against the TypeScript resolver only after
   the production resolver boundary is stable; its frozen independence and
   size gates are not weakened by the language migration.
4. **Reference custody** — catalog, lockfile, Git acquisition/materialization,
   verification, curator locking, status, and CLI.
5. **Development controls** — migrate policy tests, check orchestration,
   feature acceptance implementations, docs, model evidence commands, and
   package metadata to executable Bun TypeScript.
6. **Legacy script removal** — delete superseded Python and shell
   sources/tests/configuration only after parity gates for every owning slice
   pass. Tiny externally required bootstrap launchers remain explicit
   exceptions and contain no project logic.

During a slice, the existing Python implementation is a temporary
differential oracle, not a permanent runtime fallback. New behavior is
implemented only in TypeScript.

### Compatibility and evidence

- Existing canonical model and example documents remain the inputs.
- Generated files must compare byte-for-byte unless an explicit semantic diff
  revises their contract.
- Existing CLI success/failure observations and exit codes remain stable where
  documented.
- Reference lock entries retain schema identity and source-content meaning.
  A generator-name change is a metadata migration and must not silently rewrite
  locked source facts.
- Frozen historical plans remain historical records. Active commands, current
  documentation, and canonical evidence are updated when their owning slice
  becomes authoritative.

### Unsupported claims

This migration does not claim that Effect v4 is stable, that TypeScript makes
the semantic core formally verified, that Bun and Node are cross-platform
identical, that lint establishes semantic correctness, or that a passing
differential test proves full semantic equivalence. Those are assumptions or
bounded test evidence unless separately established.

## Oracle first

For each slice, capture positive, rejection, adversarial, deterministic-output,
and CLI-exit observations before deleting the Python implementation. The first
project-model slice must demonstrate:

- canonical model entity/relation counts and representative identities;
- zero validation errors on the canonical model;
- byte-identical eight generated views;
- the same ready frontier and weighted critical-path endpoint;
- typed failure for missing model directories, malformed JSON, invalid shapes,
  and duplicate entity IDs; and
- `validate`, `report`, and `generate --check` CLI exit behavior.

At least one oracle must be shown red for the intended missing TypeScript
behavior before implementation becomes authoritative.

## Acceptance

Run:

```bash
just accept 0010-typescript-effect-v4-runtime
```

The acceptance implementation verifies the exact Effect v4 pin, TypeScript static
checks, all Bun tests, active CLI previews, generated equality, absence of
repository-owned Python and project-logic shell scripts, Python-free Nix/check
configuration, and the full integration loop.
