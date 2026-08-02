# Plan 0004-reference-source-custody: reference-source custody

Canonical problem contract:
[`design-specs/0004-reference-source-custody.md`](../design-specs/0004-reference-source-custody.md).
This mutable execution record must not redefine the frozen contract.

## Semantic claim

The falsifiable claim, custody states, deep-module boundary, evidence limits,
semantic diff, and kill criteria are frozen in design spec 0004.

## Current state

- `references/sources.toml` contains 23 research candidates and separates local
  hints from canonical origins. `local.lang-bang` is locked to exact committed
  Git and license bytes; the other candidates remain visibly queued.
- `.references/` is ignored and no normal build reads it.
- `references/refs.bib` is intentionally empty pending accepted primary
  sources.
- `semantic_references` implements catalog validation, deterministic locking,
  offline/online materialization, strict explanatory status, safe cache
  publication, and explicit evidence limits.
- The accepted local scenario materializes `lang-bang` commit
  `5b8e032bcffefb23a3a153d3f5cea99050e589c1` and reports
  `materialized_with_visible_assumption`: the committed bytes are bound, while
  canonical-origin identity remains unverified because acquisition used a
  local sibling.

## Contract-owned implementation slices

1. Catalog and lock parsing with canonical source-record identity.
2. Atomic lock update from exact committed Git objects.
3. Safe offline and remote materialization.
4. Network-free strict status verification.
5. Local Git fixture corpus and adversarial cases.
6. CLI/package plumbing.
7. Main-agent catalog enrichment and first real lock.
8. Independent adversarial review.

Slices 1, 4, and 5 may be explored concurrently. Lock and materialization
mutation integrate serially behind the frozen CLI and schema. The main curator
alone accepts real catalog and lock changes.

## Delegated implementation contract

Autonomy: A3, integration-ready implementation in an isolated worktree.

Required reading:

- design spec 0004;
- `references/README.md`;
- `references/sources.toml`;
- `references/refs.bib`;
- `pyproject.toml`;
- `flake.nix`;
- `scripts/check.sh`.

Allowed writes:

- `src/semantic_references/`;
- `tests/test_reference_custody.py`;
- `tests/fixtures/reference_custody/`;
- `pyproject.toml`;
- `scripts/check-references.sh`.

Forbidden writes:

- `references/sources.toml`, `references/sources.lock.json`,
  `references/refs.bib`;
- `model/`, `generated/`, `research/`, `design-specs/`, `plans/`, `claims/`,
  `decisions/`, `uncertainties/`;
- `src/semantic_tracer/`, `src/semantic_project_model/`;
- `scripts/check.sh`, `flake.nix`.

Stable interfaces:

- the commands, states, catalog fields, `reference-lock-v1`, mutation
  ownership, and evidence limits in design spec 0004;
- ordinary project validation has no clone or network dependency;
- implementation uses Python standard library plus Git.

Acceptance:

```bash
nix develop --command pytest -q tests/test_reference_custody.py
nix develop --command ruff check src/semantic_references tests/test_reference_custody.py
nix develop --command ruff format --check src/semantic_references tests/test_reference_custody.py
nix develop --command pyright
nix develop --command ./scripts/check.sh
```

Deliver:

- committed integration-ready change;
- concise mechanism note and semantic diff;
- exact commands and results;
- checks not run;
- remaining assumptions and uncertainties.

## Main-agent integration

The main agent gates the committed artifact, enriches only known catalog
records, creates and inspects the first real lock and materialization, updates
the canonical graph only after research hard gates pass, runs full validation,
and commissions independent review. Tool output never grants semantic or legal
validity.

## Evidence requirements

- Git fixture tests are `example_test`.
- The visible local-source status is `runtime_validation`.
- Local origin equivalence and Git/Python behavior remain assumptions.
- No proof, authorship, legal, semantic-suitability, or portability claim is
  permitted.

## Risks

- Remote Git behavior differs from local fixtures.
- Canonical catalog hashing accidentally omits a field.
- Origin aliasing becomes permissive normalization.
- Lock mutation and cache mutation are coupled.
- A friendly repair path becomes destructive.
- Exact commits are mistaken for trustworthy content.

## Progress log

- 2026-07-29: Independent read-only analysis froze the smallest custody
  contract, negative corpus, and isolated implementation scope.
- 2026-07-29: Main agent recorded design spec 0004 before implementation
  delegation.
- 2026-07-29: Dispatched an A3 Sonnet implementation to isolated worktree
  `/tmp/semantic-reference-custody-0004` on branch
  `work/reference-custody-0004`, with `/goal` bound to the checked-in contract.
- 2026-07-29: The implementation reached commit
  `94583c4da41ca8eb18c32aaab197bce5a6c1a3fb`; all author-declared tests,
  formatting, type checks, and repository checks passed.
- 2026-07-29: Independent adversarial review rejected that commit for
  integration. Reproduced counterexamples showed that offline Git object reads
  could trigger lazy network fetches; status could execute repository or
  inherited Git configuration and mutate the index; assume-unchanged license
  tampering could pass; a failed multi-source lock could replace a cache while
  preserving its old lock; lock-only validation accepted unsafe and
  catalog-inconsistent entries; materialization mutated before rejecting
  catalog drift; and symbolic-ref resolution was not cross-checked against the
  fetched commit.
- 2026-07-29: The same isolated lane was reopened under the frozen contract.
  Each reproduced counterexample must become a failing oracle before its
  correction. The prior green suite is insufficient evidence.
- 2026-07-29: The correction reached commit
  `0c687da3003a3d3163c56d2482e4a59aac86708f`. Main-agent gates passed with
  52 focused tests, Ruff, Pyright, the full repository check, and the
  reference check. Independent review nevertheless rejected the commit.
- 2026-07-29: The second adversarial review confirmed that all seven prior
  regression classes were closed, including publication rollback after a
  second-cache install failure and an exception in the lock-write body. It
  then reproduced nine remaining contract violations: curator-lock symlink
  truncation; blobless caches unable to replay a non-license blob offline;
  unresolved `resolved_ref` accepted by strict lock-only status; hidden
  assume-unchanged/skip-worktree tampering outside declared licenses; a
  symlinked checkout escaping `.references`; orphan lock entries ignored by
  `status --all`; non-license submodules and LFS pointers reported as fully
  verified; arbitrary custom Git remote helpers executed online; and remote
  SHA-256 repositories represented by the schema but not supported by the
  acquisition path.
- 2026-07-29: The next correction is frozen to those reproduced failures.
  It must add failing oracles first, confine custody paths with no-follow
  operations, validate the catalog-lock relation globally, verify complete
  checkout shape, make an origin-independent replay cache, default-deny
  unapproved transport helpers, support both represented Git object formats,
  and keep crash/syscall/cross-platform limits visible.
- 2026-07-29: The bounded correction was accepted and rebased as
  `e8d771c`. The focused custody corpus passed 68 tests and the complete
  repository gate passed 93 tests with 119 entities, 171 relations, and all
  eight generated views current. The existing unsupported
  `claim.kernel.safety` warning remained visible.
- 2026-07-29: The main curator generated
  `references/sources.lock.json` through `semrefs lock`, then materialized and
  inspected the real offline `local.lang-bang` scenario. Status bound commit
  `5b8e032bcffefb23a3a153d3f5cea99050e589c1`, tree
  `2156309abd48d19e433af8b302238a8424c360ab`, and LICENSE SHA-256
  `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`.

## Decisions and deviations

- This operational frontier is independent of resolver checking and semantic
  research synthesis under decisions 0004 and 0005.
- Local source aliases must be explicit catalog data, not inferred by a
  provider-specific normalizer.
- The first accepted lock is integrated serially by the main curator after the
  implementation and its tests pass.
- Commit `94583c4da41ca8eb18c32aaab197bce5a6c1a3fb` is explicitly not accepted
  evidence: passing author gates did not establish the frozen network,
  non-mutation, working-tree byte, transactional-cache, or catalog-binding
  guarantees.
- Commit `0c687da3003a3d3163c56d2482e4a59aac86708f` is also explicitly not
  accepted evidence. Its tests establish exception-path rollback and the
  seven named regressions only; they do not establish path confinement,
  complete checkout/replay, global catalog-lock correspondence, a
  default-deny transport boundary, or SHA-256 operation.
- Process-crash and power-loss atomicity, syscall-level network exclusion,
  NFS behavior, and macOS/Windows portability remain outside the current
  evidence. The tested platform is Linux x86-64 with Git 2.54.0 and Python
  3.12.13 in the pinned Nix environment.

## Completion state

Complete. Deterministic positive and adversarial fixtures, two independent
counterexample rounds, the real offline `local.lang-bang` scenario, full
repository validation, a generated exact lock, and explicit evidence limits
are recorded. This establishes example-tested custody behavior plus one
runtime-validated local observation; it does not establish origin truth,
authorship, legal compatibility, semantic fitness, syscall-level isolation,
crash atomicity, or cross-platform portability.

- 2026-08-02: Historical lifecycle heading migrated verbatim from the pre-migration plan:
  # Completed plan 0004: reference-source custody
