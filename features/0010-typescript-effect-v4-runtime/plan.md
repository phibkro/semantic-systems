---
format: semantic.feature-artifact/v1
feature_id: 0010-typescript-effect-v4-runtime
kind: plan
---
# Plan 0010-typescript-effect-v4-runtime: TypeScript, Bun, and Effect v4 runtime

Design: `design-specs/0010-typescript-effect-v4-runtime.md`

Owner: main integration agent

## Current state

- Frozen migration contract: complete.
- Exact Effect v4 pin: `effect@4.0.0-beta.102`.
- Existing reusable tooling: Bun 1.3.13, TypeScript 7.0.2, Oxfmt 0.61.0,
  Oxlint 1.76.0.
- Operator amendment: Bun remains the default runtime and package manager;
  Node is a supported alternative supplied through official Effect platform
  live layers.
- Oxlint denies correctness, suspicious, and performance categories plus
  selected TypeScript, Unicorn, Import, and Promise rules. Effect-aware
  `@effect/tsgo` diagnostics and the four local architecture rule families run
  in the fast and integration gates.
- Repository-owned Python packaging, source, tests, and toolchain wiring are
  removed after accepted differential observations were captured as immutable
  TypeScript goldens. Reference custody now runs under Bun and Node:
  catalog/lock parsing, atomic lock writing, the interoperable curator guard,
  transactional offline locking from local siblings or managed object caches,
  atomic offline materialization, checkout verification, and both network-free
  status modes.
  Project model, tracer, and governance tests are TypeScript.
- External `.references/` checkouts are excluded from repository-source
  migration.

## Owned paths

- `design-specs/0010-typescript-effect-v4-runtime.md`
- `plans/completed/0010-typescript-effect-v4-runtime.md`
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
   **Complete: host and active commands use TypeScript/Effect; Nix derivations
   no longer depend on a Python runtime.**
4. Implement the inventory-tracer vertical slice. **Complete; the former
   Python package and test suite were removed after exact result differential
   parity and a final pinned Python oracle pass.**
5. Recut the independent checker against the accepted TypeScript resolver.
   **The producer/resolver boundary and complete `evidence_result_v1` slice 2
   are integrated and independently reviewed: evidence production precedes
   resolution, lossless typed outcomes carry exact semantic bindings and
   visible diagnostics, every bound successful packet is parser-validated
   before eligibility, and the resolver's transitive closure cannot reach the
   producer, execution, or I/O. The serialized `resolution_claim_v1` is
   integrated and independently reviewed as `310c4dd`, `b2772ef`, and
   `bd0e6c3`. The final declarative shared-policy experiment is complete and
   rejected. Its recorded ratio was 156.2%; exact-head review found missing
   checker responsibilities and a conservative corrected ratio of 144.2%,
   still far above the 70% gate. No production checker is selected. The
   frontier is stopped pending explicit design revision; observation
   authentication remains outside the frozen contract.**
6. Implement reference custody with explicit Git/filesystem/lock services.
   **Catalog/lock/offline-lock/offline-materialize/full-status boundary
   complete**
   (`src/references/`):
   `sources.toml` parsing/validation, `reference-lock-v1` parsing, canonical
   catalog digests, atomic lock writing, offline local-sibling and managed-cache
   Git observation, an interoperable kernel curator guard, all-or-nothing
   offline lock publication, offline atomic materialization, checkout
   verification, both network-free status modes, online remote locking, and
   exact/ref/explicit-history remote materialization now run on Effect v4 under
   Bun and Node. The parsing/status/writer suite uses accepted pre-removal
   differential goldens plus live Bun/Node parity; Git security boundaries use
   adversarial fixtures and deliberately exceed the former implementation
   where review exposed shared defects. Remote
   publication is interruption-atomic across cache and canonical lock.
   Annotated-tag peeling and a reserved cache-ref namespace remain localized
   fail-closed follow-ups.
7. Migrate development-control and policy tests to Bun. **Complete for
   development-control and reuse-first governance; custody tests remain with
   their owning implementation slice.**
8. Migrate repository-owned shell orchestration and executable acceptance to
   Bun TypeScript, revising governance 0005 atomically. **Complete: checks,
   acceptance programs, and Git hooks are executable Bun TypeScript; Just is
   the pinned declarative task surface.**
9. Remove Python packaging, source, tests, Nix dependencies, caches, legacy
   shell logic, Makefile indirection, and active command references.
   **Complete after accepted differential observations were captured as
   immutable TypeScript goldens.**
10. Run exact acceptance, independent review, semantic/evidence audit, preview,
    and integration gates. **Complete at integrated head `7c49b7f`: exact
    acceptance, semantic/evidence audit, and independent review passed. This
    runtime migration has no UI preview surface.**
11. Replace direct Bun/Node capability use in semantic programs with portable
    Effect platform services; compose official Bun and Node live layers at
    entrypoints and compare equivalent bounded observations. **Complete for the
    project-model, inventory-tracer, and reference-custody slices; runtime-only
    adapters remain at composition roots.**
12. Install compatible exact `@effect/tsgo` and `effect-oxlint` releases,
    enable type-aware Effect diagnostics, and add tested local rules for
    portable-core imports, runtime execution boundaries, Schema decoding, and
    ambient nondeterminism. **Complete for the project-model, inventory tracer,
    and reference-custody portable slices.**

Feature completion closes the runtime migration, not the stopped checker-policy
frontier in item 5, the annotated-tag and cache-namespace follow-ups in item 6,
or expansion of items 11 and 12 beyond the named portable slices. Those
residues require their own contracts.

## Historical delegated custody slice: remote acquisition and materialization

This section preserves the frozen assignment completed before the final
Python-removal cutover. Its Python references describe the then-current
differential boundary, not an active runtime, command, or authorization.

The slice was frozen against design specs 0004 and 0010. Autonomy was A3:
produce one committed, reviewable TypeScript custody slice in an isolated
worktree based on the exact integration head containing this assignment. It
may complete online `lock` and remote/history-fallback `materialize`; it is not
authorized to delete the Python oracle or perform a real network acquisition.

Owned writes:

- `src/references/**`;
- `tests/reference-custody.test.ts`.

Forbidden writes:

- `src/semantic_references/**`, `tests/test_reference_custody.py`, and
  `pyproject.toml`; the Python implementation remains a read-only differential
  oracle for this slice;
- `references/sources.toml`, `references/sources.lock.json`,
  `references/refs.bib`, and `.references/`;
- all project-model, tracer, generated, model, claim, decision, design, plan,
  uncertainty, Nix, package, hook, CI, and general check/toolchain files;
- custody schema, state names, evidence categories, catalog/lock meaning,
  trusted-origin claims, or the existing offline behavior.

Required behavior:

1. Port remote lock acquisition to portable Effect services. Resolve the
   selected ref coherently, fetch into a scoped sibling temporary managed
   cache, recompute and validate the selected commit/tree/license identities,
   hydrate the complete selected object closure for offline replay, advertise
   only refs backed by that closure, and publish all selected caches plus the
   canonical lock atomically under one supervised curator.
2. Port remote materialization. Try the exact locked commit shallowly, then the
   recorded concrete ref only if it still resolves to that commit. Broader
   blobless history is available only after explicit
   `--allow-history-fallback`. Build and verify a scoped sibling checkout
   before one no-replace atomic publication.
3. Preserve `lock <id>|--all [--offline]` and
   `materialize <id>|--all [--offline] [--allow-history-fallback]` grammar and
   exit behavior. Offline paths remain transport-denied and history fallback
   is never implicit.
4. Keep runtime-specific Bun/Node layers at composition roots. All filesystem,
   path, crypto, clock, process, and environment authority remains injected;
   no ambient runtime capability, shell string, credential prompt, repository
   hook, submodule recursion, LFS hydration, provider API, or unapproved Git
   transport/helper may cross the boundary.
5. Reuse the existing curator, canonical lock writer, path confinement,
   object-identity recomputation, checkout verifier, Git environment, and
   offline materializer. Do not fork a second implementation of those
   semantics.

Required red/green oracles, using only local Git fixtures and executable
transport canaries:

- remote lock produces `acquisition: "remote"` and
  `origin_verified: true`, then its cache materializes the complete locked tree
  offline after the origin disappears;
- branch movement after locking cannot change materialized bytes;
- exact-commit, recorded-ref, and explicit history-fallback materialization
  occur in that order, with moved-ref rejection and no silent widening;
- a later failure in `lock --all`, cache-install failure, or lock-write failure
  restores every prior cache and preserves prior lock bytes;
- selector movement during observation, missing or symlinked license blobs,
  wrong object type/identity, incomplete closure, unsafe path administration,
  destination races, and verification failure publish nothing and leave no
  temporary or backup artifacts;
- custom helpers, SSH/scp spellings, repository programs/configuration,
  prompts, hooks, submodules, LFS hydration, and offline/promisor lazy fetches
  are rejected without executing their canaries;
- SHA-1 and SHA-256 repositories follow the represented lock schema where the
  installed Git supports them;
- equivalent bounded journeys succeed under the pinned Bun and Node live
  layers;
- affected Python observations are compared explicitly, while existing
  intentional security improvements over Python remain documented rather than
  weakened for parity.

Focused acceptance:

```bash
bun test tests/reference-custody.test.ts
bun run typecheck
bun run lint
bunx oxfmt --check src/references tests/reference-custody.test.ts
node src/references/main-node.ts catalog-check
git diff --check
```

Stop rule:

- Stop after the complete bounded local-fixture corpus passes for online lock
  and remote materialization under both live-layer compositions.
- Do not access a real remote, update checked-in custody observations, broaden
  transport policy, delete Python, change Nix/package/check wiring, or begin
  final migration cleanup.
- Preserve counterevidence in the commit if a frozen behavior cannot be ported
  faithfully; do not hide it through a compatibility fallback or weakened
  oracle.

Deliver:

- one focused Conventional Commit and exact head;
- the red observation established before each behavior family;
- Bun/Node and accepted pre-removal differential/golden results;
- atomicity, path-confinement, transport, object-closure, and negative-control
  results;
- evaluated/reused prior art with license/provenance;
- semantic diff and remaining trusted assumptions;
- exact commands, checks not run, deviations, and remaining uncertainty.

## Historical first-slice gates

```bash
bun test tests/project-model.test.ts
bun run typecheck
bun run semproj -- validate
bun run semproj -- generate --check
git diff --check
```

The existing generated directory remains the byte-for-byte project-model
golden oracle. Accepted pre-removal differential observations remain immutable
reference-custody goldens; no Python runtime or implementation is active.

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
  and ambient `crypto.randomUUID()` inside an Effect generator). `Effect.gen`
  defers entry to the generator, but JavaScript still evaluates
  `Effect.succeed(crypto.randomUUID())` as the iterator advances, before that
  `Effect.succeed` value is yielded; only a thunk such as
  `Effect.sync(() => crypto.randomUUID())` captures the operation for the
  interpreter. Ambient authority remains non-replaceable in either form.
  Security-sensitive UUIDs therefore use the injectable
  `Crypto.Crypto` service, while deterministic non-cryptographic tests may
  replace `Random`.

## Risks

- Effect v4 beta APIs may change; exact pins and static checks contain drift.
- Differential tests can preserve accidental behavior; the frozen semantic
  contract and adversarial oracles decide intended compatibility.
- Reference custody has substantially more filesystem/Git race and safety
  surface than the first two slices; it is migrated after the local semantic
  core is stable.

## Log

- 2026-07-30: integrated remote reference lock/materialization as `f77fbe3`.
  The focused corpus passes 143 tests and 617 assertions under bounded
  local-Git fixtures, with typecheck, severe lint, formatting, and Bun/Node
  parity green. Independent review found that external interruption could
  bypass rollback between cache rename and lock write; the accepted amendment
  makes the short network-free publication transaction uninterruptible and
  adds a discriminating interruption oracle. Exact amended-head review
  confirmed the defect closed. Annotated tags and a possible
  `refs/heads/custody` namespace collision remain fail-closed follow-ups.
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
  origin-identity rewrites without opening network; a protocol canary shows
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
  symlinks; only concrete `ENOENT`/`EINVAL` read-link results continue, while
  other inspection failures and any unsafe or non-directory component fail
  closed. A cache must expose exactly one raw `remote.origin.url` equal to the
  declared origin; catalog aliases remain sibling-only. A cache that resolves
  the requested selector is preferred. Only a typed selector-absent probe
  falls back to the declared origin-matched sibling; repository, object, and
  process failures remain visible. Both acquisition kinds share one committed
  object, concrete-ref, tree, and license-blob observer and the same
  transport-denying Git capability. No cache bytes are created or mutated.
  The prior Python path helper and resolver order were evaluated and adapted;
  Effect FileSystem/Path and the existing Git service were reused, so no new
  dependency or hand-written runtime adapter was needed.
  Oracles cover cache-only custody, cache preference over a newer sibling,
  selector fallback, source/cache symlink escape, a non-directory cache, and a
  real partial-promisor cache whose missing license blob must fail without
  invoking its executable transport canary; a positive control first shows
  the blob is absent and that the same read can reach and execute that helper
  when offline denial is absent. The rejected production read preserves a
  recursive cache byte/mode snapshot. Additional oracles reject cache-origin
  mismatch, distinguish selector absence from operational failure, and inject
  a no-follow inspection failure. A fresh cache-backed mutation runs under
  Node; the Bun re-lock preserves a distinctive historical timestamp plus the
  exact bytes and inode, distinguishing content reuse from same-second
  coincidence. Initial exact-head review of `defdf08` exposed the cache
  identity, fallback, no-follow, and evidence gaps; the corrections pass
  TypeScript, oxlint, formatting, diff hygiene, and all 70 focused custody
  tests. Remote cache construction/publication and materialization remain
  deferred. Nix and broad integration gates were not run while host I/O full
  pressure remained above 80%.
- 2026-07-30: ported checkout verification and the checkout-inspecting half of
  `status` to the portable Effect v4 custody core. Full status now derives all
  six frozen custody states without network or mutation and binds a managed
  checkout to a detached exact HEAD, locked commit/tree, clean worktree
  including ordinary untracked dirt, visible index/sparse suppression, every
  committed and working-tree license observation, and complete-tree Gitlink
  and LFS indirections. Stable symlink/path escapes and invalid UTF-8 Git paths
  fail closed. Read-only Git commands retain the sealed environment,
  replacement-ref denial, `GIT_NO_LAZY_FETCH`, and `--no-optional-locks`.
  A red adversarial oracle additionally demonstrated that same-size dirt can
  make `git status` execute a repository-configured clean filter; full status
  now inspects local configuration without includes and rejects executable
  clean/smudge/process filters before comparing the worktree. The Python
  verifier/status modules and existing Git utilities were evaluated as the
  temporary differential oracle; the accepted Effect FileSystem, Path, Crypto,
  process, and Git services were reused without a new dependency or runtime
  adapter. Bun/Python state and exit behavior agree on exact, absent, attached,
  drifted, dirty, hidden-index, verified-origin, tree/license-tampered, Gitlink,
  and LFS fixtures; the exact materialized result also agrees under Node.
  Positive transport canaries show missing promisor objects fail without
  opening their helper, and index bytes/mtime remain unchanged. Remote
  acquisition and materialization remain the next custody slices. All 85
  focused custody tests, exact Effect/TypeScript diagnostics, full Oxlint,
  Oxfmt, and diff hygiene pass; broad and Nix gates remain deferred while host
  I/O full pressure remains above 80%.
- 2026-07-30: resolved the exact-head review of full checkout status. The
  reviewer demonstrated four custody gaps: a raw local `include.path` could
  restore an executable clean filter after the preflight; only declared
  license blobs were forced to establish local availability; checkout `.git`
  administration could redirect repository authority through a gitfile,
  symlinked object directory, worktree/common administration, or alternates;
  and a prefix-only LFS test rejected ordinary prose such as
  `.../specification`. Verification now establishes a contained ordinary
  `.git` directory before invoking Git, rejects external local-config path
  authority with includes disabled, inventories the transport-disabled local
  object database and requires every committed blob to be present, and parses
  only a complete bounded Git LFS v1 pointer from committed and working-tree
  bytes. Small committed blobs are read with bounded concurrency. Effect
  v4 beta.102's Bun child-process stdin/pipeline path was evaluated for a
  selected-object batch but delivered an empty stream under the real Bun CLI;
  Git's no-stdin `--batch-all-objects` inventory was used instead, preserving
  the swappable Bun/Node runtime boundary without a custom adapter.
  Positive controls demonstrate both direct and included filters execute under
  raw Git before the hardened verifier blocks them, and that a missing
  non-license promisor blob can execute its transport helper without offline
  denial. Counterexamples cover gitfiles, `.git` and object-directory
  symlinks, `commondir`, `config.worktree`, alternates, and LFS-like
  non-pointers. The exact checkout index is checked at nanosecond precision.
  All 94 focused custody tests, TypeScript, full Oxlint, Oxfmt, and diff
  hygiene pass. Broad and Nix gates remain deferred while host I/O pressure is
  elevated.
- 2026-07-30: the independent static re-review of `709b7af` returned
  `NEEDS_CHANGES`: nested loose, packed, and split-index symlinks could still
  redirect Git outside managed checkout custody; the all-object inventory
  scaled with unrelated history; and blobs above the LFS parse bound were not
  fully integrity-checked. The correction recursively rejects stable links in
  checkout and managed-cache object storage plus split-index administration,
  scopes object verification to the committed tree, and recomputes selected
  object integrity with bounded 64-OID `git fsck` batches. Only small blobs are
  then read for bounded LFS parsing. Raw-Git positive controls demonstrate
  loose objects, pack files, and shared indexes remain usable through the injected
  symlinks before hardened status rejects them. A same-size valid replacement
  blob remains readable under the expected object path but fails the
  recomputed-OID integrity gate.
- 2026-07-30: ported offline `materialize` as the next substantive custody
  tracer bullet. Catalog-to-lock binding and missing-lock failures occur
  before curator or custody mutation. One supervised curator owns the whole
  selected operation; each absent checkout is cloned without hardlinks into
  a scoped sibling `.materialize-*` directory, checked out at the exact locked
  commit detached with submodule recursion disabled, verified through the
  shared full-status boundary, and atomically renamed into place. A valid
  existing checkout is a no-op; a mismatch is never repaired, overwritten, or
  deleted. Offline source selection prefers a self-contained origin-bound
  managed cache containing the commit, then an origin/alias-bound declared
  sibling. Remote and history-fallback materialization remain unimplemented.
  The Python materializer, Git helpers, path helpers, and CLI were evaluated
  and adapted; existing Effect FileSystem, Path, process, Git, Crypto, and
  curator services were reused, so no dependency or runtime adapter was
  added. Red CLI oracles first observed the missing command. Bun/Node
  counterexamples now cover branch movement after lock, exact no-op reuse,
  byte-stable catalog-drift and mismatch refusal, missing lock/commit,
  cache-only materialization, managed-cache/source-root symlinks, visible LFS
  publication, and a real promisor helper that raw Git can execute but the
  offline materializer cannot. All 108 focused custody tests pass. A final
  integration audit also made operational cache commit-probe failures fail
  closed rather than look absent, and replaced substring-based visible
  indirection classification with exact reason shapes; both new
  counterexamples pass, bringing the suite to 110 tests. TypeScript, Oxlint,
  Oxfmt, and diff hygiene pass. Broad and Nix gates remain deferred while host
  I/O pressure is elevated.
- 2026-07-30: widened the tested Effect/Oxlint portability boundary to the
  TypeScript reference-custody core now that it is substantive, excluding only
  its explicit Bun/Node entrypoints, TOML live-layer adapters, and the
  runtime-neutral curator-holder bootstrap. The red oracle first showed that a
  runtime import, Effect execution, raw JSON parsing, and ambient UUID call in
  `src/references/` escaped the rules. Widening then exposed an overbroad
  nondeterminism diagnostic: zero-argument `new Date()` captures ambient time,
  but `new Date(milliseconds)` deterministically interprets an already
  captured value. The rule now distinguishes those forms without a
  suppression. All six rule tests, full Oxlint, TypeScript, and Oxfmt pass.
- 2026-07-30: the independent exact-`13c1c22` offline-materialization review
  returned `NEEDS_CHANGES`. It confirmed the prior nested-link and large-blob
  fixes, then found that commit/tree identities were not independently
  recomputed, recursive object-storage inspection still scaled with unrelated
  loose history, an ordinary rename could replace an empty directory appearing
  after preflight, local sibling `.git` administration could redirect outside
  the sibling, and a missing `OID^{commit}` was misclassified because Git 2.54
  reports it as fatal exit 128 rather than silent absence.
- 2026-07-30: corrected that review boundary. Exact-object probing now checks
  the undecorated OID for silent absence and separately validates its type, so
  operational corruption fails closed while a valid cache miss falls back to
  the sibling. Siblings pass the same self-contained administration checks as
  checkouts before Git reads their origin or objects. Object administration
  scans only the bounded fanout roots plus pack/info metadata; a directory-wise
  selected-tree walk validates each exact loose-object path before opening it.
  Every selected commit, tree, and blob is then streamed through
  `git cat-file` into an Effect-scoped temporary file and recomputed with
  repository-format-aware `git hash-object --no-filters`; unrelated loose
  history is neither opened nor enumerated. Effect/Bun process-to-process
  piping was re-evaluated and again delivered an empty stream, so the scoped
  file is the smallest portable bounded bridge shared by Bun and Node.
  Publication now uses GNU `mv --no-copy --update=none-fail
--no-target-directory`, preserving same-filesystem atomicity while refusing
  a destination that appears after preflight. New controls cover cache
  miss/sibling fallback, commit and tree substitution, selected versus
  unrelated loose-object symlinks, sibling `.git` redirection, an injected
  no-replace race, source/destination object inode separation, and actual
  gitlink non-initialization. The custody corpus now contains 117 tests; the
  new controls and affected prior controls pass targeted under severe I/O
  pressure.
- 2026-07-30: the independent exact-`abbe0eb` closure-custody review returned
  `NEEDS_CHANGES`. It verified selected commit/tree/blob recomputation, bounded
  unrelated-history behavior, promisor denial, no-hardlink cloning, atomic
  GNU `mv` publication, cleanup, visible gitlink/LFS assumptions, and the
  widened Effect/Oxlint boundary. It found two remaining escapes: a valid
  wrong-type Git object stored under the locked commit OID was treated as
  ordinary cache absence, and loose-reference administration could redirect
  through `.git/refs` symlinks. Integration self-audit also found that managed
  caches rejected repository-local programs and path redirections while local
  siblings did not.
- 2026-07-30: corrected all three findings. Silent exit 1 from the undecorated
  object probe is now the only cache-absence result; any present non-commit
  object is typed corruption. Checkout, sibling, and cache loose-reference
  trees are inspected without following links, while reftable and
  `extensions.refStorage` remain explicitly unsupported until their custody
  format is implemented. Local siblings now reject the same executable
  filters, external includes, and path redirections as managed caches before
  selector observation. Five new red/green controls exercise wrong-type
  corruption, cache and nested sibling reference redirection, sibling external
  configuration rejection, and materialized-checkout reference redirection.
  They pass with 15 affected prior controls; TypeScript, Oxlint, Oxfmt, and
  diff hygiene pass. The custody corpus is now 122 tests. Broad and Nix gates
  remain deferred under severe host I/O PSI despite a nearly idle direct NVMe
  sample and zero Btrfs device errors.
- 2026-07-30: uncertainty 0004's partial disposable checker screen reached 17
  focused tests and 233 assertions after correcting stale authored-identity and
  structural-count omissions. A third fresh exact-head review reproduced the
  configured 406.2%, 449.3%, and 429.2% ratios but rejected their complete
  interpretation: the annotation oracle is not exhaustive, frozen claim/report
  fields are absent, presentation-only ordering is rejected, and the canonical
  adapter is folded into the generic checker. The ratios are retained as lower
  bounds for the current prototypes. No option is selected and no result
  establishes CLM-0002.
- 2026-07-30: integrated the complete current-tracer `evidence_result_v1`
  producer/resolver slice as `2d8f124`, `ba3ce95`, `8b3324e`, `e7dba9d`, and
  `9144e9a`. Exact-head GPT-5.6 Sol review of source head `2a2fec8` returned
  `RESOLVED` with no findings after 50 focused tests/295 assertions,
  TypeScript, and diff hygiene. Resolution now uses the shared Effect Crypto
  parser to revalidate every bound successful producer packet before
  eligibility while preserving earlier binding-error precedence. The same
  targeted gates pass on the integrated head; broad and Nix gates remain
  deferred under severe I/O PSI.
- 2026-07-30: added a scope-aware severe Effect Oxlint rule for ambient
  `console` and `globalThis.console`. It applies only to modules importing
  Effect packages, ignores lexically shadowed console identifiers, and directs
  operational output to structured `Effect.log*`, the replaceable `Console`
  service, or an injected capability. Genuinely developer-only output may use
  a targeted suppression carrying a `dev only:` reason. All three existing
  Effect-bearing violations moved to `Console.log` or `Console.error`. Seven
  focused lint-rule tests, TypeScript, full severe Oxlint, formatting, and the
  full 228-test repository suite pass at `48b388b`. A real CLI probe then
  exposed that Oxlint's built-in global-reference query missed unresolved bare
  `console` while catching `globalThis.console`; `d25d3cf` adds the
  scope-through fallback and a durable regression. Both forms now fail, local
  shadows remain allowed, and a targeted `-- dev only: ...` suppression is
  accepted.
- 2026-08-02: Historical leading status migrated verbatim from the pre-migration plan:
  Status: in progress
- 2026-08-02: candidate `4ab8722` removed the repository-owned Python package,
  tests, packaging, and toolchain dependencies after capturing the accepted
  differential boundary as immutable TypeScript goldens. Independent review
  reproduced all 23 catalog digests, the astral digest, canonical lock bytes,
  catalog-check output, and 23 status reports against the removed implementation.
  The review found no custody or security regression and required this
  follow-up to repair stale plan claims, preserve ignored-cache filtering, and
  make the sandboxed source invariant fail closed. The focused reference gate
  passes 145 tests and 607 assertions with typecheck, severe lint, formatting,
  Bun/Node catalog parity, and a network-free real CLI observation.
  Feature acceptance passes 670 tests and 17,145 assertions plus model,
  generated-view, typecheck, severe-lint, formatting, commit-policy, and native
  Nix source-invariant gates. Garnix returned HTTP 502, so Nix built both
  derivations locally and passed.
- 2026-08-02: final reviewed head `7c49b7f` integrated by fast-forward on the
  primary `feature/typescript-effect-v4-0010` lineage. The exact-head feature
  gate repeated all 670 tests and 17,145 assertions, model and generated-view
  checks, static gates, and both Nix derivations. Independent review returned
  `ACCEPTED` after the multi-license oracle was made discriminating and the
  fail-closed source invariant was fully pinned. No UI preview applies to this
  runtime migration. The canonical feature record now owns positive completion.
