# Type-system refinement ladder — primary-source packet

Status: mechanical research packet (A3, no semantic authority). This fills the
factual gap recorded in `portfolio.md` §"Corpus coverage" and behind
`uncertainties/0002-type-system-refinement-ladder.md` §"Supporting evidence":
the refinement-ladder corpus class had zero primary-source packets. This
document supplies six project cards (GHC System F/System FC, Liquid Haskell,
Flux, F*, Agda, Idris 2) plus a cross-project comparison table.

**What this is not**: not proof, not static analysis, not legal advice, not
an adoption decision, and not a claim upgrade to anything in `portfolio.md` or
`enforcement-ladder.md`. External projects remain references, never semantic
authorities. No implementation code is copied verbatim; source excerpts are
short and paraphrased where indicated.

**Evidence labeling convention used throughout**: `CITED` = read from a
named primary source (repo file, doc page, release/issue metadata) at the
stated URL/locator/access date. `PROPOSED` = constructed by the researching
agent as an illustrative example, not pulled from a fetched source — flagged
so it can become a future local oracle experiment rather than be mistaken
for observed fact. `PLAUSIBLE`/`inferred` = a reasonable reading of
architecture or a secondary source (e.g. a search-result snippet of a paper)
that was not independently re-verified against primary full text. Access
date for every fact below is **2026-07-29** unless stated otherwise.

Research method: six parallel bounded-retrieval agents (Sonnet tier, no
adoption authority), one per project, using `gh`/`WebFetch` against each
project's canonical repository listed in `references/sources.toml`. Each
agent was instructed to mark, not silently drop, anything it could not
verify. Their raw reports are reproduced/condensed below with citations
intact; nothing here upgrades an agent's own uncertainty flag.

---

## Card 1 — GHC: Core / System F and System FC

**Pinned version**: tag `ghc-9.14.1-release`, commit
`902339d332fb4ce2b3c87dcac1ee6495d41ad886`. Source:
`gh api repos/ghc/ghc/tags` against the GitHub mirror
https://github.com/ghc/ghc (`gitlab.haskell.org`, the canonical origin, was
blocked by an Anubis bot-wall from this environment; the GitHub mirror is
kept in sync and used as the fetch target throughout this card). A newer
patch release exists on an older minor series (`ghc-9.12.4-release`,
2026-03-27) — recorded, not used, since 9.14.1 is higher by version-number
precedence.

**License**: `BSD-3-Clause` (inferred from license-text pattern, not an
SPDX header in-file — GitHub's detector was not separately queried for this
card). Path: `LICENSE` at repo root
(https://github.com/ghc/ghc/blob/master/LICENSE, blob sha
`b5059b71f60658ae11b33fdc011cb003f5af5b05`). Header: "The Glasgow Haskell
Compiler License / Copyright 2002, The University Court of the University of
Glasgow..." followed by standard 3-clause BSD conditions.

**Problem solved**: Core (System F-based) is GHC's single, small, explicitly
typed intermediate language. Haskell surface syntax is desugared
(`compiler/GHC/HsToCore/*`) into Core after type inference; every subsequent
Core-to-Core optimization pass (`compiler/GHC/Core/Opt/*`) and codegen stage
operates on this one IR, so every pass's output can itself be
independently type-checked.

**Type-theoretic rung**: **System F** — explicit type abstraction/application
(`Λ`/`@`), not implicit generics; impredicative instantiation is
representable in Core even though the surface checker restricts it. Not
dependently typed: Core types cannot depend on runtime term values.
**System FC** extends System F with explicit type-equality coercion terms
(`γ : σ ~ τ`) as first-class evidence for GADTs and type families. CITED,
in-repo: `compiler/GHC/Core/Lint.hs`, _Note [GHC Formalism]_ (pinned commit,
~lines 127–137): "this file implements the type-checking algorithm for
System FC, the 'official' name of the Core language... there is a document
core-spec.pdf built in docs/core-spec." `docs/core-spec` itself was not
fetched (§ Unresolved). Secondary confirmation (PLAUSIBLE, search-snippet
only, PDF not directly read): Sulzmann, Chakravarty, Peyton Jones, Donnelly,
"System F with Type Equality Coercions," TLDI '07.

**Checker/elaborator/solver boundary**: Elaboration (`compiler/GHC/Tc/*`)
implements **OutsideIn(X)** constraint generation/solving (PLAUSIBLE,
secondary source: Vytiniotis et al. 2011, not directly re-fetched), a
bespoke algorithm for GHC's specific feature set — **no SMT solver** is
involved in elaboration (consistent across all sources found, but not
directly quoted as "not SMT" from a primary doc — flagged plausible, not
proven negative). Separately, **Core Lint**
(`compiler/GHC/Core/Lint.hs`) re-type-checks the _output_ of desugaring and
of every optimization pass; it is a post-hoc verification pass, not part of
elaboration.

**Guarantees / trusted base / failure modes**: CITED verbatim,
`compiler/GHC/Core/Lint.hs`, _Note [Core Lint guarantee]_: "If all of: 1.
Core Lint passes, 2. there are no unsafe coercions (i.e.
unsafeEqualityProof), 3. all plugin-supplied coercions (i.e. PluginProv) are
valid, and 4. all case-matches are complete then running the compiled
program will not seg-fault... However, do note point (4)... Core Lint does
not check for incomplete case-matches... an incomplete case-match might
slip by Core Lint and cause trouble at runtime." Core Lint checks: type
errors, out-of-scope type/term variables, ill-kinded types, incorrect unsafe
coercions. It does **not** check case-match exhaustiveness (a named,
permanent gap, not an oversight) and it trusts `unsafeEqualityProof` and
plugin-supplied coercions axiomatically. Core Lint is off by default; it
runs under the `-dcore-lint` debug flag ("Turn on heavyweight intra-pass
sanity-checking within GHC, at Core level," GHC User's Guide, Debugging the
compiler section, https://downloads.haskell.org/ghc/9.14.1/docs/users_guide/debugging.html).
Without the flag, an ill-typed Core term from a buggy pass is not caught at
compile time.

**Implementation paths** (verified at pinned commit via `gh api
repos/ghc/ghc/contents/...`): Core datatype `compiler/GHC/Core.hs`; Core
Lint `compiler/GHC/Core/Lint.hs`; coercions
`compiler/GHC/Core/Coercion.hs`, `compiler/GHC/Core/TyCo/`; constraint
solver `compiler/GHC/Tc/Solver.hs` +
`compiler/GHC/Tc/Solver/{Solve,Dict,Equality,Irred,Default,Rewrite,InertSet,Monad,Types}.hs`;
desugarer `compiler/GHC/HsToCore.hs` +
`compiler/GHC/HsToCore/{Expr,Match,Binds,GuardedRHSs,ListComp,Pmc,...}.hs`;
optimizations `compiler/GHC/Core/Opt/`.

**Unresolved**: `docs/core-spec` content not fetched; the System FC paper
and the OutsideIn(X) paper were only located via secondary search snippets,
not read directly; no historical Core-Lint-catches/misses-a-bug incident
was located (gitlab issue tracker unreachable, GitHub mirror carries no
issues); whether `-dcore-lint` is on in GHC's own CI/validate builds was not
confirmed; SPDX id is an inference from license text, not a repo-declared
value.

**Example patterns** (rung: explicit-polymorphism + typed-equality-evidence):

- **POSITIVE** (PROPOSED, illustrative, not a fetched dump): a GADT
  evaluator (`eval :: Expr a -> a` over `IntE :: Int -> Expr Int`,
  `BoolE :: Bool -> Expr Bool`) — each branch's coercion, derived from the
  GADT index equality, casts the branch result to `a`. Structure follows the
  textbook shape described by System FC's own design, not a real
  `-ddump-simpl` output read in this pass.
- **MINIMAL REJECTION** (PROPOSED): a hand-built Core term applying
  `f :: forall a. a -> a` instantiated at `Int` to a `Bool`-typed argument —
  Core Lint's "type errors" check (cited above) rejects it. Not run against
  a real build in this pass.
- **SUBTLE ADVERSARIAL** (boundary CITED, scenario PROPOSED): the _Note
  [Core Lint guarantee]_ names the exact gap — an optimization pass that
  turns a source-exhaustive match into a Core `case` that is not
  syntactically exhaustive can pass Core Lint cleanly yet seg-fault at
  runtime. This is a documented, permanent limitation, not a hypothetical
  bug class; the specific transforming pass and input are proposed, not
  sourced.

---

## Card 2 — Liquid Haskell

**Pinned version**: tag `v0.9.14.1` ("A first version to build with GHC
9.14.1"), published 2026-05-07T14:02:08Z, commit
`1c2a820d84f58d67eeb25aef9de26043d8cb55d6`. Source: `gh release list
--repo ucsd-progsys/liquidhaskell`;
`gh api repos/ucsd-progsys/liquidhaskell/git/refs/tags/v0.9.14.1`. An older
numeric-only tag scheme (`v9.2.8`, pre-2024) also exists and is not used.

**License**: `BSD-3-Clause` (GitHub license-detector `spdx_id`). Path:
`/LICENSE` at repo root
(https://raw.githubusercontent.com/ucsd-progsys/liquidhaskell/develop/LICENSE).
Header: "Copyright (c) 2013-2014, Ranjit Jhala... Redistribution and use in
source and binary forms..." (standard 3-clause BSD). A second file,
`/LICENSE_Z3`, ships the bundled Z3 license terms — path confirmed, content
not separately fetched (§ Unresolved).

**Problem solved**: extends GHC's checker with SMT-backed refinement types
— predicate-annotated base types checked via subtyping. Documented use
classes (`docs/mkDocs/docs/index.md`, v0.9.14.1): totality of partial
functions (e.g. `head` restricted to `NonEmpty`), array/vector bounds
safety, dependent-contract shape constraints (equal-length vector
operations), termination via decreasing metrics, user-defined invariants
(e.g. sortedness) made compile-time-checked, and equational/law proofs via
refinement reflection.

**Type-theoretic rung**: refinement types `{v:Int | v > 0}` attached to base
types/constructors/signatures via `{-@ ... @-}` pragmas
(`docs/mkDocs/docs/specifications.md`); checking reduces to subtyping
discharged as SMT queries — not full dependent-type computation, and
refinements are erased before/at GHC's own type checking (i.e. GHC's type
soundness is a separate, assumed lower layer — inferred from architecture,
not an explicit LH doc statement). Logic fragment: by default with Z3,
non-linear integer arithmetic (division/multiplication) is Z3-interpreted
(heuristic, not decidable); `--linear` restricts to uninterpreted-function
treatment of `*`/`div` for a weaker, decidable fragment
(`docs/mkDocs/docs/options.md`, "Restriction to Linear Arithmetic"). Solver
choice is configurable: `Z3 | Z3mem | Cvc4 | Cvc5 | Mathsat`
(`liquid-fixpoint`'s `Language.Fixpoint.Types.Config`).

**Checker/elaborator/solver boundary**: GHC plugin
(`ghc -fplugin=LiquidHaskell FILE.hs`, README.md). Two-package
architecture: `liquidhaskell-boot` (spec parsing `Bare.hs`, VC generation
`Constraint/Generate.hs`, translation to the solver's constraint language
`Constraint/ToFixpoint.hs`) hands off to the separate `liquid-fixpoint`
package (git submodule,
https://github.com/ucsd-progsys/liquid-fixpoint) for Horn-clause solving
and the SMTLIB2 process interface (`Smt/Interface.hs`). Runs as part of the
same `ghc`/`cabal build` invocation as GHC's own checking, not a separate
offline pass.

**Guarantees / trusted base / failure modes**: TCB = GHC + the LH VC
generator + `liquid-fixpoint`'s solving engine + the external SMT solver
(Z3 default). `{-@ assume ... @-}` is explicitly documented `(Unchecked)`
(`specifications.md`); `options.md` on `assume reflect` warns: "if both
functions don't actually behave in the same way, then you may introduce
falsity in your logic." Solver-timeout behavior as an explicit
soundness-vs-completeness statement was **not found** in the fetched pages
(architectural inference only: an unproved VC is a rejection, not a silent
pass). **Documented open unsoundness issues** (via `gh search issues
"unsound" --repo ucsd-progsys/liquidhaskell`, titles/state only, bodies not
read): #2725 (refinements on lambdas over GADT-existential type variables,
"SAFE program crashes"), #1657 (bounded refinements), #1668 (global
assumption), #2274 (dependent-pair syntax ignores refinements), #1339
("Unsoundly Proving 1 = 2 and false"), #1299 (abstract refinements in type
classes), #2443 (reflection of functions with class constraints), #2410
(inferred-type leak across modules), #159 (termination checker unsound via
recursive datatypes/references), #2718 (aeson-derived instances make a
whole module verify vacuously), plus tracking issues #1576 and #2647. All
URLs `https://github.com/ucsd-progsys/liquidhaskell/issues/<n>`, state as
returned 2026-07-29.

**Implementation paths**: VC generation
`liquidhaskell-boot/src/Language/Haskell/Liquid/Constraint/Generate.hs`;
constraint-to-solver translation `.../Constraint/ToFixpoint.hs`; core types
`.../Constraint/{Constraint,Types,Env,Split,Template}.hs`; spec parsing
`.../Bare.hs`, `Bare/`, `Parse.hs`; GHC plugin wiring
`.../GHC/{Interface,Plugin}.hs`; SMT interface (submodule) `liquid-fixpoint`
→ `src/Language/Fixpoint/Smt/{Interface,Serialize,Theories,Types}.hs`; Horn
solving `liquid-fixpoint` → `src/Language/Fixpoint/Solver.hs`, `Solver/`,
`Horn/`.

**Unresolved**: explicit timeout-handling doc statement not located;
whether "GHC's soundness is a separate assumed layer" is stated anywhere by
LH itself (currently an architectural inference); `LICENSE_Z3` content not
read; the 12 unsoundness issues' bodies and fix status past their opening
were not individually reviewed.

**Example patterns**:

- **POSITIVE** (CITED): `tests/pos/Div000.hs`
  (https://github.com/ucsd-progsys/liquidhaskell/blob/v0.9.14.1/tests/pos/Div000.hs):
  `{-@ mydiv :: Int -> {v:Int | v /= 0} -> Int @-}`; a call site where the
  divisor is statically provably nonzero verifies.
- **MINIMAL REJECTION** (CITED): `tests/neg/SafePartialFunctions.hs`
  (`{-@ LIQUID "--expect-any-error" @-}`) — a local partial `head` (missing
  the `[]` case) applied via `map head` over lists with no non-emptiness
  guarantee; LH rejects it. (A dedicated negative division test was not
  found in the fetched listing; this is the closest cited rejecting
  example.)
- **SUBTLE ADVERSARIAL** (boundary CITED, exploit PROPOSED): `options.md`
  documents Z3's non-linear arithmetic as heuristic/incomplete by default,
  with `--linear` falling back to a weaker decidable fragment. Composed
  with the documented `{-@ assume reflect X as Y @-}` unchecked-equivalence
  mechanism: a reflected function whose logic diverges from its real
  behavior on a nonlinear-arithmetic input Z3's heuristics don't
  double-check would let downstream proofs rely on a false equivalence.
  This composition is architecturally sound per the docs but was not
  demonstrated with a concrete failing file in this pass — a candidate
  future local oracle experiment, not an observed exploit.

---

## Card 3 — Flux (refinement types for Rust)

**Pinned version**: **no stable release exists** — `gh api
repos/flux-rs/flux/tags` and `/releases` both return empty arrays as of
2026-07-29 (rolling-version limitation, stated explicitly, not inferred).
Default-branch (`main`) tip commit used instead:
`3f6c680f3d2b51519d4d252aa61e7948727c606e` (2026-07-25T00:10:14Z, GPG-verified,
"Rerun hints (#1698)"), via `gh api repos/flux-rs/flux/commits/main`. The
`rust-toolchain.toml` pin and reliance on internal `rustc_driver`/
`rustc_middle` APIs (§ boundary) are consistent with why no stable tag
exists — no upstream doc states this as policy; it is inferred from the
absence of tags plus the nightly-artifact install script.

**License**: `MIT` (GitHub `spdx_id`). Path: `/LICENSE` at repo root, blob
`969d061e8ba2e38d69391910b1ef0d4869ff18d1`. Standard MIT permission/AS-IS
text; no `Copyright (c) <year> <holder>` line present in the fetched blob
(noted as-is). No dual MIT/Apache-2.0 licensing (no `LICENSE-APACHE` file),
unlike the common Rust-ecosystem pattern.

**Problem solved**: `book/src/README.md` — "a refinement type checker
plugin for Rust that lets you _specify_ a range of correctness properties
and have them be _verified_ at compile time." Documented verification
classes: index-bounds safety (tutorial `05-vectors.md`; test
`tests/tests/neg/arrays/array04.rs`), integer overflow/underflow (opt-in via
`#[flux::opts(check_overflow = "strict")]`; test
`check_overflow00.rs`), arbitrary logical invariants over scalars/structs
(`refined_by`), and ownership-aware mutable-reference invariants (below).

**Type-theoretic rung**: refinements layered over Rust base types, with
**strong updates over `&mut T`** — `ensures` clauses specify how a
pointee's refined type changes across a call, e.g.
`fn(p: &mut i32[@n]) ensures p:i32[n+1]` (`book/src/tutorial/02-ownership.md`).
Aliased `&mut` references are handled by generalizing to the join of both
possible target invariants (`test_alias` example,
`book/src/guide/architecture.md`). Flux defines its own IR chain: Surface →
Fhir (refined `rustc_hir`) → Rty (refined `rustc_middle::ty`) →
Simplified-Rustc, with lifting/refining translations between plain-Rust and
refined representations.

**Checker/elaborator/solver boundary**: implemented as a genuine rustc
driver — `crates/flux-driver` implements `rustc_driver::Callbacks`,
launched via binaries `flux`/`cargo-flux` (crate `flux-bin`). Refinement
checking: `crates/flux-refineck`; constraint inference and fixpoint
encoding: `crates/flux-infer` (`fixpoint_encoding.rs`, `infer.rs`,
`wkvars.rs`, plus `lean_encoding.rs`/`lean_format.rs` whose purpose was not
confirmed — § Unresolved). SMT solver: **Z3**, fetched as a prebuilt binary
by `install.sh`. Constraint/Horn-clause layer: **liquid-fixpoint**
(same upstream group as Liquid Haskell), fetched as a nightly binary by the
same install script; the `flux-fixpoint` crate named in
`architecture.md`'s prose 404s in the live `crates/` listing on `main`
(likely doc drift into `flux-infer`, unresolved). Trust split: rustc is
trusted for parsing/resolution/borrow-checking/base typing; Flux adds the
refinement layer discharged to liquid-fixpoint → Z3. Explicit escape
hatches: `#[flux_rs::trusted]` (skip body-checking, trust the declared
signature) and `#[flux_rs::ignore]` (skip entirely),
`book/src/guide/specifications.md` §"Ignored and trusted code."

**Guarantees / trusted base / failure modes**: TCB = rustc + Flux's
IR-translation/VC-generation crates (`flux-desugar`, `flux-fhir-analysis`,
`flux-refineck`, `flux-infer`) + liquid-fixpoint + Z3 + any code marked
`#[trusted]`/`extern_spec`. `book/src/about.md` §"Limitations", quoted
verbatim: "This is a prototype! Use at your own risk. Everything could
break and it will break." **Documented unsoundness** (`gh api
search/issues?q=repo:flux-rs/flux+unsound`): **#907, open** — "Potential
unsoundness involving `Any`/downcasting": a function using
`dyn Any::downcast_mut` to mutate through an assumed-immutable generic `T`
breaks a parametricity assumption Flux relies on; verified (incorrectly) by
Flux per the reporter. Closed/fixed: #1547 (unsound integer-division rule),
#859 (`ReifyFnPtr` cast unsoundness), #588 (fresh KVar for bounded
generics). No formal soundness proof or TCB-audit document was located.
Solver-timeout behavior (sound-but-incomplete rejection vs. otherwise) was
**not found** in the fetched architecture/specifications docs.

**Implementation paths**: rustc-driver seam
`crates/flux-driver/src/{callbacks.rs,lib.rs}`; surface parser
`crates/flux-syntax`; desugaring `crates/flux-desugar`; well-formedness/
Fhir→Rty `crates/flux-fhir-analysis`; shared IR `crates/flux-middle`;
refinement-checking core `crates/flux-refineck/src/{checker.rs,type_env.rs,
invariants.rs,ghost_statements.rs,primops.rs}`; VC/solver encoding
`crates/flux-infer/src/{fixpoint_encoding.rs,infer.rs,refine_tree.rs,
wkvars.rs}`; user attributes `lib/flux-attrs` (via `lib/flux-rs`); CLI
`crates/flux-bin/src`; regression tests `tests/tests/{pos,neg,with_deps}/`.

**Unresolved**: `crates/flux-fixpoint` existence (404 vs. doc mention);
precise solver-timeout semantics; whether/how refinement checking treats
`unsafe {}` blocks (escape hatches confirmed, no explicit unsafe-block
policy statement located); purpose of `lean_encoding.rs`/`lean_format.rs`;
no soundness-proof artifact located (absence of evidence only).

**Example patterns**:

- **POSITIVE** (CITED): `book/src/tutorial/05-vectors.md` §"Random
  Access" — `RVec<T>::get` specified `fn(&RVec<T>[@n], i:
usize{i < n}) -> &T`; wrapped by an `Index` trait so `vec[i]` inside a
  `while i < vec.len()` loop is proven in-bounds, eliminating the runtime
  "index out of bounds" panic class named in the tutorial's introduction.
- **MINIMAL REJECTION** (CITED): `tests/tests/neg/arrays/array04.rs`,
  `test_repeat_oob`: `let arr = [0i32; 4]; arr[10]`, annotated
  `//~ ERROR assertion might fail`, a committed negative regression test.
  Also `05-vectors.md` §"Binary Search": Flux reports `precondition might
not hold ... vec[mid]` against a buggy `binary_search` plus a companion
  overflow diagnostic for `size = right - left`.
- **SUBTLE ADVERSARIAL** (CITED — issue #907, and the documented `trusted`
  escape hatch; PROPOSED — the composed scenario): issue #907's
  `not_id<T>` uses `dyn Any::downcast_mut` to mutate `t` through a
  type-erased reference while appearing to return `T` unchanged, violating
  Flux's parametricity assumption while still verifying. Separately,
  `book/src/guide/specifications.md` documents that a `#[flux_rs::trusted]`
  method's _signature_ is trusted without checking its _body_ — the doc's
  own framing: "Flux _cannot_ check this code." PROPOSED composition (not
  found cited verbatim): two aliased `&mut i32{v:0<=v}` parameters where a
  `trusted`-marked helper strong-updates only one — if the trusted
  signature doesn't account for the aliasing, the asserted invariant could
  hold for a location a different code path actually mutated. Flagged as a
  plausible instance of the ownership+refinement boundary, not a confirmed
  bug — a candidate future local oracle experiment.

---

## Card 4 — F*

**Pinned version**: tag `v2026.07.24`, commit
`60f60c05ccdb2caa31eb52395d7818ba2df3904e` (marked "Latest" via `gh release
list --repo FStarLang/FStar`). Prior tags for context: `v2026.07.12`
(`bfe6008225378c306ac886b0843eb1d34dccd546`), `v2026.07.05`
(`2173bc4316a51f01754f10bf94f697aba083c2e0`) — F* tags roughly weekly.

**License**: `Apache-2.0` (`gh api repos/FStarLang/FStar/license`). Path:
`LICENSE` at repo root (https://github.com/FStarLang/FStar/blob/master/LICENSE),
header "Apache License / Version 2.0, January 2004." A second file,
`LICENSE-fsharp.txt`, covers F#-derived material — noted, not further
inspected.

**Problem solved**: per fstar-lang.org — "a general-purpose proof-oriented
programming language ... combines the expressive power of dependent types
with proof automation based on SMT solving and tactic-based interactive
theorem proving," with an effects system (Dijkstra-monad-style, PLAUSIBLE
via Maillard et al. "Dijkstra Monads for All," ICFP 2019, not independently
re-verified) for imperative/stateful verification. Flagship application:
Project Everest/HACL* — verified cryptography shipping in Firefox, the
Linux kernel, and Python's standard library (fstar-lang.org).

**Type-theoretic rung**: **full dependent types**, not refinements bolted
onto a non-dependent base. CITED, `examples/data_structures/Vector.fst`:
`type vector 'a : nat -> Type = VNil : vector 'a 0 | VCons : hd:'a -> #n:nat
-> tl:vector 'a n -> vector 'a (n + 1)`, with
`append: ... -> Tot (vector a (n1 + n2))` — the return index is _computed_
and dependently checked, beyond refinement typing alone. F*'s refinement
types (`x:t{p x}`) are the SMT-automated layer on top of this (obligations
discharged to Z3 with no proof term required, e.g.
`sort : l:list int -> Tot (m:list int{sorted m /\ permutation l m})` in
`examples/algorithms/InsertionSort.fst`); genuinely dependent obligations
that SMT alone can't discharge require tactic/lemma-based proof. No F*
primary source was found directly contrasting F* against Liquid
Haskell/Flux by name — this rung comparison is drawn from code structure,
not an F*-authored claim.

**Checker/elaborator/solver boundary**: SMT solver **Z3**
(`src/smtencoding/FStarC.SMTEncoding.{Z3,Solver,Encode,EncodeTerm,
UnsatCore}.fst`). PLAUSIBLE (search-snippet of Martínez et al., "Meta-F*:
Proof Automation with SMT, Tactics, and Metaprograms," arXiv:1803.06547,
not independently re-confirmed against clean PDF text): "the logical
encoding from F* to SMT, along with the solver itself, are already part of
F*'s TCB" — i.e., unlike Coq/Lean/Agda's small-kernel-replays-proof-terms
model, F* trusts Z3's answer directly with no independent proof-term replay
layer. Type-checker `src/typechecker/` (`Tc.fst`, `TcTerm.fst`,
`TcEffect.fst`, `Rel.fst`) elaborates into a core calculus and emits VCs to
the SMT layer. Extraction: OCaml (default)/F# via
`src/extraction/FStarC.Extraction.ML.*`; C/WASM via **KaRaMeL**
(submodule, https://github.com/FStarLang/karamel); assembly via **Vale**
(separate repo, referenced from README, not vendored); Pulse (an F* DSL)
extracts to C or Rust via KaRaMeL. Extraction is not itself covered by
type-checking + SMT proof — inferred from architecture (separate
submodule/pipeline), not an F*-authored "extraction is untrusted"
statement.

**Guarantees / trusted base / failure modes**: TCB = type-checker + SMT
encoding + Z3 itself (per the Meta-F* snippet above) + the extraction
pipeline. **SMT proof instability is a named, documented problem**: F*
wiki, "Getting better mileage out of Z3"
(https://github.com/FStarLang/FStar/wiki/Getting-better-mileage-out-of-Z3):
Z3 "often ends up being a bottleneck in terms of proofs stability and
predictability" in large developments (HACL*, mitls); "very little
transparency into what's in the context when presenting a proof to Z3 (it
can often be a 10MB background theory)"; seemingly harmless F* changes can
make previously-working proofs non-replayable or need larger timeouts, and
lemmas that prove instantly in isolation can fail inside a larger module
(quantifier interference). A companion wiki page, "Robust, replayable
proofs using unsat cores," exists to address this — its body could not be
fetched in this pass (title/cross-reference only). **`admit()` is a named
unsoundness escape hatch**: wiki "Sliding admit verification style"
(https://github.com/FStarLang/FStar/wiki/Sliding-admit-verification-style):
`admit()` inside a `Pure`/`Ghost` body is encoded to Z3 literally as
`Prims.admit()`, which "will allow you to later prove" a false lemma such
as `f_is_constant : Lemma (f x == f y) = ()` for a non-constant `f`; the
page recommends `assume val` as a safer stopgap and frames `admit()` as a
temporary interactive-development aid.

**Implementation paths**: type-checker/elaborator `src/typechecker/`
(`Tc.fst`, `TcTerm.fst`, `TcEffect.fst`, `TcInductive.fst`, `Rel.fst`,
`Core.fst`); VC generation/SMT encoding `src/smtencoding/` (`Encode.fst`,
`EncodeTerm.fst`, `Z3.fst`, `Solver.fst`, `UnsatCore.fst`, `Pruning.fst`);
extraction to OCaml/F# `src/extraction/` (`Modul.fst`, `Term.fst`,
`Code.fst`, `Syntax.fst`) plus the KaRaMeL bridge `Krml.fst`; extraction to
C/WASM (separate repo) `karamel` submodule; extraction to assembly
(separate repo, not vendored) `project-everest/vale`; standard library
`ulib/`; expected-failure fixtures `tests/error-messages/`,
`tests/bug-reports/`.

**Unresolved**: full text of the "unsat cores" wiki page; direct
(non-snippet) confirmation of the Meta-F* TCB quote; no F* doc directly
compares F* to Liquid Haskell/Flux; whether F*'s tactic engine
(`src/tactics/`, not enumerated here) provides any separately-checkable
proof layer reducing raw-Z3 trust for tactic-discharged goals — plausible,
not confirmed this pass.

**Example patterns**:

- **POSITIVE** (CITED, both from the repo, pinned tag): the `vector`
  length-indexed type and `append` signature above
  (`examples/data_structures/Vector.fst`) for genuine dependent typing;
  `examples/algorithms/InsertionSort.fst`'s
  `sort : l:list int -> Tot (m:list int{sorted m /\ permutation l m})` for
  the refinement+SMT-automation pattern.
- **MINIMAL REJECTION** (PROPOSED, harness location CITED): a definition
  like `let bad () : x:int{x > 10} = 5` would fail because the VC
  `5 > 10` is UNSAT-refuted by Z3. The `tests/error-messages/` directory
  (`ExpectFailure.fst`, `Asserts.fst`, `AssertNorm.fst`) is exactly the
  harness for such fixtures, but no specific file body was pulled to
  confirm this exact snippet in this pass.
- **SUBTLE ADVERSARIAL** (CITED): the `admit()`-in-body hole from "Sliding
  admit verification style" (above) — a concrete, wiki-documented soundness
  escape distinct from (and compounding) the Z3-version/quantifier-
  instantiation flakiness described in the "mileage" page.

---

## Card 5 — Agda

**Pinned version**: tag `v2.8.0`, published 2025-07-05T20:31:37Z, commit
`3d04bacca842729f9c0869b9287256321b5f450f` (via
`gh api repos/agda/agda/releases/latest` and
`.../git/refs/tags/v2.8.0`).

**License**: file `LICENSE` at repo root
(https://github.com/agda/agda/blob/v2.8.0/LICENSE) reads as standard MIT
permission/warranty text ("Permission is hereby granted..."/"THE SOFTWARE
IS PROVIDED 'AS IS'"). **Caveat**: GitHub's license API classifies it as
`"key":"other","spdx_id":"NOASSERTION"` (`gh api repos/agda/agda`), likely
because the file has an extended contributor-attribution preamble before
the standard MIT boilerplate rather than a canonical "MIT License" title
line. Recorded as an open discrepancy between text-shape and
auto-detected SPDX id — not legal advice, and not resolved here.

**Problem solved**: interactive dependently-typed programming language /
proof assistant based on Martin-Löf type theory — used both as a proof
assistant (propositions-as-types, goal-driven interactive proof) and as a
total (or partial, flag-dependent) functional programming language. Source:
repo description and
`doc/user-manual/getting-started/what-is-agda.lagda.rst` (v2.8.0).

**Type-theoretic rung**: full dependent types — Pi types, Sigma/record
types, inductive families indexed by data, a universe hierarchy
(`Set₀ : Set₁ : ...`) with optional cumulativity/universe polymorphism
(`doc/user-manual/language/{sort-system,universe-levels,data-types,
record-types}.lagda.rst`, v2.8.0). **Trust boundary, CITED verbatim from
`doc/user-manual/language/safe-agda.lagda.rst`**: by default (no `--safe`)
Agda is _not_ consistent-by-construction; `--safe` is required for a
trustworthy core and is **coinfective** — "if a module is declared safe,
then all its imported modules must also be declared safe." Flags/pragmas
`--safe` forbids, each individually documented as a soundness hole:
`postulate` ("can be used to assume any axiom"); `--allow-unsolved-metas`
("forces Agda to accept unfinished proofs"); `--allow-incomplete-matches`/
`NON_COVERING` ("allows to prove false using a partial function");
`--no-positivity-check`/`NO_POSITIVITY_CHECK`/`POLARITY` ("make it possible
to write non-terminating programs via datatypes that are not strictly
positive"); `--no-termination-check`/`TERMINATING`/`NON_TERMINATING`
("give loopy programs any type"); `--type-in-type`, `--omega-in-omega`,
`NO_UNIVERSE_CHECK` ("allow the user to encode the Girard-Hurken
paradox"); `INJECTIVE` pragma ("allows to prove false by declaring a
non-injective function as injective"); `ETA` pragma (can loop under
unguarded recursive records); `--injective-type-constructors` ("together
with excluded middle leads to an inconsistency via Chung-Kil Hur's
construction"); `--sized-types` ("lacks some checks that rule out
improper, inconsistent uses of sizes"); `--experimental-irrelevance`/
`--irrelevant-projections`; `--rewriting` ("can at the very least break
convergence"); K-axiom/univalence combinations
(`--cubical-compatible`+`--with-K`; `--without-K`+`--flat-split`;
`primEraseEquality`+`--without-K`); `--allow-exec` ("allows system calls
during type checking"); plus `--no-load-primitives`, `--cumulativity`,
`--large-indices` combinations, and the `COMPILE` FFI pragma.

**Checker/elaborator/solver boundary**: no architectural kernel-vs-
elaborator split (unlike Lean/Coq) — the same `TypeChecking` machinery
elaborates and validates. Elaboration components:
`src/full/Agda/TypeChecking/Rules/{Term,LHS,Application,Data,Def,Record,
Decl}.hs` (bidirectional rules), `MetaVars.hs` (unification-driven
elaboration), `InstanceArguments.hs` (instance search), `Conversion.hs`
(definitional-equality checking), `Reduce.hs` (normalization). **No SMT
solver** — inferred from `README.md`'s absence of any SMT dependency plus
the presence of purpose-built unification/normalization modules; not an
explicit "we do not use SMT" primary-doc statement, flagged as
high-confidence inference, not quoted fact. **Termination checking is a
separate pass**: `src/full/Agda/Termination/{TermCheck,CallGraph,
CallMatrix,Order,RecCheck,Termination}.hs`, structural/lexicographic-order
call-graph analysis (the "foetus" algorithm, citing Andreas Abel).
`--no-termination-check` and the `TERMINATING`/`NON_TERMINATING` pragmas
are confirmed forbidden under `--safe` (above). **Positivity checking is a
separate pass**: `src/full/Agda/TypeChecking/Positivity.hs` +
`Positivity/`; documented page is itself marked "This is a stub" in the
v2.8.0 docs. `--no-positivity-check`/`NO_POSITIVITY_CHECK` confirmed
forbidden under `--safe`.

**Guarantees / trusted base / failure modes**: TCB = the core
`TypeChecking` kernel (`Conversion.hs`, `Reduce.hs`,
`TypeChecking/Rules/`) plus, when enabled by default, the termination and
positivity checkers (load-bearing for consistency — a non-terminating
function or non-strictly-positive datatype can prove `⊥`). `--safe`
excludes the full list above, narrowing the TCB to the core calculus
without postulates/unsafe pragmas/unsafe options. **No dedicated "unsound"
label exists** on the repo (checked `gh api repos/agda/agda/labels`).
Closed historical soundness bugs found by title search: #585 ("Occurs check
unsound..."), #7568 ("Type-based termination unsound in the presence of
polymorphism"), #3049 ("Positivity unsoundness"), #2001, #405, #628
("BUILTIN NATDIVSUCAUX is unsound"), #108 ("The positivity checker accepts
unsound code") — all closed/fixed. Three open issues mention "unsound" in
body text (#7614, #4788, PR #5234) but were **not individually triaged**
for whether they represent live `--safe`-mode holes (§ Unresolved).

**Implementation paths**: kernel `src/full/Agda/TypeChecking/`
(`Conversion.hs`, `Reduce.hs`, `MetaVars.hs`, `Rules/{Term,LHS,Application,
Data,Def,Record,Decl}.hs`, `InstanceArguments.hs`); termination checker
`src/full/Agda/Termination/TermCheck.hs` + `{CallGraph,CallMatrix,Order,
RecCheck,Termination,CutOff}.hs`; positivity checker
`src/full/Agda/TypeChecking/Positivity.hs` + `Positivity/`.

**Unresolved**: whether #7614/#4788/#5234 are live `--safe`-reachable
soundness holes or lower-severity issues; "SMT-free" is an inference, not a
quoted primary-doc sentence; SPDX id vs. license-text-shape discrepancy
unresolved (recommend a human/legal check if load-bearing); no single
canonical "known soundness gaps" list exists beyond `safe-agda.lagda.rst`.

**Example patterns**:

- **POSITIVE** (CITED): `doc/user-manual/language/coverage-checking.lagda.rst`
  — `Vec A n` with `head : ∀ {A m} → Vec A (suc m) → A`; the `[]` case is
  correctly excluded because unifying `Vec A 0` against the required
  `Vec A (suc m)` fails.
- **MINIMAL REJECTION** (PROPOSED, rule CITED): `loop : Nat → Nat;
loop n = loop n` is rejected by the default termination checker because
  `n` is not structurally smaller than the caller's argument — a direct
  application of the structural-recursion rule in
  `termination-checking.lagda.rst`. The doc itself only shows accepted
  schemas, not a labeled rejection example, so this snippet is constructed,
  not quoted.
- **SUBTLE ADVERSARIAL** (CITED, doc-official): `positivity-checking.lagda.rst`
  contains a worked example using the `POLARITY` pragma on a postulated
  function type to derive `⊥` from a non-strictly-positive encoding,
  closing with the doc's own line: "Polarity pragmas are not allowed in
  safe mode." This directly demonstrates the `--safe` trust boundary with a
  concrete inconsistency proof, sourced verbatim from Agda's own
  documentation (not reproduced verbatim here beyond structure — see the
  doc page for the full derivation).

---

## Card 6 — Idris 2

**Pinned version**: tag `v0.8.0` ("2025 Hallowe'en Release"), published
2025-10-31, commit `15a3e4e70843f7a34100f6470c04b791330788df` (via
`gh api repos/idris-lang/Idris2/releases/latest` and `.../tags`).

**License**: `BSD-3-Clause` (verified from text, not assumed). Path:
`/LICENSE` at commit `15a3e4e7`
(https://github.com/idris-lang/Idris2/blob/v0.8.0/LICENSE). Header:
"Copyright (c) 2020 Edwin Brady, School of Computer Science, University of
St Andrews... Redistribution and use in source and binary forms..." —
canonical 3-clause BSD text (no advertising clause).

**Problem solved**: a dependently-typed general-purpose language whose core
(TT) is **Quantitative Type Theory (QTT)** — every binder carries a
multiplicity, so erasure and linear-resource-protocol correctness are
**checked** typing properties, not merely optimizer-inferred ones. Source:
`docs/source/tutorial/multiplicities.rst` (CITED, commit `15a3e4e7`).

**Type-theoretic rung**: QTT, developed by Bob Atkey and Conor McBride —
CITED in-repo, `multiplicities.rst`: "Idris 2 is based on Quantitative Type
Theory (QTT) ... a core language developed by Bob Atkey and Conor McBride"
(links https://bentnib.org/quantitative-type-theory.html); and
`docs/source/implementation/overview.rst`: "Core language TT ... based on
quantitative type theory ... Binders have 'multiplicities' which are either
0, 1 or unlimited." Edwin Brady's own design paper is linked from the
tutorial as the canonical writeup — "Idris 2: Quantitative Type Theory in
Action" (https://www.type-driven.org.uk/edwinb/idris-2-quantitative-type-theory-in-action.html,
CITED via in-repo link, content not independently re-fetched here).
Difference from plain dependent types (e.g. Agda): multiplicities are
checked by a dedicated post-elaboration pass (`Core/LinearCheck.idr`, not
merely inferred dead-code elimination) — `multiplicities.rst` states this
directly via the `vlen`/`sumLengths` rejected-vs-accepted example.

**Checker/elaborator/solver boundary**: elaborator `RawImp → TT`
(`TTImp.Elab.{Term,Check}`) relies on **pattern unification**
(`Core/Unify.idr`, `UnifyState.idr`) — "essentially works the same way as
Agda as described in Ulf Norell's thesis" (`overview.rst`, "Unification").
**No SMT solver** — verified absent by direct inspection of
`src/Core/*` file names and the overview doc; auto-implicits are resolved
by proof search (`Core/AutoSearch.idr`), not an SMT decision procedure.
**Multiplicity/linearity checking is a separate pass, not integrated into
unification**: "There is a separate linearity check after elaboration...
implemented in `Core.LinearCheck`" (`overview.rst`); export `linearCheck`
(`src/Core/LinearCheck.idr`, line 694) is invoked from
`TTImp/ProcessDef.idr` (confirmed via code search across
`TTImp/Elab.idr`, `TTImp/ProcessType.idr`, `Idris/REPL.idr`,
`Core/Context.idr`). **Erasure is structural, not just a flag**:
`overview.rst`, "Erasure": "0-multiplicity arguments to constructors are
erased completely, whereas 0-multiplicity arguments to functions are
replaced with a placeholder erased value." `src/Core/CompileExpr.idr`
defines an explicit `CErased` IR constructor; `src/Compiler/CompileExpr.idr`
implements the erasure pass (`EraseArgs`, `eraseConArgs`,
`expandToArity`).

**Guarantees / trusted base / failure modes**: TCB = core type-checker/
unifier (`Core/TT.idr`, `Core/Unify.idr`, `Core/UnifyState.idr`) + the
separate linearity checker (`Core/LinearCheck.idr`) + the shared erasure
pass (`Compiler/CompileExpr.idr`) + each codegen backend. Idris 2 ships
multiple backends (`src/Compiler/{RefC,Scheme,ES}/` — C/reference-counted,
Chez Scheme/Racket, JS/Node). Backends consume the already-erased
`CExp`/`NamedCExp` IR without re-deriving multiplicities themselves — a bug
in the shared erasure pass or a backend's mishandling of the `CErased`
placeholder could in principle reintroduce or mis-run an erased term; this
is an inference from code structure, not a doc statement (flagged
PLAUSIBLE, not CITED-confirmed). **Documented soundness issues** (`gh api`
issue search, `repo:idris-lang/Idris2`): **#1163, closed 2021-03-09**,
"Linearity checker issue allows using 0-multiplicity values" — a
`(0 x : Nat) -> Nat` function extracted `x` at runtime via a dependent
type-level match trick, type-checked incorrectly, and the compiled Scheme
program crashed with "attempt to reference unbound identifier" — a real
observed runtime failure from an erasure/soundness gap, fixed prior to
v0.8.0 but not independently re-tested against current HEAD here. Also
closed: #73 (multiplicity subtyping with dependent types), #2895, #1447,
#1274, #758, #189 (linearity-checker edge cases around lets/monad-wrapping
— a recurring historical pattern). **Open as of 2026-07-29**: #3287
(over-rejection/completeness gap with abstract interfaces wrapping a
linear state-transformer monad — a false negative, not unsoundness),
#1204, #3732, #490, #3758, #2948.

**Implementation paths**: core/unifier `src/Core/{TT,Unify,UnifyState,
Normalise,Value,Context}.idr`; linearity checker `src/Core/LinearCheck.idr`
(706 lines, `linearCheck` at line 694); elaborator `src/TTImp/Elab.idr` +
`TTImp/Elab/`; definition processing (invokes `linearCheck`)
`src/TTImp/ProcessDef.idr`; erasure `src/Core/CompileExpr.idr` (IR,
`CErased`), `src/Compiler/CompileExpr.idr` (pass logic, ~lines 22-107,
546-619); codegen backends `src/Compiler/RefC.idr` + `RefC/` (C, reference
counting — v0.8.0 changelog notes precise-drop RC), `src/Compiler/Scheme/`,
`src/Compiler/ES/`.

**Unresolved**: whether current RefC/Scheme/ES backends carry any
_currently open_ erasure-reintroduction or linearity-violation-at-runtime
bug (search not exhaustive); whether `LinearCheck.idr`'s current
implementation still admits any variant of the #1163 exploit class (not
independently re-tested against v0.8.0); elaborator-reflection ×
multiplicity-checking interaction (external tutorial not fetched — any
claim here would be proposed, not cited); RefC's reference-counting
optimization's machine-code-level interaction with linearity guarantees
(not verified in detail).

**Example patterns** (all CITED, `docs/source/tutorial/multiplicities.rst`,
commit `15a3e4e7`):

- **POSITIVE**: a `Door` resource-protocol type
  (`data Door : DoorState -> Type`) with `1`-multiplicity linear arguments
  on `openDoor`/`closeDoor`/`deleteDoor`, used in sequence so each door
  value is consumed exactly once, statically enforced ("Resource
  protocols").
- **MINIMAL REJECTION**: `badNot : (0 x : Bool) -> Bool; badNot False =
True; badNot True = False` — rejected: "Attempt to match on erased
  argument False in Main.badNot." Also a linear value used twice
  (`duplicate x = (x, x)` → "There are 2 uses of linear name x") and zero
  times (→ "There are 0 uses of linear name...") ("Linearity"/"Erasure").
- **SUBTLE ADVERSARIAL**: doc-sanctioned legitimate boundary case — an
  erased (`0`) argument's value can be matched when it is uniquely
  re-derivable from a companion singleton-typed argument
  (`sNot : (0 x : Bool) -> SBool x -> Bool`) — an intentional, checked
  exception to "no matching on erased args" ("Erasure"). Historical
  adversarial instance of the _same_ boundary via a different route (a
  type-level, not value-level, dependent match): issue #1163 (above) — the
  closest primary-source evidence of "erased value leaks through a
  dependent match on its type," fixed pre-v0.8.0, general-class closure not
  independently re-verified.

---

## Comparison table — what each rung can express and cannot establish

| Rung (project)                                                                                           | Expresses                                                                                                                                                                                                                                                     | Deliberately cannot establish (by design, not a bug)                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit polymorphism + typed equality evidence — System F / System FC (GHC Core)                        | Explicit type abstraction/application; type-safe optimization passes re-checkable against one small typed IR; GADT/type-family equalities as first-class coercion terms                                                                                       | Value-dependent types (types cannot depend on runtime values); case-match exhaustiveness (named, permanent Core Lint gap); anything behind `unsafeEqualityProof`/plugin-supplied coercions, which are trusted axiomatically                                                                                                                                                                                 |
| SMT-backed decidable refinements over a non-dependent base — Liquid Haskell (Haskell), Flux (Rust)       | Predicate-refined base types (bounds, non-emptiness, sortedness, ownership-aware strong updates over `&mut`); properties reduced to solver-decidable (or solver-heuristic) subtyping obligations                                                              | Properties outside the supported logic fragment (nonlinear arithmetic is heuristic/incomplete unless restricted); anything behind `assume`/`trusted`/`extern_spec` escape hatches, which are unchecked by construction; aliasing or type-erasure interactions the refinement layer cannot see into (e.g. `Any::downcast_mut`, GADT-existential lambdas)                                                     |
| Full dependent types + effects + SMT automation + separate extraction — F*                               | Types computed from values (e.g. length-indexed vectors with arithmetic on indices); effectful (stateful) specifications; SMT-discharged proof obligations without hand-written proof terms                                                                   | Independent proof-term replay outside the solver — Z3's answer is trusted directly, not re-checked by a smaller kernel; proof stability across solver/context changes (documented, named fragility); correctness of the separate extraction pipeline (OCaml/F#/KaRaMeL/Vale), which sits outside type-checking + SMT proof; anything behind `admit()`/`assume val`                                          |
| Full dependent types, unification+normalization kernel, termination/positivity as separate passes — Agda | Pi/Sigma types, inductive families, universe hierarchy; a documented, enumerable set of trust-weakening flags whose exclusion (`--safe`) defines a narrower, named TCB                                                                                        | Consistency under default (non-`--safe`) settings, where `postulate`, unsolved metas, non-covering matches, disabled termination/positivity checks, and several universe/K-axiom combinations are all live, individually documented soundness holes; no SMT-style automation — obligations must be proved, not discharged heuristically                                                                     |
| Quantitative Type Theory: dependent types with checked, multiplicity-based erasure — Idris 2             | Resource-aware typing (0/1/ω multiplicities) as a _checked_ property, not an optimizer heuristic; structural (not just flagged) erasure of 0-multiplicity terms from compiled output, verified by a dedicated post-elaboration pass distinct from unification | Backend-level preservation of the erasure/linearity judgment — multiple codegen backends consume the pre-erased IR without re-deriving multiplicities, so a backend or shared-pass bug is architecturally capable of violating the judgment (inferred, not proven); historical evidence (#1163) that type-level (not value-level) matches can leak erased values around the checked boundary, since patched |

Reading the table as a ladder (not a total order — cf.
`uncertainties/0002-type-system-refinement-ladder.md` §"Counterevidence and
risks"): each rung adds an axis of checked property (polymorphism evidence
→ decidable logical refinement → full value-dependency + effects →
consistency-under-restriction + no-solver kernel → checked resource
erasure), and each axis has its own, separately named boundary rather than
a single "more trusted" scale. Liquid Haskell/Flux and Agda/Idris 2 are
not comparable by "higher rung wins" — Liquid Haskell/Flux buy SMT
automation at the cost of solver-boundary trust that Agda's kernel avoids
entirely (no SMT at all), while Agda's kernel avoids SMT but has no
value-dependent-erasure discipline comparable to Idris 2's QTT. This
labeled reading is **inference**, drawn from the six cards above, not an
additional fact from any one project's own documentation.

## Candidate future local oracle experiments (proposed, not run)

None of the following were executed against a real toolchain in this
research pass; each is a PROPOSED example above, restated here as a
pointer for a future falsifiable experiment, per
`uncertainties/0002-type-system-refinement-ladder.md` §"Resolving
experiment":

1. GHC: construct the ill-typed-instantiation Core term (Card 1, minimal
   rejection) and confirm `-dcore-lint` rejects it; separately construct an
   optimization pass that drops an "impossible" case branch and confirm
   Core Lint's documented blind spot (case-match exhaustiveness) lets it
   through.
2. Liquid Haskell: the `assume reflect` + nonlinear-arithmetic composition
   (Card 2, subtle adversarial) as a concrete failing/passing pair.
3. Flux: the aliased-`&mut` + `trusted`-helper composition (Card 3, subtle
   adversarial) as a concrete test file.
4. F*: reproduce the `tests/error-messages/`-style minimal rejection (Card 4) and independently confirm the `admit()` soundness hole against a
   pinned Z3 version.
5. Agda: run the cited `POLARITY`-postulate derivation of `⊥` (Card 5)
   under both default and `--safe` mode to confirm `--safe` actually
   rejects it.
6. Idris 2: attempt to reproduce the #1163 exploit class (Card 6) against
   the pinned `v0.8.0` to confirm the fix still holds, and separately
   probe backend-level erasure preservation (RefC vs. Scheme vs. ES) for
   the same source program.

None of these were run; recording them as unresolved-but-actionable is
required by design spec 0002 ("facts, inference, recommendation, and
unresolved uncertainty are visibly distinct") and does not upgrade any
example's evidence category.
