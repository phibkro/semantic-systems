# Enforcement ladder for adopted reference methods

Status: integration candidate. Companion to `portfolio.md`; the provenance and
repair record there apply here. Feature 0002 remains in progress.

Rungs, strongest first: `generated`, `static`, `model_checked`, `tested`,
`runtime_checked`, `convention`. The ladder is per boundary and per property.
The cached rungs assumed a future Rust plane. The "here now" column is
re-derived for the active TypeScript 7, Bun, Effect v4, Oxfmt, Oxlint, and
Effect-aware TypeScript toolchain. Future Rust and Lean planes remain separate
boundaries.

## The rule the run itself proved

Every refutation in the pilot came from comparing prose with an enforcing
repository artifact:

```text
enforcement claim -> pinned enforcing artifact -> executable negative fixture
```

Documentation without that edge is convention. A failed fetch is not
evidence of absence. This rule is itself adopted at the `tested` rung via
the enforcement register (RX4): every rule this project claims as checked
must name its enforcing artifact and have a seeded failure proving the gate
can fail.

## Accepted methods by rung

### generated

**`sem.per-artifact-assumption-query`** — B1/B3, target `generated`; RX2 is
planned. The query must walk the same canonical relations that produce an
artifact, so the report and the recorded graph have one source. Why no higher
rung exists: no rung detects an opaque primitive that records no edge (the
Lean `reduceBool` incident shape, `lean4-kernel.c06`). RX2 therefore includes
an enumerated opaque-adapter register and a deliberate negative fixture.
The graph premise exists today in `model/**`; the query does not, so this
method is not yet an implemented project capability.

**`disc.tool-normalized-formatting`** (formatter half) — repository gates,
implemented. `oxfmt --check` runs from `scripts/check-fast.ts` through
`just fast`; the pinned Nix shell treats a missing tool or mismatch as failure.
Why not higher: formatting is generated from source text, but the register of
tool-checked versus review-only rules is still a maintained convention. RX4
must bind every claimed rule to its enforcing artifact and one seeded failure.

### static

**`disc.zero-warning-tool-gate`** — repository gates, implemented. Oxlint,
Effect-aware TypeScript diagnostics, and related checks fail the fast loop on
diagnostics. Why not higher: a gate is a build predicate, not a derived
artifact; its configured scope can omit a file or rule. RX4's seeded failures
must show that each named gate can fail. Power of Ten is motivating lineage
only; its strongest prose is not verified.

**`dod.structured-diagnostic-record-with-provenance`** (record half) — B2/B3.
`ValidationIssue` and the current subsystem errors are typed data with codes,
messages, and affected identities; the resolver explains decisions
structurally. Why not generated: TypeScript still permits a call site to choose
the wrong code or identity. A single-source code registry with a completeness
test (RX4) is the reachable extension, at the `tested` rung. Rustc's E-code
namespace is reference data, never this project's namespace.

**`dod.stable-ids-over-addresses-and-offsets`** — B1–B5, implemented as a
mixed static and tested discipline. Branded digests and constrained schemas
make several identity classes structurally distinct, while canonical records
and exact-commit custody preserve stable values across serialization. Why not
higher: not every string-valued id is branded, and schema checks cannot prove
that a producer chose semantic identity rather than a transient position. RX4
retains the cross-view and lock-field audit.

**`sem.effect-rows-in-function-types`** (closed-capability adaptation) —
active TypeScript services. Effect service requirements expose many
capabilities in function types, and the custom Oxlint Effect rules reject
selected ambient access in portable semantic modules. Why not higher: this is
a closed service discipline with configured adapter exceptions, not Koka-style
open effect rows; TypeScript can still represent an ambient import outside the
checked scope. The exemption surface therefore remains an explicit convention.

### tested

**`sem.small-kernel-rechecks-untrusted-producer`** — B4 (spec 0003). The
independent checker uses a small admitted operation set, typed boundaries,
forbidden-import checks, mutation fixtures, and an independence/size gate.
Its public result is structurally typed, but the claim remains `tested`:
runtime inputs still require decoding, TypeScript compilation is not a proof,
and producer/checker agreement can share a defect. Generated code is refused
because emitting both sides from one definition would destroy the intended
redundancy. Trust statements remain scoped by implementation, property,
escape set, and version.

**`sem.replay-the-artifact-not-the-build`** — B5, extend to B3.
Custody materialization already re-verifies exact committed bytes offline
with failure injection (CLM-0003). Why not higher: the property ranges over
persisted bytes under an evolving format — replay is an execution, at best
a CI job. Independence is from the producing run, never from the checker
implementation (the lean4checker disclaimer, ported verbatim as our own
scoping).

**`dod.result-identity-short-circuit`** (precondition half) — B1 now.
Canonical determinism is the precondition Salsa-style backdating needs. RX1
observed byte-identical ten-view trees and CLI output from three Bun and three
genuine Node processes on 2026-08-02. That establishes a repeatable machine
check for the current output boundary, not future determinism. The backdating
and recomputation-truncation mechanism remains deferred to B6. Silent
degradation from non-canonical results is visible only through recomputation
observations, which is why RX1 precedes that mechanism.

### deferred to B6 (accepted as design constraints, not adopted now)

| Method                                   | Rung when built                                         | Standing constraint recorded now                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dod.demand-driven-memoized-query-graph` | tested (differential CI + recomputation-log assertions) | Query interface stays project-owned; invalidation granularity chosen deliberately before queries are written; purity precondition mitigated by the capability wall, never discharged |
| `dod.diagnostics-as-data-side-channel`   | static (identity-excluded channel type)                 | The diagnostics/caching/lifecycle triad is one decision, taken together, before any query graph exists; span-bearing values inside memoized identity are a rejected pattern          |
| `dod.green-red-lossless-syntax-tree`     | tested (round-trip property + fuzz budget)              | Losslessness is a tested property, never a representation guarantee; offset-freedom of the shared layer is the statically enforceable enabling condition                             |

## Not accepted in the pilot

Nineteen candidates remain classified but unadopted (full details in the
cached payload): handlers-as-user-defined-interpreters,
translate-the-feature-away, static-refcount-insertion,
uniqueness-conditioned-inplace-reuse, taught-discipline-without-enforcement,
implementation-diversity-as-independence, library-adds-no-trust-primitives,
arena-scoped-ir-allocation, interning-for-identity-equality,
enforced-diagnostic-lifecycle, compiler-generated-refcounting-with-reuse,
no-heap-allocation-after-init, bounded-loops-and-queues,
assertion-density-space, checkable-language-subset, function-size-cap,
deterministic-simulation-last-line-of-defense, leverage-point-triage,
information-flow-restructuring. Non-acceptance is scoped to this pilot:
several (arena allocation, interning, deterministic simulation) become live
candidates when B6 exists and a project-shaped benchmark can price them.

## Meadows leverage-point note

The cached run mapped all 31 candidates to leverage points (LP2–LP12) and
flagged its own mapping as inference — the essay never discusses software.
Retained observation, labeled inference with a consensus caveat upheld by
the adversarial review: the accepted set concentrates at LP5–LP8 (rules,
information flows, feedback) rather than LP12 (constants); numeric proxy
targets (assertion density, line caps) are LP12 and were rejected. The
anticorrelation statistic in the payload is not usable evidence: both
columns were assigned by the same analyst (consensus flag F1.f01).
