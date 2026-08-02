# Reference-baselines evidence packet

Status: historical auditable evidence artifact (mechanical normalization,
autonomy A3, no semantic authority). `evidence-packet.json` is authoritative
for this 2026-07-29 packet only. The current boundary and enforcement decisions
live in `portfolio.md` and `enforcement-ladder.md`.

## Provenance

- Run id: `wf_4acac964-579`
- Payload: `.research-cache/reference-baselines/pilot-wf_4acac964-579-result.json`, SHA-256 `51bb064ba951578948654c25027359b33c9f3647e4e55c75d80b077c8807f9fc`
- Workflow script: `.research-cache/reference-baselines/reference-baselines-pilot-wf_4acac964-579.js`, SHA-256 `3963a2d23c3d38a038316eabc625b4a543b956d3c9365a059cf4012fd20635b9` (matches recorded digest: True)
- Repaired portfolio commit: `c3e52efeee40ba66f2168fe687ed9ab80c3a056f`
- Source access date: 2026-07-29

Mechanical normalization only (autonomy A3, no semantic authority). Cached factual fields (project cards, claim ledger, verification verdicts, license checks, adversarial review, gap log) are reproduced unchanged from the cached control payload. Project-owned boundary, enforceability rung, reuse class, and experiment mapping are joined exclusively from the repaired tracked artifacts (portfolio.md, enforcement-ladder.md, adoption-experiments.md) at the commit above, never from the payload's forced target_boundary defaults.

The packet intentionally preserves the repository-shape analysis at commit
`c3e52ef`. The current integration does not rewrite that evidence after the
TypeScript/Effect migration; it re-derives current decisions in the companion
artifacts and keeps the mismatch visible.

### Invalid fields excluded from this packet

- result.method_matrix[].classification.target_boundary (forced 'none_project_owned'; projectContext arrived as an empty JSON string, so the boundary enum was empty -- see result.hidden_assumptions[0] and result.unresolved_questions[0])
- result.accepted_methods[].target_boundary (forced 'none_project_owned', same cause)
- result.ranked_experiments[].boundary (literal value 'none_project_owned (forced default; boundary enum empty)' recorded by the run itself)
- result.run_date (literal value 'unknown-run-date'; forced default, same cause; use provenance.source_access_date instead)

### Counts

- Cards: 17
- Claims: 119
- Claim verdicts: 105 verified, 10 unverified, 3 not_sampled, 1 refuted
- Methods: 31 total, 12 accepted in the pilot
- License checks: 17
- Adversarial challenges: 51
- Gap log entries: 13

## Cards

Every card below links its `card_id` and the `claim_id`s it
owns, so any portfolio citation resolves back to a source. Full
field detail (license, sources, TCB, assumptions, methods,
enforceability-here, confidence) lives in `evidence-packet.json`.

| card_id                                      | project                                                             | cluster            | claims | methods (accepted-here)                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------- | ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagnostics.elm-compiler-messages`          | Elm compiler messages                                               | diagnostics        | 3      | (none observed)                                                                                                                                                                                                                                                                   |
| `diagnostics.lsp-diagnostics-provenance`     | LSP diagnostics provenance (mechanism card)                         | diagnostics        | 5      | `dod.result-identity-short-circuit`_, `dod.structured-diagnostic-record-with-provenance`_                                                                                                                                                                                         |
| `diagnostics.miette-ariadne`                 | miette + ariadne (combined rendering/diagnostic-protocol libraries) | diagnostics        | 7      | `dod.structured-diagnostic-record-with-provenance`*                                                                                                                                                                                                                               |
| `diagnostics.rustc-structured-diagnostics`   | rustc structured diagnostics + error codes                          | diagnostics        | 7      | `dod.enforced-diagnostic-lifecycle`, `dod.structured-diagnostic-record-with-provenance`*                                                                                                                                                                                          |
| `discipline-systems.meadows-leverage-points` | Meadows leverage points                                             | discipline-systems | 8      | `disc.information-flow-restructuring`, `disc.leverage-point-triage`                                                                                                                                                                                                               |
| `discipline-systems.power-of-ten`            | Power of Ten / NASA-JPL rules                                       | discipline-systems | 6      | `disc.assertion-density-positive-and-negative-space`, `disc.bounded-loops-and-queues`, `disc.checkable-language-subset`, `disc.function-size-cap`, `disc.no-heap-allocation-after-init`, `disc.zero-warning-tool-gate`*                                                           |
| `discipline-systems.tigerbeetle-tigerstyle`  | TigerBeetle + TigerStyle                                            | discipline-systems | 9      | `disc.assertion-density-positive-and-negative-space`, `disc.bounded-loops-and-queues`, `disc.checkable-language-subset`, `disc.deterministic-simulation-last-line-of-defense`, `disc.function-size-cap`, `disc.no-heap-allocation-after-init`, `disc.tool-normalized-formatting`* |
| `koka-effects.koka`                          | Koka                                                                | koka-effects       | 8      | `sem.effect-rows-in-function-types`*, `sem.handlers-as-user-defined-interpreters`, `sem.static-refcount-insertion`, `sem.taught-discipline-without-enforcement`, `sem.translate-the-feature-away`                                                                                 |
| `koka-effects.perceus`                       | Perceus (Koka reference counting + reuse)                           | koka-effects       | 6      | `dod.compiler-generated-refcounting-with-in-place-reuse`, `sem.static-refcount-insertion`, `sem.taught-discipline-without-enforcement`, `sem.translate-the-feature-away`, `sem.uniqueness-conditioned-inplace-reuse`                                                              |
| `lean4-proof.lean4-kernel`                   | Lean 4                                                              | lean4-proof        | 7      | `sem.implementation-diversity-as-the-real-independence`, `sem.library-adds-no-trust-primitives`, `sem.per-artifact-assumption-query`_, `sem.small-kernel-rechecks-untrusted-producer`_                                                                                            |
| `lean4-proof.lean4checker`                   | lean4checker / external checkers                                    | lean4-proof        | 6      | `sem.implementation-diversity-as-the-real-independence`, `sem.replay-the-artifact-not-the-build`_, `sem.small-kernel-rechecks-untrusted-producer`_                                                                                                                                |
| `lean4-proof.mathlib-trust-boundary`         | Mathlib (trust boundary only)                                       | lean4-proof        | 4      | `sem.library-adds-no-trust-primitives`, `sem.per-artifact-assumption-query`_, `sem.replay-the-artifact-not-the-build`_, `sem.small-kernel-rechecks-untrusted-producer`*                                                                                                           |
| `rustc-core.rustc`                           | rustc                                                               | rustc-core         | 13     | `dod.arena-scoped-ir-allocation`, `dod.demand-driven-memoized-query-graph`_, `dod.interning-for-identity-equality`, `dod.result-identity-short-circuit`_, `dod.stable-ids-over-addresses-and-offsets`*                                                                            |
| `rustc-core.salsa`                           | Salsa                                                               | rustc-core         | 9      | `dod.demand-driven-memoized-query-graph`_, `dod.diagnostics-as-data-side-channel`_, `dod.interning-for-identity-equality`, `dod.result-identity-short-circuit`_, `dod.stable-ids-over-addresses-and-offsets`_                                                                     |
| `syntax-oxc.oxc`                             | Oxc (VoidZero)                                                      | syntax-oxc         | 7      | `dod.arena-scoped-ir-allocation`, `dod.diagnostics-as-data-side-channel`_, `dod.structured-diagnostic-record-with-provenance`_                                                                                                                                                    |
| `syntax-oxc.rowan`                           | Rowan                                                               | syntax-oxc         | 6      | `dod.green-red-lossless-syntax-tree`*, `dod.interning-for-identity-equality`                                                                                                                                                                                                      |
| `syntax-oxc.rust-analyzer`                   | rust-analyzer                                                       | syntax-oxc         | 8      | `dod.demand-driven-memoized-query-graph`_, `dod.diagnostics-as-data-side-channel`_, `dod.green-red-lossless-syntax-tree`_, `dod.interning-for-identity-equality`, `dod.stable-ids-over-addresses-and-offsets`_                                                                    |

`*` = accepted in the pilot (see `enforceability_here` in the JSON for boundary/rung/experiment).

## Claim ledger

119 claims, field-for-field equal to the cached ledger (claim_id, card_id, cluster, statement, category, load_bearing, uncertainty, sources, verification, history). See `claim_ledger` in the JSON file for the full list; not reproduced here to keep this index short.

## Verification and review

- 17/17 license checks executed (see `verification.license_checks` in the JSON).
- 51 adversarial-review challenge targets (see `adversarial_review` in the JSON for summary, consensus/authority flags, and per-target dispositions).
- 13 gap-log entries recording what was not read or could not be upgraded (see `gap_log`).
