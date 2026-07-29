# Design spec 0002: reference baselines deep research

Status: active

Problem owner: main research and integration agent

Semantic frontier: reference adoption, trust boundaries, compiler construction,
and enforceable engineering discipline

## User journey

A maintainer launches one Claude Code dynamic workflow and receives a
source-backed portfolio of mature language-semantics, proof, compiler,
diagnostics, verification, and engineering references. Every recommended
method states what can be adopted, what must remain project-owned, its license
and provenance, its evidence strength, its enforceability rung, its system
leverage point, and the smallest experiment that could falsify its value here.

## Falsifiable claim

A staged, model-routed research workflow can examine a broad reference corpus
without spending frontier-model reasoning on mechanical retrieval, while
retaining enough provenance and independent review for the main agent to make
auditable adoption decisions.

The claim fails if the final portfolio is a reading list, contains unsupported
claims, hides licensing or trust implications, conflates convention with
static enforcement, or recommends external semantics as the project's
authority.

## Workflow choice

Use a custom Claude Code dynamic workflow as the outer orchestrator.

The bundled `/deep-research` workflow is the reference pattern for discovery,
source fetching, cross-checking, claim voting, and cited synthesis. It is not
the outer workflow because this task additionally requires:

- explicit per-stage model routing;
- project-card schemas and license fields;
- cross-project semantic comparison;
- static/generation/test/convention enforceability classification;
- Meadows leverage-point analysis;
- project-specific adoption experiments and kill criteria;
- reusable batching across dozens to hundreds of total agents.

## Complexity routing

### Sonnet 5 — mechanical source work

Use for bounded retrieval and extraction:

- locate official documentation, papers, repositories, license files, and
  relevant implementation paths;
- record version, commit, URL, artifact type, and exact scope;
- extract architecture facts without evaluating their suitability;
- populate project cards from a fixed schema;
- flag missing or conflicting primary sources.

Sonnet must not decide kernel semantics, trust policy, or adoption.

### Opus 5 — advanced comparative reasoning

Use for:

- compare semantic mechanisms and their assumptions;
- distinguish reusable method from host-language or project-specific baggage;
- classify what can be generated, statically enforced, dynamically gated, or
  only maintained by convention;
- find counterexamples and license/trust incompatibilities;
- map methods to explicit project boundaries and candidate tracer bullets.

### Fable 5 — frontier planning and synthesis

Use only for:

- research decomposition and routing policy;
- resolving contradictions across Opus reviews;
- cross-domain synthesis;
- identifying paradigm-level opportunities and hidden assumptions;
- ranking adoption experiments by semantic learning per unit attention.

Fable does not validate its own synthesis. The main agent verifies sources,
evidence categories, repository fit, and final acceptance.

## Scale and admission control

The workflow must support hundreds of total agents through data-driven batches,
cacheable project cards, and resumable phases. Scale is total work, not
unbounded concurrency.

For this repository:

- at most one workflow child may run beside the Fable lead;
- delegated depth is lead to worker only;
- the pilot uses a small representative slice before broad fan-out;
- no worker writes project semantics or evidence status;
- larger waves require the pilot's source quality, routing accuracy, and cost
  to be reviewed first.

## Initial reference corpus

### Semantics and effects

- Koka, Eff, Links, OCaml 5, Frank, Multicore OCaml papers;
- Redex and K as executable-semantics laboratories;
- CompCert and CakeML as verified-compilation references.

### Proof and trusted checking

- Lean 4 kernel, elaborator, metaprogramming, and Mathlib boundaries;
- Rocq/Coq proof objects and extraction;
- Isabelle code generation and document model.

### Compiler data and incremental architecture

- Rust compiler arenas, interning, query system, diagnostics, and MIR;
- rust-analyzer/Rowan/Salsa incremental and lossless-tree patterns;
- VoidZero/Oxc AST layout, arena allocation, parser, linter, and diagnostics;
- Clang ASTContext/LLVM bump allocation and MLIR diagnostic/provenance seams;
- Koka Perceus and other reference-counting or reuse analyses.

### Diagnostics and observability

- Rust structured diagnostics and error codes;
- Elm and Gleam diagnostic ergonomics;
- Hazel typed holes and live semantics;
- language-server provenance and incremental invalidation patterns.

### Engineering and verification discipline

- TigerBeetle architecture and TigerStyle;
- Gerard Holzmann's Power of Ten / JPL rules;
- NASA/JPL coding and verification guidance;
- SQLite testing and fault-injection practices.

### Systems thinking

- Donella Meadows' twelve leverage points;
- correctness-by-construction, single-source, and explicit
  core-to-derivation mapping;
- paradigms as selectable tools rather than semantic authorities.

The workflow may add projects only when they cover a missing comparison class.

## Project-card schema

Every reference card must contain:

- project and pinned version or commit;
- primary sources and license;
- problem solved;
- semantic or architectural method;
- observable guarantees;
- trusted computing base;
- assumptions and failure modes;
- implementation technique and relevant source paths;
- performance evidence, if any, with benchmark scope;
- diagnostic/observability approach;
- highest enforceability rung:
  `generated`, `static`, `model_checked`, `tested`, `runtime_checked`, or
  `convention`;
- Meadows leverage point and rationale;
- reusable method;
- project-specific baggage to reject;
- target Semantic Systems boundary;
- smallest adoption experiment;
- success threshold and kill criterion;
- confidence and unresolved questions.

## Research phases

1. Fable freezes taxonomy, project-card schema, routing, and stopping rules.
2. Sonnet agents fetch primary-source packets and fill factual fields.
3. Opus agents compare packets by concern and adversarially review claims.
4. A separate Opus verification pass checks provenance, license, evidence
   scope, and enforceability classification.
5. Fable synthesizes an adoption portfolio and experiment sequence.
6. The main agent verifies accepted claims and integrates canonical records.

## Acceptance

- At least twelve representative projects cover all six corpus areas in the
  pilot.
- Every material claim links to a primary source.
- Every code-reuse candidate records its license and exact provenance.
- Facts, inference, recommendation, and unresolved uncertainty are visibly
  distinct.
- Every recommendation names an enforceability rung and explains why a higher
  rung is not yet reachable.
- Every recommendation maps to a project-owned boundary and a falsifiable
  experiment.
- At least one independent reviewer challenges each cross-project synthesis.
- The workflow records unverified and refuted claims rather than dropping them
  silently.
- No external tool, project, or model becomes semantic authority.

## Non-goals

- Copying implementation code during research;
- selecting the final kernel calculus;
- implementing the Rust compiler;
- importing a proof stack;
- adopting TigerStyle wholesale;
- claiming benchmark results outside their measured scope;
- running hundreds of agents before the pilot establishes value.

## Kill criteria

- Stop if primary-source provenance cannot survive aggregation.
- Stop if model routing spends Fable on extraction or Sonnet on foundational
  semantic decisions.
- Stop if the workflow cannot cap live concurrency independently of total
  agent count.
- Stop if source packets cannot be independently checked.
- Stop if the output cannot identify concrete experiments for the current
  semantic frontier.
