---
format: semantic.feature-artifact/v1
feature_id: 0004-reference-source-custody
kind: specification
legacy_entity_id: work.reference-source-custody
---
# Design spec 0004: reference-source custody

Status: active

Problem owner: main research and integration agent

Semantic frontier: external-source provenance and reproducible research custody

## User journey

A researcher names a catalogued Git source, resolves it once to exact committed
bytes, and later materializes and verifies those same bytes offline. The report
distinguishes a verified materialization from an unlocked, dirty, drifted, or
locally observed source. Normal project builds remain independent of all
reference repositories.

## Falsifiable claim

For a catalog source with an explicit update selector and license artifact
paths, the custody tool:

1. resolves the selector to a full Git commit and tree;
2. hashes the declared license bytes from that committed tree;
3. atomically records those observations in a deterministic checked-in lock;
4. materializes only the locked commit under the ignored cache; and
5. verifies without network or mutation that the checkout is detached, clean,
   exact, and contains the locked license bytes.

The claim is falsified if a moving branch changes materialized content without
a lock change, catalog provenance drift is accepted, modified license bytes or
a dirty checkout pass, offline verification opens the network, failed work
damages a valid lock or checkout, or normal validation needs a reference clone.

## Values

- A branch is an update selector, never an evidence pin.
- Catalog intent, observed custody, bibliography, semantic suitability, and
  legal compatibility are distinct.
- Exact committed bytes outrank mutable working-tree observations.
- Mutations are atomic and fail closed.
- Reference repositories are optional research inputs, never build inputs or
  semantic authorities.

## Frozen deep-module contract

### Catalog boundary

`references/sources.toml` is human-authored research intent. A lockable source
adds:

- `track`: the explicit Git ref to resolve;
- `license_paths`: every license artifact to preserve;
- optional `origin_aliases`: exact alternate remote spellings accepted only
  when acquiring from a local sibling.

IDs are path-safe dotted identifiers. License paths must be relative,
normalized, unique, non-symlink blobs inside the commit. Missing custody fields
leave a source queued and unlocked; they do not make the catalog invalid.

`references/refs.bib` remains the only bibliography. Neither file is evidence
of correctness, authorship, compatibility, or permission to copy code.

### `reference-lock-v1`

`references/sources.lock.json` is generated and checked in. It contains a
schema version, generator identity, and entries keyed by source ID. Each entry
contains:

- declared origin, tracked ref, and resolved ref;
- full commit and tree object IDs plus Git object format;
- a SHA-256 digest of the complete canonical catalog record;
- retrieval timestamp and acquisition kind;
- whether the declared origin commit was remotely verified;
- for every declared license artifact: Git mode, byte length, and raw-blob
  SHA-256.

Duplicate JSON keys, abbreviated object IDs, missing fields, unsafe paths, and
unknown schema versions are invalid. A no-op re-lock preserves both bytes and
timestamp. License hashes identify inspected bytes only; they are not legal
analysis.

The lock is an observation derived from catalog intent plus Git objects, not a
pure projection. It is mutated only by `lock`, through a temporary file and
atomic replacement.

### Commands

```text
semrefs catalog-check
semrefs lock <id>|--all [--offline]
semrefs materialize <id>|--all [--offline] [--allow-history-fallback]
semrefs status <id>|--all [--lock-only] [--json]
```

- Commands require an explicit ID or `--all`.
- `catalog-check` and `status` are network-free.
- `lock` alone mutates the checked-in lock.
- `materialize` alone mutates `.references/`.
- `status` never mutates.
- strict status returns nonzero for unlocked, absent, dirty, mismatched, or
  unverifiable materializations;
- `--lock-only` verifies lock structure, catalog derivation, exact pins, and
  license metadata without requiring a checkout.

Human-readable states are `queued_unlocked`, `locked_unmaterialized`,
`materialized_verified`, `materialized_with_visible_assumption`, `drifted`,
and `unverifiable`.

### Safe acquisition

Remote acquisition resolves with Git, uses a tool-owned temporary repository
under `.references/`, fetches shallow blobless content without tags, checks out
the exact commit detached, validates tree and license blobs, then atomically
renames the cache.

Offline acquisition may read a declared local sibling or an existing local Git
object cache and must not fall back to network. Local remote identity must equal
the declared origin or an explicit catalog alias. Accepted observations inspect
committed objects, never uncommitted sibling files.

Materializing an old locked commit first tries an exact shallow fetch. It may
use the recorded ref only if that ref still resolves to the locked commit.
Broader blobless history requires `--allow-history-fallback`. The tool never
initializes submodules, hydrates Git LFS, runs repository hooks, prompts for
credentials, executes shell strings, or destructively repairs a mismatch.

A curator lock under `.references/` prevents concurrent mutation within one
working directory. Concurrent curators require separate worktrees and caches.

## Oracle first

Tests construct temporary local Git repositories; no test needs network.

Required positive scenario:

1. lock a repository at commit A;
2. advance its branch to commit B;
3. materialize and verify commit A offline;
4. observe that only an explicit re-lock can select B.

Required minimal rejections:

- unsafe or duplicate source IDs and license paths;
- missing strict lock entry;
- malformed or abbreviated commit;
- catalog origin, selector, or license-path drift;
- checkout at a different commit;
- dirty checkout;
- missing, changed, or symlinked license;
- local remote mismatch;
- unavailable offline object.

Required adversarial cases:

- a failed fetch cannot overwrite a valid lock or cache;
- uncommitted sibling content cannot affect committed hashes;
- multiple license artifacts must all verify;
- submodule and LFS pointers cannot masquerade as fully materialized content;
- local-only custody remains visibly weaker than remote-verified custody.

## Visible command

```bash
PYTHONPATH=src python -m semantic_references status local.lang-bang
```

After an explicit offline lock and materialization, it reports the canonical
origin, exact commit and tree, license artifact digests, acquisition status,
and `materialized_verified` or a visible weaker assumption.

## Acceptance

1. All positive and adversarial fixtures pass without network.
2. Lock output is deterministic and no-op locking is byte-identical.
3. Catalog drift, checkout drift, dirt, and license drift fail strict status.
4. Offline paths are demonstrably network-free.
5. Failed operations preserve prior valid artifacts.
6. The package uses only Python's standard library and Git unless a measured
   design revision justifies more.
7. Normal `scripts/check.sh` works with `.references/` absent.
8. The visible local-source scenario succeeds.
9. An independent reviewer injects branch movement, checkout dirt, catalog
   drift, and license mutation.

## Evidence claim and limits

Fixture tests are `example_test`; an actual status run is
`runtime_validation`. A Git object ID binds bytes but does not establish
authorship, origin truth, semantic correctness, legal compatibility, complete
history, submodule contents, or LFS payloads.

## Frozen boundaries and non-goals

Do not change semantic theory identity, evidence categories, resolver policy,
the project graph vocabulary, research conclusions, bibliographic authority,
or ordinary build inputs. Do not infer SPDX identifiers, legal compatibility,
or adoption suitability. Provider APIs, registry services, archive mirrors,
signatures, submodule recursion, and LFS hydration are out of scope.

## Kill criteria

- A branch name is treated as a stable pin.
- Status or materialization rewrites the lock.
- License bytes are hashed from a mutable working tree.
- Offline mode can access the network.
- Failed work can destroy a valid artifact.
- Normal builds depend on external repositories.
- The tool silently widens shallow fetches or repairs mismatches.
- Local-only observation is reported as remotely portable.
- The implementation requires provider-specific APIs or material dependencies
  without a measured justification.

## Semantic diff

This contract adds reproducible custody states and exact source/license-byte
bindings for external research artifacts. It grants those artifacts no theory,
realization, evidence, trust, licensing, or adoption authority.
