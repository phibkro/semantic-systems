# Execution plan 0010: TypeScript, Bun, and Effect v4 runtime

Design: `design-specs/0010-typescript-effect-v4-runtime.md`

Status: in progress

Owner: main integration agent

## Current state

- Frozen migration contract: complete.
- Exact Effect v4 pin: `effect@4.0.0-beta.102`.
- Existing reusable tooling: Bun 1.3.13, TypeScript 7.0.2, Oxfmt 0.61.0,
  Oxlint 1.76.0.
- Operator amendment: Bun remains the default runtime and package manager;
  Node is a supported alternative supplied through official Effect platform
  live layers.
- Oxlint now denies correctness, suspicious, and performance categories plus
  selected TypeScript, Unicorn, Import, and Promise rules. Effect-aware
  `@effect/tsgo` diagnostics and the local architecture plugin remain
  dependency-gated.
- Remaining Python surface: reference custody's remote acquisition,
  materialization, checkout verification, and the checkout-inspecting half of
  status; online/general `lock`, `materialize`, and its test module; plus
  transitional Nix/fast/integration wiring.
  Catalog/lock parsing, atomic lock writing, the interoperable curator guard,
  transactional offline locking from local siblings or managed object caches,
  and network-free `status --lock-only` are now TypeScript (see item 6 below).
  Project model, tracer, and governance tests are TypeScript.
- External `.references/` checkouts are excluded from repository-source
  migration.

## Owned paths

- `design-specs/0010-typescript-effect-v4-runtime.md`
- `plans/active/0010-typescript-effect-v4-runtime.md`
- `scripts/accept/0010-typescript-effect-v4-runtime.ts`
- `src/**/*.ts`
- `tests/**/*.test.ts`
- project toolchain/check/Nix configuration
- current documentation and canonical command/evidence references
- superseded repository-owned Python files when their slice is accepted

Other active feature worktrees and their owned files remain forbidden.

## Work queue

1. Pin Effect v4 and freeze the migration contract. **Complete.**
2. Implement the project-model vertical slice with differential/golden oracles.
   **Complete.**
3. Switch project-model active commands and gates after focused parity passes.
   **Complete for host/active commands; the Nix derivation remains a declared
   transitional differential oracle until dependencies are hermetically
   packaged.**
4. Implement the inventory-tracer vertical slice. **Complete; the former
   Python package and test suite were removed after exact result differential
   parity and a final pinned Python oracle pass.**
5. Recut the independent checker against the accepted TypeScript resolver.
6. Implement reference custody with explicit Git/filesystem/lock services.
   **Catalog/lock/status-lock-only boundary complete** (`src/references/`):
   `sources.toml` parsing/validation, `reference-lock-v1` parsing, canonical
   catalog digests, atomic lock writing, network-free `status --lock-only`,
   offline local-sibling and managed-cache Git observation, an interoperable
   kernel curator guard, and all-or-nothing offline lock publication now run
   on Effect v4 under Bun and Node. The
   parsing/status/writer suite remains differential against the Python oracle;
   Git security boundaries use adversarial fixtures and deliberately exceed
   Python where review exposed shared defects. Remote acquisition,
   materialization, checkout verification, and the remaining
   `lock`/`materialize` CLI surface remain Python and are the rest of this
   item.
7. Migrate development-control and policy tests to Bun. **Complete for
   development-control and reuse-first governance; custody tests remain with
   their owning implementation slice.**
8. Migrate repository-owned shell orchestration and executable acceptance to
   Bun TypeScript, revising governance 0005 atomically. **Complete: checks,
   acceptance programs, and Git hooks are executable Bun TypeScript; Just is
   the pinned declarative task surface.**
9. Remove Python packaging, source, tests, Nix dependencies, caches, legacy
   shell logic, Makefile indirection, and active command references.
10. Run exact acceptance, independent review, semantic/evidence audit, preview,
    and integration gates.
11. Replace direct Bun/Node capability use in semantic programs with portable
    Effect platform services; compose official Bun and Node live layers at
    entrypoints and prove equivalent bounded observations. **Complete for the
    project-model and inventory-tracer slices; reference custody remains.**
12. Install compatible exact `@effect/tsgo` and `effect-oxlint` releases,
    enable type-aware Effect diagnostics, and add tested local rules for
    portable-core imports, runtime execution boundaries, Schema decoding, and
    ambient nondeterminism. **Complete for the project-model and inventory
    tracer slices.**

## First-slice gates

```bash
bun test tests/project-model.test.ts
bun run typecheck
bun run semproj -- validate
bun run semproj -- generate --check
git diff --check
```

The existing generated directory is the byte-for-byte golden oracle. Python
remains installed only as a temporary differential oracle until the slice is
accepted; no new Python implementation is permitted.

## Reuse and prior art record

- Reused the existing Bun/TypeScript/Oxc repository scaffold.
- Selected Effect v4 core `Schema`, typed errors, effects, scopes, and services
  rather than adding unrelated schema/error/task libraries.
- Reviewed Effect's official repository and v4 migration sources; MIT license
  is compatible.
- Selected official Effect portable platform services with Bun and Node live
  layers rather than an owned filesystem abstraction. Exact compatible beta
  adapter pins will be reviewed together before installation.
- Evaluated and installed exact `effect-oxlint` 0.3.3 (MIT) as the Effect v4 toolkit for local
  Oxlint rules. It complements rather than replaces official `@effect/tsgo`
  diagnostics because Oxlint JavaScript plugins do not currently receive
  TypeScript type information. The older `@effect/language-service` package
  was rejected because the official documentation routes TypeScript 7 users
  to `@effect/tsgo`.
- Reviewed `joelhooks/effectts-skills` at
  `0a7a0d984033fa6d6ff4ef2b50bdd9eb06a3a6c5` as MIT-declared prior art.
  Reused its source-first posture and independently corroborated guidance on
  typed errors, single composition boundaries, injected nondeterminism, and
  stricter TypeScript flags. It was not copied or installed: the checkout has
  no license-text file, and several claimed latest-v4 examples are stale or
  internally inconsistent with exact Effect beta.102 (`ServiceMap.Service`,
  pre-TS7 `@effect/language-service`, the old `TaggedErrorClass` call shape,
  and ambient `crypto.randomUUID()` inside an Effect generator). The UUID call
  is correctly deferred because `Effect.gen` is implemented with
  `Effect.suspend`; its remaining issue is ambient, non-replaceable authority,
  not eager evaluation. Security-sensitive UUIDs use the injectable
  `Crypto.Crypto` service, while deterministic non-cryptographic tests may
  replace `Random`.

## Risks

- Effect v4 beta APIs may change; exact pins and static checks contain drift.
- Differential tests can preserve accidental behavior; the frozen semantic
  contract and adversarial oracles decide intended compatibility.
- Reference custody has substantially more filesystem/Git race and safety
  surface than the first two slices; it is migrated after the local semantic
  core is stable.
- The full acceptance gate remains intentionally red until the final
  Python-removal slice.

## Log

- 2026-07-30: operator selected TypeScript, Bun, and specifically Effect v4.
- 2026-07-30: npm registry independently reported `beta` as
  `4.0.0-beta.102`; exact dependency installed.
- 2026-07-30: inventory found 35 repository-owned Python source modules and
  five Python test modules across project model, tracer, custody, and controls.
- 2026-07-30: project-model Bun tests passed 7/7; all eight views matched
  byte-for-byte; `validate`, `report`, and `generate --check` matched Python
  stdout and exit status exactly. Active host commands now use Bun/Effect v4.
- 2026-07-30: inventory tracer result JSON matched Python exactly, including
  resolution, evidence, counterexamples, execution, assumptions, and
  explanation. The TypeScript platform semantic diff recomputed both
  realization identities and updated every canonical binding; 13 tracer tests
  and the final pinned Python differential suite passed before deletion.
- 2026-07-30: development-control and reuse-first governance moved to 15 Bun
  tests. The mixed transitional integration loop passed 68 custody Python
  tests; the integration script now runs Bun tests as an authoritative gate.
- 2026-07-30: operator expanded the target to repository-owned shell logic.
  Check orchestration and executable feature acceptance will move to Bun
  TypeScript; only pre-Bun or externally fixed bootstrap launchers may remain.
- 2026-07-30: replaced all repository shell programs under `scripts/` and
  `.githooks/` with typed Bun entrypoints, replaced the Makefile with a thin
  `justfile`, pinned Just in the Nix shell, and migrated acceptance identity
  from `.sh` to `.ts` across the validator, dispatcher, tests, hooks, CI, docs,
  and checked Clamor adaptation provenance. Focused governance tests,
  typecheck, lint, formatting, and provenance conformance pass; pinned
  Actionlint/integration remain deferred while live Agda Git custody drives
  elevated I/O pressure.
- 2026-07-30: an independent read-only GPT-5.6 Sol audit found controlled-error,
  deleted-oracle, acceptance-authority, stale-migration, and Just-dispatch
  defects. The project-model boundary and CLI grammar were repaired; deletion,
  rename/copy, zero-plan, and removed-plan oracles were restored; migration
  authority is now range-bound; direct Just acceptance uses validated,
  non-shell dispatch; and acceptance verifies exact Effect manifest/lock pins,
  scans active TypeScript/CI entrypoints, and invokes the declared Nix gate.
  The deleted executable-mode, provenance, hook-environment, and fresh-checkout
  installation oracles were then restored. Focused development-control tests
  pass 22/22 and typecheck/diff checks pass. Effect capability services and the
  derivation-invariance oracle remain open; broad and Nix gates remain deferred
  under elevated I/O pressure.
- 2026-07-30: strengthened the inventory tracer document boundary from a
  top-level unknown record to kind-specific Effect Schemas for theories,
  realizations, evidence suites and cases, policies, and scenarios while
  preserving the original JSON documents for canonical identity. A nested
  malformed `theory.laws` counterexample now fails at schema decoding. Focused
  tracer tests pass 14/14 and typecheck/diff checks pass.
- 2026-07-30: operator required a swappable Bun/Node runtime boundary. The
  contract now targets portable Effect platform services and confines official
  live layers to composition entrypoints; the provisional owned filesystem
  adapter was removed before adoption.
- 2026-07-30: enabled an Oxlint baseline that denies correctness, suspicious,
  and performance categories plus high-signal TypeScript/Promise/import rules,
  reports unused suppressions, and passes the current TypeScript tree in 0.2s
  on one thread. Blanket `no-await-in-loop`, mutable-array replacement, and
  promise-chain style rules remain explicitly off pending semantic rewrites.
  Official `@effect/tsgo` diagnostics and tested `effect-oxlint` architecture
  rules are the next static-safety slice after compatible exact versions can
  be installed without worsening elevated I/O pressure.
- 2026-07-30: installed exact TS7-compatible `@effect/tsgo` and official Bun
  and Node Effect platform layers. An idempotent explicit setup now attaches
  Effect diagnostics after lifecycle-script-free installs and a read-only
  fast-loop check fails if the compiler is unpatched. Project-model filesystem
  and path capabilities moved to official Effect services; real Bun and Node
  entrypoints validate the same 119 entities and 171 relations, and a
  bounded layer-equivalence oracle compares all generated views.
- 2026-07-30: activated five tested `effect-oxlint` project rules for portable
  runtime imports/globals, Effect execution/provision boundaries, Schema JSON
  decoding, ambient nondeterminism, and thrown portable failures. The thrown
  failure oracle found a genuinely partial cyclic-graph path; topological
  ordering now reports `undefined` and longest-path returns no fabricated
  result. Exact TSGO diagnostics enforce additional v4/capability rules on the
  portable slice, and TypeScript now enables exact optional properties,
  no-unused locals, implicit-override checks, forced module detection, and
  verbatim module syntax.
- 2026-07-30: moved the inventory tracer's JSON loading, path resolution, and
  SHA-256 content identities onto official Effect FileSystem, Path, and Crypto
  services. Separate Bun and Node entrypoints now compose only their live
  platform layers. Fifteen focused tracer tests preserve the accepted
  identities and rejection behavior, a live-layer oracle compares the complete
  result under Bun and Node, and the pinned Node 24.18.0 entrypoint completes
  the real inventory journey with the same selected realization.
- 2026-07-30: widened the tested Effect Oxlint portability rules from the
  project model to the inventory tracer, excluding only the explicit Bun and
  Node composition roots. Ambient clock, random, crypto and fetch access is
  rejected because it bypasses injectable capability services. The rule does
  not misclassify `Effect.gen` as eager: v4 constructs it through
  `Effect.suspend`; ordinary generator statements run when the runtime advances
  the iterator, while a yielded `Effect.sync` thunk runs when that Effect is
  interpreted. Both `crypto.randomUUID()` and
  `globalThis.crypto.randomUUID()` now have regression oracles, while the
  injected `Crypto.Crypto.randomUUIDv4` description remains valid. The strict
  TSGO Effect/capability diagnostics and Schema-over-JSON rule now cover the
  tracer as well as the project model. Focused rule and tracer suites pass
  20/20, and typecheck, full lint, formatting, and diff hygiene are green.
- 2026-07-30: implemented the first frozen reference-custody vertical slice
  (`src/references/`): `sources.toml` parsing/validation (path-safe IDs,
  normalized/unique license paths, git-safe origin/track/aliases, paired
  track+license_paths), `reference-lock-v1` parsing (duplicate-key rejection,
  exact full object IDs, safe paths/modes, unknown-schema failure), and
  network-free `status --lock-only` (`queued_unlocked`/`drifted`/
  `locked_unmaterialized`). TOML decoding is a portable `TomlParser` Effect
  service with Bun (`Bun.TOML.parse`) and Node (`toml` package) live layers
  confined to `toml-bun.ts`/`toml-node.ts`, composed only in `main-bun.ts`/
  `main-node.ts`; JSON's silent last-value-wins on duplicate keys has no
  standard-library escape hatch, so `strict-json.ts` is a small hand-written
  duplicate-key-rejecting parser (the TOML hand-roll ban did not apply — a
  license-compatible pure-JS TOML parser was reused instead, see below).
  Canonical catalog digests replicate Python's
  `json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=True)`
  byte-for-byte, verified against all 23 real `references/sources.toml`
  entries plus an astral-Unicode regression that requires Python-compatible
  UTF-16 surrogate-pair escapes. Reuse: `toml@4.3.0` (MIT, TOML v1.1.0 compliant) was already an
  installed transitive dependency of `effect` itself; promoted to an exact
  direct pin rather than adding a new package. `tests/reference-custody.test.ts`
  (36 tests) differentially oracles every accept/reject and status decision
  against the still-installed Python `semantic_references` package via
  subprocess (real repo catalog+lock byte/JSON parity, constructed-fixture
  drift scenarios, and adversarial duplicate-JSON-key/duplicate-TOML-key/
  abbreviated-object-id/unsafe-path cases), plus pure unit coverage of every
  validation predicate. `bun test`, `bun run typecheck`, and `bun run lint`
  are green; `oxfmt` formatted only the owned files. Exact-head TSGO initially
  reported 28 `unnecessaryFailYieldableError` suggestions: the tagged custody
  errors are themselves Effect v4 yieldables, so `yield* Effect.fail(error)`
  was replaced with direct `yield* error`; type checking now emits no
  diagnostics and the 36-test differential suite remains green. The exact pinned Node
  24.18.0 runtime independently executed `main-node.ts catalog-check` against
  the real repository catalog and reported the same 23 validated sources;
  automated Bun/Node parity remains part of the later full runtime gate. Out
  of scope for this slice, still Python:
  Git acquisition/materialization, the curator lock, checkout verification,
  and the `lock`/`materialize` CLI commands (and the checkout-inspecting half
  of `status`) — `catalog.py`, `lockfile.py`, and the lock-only path of
  `status.py` were left in place rather than deleted, since Python's CLI is
  still the only implementation of the commands that exercise them
  end-to-end (`lock`, `materialize`, non-`--lock-only` `status`) and design
  spec 0010 requires deleting a superseded module only after its slice's own
  parity gate passes, not merely after one path through it is reproduced.
- 2026-07-30: extended the custody slice with canonical lock serialization and
  atomic writing. A shared canonical JSON encoder now preserves recursive
  Unicode-code-point key ordering, Python-compatible ASCII/surrogate escaping,
  compact catalog-digest bytes, and indented lock bytes. The writer reuses
  Effect v4's portable `FileSystem` file handles and scoped temporary-file
  lifecycle: it writes in the destination directory, flushes with `sync`,
  closes before one rename, makes byte-identical writes true no-ops, and
  removes temporary artifacts on failure. Differential lock bytes (including
  astral Unicode), lossless arbitrary-size JSON integers, rejection of
  integer-valued exponent floats, stable inode on a no-op, and an injected
  rename defect that preserves the prior artifact and cleans the temporary
  directory raise the focused custody suite to 40 passing tests. Typecheck,
  Oxlint, Oxfmt, and the exact pinned Node catalog command are green. This
  writer is not yet exposed by the CLI; the later Git-acquisition slice remains
  the only authority that may construct and commit new observations.
- 2026-07-30: ported the first Git-touching custody tracer bullet: offline
  observation of a declared, origin-matched local sibling. The portable core
  uses Effect v4 `FileSystem`, `Path`, `Crypto`, `Clock`, and the official
  `ChildProcessSpawner`; the ambient process environment is captured only by
  an injected `GitEnvironment` capability that reconstructs Git's environment
  from an allowlist. Shell execution, inherited Git configuration, prompts,
  helpers, SSH/scp spellings, and every offline transport scheme are denied.
  Replacement refs are disabled so a local repository cannot substitute a
  different tree or license blob while the lock records the original commit
  ID. Ref advertisement runs from a scoped neutral directory below
  `GIT_CEILING_DIRECTORIES`, preventing repository-local
  `url.*.insteadOf` configuration in the invoking checkout from rewriting a
  local path into another local repository or an online transport. HTTPS is
  independently disabled in Git itself for every offline invocation. Local
  origin identity is read as exactly one raw `remote.origin.url` from the
  repository config, with URL rewrites and included config disabled.
  The lock is derived exclusively from the selected commit/tree and regular
  committed license blobs; dirty working-tree bytes are irrelevant, and a
  byte-identical observation retains the prior custody timestamp. Adversarial
  tests cover environment poisoning, transport syntax, committed object
  custody/stable reuse, remote-origin mismatch, and replacement-ref
  substitution. Local-to-local `insteadOf` attacks demonstrate both ref and
  origin-identity rewrites without opening network; a protocol canary proves
  Git rejects HTTPS before transport; multiple raw origins fail closed; and
  NUL-delimited tree parsing preserves non-ASCII/control-bearing paths
  independently of `core.quotePath`. These counterexamples raise the focused
  suite to 50 passing tests. The Python implementation shares several of the
  exposed defects, so the new Git security oracles are intentionally not
  described as Python parity. This slice deliberately does not expose the
  mutating `lock` CLI: publication must remain serialized until the curator
  lock and multi-source transaction are ported.
- 2026-07-30: ported the curator and local-sibling publication dependency,
  making the first mutating custody tracer bullet executable as
  `semrefs lock <id>|--all --offline`. An Effect-scoped holder uses
  util-linux `flock --no-fork` on the same persistent
  `.references/.curator.lock` inode as Python; it never truncates or writes
  that file. A readiness file is created only after `flock` atomically
  acquires the kernel lock and execs the Bun/Node holder, avoiding
  stream-readiness and scheduler races. The complete mutation races against
  unexpected holder exit, so loss of the inherited kernel-lock descriptor
  interrupts publication; scope release then kills the healthy holder and
  waits for descriptor closure. Stable root/lock symlinks and multiply-linked
  lock inodes fail closed. The process command and allowlisted environment are
  injected capabilities; shell strings are never used. util-linux was chosen
  over a native Node addon or a stale lock-directory protocol because it is
  already installed, preserves crash-release semantics, and interoperates
  during the Python transition; the Nix development shell pins it on Linux.
  A non-Linux curator layer remains required before claiming the declared
  Darwin platforms support mutation.
  The command observes every selected local sibling into memory before one
  canonical atomic lock write. Any failure leaves prior lock bytes unchanged;
  this slice has no object-cache mutation to roll back. Oracles cover nested
  curator conflict/release, live Python-vs-TypeScript exclusion, preservation
  of the Python-format lock file, symlink and hardlink attacks, failed
  two-source rollback followed by successful publication, forced loss of a
  ready holder during a real lock transaction with byte-identical rollback,
  and a real Node lock followed by a byte/inode-stable Bun re-lock. The initial
  bounded gate passed 57 focused tests under Bun alongside TypeScript, oxlint,
  formatting, and diff-hygiene checks. Exact-head review then exposed the
  holder-supervision gap, the Node no-op oracle, and a false-pass path in the
  first holder-loss oracle; their corrections pass the same static gates and
  59 focused tests. Object-cache fallback and remote/cache publication remain
  deferred and are stated in CLI usage. Nix and broad integration gates were
  not run while host I/O full pressure remained above 80%.
- 2026-07-30: ported read-only offline fallback to the existing managed
  `.references/<id>/.git-cache`. The implementation first inspects the custody
  root, source root, and cache as real directories without following stable
  symlinks; a present unsafe or non-directory component fails closed. A cache
  that resolves the requested selector is preferred, matching the transitional
  Python oracle; an absent cache or one lacking that selector falls back to the
  declared origin-matched sibling. Both acquisition kinds share one committed
  object, concrete-ref, tree, and license-blob observer and the same
  transport-denying Git capability. No cache bytes are created or mutated.
  The prior Python path helper and resolver order were evaluated and adapted;
  Effect FileSystem/Path and the existing Git service were reused, so no new
  dependency or hand-written runtime adapter was needed.
  Oracles cover cache-only custody, cache preference over a newer sibling,
  selector fallback, source/cache symlink escape, a non-directory cache, and a
  real partial-promisor cache whose missing license blob must fail without
  invoking its executable transport canary. A fresh cache-backed mutation runs
  under Node followed by a byte/inode-stable Bun re-lock. TypeScript, oxlint,
  formatting, diff hygiene, and all 67 focused custody tests pass. Remote cache
  construction/publication and materialization remain deferred. Nix and broad
  integration gates were not run while host I/O full pressure remained above
  80%.
