# Decision 0007: reference-method adoption classes and boundary mapping

## Question

How does Semantic Systems adopt methods from the reference-baselines pilot
corpus without importing code, external semantics, or unverified claims?

## Alternatives

1. Treat the pilot output as a reading list and adopt nothing formally.
2. Adopt the cached synthesis as-is, including its forced default boundary
   column and its Rust-shape rung assumptions.
3. Reuse only the verified retrieval/verification packets, re-derive
   boundary mapping and rungs against the actual repository, and admit each
   method in one of three classes with a falsifiable experiment.

## Chosen option

Option 3. Every accepted method is classified as:

- **adopt substantially as-is** — the mechanism already matches project
  practice or ports unchanged (formatting/warning gates, artifact replay,
  stable exact ids);
- **adapt behind a project-owned boundary** — the method's shape is reused
  but its content is project-defined (assumption query over the canonical
  graph, independent checker at spec 0003, closed capability wall, typed
  diagnostic records);
- **fresh synthesis / deferred** — accepted only as a recorded design
  constraint on a plane that does not exist yet (query graph, diagnostics
  placement, lossless syntax tree at the production tooling plane).

The authoritative records are `research/reference-baselines/portfolio.md`
(decision table), `enforcement-ladder.md` (rung per boundary and why no
higher rung), and `adoption-experiments.md` (thresholds and kill criteria).
No reference code is copied; licenses and provenance are recorded per
method; unverified dependencies stay flagged and upgrade nothing.

## Rationale

The cached pilot proved its packets but not its boundary mapping: its argument
defect emptied the project context, and its own kill criterion required a new
rung analysis when the repository shape changed. The active implementation
plane is now TypeScript 7, Bun, and Effect v4. Its typed services, Effect-aware
static diagnostics, strict formatter and linter gates, and generated-view
checks raise some enforcement ceilings above the retired Python bootstrap.
This decision therefore uses the verified packets but re-derives every local
rung against the current toolchain. It does not upgrade any evidence category,
and external semantics remain references rather than authority.

## Confidence

High for the class assignments of methods that map onto existing gates and
frontiers (specs 0003/0004, formatting and warning gates, exact identity).
Moderate for the deferred constraints: the production-plane triad
(diagnostics/caching/lifecycle) is recorded from reference evidence, not
from a local consumer.

## Reversibility

High. Each adoption is gated by its experiment's kill criterion; deferred
methods are constraints on future design, not commitments. Removing a
method removes its experiment and register entries; no semantic contract
changes are involved.

## Affected entities

`work.reference-baselines-deep-research`, experiments RX1–RX5 and deferrals
D1–D4, the enforcement register, claims registry CLM-0005, references
catalog entries, and uncertainty 0002. The refinement-ladder packet now covers
the missing comparison class; exact remote custody pins remain unresolved.

## Reopening condition

Reopen if RX1 or RX2 kill criteria fire (the determinism or recorded-edge
premises fail locally), if custody locking or paper-body verification
contradicts a card this decision relied on, or if the production tooling
plane's actual shape invalidates the deferred constraints.
