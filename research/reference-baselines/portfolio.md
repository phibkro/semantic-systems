# Reference-baselines adoption portfolio

Status: integration candidate. This is research `assertion` plus source-backed
provenance, not proof, static analysis, or legal advice. Feature 0002 remains
in progress. External projects are references and realizations, never semantic
authorities.

## Provenance and repair record

The checked-in source of record is `evidence-packet.json`, SHA-256
`2c10a8cef26689bdc85f5251cf7c94d94b7016a151120f622170d8406eb9d5ff`.
It preserves the audited reduction of cached control run `wf_4acac964-579`;
the original payload digest is
`51bb064ba951578948654c25027359b33c9f3647e4e55c75d80b077c8807f9fc`
and the workflow script digest is
`3963a2d23c3d38a038316eabc625b4a543b956d3c9365a059cf4012fd20635b9`.

The run's argument object arrived as a JSON string, so `projectContext` was
empty: run date, frozen boundaries, and the boundary enum all fell back to
defaults, and every `target_boundary` in the payload is a forced
`none_project_owned`. This repair:

- **reuses unchanged** the checked-in, context-independent packet: 17 project
  cards, 119 typed claims with verification verdicts, 17 license checks, the
  51-challenge adversarial review, 8 rejected patterns, and the gap log;
- **adds** the separately verified six-card type-system refinement packet;
- **re-derives** boundary mapping, enforceability rungs, reuse classes,
  ranking, and adoption decisions against the current repository;
- **performs no source retrieval in this integration** and upgrades no evidence
  category.

Claim ids below (`cluster.card.cNN`) refer to the cached claim ledger; each
carries URL, version-or-commit, content locator, access date 2026-07-29, and
a per-claim verdict in the payload.

## The shape premise, discharged

The cached synthesis conditioned each rung on an unverified premise: a
Rust-implemented, long-lived, editor-facing analysis front end
(`hidden_assumptions` 1). Its E1 kill criterion requires a new rung analysis
when that premise fails. The production plane remains future work, but the
implemented project-tooling plane has migrated since the packet was authored:

| Plane                                                                                | Current state                                                                       | Consequence for adoption                                                                                                                        |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Project tooling (`src/project-model`, `src/references`, and other `src/**` services) | Implemented in TypeScript 7, Bun, and Effect v4 with typed schemas and strict gates | Experiments run here; static ceilings come from types, service requirements, and configured diagnostics, not Rust ownership or open effect rows |
| Semantic core (kernel, theories, evidence meaning)                                   | Implemented kernel plus frozen boundaries for feature 0002                          | Reference methods may inform implementation; this feature cannot change semantic authority                                                      |
| Production compiler/frontend plane                                                   | Design-stage (`docs/technology-portfolio.md`, `docs/realization-strategy.md`)       | Query-graph, diagnostic-placement, and lossless-tree methods remain deferred with explicit preconditions                                        |
| Formal evidence plane (Lean adapter)                                                 | Design-stage                                                                        | Assumption-query and small-kernel methods adapt the shape, not the Lean stack                                                                   |

Project-owned boundaries used for mapping (all current-repository seams):

- **B1 canonical graph → generated views**: `model/**` is the root;
  `generated/**` is a pure projection via the generator.
- **B2 model validation**: structural gates and `ValidationIssue` records.
- **B3 resolver tracer**: policy + typed evidence → selection + explanation
  (design spec 0001, CLM-0001).
- **B4 independent resolution checker**: design spec 0003 frontier
  (CLM-0002, uncertainty 0004).
- **B5 reference-source custody**: catalog → lock → materialization
  (design spec 0004, CLM-0003).
- **B6 production tooling plane** (future), **B7 formal evidence plane**
  (future), **B8 semantic core** (frozen).

## Corpus coverage

The checked-in packets contain 23 representative project entries across all
six frozen corpus areas:

| Corpus area                        | Representative projects                                           |
| ---------------------------------- | ----------------------------------------------------------------- |
| Semantics and effects              | Koka; Perceus                                                     |
| Proof and trusted checking         | Lean 4; Mathlib trust boundary; lean4checker                      |
| Type-system refinement ladder      | GHC Core/System FC; Liquid Haskell; Flux; F*; Agda; Idris 2       |
| Compiler data and incrementality   | rustc; Salsa; rust-analyzer; Rowan; Oxc                           |
| Diagnostics and observability      | rustc diagnostics; Elm; miette and ariadne; LSP diagnostics       |
| Engineering and systems discipline | TigerBeetle and TigerStyle; Power of Ten; Meadows leverage points |

The refinement entries live in `refinement-ladder-packet.md`. They preserve
their own pin, license, trust-boundary, implementation-path, and unresolved
fields; they were not injected into the older cached claim ledger. They are
coverage-only cards, not full instances of the frozen project-card schema:
they omit the fixed enforceability rung, Meadows mapping, target boundary, and
adoption threshold/kill fields. No accepted method depends on them.
Redex/K, CompCert/CakeML, Rocq/Isabelle, Eff/Links/Frank/OCaml 5,
Clang/LLVM/MLIR, Hazel, Gleam, SQLite testing, and attestation stacks remain
outside this pilot.

Adoption consequence: the refinement projects form separate axes, not one
"stronger type system" ordering. Explicit equality evidence, SMT-backed
refinements, kernel-checked dependent types, restricted safe modes, and
quantitative erasure each move a different trust boundary and retain different
escape hatches. This feature adopts that boundary vocabulary as-is for future
design reviews; it does not select or import a type system. The six proposed
toolchain probes remain unrun.

Local references: `research/lang-bang-patterns.md` and
`research/semantic-packages-patterns.md` remain the bounded analyses of the
two local sources. Their patterns corroborate, and are corroborated by, the
external corpus at three points: proof-rides-the-reference and generated
drift gates (lang-bang) match `sem.small-kernel-rechecks-untrusted-producer`
and `disc.tool-normalized-formatting`; claims-are-not-their-evidence
(semantic-packages) matches this portfolio's claim-typing discipline.
Corroboration is labeled inference, not additional evidence.

## Evidence ledger summary

119 claims in the cached ledger: 95 fact, 20 unverified, 3 inference,
1 refuted (authoring categories); independent verification pass verdicts:
105 verified, 10 unverified, 3 not_sampled, 1 refuted. The refuted claim
(`discipline-systems.tigerbeetle-tigerstyle.c08`) — "zig fmt enforces the
100-column limit" — fell to a repository-artifact read: `build.zig` wires a
formatting check into CI, but line width is enforced by `src/tidy.zig`, not
`zig fmt`. Every substantive refutation in the run came from comparing prose
against an enforcing repository artifact.

Zero scoped performance numbers exist anywhere in the corpus: no benchmark
survived with workload, hardware, and comparison scope attached. All layout
and performance folklore (arenas, interning, structure-of-arrays) therefore
remains hypothesis here, consistent with `docs/technology-portfolio.md`.

## License and provenance table

From the cached license verification pass (all 17 cards checked):

| Reference                     | SPDX                                                          | Confirmation                                                                     |
| ----------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Koka, Perceus impl.           | Apache-2.0                                                    | Confirmed from raw LICENSE (Microsoft Research copyright header)                 |
| Lean 4, Mathlib, lean4checker | Apache-2.0                                                    | Confirmed from raw LICENSE files                                                 |
| rustc, rustc diagnostics      | MIT OR Apache-2.0                                             | Confirmed from COPYRIGHT file                                                    |
| Salsa                         | Apache-2.0 OR MIT                                             | Confirmed from Cargo.toml manifest                                               |
| rust-analyzer, Rowan          | MIT OR Apache-2.0                                             | Confirmed (repo files / crate metadata)                                          |
| Oxc                           | MIT                                                           | Confirmed from LICENSE; vendored third-party code carries separate licenses      |
| Elm compiler                  | BSD-3-Clause                                                  | Confirmed from raw LICENSE                                                       |
| miette / ariadne              | Apache-2.0 / MIT                                              | miette confirmed from LICENSE; ariadne secondary-sourced (docs.rs metadata only) |
| LSP specification             | CC-BY-3.0-US posture per verifier note; card recorded unknown | Partially resolved; attribution required if spec text is reproduced              |
| TigerBeetle                   | Apache-2.0                                                    | Confirmed; copyright holder line absent from fetched text                        |
| Power of Ten (IEEE 2006)      | none — all rights reserved presumed                           | Rights statement unextractable from hosted PDF                                   |
| Meadows leverage points       | none — all rights reserved                                    | "© 1996-2026 The Academy for Systems Change"                                     |

The refinement packet records GHC, Liquid Haskell, and Idris 2 as
BSD-3-Clause; Flux as MIT; F* as Apache-2.0; and Agda as MIT-shaped text with
an unresolved `NOASSERTION` detector result. Liquid Haskell's bundled Z3 terms
and F*'s F#-derived license file remain separately unresolved.

Consequences adopted as constraints: cite Power of Ten and Meadows by
reference only, never reproduce their text; paraphrase-and-attribute any
discipline prose derived from them; no reference code is copied in any
adoption below (methods only), so copyright-level exposure is nil and patent
posture remains unexamined (recorded, unresolved).

`references/refs.bib` remains intentionally empty: no paper body achieved
full primary verification in the cached run (Perceus PLDI'21 and the
ICFP'21 evidence-passing paper were blocked at abstracts by ACM 403 and PDF
tooling; the Elm essay body and Power of Ten canonical text were never
readable). Adding bibliography entries for papers whose bodies were not read
would upgrade evidence by aggregation. They enter `refs.bib` when a
verified-body fetch lands.

## Accepted methods, boundary-mapped

Twelve methods survive from 31 candidates (the 19 non-accepted remain listed
in `enforcement-ladder.md`). Reuse classes: **as-is** (adopt substantially
unchanged), **adapt** (behind a project-owned boundary), **defer** (fresh
synthesis blocked on a plane that does not exist yet). Rungs, why-not-higher
detail, and the full experiment contracts live in `enforcement-ladder.md`
and `adoption-experiments.md`; this table is the decision record.

| Method (provenance)                                                                          | Class                                   | Boundary                                 | Rung here                                                    | Experiment                  |
| -------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| `sem.per-artifact-assumption-query` (Lean `#print axioms` shape; lean4-kernel.c02/c03/c06)   | adapt                                   | B1/B3                                    | generated                                                    | RX2                         |
| `sem.small-kernel-rechecks-untrusted-producer` (Lean kernel + lean4checker; c01/c02/c03)     | adapt                                   | B4                                       | tested (static at B6)                                        | maps to spec 0003, CLM-0002 |
| `sem.replay-the-artifact-not-the-build` (lean4checker.c01/c02/c04)                           | as-is                                   | B5, extend to B3                         | tested                                                       | CLM-0003 gates + RX5        |
| `sem.effect-rows-in-function-types` (Koka.c01/c02; closed-capability adaptation)             | adapt                                   | TypeScript Effect services now; B8 later | static (service/lint wall) + convention (exception register) | RX3                         |
| `dod.demand-driven-memoized-query-graph` (rustc.c05/c07, salsa.c02, rust-analyzer.c04)       | defer                                   | B6                                       | tested when built                                            | D2 (deferred)               |
| `dod.result-identity-short-circuit` (salsa.c04, rustc.c08)                                   | adapt precondition now; defer mechanism | B1 now; B6 later                         | tested                                                       | RX1 passed; D2 later        |
| `dod.diagnostics-as-data-side-channel` (salsa.c04/c07, rust-analyzer.c07)                    | defer                                   | B6                                       | static when built                                            | D3 (deferred)               |
| `dod.structured-diagnostic-record-with-provenance` (rustc-diag.c01/c02, miette.c01, lsp.c01) | adapt                                   | B2/B3                                    | static (typed record) + tested (registry)                    | RX4                         |
| `dod.green-red-lossless-syntax-tree` (rust-analyzer.c01/c02, rowan.c01)                      | defer                                   | B6 frontend                              | tested when built                                            | D1 (deferred)               |
| `dod.stable-ids-over-addresses-and-offsets` (rust-analyzer.c03/c05, rustc.c06)               | as-is                                   | B1–B5 (already practice)                 | static-partial (schema)                                      | audit folded into RX4       |
| `disc.tool-normalized-formatting` (TigerBeetle build.zig/tidy.zig via O4 verdicts)           | as-is                                   | repo gates                               | generated (formatter) + convention (register)                | RX4                         |
| `disc.zero-warning-tool-gate` (O3 inference; TigerBeetle CI precedent)                       | as-is                                   | repo gates                               | static                                                       | RX4                         |

Notes on the three deferred methods: each is _accepted as a design
constraint on B6_, not adopted now. The pilot's central forced triad —
diagnostics placement, caching identity, and diagnostic lifecycle must be
decided together before any query graph is built — is recorded as a B6
design precondition in `adoption-experiments.md` (D2/D3). Building them now
would manufacture a consumer, violating the consumer-gated-slices pattern
this project already follows.

Semantic-core note: `sem.effect-rows-in-function-types` is adopted only as an
implementation discipline (Effect service requirements plus a lint wall) for
the current TypeScript tooling plane. Whether the _language_ adopts Koka-style
open effect rows is B8 semantic-frontier work, frozen for this bullet; the
corpus establishes that Koka's guarantee is stronger than any closed
capability discipline (inference, not a project decision).

## Rejected imports

Unchanged from the cached run, all reproduced with reasons in the payload:
blanket recursion bans for tree-shaped data; abort-on-assert in long-lived
serving processes; universal no-allocation-after-init for input-proportional
front ends; vendor benchmark numbers without workload/scope/date; absolute
TCB marketing ("no runtime", "not trusted at all", "adds nothing to
trust"); assertion-density and line-cap numerology as safety content;
span-bearing diagnostics inside memoized identity; and enforcement claims
derived from prose alone.

## Unresolved and unverified (visible residue)

1. The custody lock covers 5 of 23 catalog sources. The remaining cards carry
   observed URLs and version descriptions but do not have current
   origin-verified lock entries. They are not provenance-final and cannot close
   design-spec acceptance.
2. `refs.bib` is empty (see above); Perceus, evidence-passing, Elm, and Power of
   Ten bodies remain unread.
3. Ten claims remain unverified and three were not sampled in the original
   ledger. They support no recommendation without a visible dependency.
4. Version debt remains: the Lean cluster is rolling-latest, Meadows
   publication history is unresolved, and current Salsa terminology is not
   reverified.
5. The refinement packet closes the missing corpus-area count, but bundled
   license terms, toolchain versions, and several soundness caveats remain
   explicit uncertainties.
6. Patent posture of Apache-2.0 and MIT method adaptations is unexamined.
7. The original F2 ranking was the only unchallenged synthesis. This integration
   re-derives it against current boundaries; an independent review of this
   integrated artifact is still required before feature closure.
