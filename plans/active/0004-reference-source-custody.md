# Active plan 0004: reference-source custody

Canonical problem contract:
[`design-specs/0004-reference-source-custody.md`](../../design-specs/0004-reference-source-custody.md).
This mutable execution record must not redefine the frozen contract.

## Semantic claim

The falsifiable claim, custody states, deep-module boundary, evidence limits,
semantic diff, and kill criteria are frozen in design spec 0004.

## Current state

- `references/sources.toml` contains 23 research candidates and separates local
  hints from canonical origins, but no entry is provenance-ready.
- `.references/` is ignored and no normal build reads it.
- `references/refs.bib` is intentionally empty pending accepted primary
  sources.
- Local `lang-bang` is available at observed commit
  `5b8e032bcffefb23a3a153d3f5cea99050e589c1` with a committed `LICENSE`.
- No lock generator, materializer, strict status command, or custody tests
  exist.

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

## Decisions and deviations

- This operational frontier is independent of resolver checking and semantic
  research synthesis under decisions 0004 and 0005.
- Local source aliases must be explicit catalog data, not inferred by a
  provider-specific normalizer.
- The first accepted lock is integrated serially by the main curator after the
  implementation and its tests pass.

## Completion state

Open. Complete only after deterministic custody fixtures, the real offline
`local.lang-bang` scenario, independent review, full repository validation,
and exact evidence limits are recorded.
