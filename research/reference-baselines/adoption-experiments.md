# Reference-baselines adoption experiments

Status: integration candidate. Companion to `portfolio.md` and
`enforcement-ladder.md`. Feature 0002 remains in progress. Experiments are
ranked by semantic learning per unit attention for the current repository,
not the retired bootstrap shape. Cached experiments whose preconditions do
not exist are deferred with the precondition named.

Every experiment is project-owned, falsifiable, and respects the frozen
boundaries of bullet 0002 (no kernel, evidence-meaning, runtime, or
custody-implementation changes are part of any experiment below; RX
experiments touch only project tooling, fixtures, and gates).

## Completed

### RX1 — cross-runtime generator determinism (from cached E1)

- Method: `dod.result-identity-short-circuit` (precondition half).
  Boundary: B1. Rung targeted: tested.
- Do: run the current project-model validator and generator in fresh Bun and
  genuine Node processes. Write each result to a separate temporary output
  tree, compare the ten view files byte-for-byte, and repeat the comparison
  three times. Enumerate any source of divergence, including input order,
  ambient time, runtime-specific serialization, and absolute paths.
- Success: all three Bun/Node pairs have the same file set and byte digests;
  any canonicalization fix has a named source and a one-hour cap.
- Kill: by-design nondeterminism that cannot be removed within one day kills
  result-identity adoption at that output boundary.
- Assumptions: the pinned environment supplies a genuine Node runtime.
  Rank rationale: this is the cheapest probe and gates later memoization.
- Observation (2026-08-02): `nix develop --command bun
scripts/experiments/0002-generator-determinism.ts` ran six fresh runtime
  trials (three Bun, three genuine Node v24.18.0). Each trial used separate
  validator and generator processes; the Node identity probe was separate.
  All ten-view trees and CLI output streams matched byte-for-byte:
  `sha256:edbab5827c077e672c2cc805d670b54957f76b453e1d8610d1496edc221ee257`.
  This is a machine check of this source tree, not a proof of future
  determinism or memoization correctness.

### RX2 — assumptions(artifact) over recorded edges (from cached E4)

- Method: `sem.per-artifact-assumption-query`. Boundary: B1/B3. Rung:
  generated.
- Do: implement `assumptions(artifact)` walking canonical-graph relations
  (`assumes`, `supports`, `discharges`, dependency edges), rendering a
  distinguished stub/incomplete marker. Two fixtures: (positive) a seeded
  stub assumption surfaces through at least three intermediate
  derivations; (negative, kept permanently) an unmodeled opaque adapter
  yields a clean-but-wrong report — reproducing the Lean `reduceBool`
  failure shape on our own graph so the incompleteness mode is a tested
  fact. Start the opaque-primitive register with the known entries: runtime
  adapters, the generator, external tools, and manually asserted relations.
- Success: positive fixture passes on every run; negative fixture
  demonstrably shows the silent-partial report and is linked from the
  register.
- Kill: wiring exceeds two days — the "nearly free on a recorded graph"
  premise is refuted for this repository; record the actual cost.
- Assumptions: canonical relations are complete enough to be worth
  walking; the negative fixture exists precisely because they are not
  complete.
- Runnable Bun command: `nix develop --command bun scripts/experiments/0002-assumption-query.ts`.
- Runnable Node command: `nix develop --command node scripts/experiments/0002-assumption-query.ts`.
- Fixture linkage: the canonical register is `model/architecture/assumption-register.json`; positive and permanent negative fixtures are `src/project-model/assumption-fixtures.ts#positiveAssumptionFixture` and `src/project-model/assumption-fixtures.ts#negativeOpaqueAdapterFixture`.
- Each invocation emits its runtime identity and selected Effect platform layer plus a real-graph register probe and a SHA-256 digest of the runtime-independent semantic observation.
- Observation (2026-08-02): both runnable commands completed under Bun 1.3.13 with `@effect/platform-bun` and genuine Node v24.18.0 with `@effect/platform-node`. Both produced semantic digest `sha256:5abf050d55b4b7ed9da1b17176a53a0456e1531aa44a6563e5ecf92aa3acbff2`. The real-graph probe resolved all nine registered opaque primitives and emitted nine `known_opaque` markers. The positive fixture emitted one reachable assumption with `incomplete`; the permanent negative fixture emitted no assumptions with `recorded_complete`, preserving the tested clean-but-wrong mode. `bun test tests/project-model-assumptions.test.ts` passed 12 tests. The observed wiring interval from delegated implementation start through successful parent execution was 56 minutes, below the two-day kill threshold. These runtime checks and tests do not establish completeness beyond the recorded graph plus supplied register, external-tool correctness, or future behavior.

### RX5 — evidence-artifact replay in a separate process (from cached E10)

- Method: `sem.replay-the-artifact-not-the-build`. Boundary: B3/B5. Rung:
  not applicable at the current tracer boundary.
- Do: persist one tracer evidence-result artifact from a normal run; a
  separate process (no shared memory with the producer) reloads and
  re-validates identity bindings and result content; seeded bit-flip and
  schema-drift fixtures. State in the job's description that it reuses
  project validation code — independence from the run, not the
  implementation.
- Success: replay rejects 10/10 seeded corruptions and stays green on
  clean artifacts.
- Kill: if no evidence artifact is persisted across a process boundary in
  the current tracer, mark N/A and record the finding; do not manufacture
  persistence to adopt the method.
- Assumptions: custody fixtures (spec 0004 tests) already cover the
  reference-source half; this would extend the pattern to evidence results.
- Observation (2026-08-02): the current CLI supports only `semantic-tracer
demo` and emits human-readable evidence summaries. It does not emit or
  persist an `evidence_result_v1` artifact. A fresh Bun process ran the demo
  against a temporary copy of the nine-file inventory fixture with exit 0
  and empty stderr. The complete input tree remained byte-identical at
  `sha256:447b6fa72682fa1bd178365f828047e276d70db95d5c09b560ea3bf18286ce2c`;
  no file appeared and stdout contained no serialized evidence-result
  artifact. Source inspection found parsing and in-memory round-trip
  validation, but no tracer evidence-result write boundary. RX5 is therefore
  N/A under its frozen kill criterion. No persistence was manufactured.

### RX3 — ambient-effect inventory and capability wall (from cached E2)

- Method: `sem.effect-rows-in-function-types` (closed adaptation).
  Boundary: portable semantic modules under `src/**`. Rung: static wall plus
  a convention-backed exception register.
- Do: audit the current Effect service requirements and
  `scripts/oxlint/semantic-effect-rules.ts` against ambient clock, filesystem,
  network, environment, randomness, and output-order access. Move legitimate
  operations behind existing service or runtime-adapter seams. Record each
  excluded adapter path and why the portable rule cannot own it.
- Success: every portable module either exposes the capability through its
  Effect type or fails the configured lint rule; each adapter exception is
  listed once with an owner and reason.
- Kill: more than 50 load-bearing exceptions, or a rule that cannot separate
  portable semantics from runtime adapters, drops the local method to
  convention rather than pretending to implement open effect rows.
- Assumptions: the Effect-aware Oxlint plugin continues to inspect the pinned
  TypeScript AST. The gate does not establish Koka-style row polymorphism.
- Observation (2026-08-03): the configured plugin classifies each current
  TypeScript source under canonical `src/` as portable or as one of 21
  registered runtime adapters. Each adapter record owns one exact path and
  names its capability owner and reason. The register is an auditable
  admission assertion, not proof that each grant is load-bearing.
- The repository inventory fails on an unclassified source, duplicate or
  dangling adapter entry, runtime-bearing portable import, or
  portable-to-adapter import. The wall rejects static Node, Bun, and platform
  imports, re-exports, string-literal `import()`, and ambient `require()`.
  It also rejects named runtime globals, console, current-time, entropy,
  timers, fetch, and Effect execution.
- The raw-JSON rule covers `project-model`, `tracer`, `references`, `actor`,
  `stm`, `stm-explorer`, `relational-facts`, `semantic-system`,
  `kernel-calculus`, and `normalized-core`. The throw rule covers the
  project-model total-function slice. Other portable roots are not covered by
  these two narrower rules.
- `nix develop --command bun
scripts/experiments/0002-capability-wall.ts` ran configured Oxlint against a
  temporary canonical source fixture. It observed 21 expected diagnostics
  across all six rules. A lexical-service fixture and both STM runtime
  adapters emitted no `semantic-effect` diagnostics. The script removed its
  fixture.
- Dynamic non-literal module or property names, aliases, reflection, and
  dependencies outside canonical `src/` remain outside this static wall. The
  result is static diagnostic evidence. It is not effect-row polymorphism or
  proof that all ambient capabilities are absent.

## Runnable now

### RX4 — enforcement register, code registry, seeded gate failures (merges cached E8, E11, E12)

- Methods: `disc.tool-normalized-formatting`,
  `disc.zero-warning-tool-gate`,
  `dod.structured-diagnostic-record-with-provenance`,
  `dod.stable-ids-over-addresses-and-offsets` (audit). Boundary: B2 + repo
  gates. Rung: generated/static mechanisms, tested by seeded failures.
- Do: (a) create the enforcement register mapping every rule this project
  claims (AGENTS.md invariants, CONTRIBUTING gates, check scripts) to its
  enforcing artifact and environment, or explicitly `review-only`;
  (b) add a completeness test over `ValidationIssue` codes — every code
  named in a register, every registered code producible by a fixture;
  (c) seed one failure per gate (unformatted file, warning, invalid model,
  drifted view) proving each gate can fail; (d) one-time audit that no
  generated view or lock field encodes positional identity.
- Success: register names an artifact for every checked rule; the
  completeness test goes red on a seeded undocumented code; every seeded
  failure turns the pinned check red.
- Kill: none substantive; if a claimed rule has no plausible enforcing
  artifact, tag it `review-only` visibly rather than inventing tooling.
- Rationale: direct mechanization of the run's clearest lesson —
  enforcement claims cite artifacts, never prose.

## Mapped to existing frontiers (no new experiment)

- Cached E9 (checked admission gate) **is** design spec 0003 / CLM-0002:
  the independent resolution checker with mutation fixtures and the
  independence/size gate. Its first cut was rejected on the frozen size
  gate; uncertainty 0004 owns the recut. Adding a second admission-gate
  experiment would duplicate an active frontier.
- Cached E10's reference-source half **is** design spec 0004 / CLM-0003
  (offline materialization and verification with failure injection).

## Deferred until the production tooling plane (B6) exists

Preconditions recorded now so the deferral is falsifiable, not forgotten:

| ID  | From                   | Method                                                 | Precondition                                                | Standing constraint                                                                                                                                                  |
| --- | ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | E3                     | green-red lossless syntax tree                         | a parser and fixture corpus (`work.lossless-frontend-spec`) | round-trip identity is a CI property over corpus + fuzz budget from day one; classify dropped byte classes rather than only fixing them                              |
| D2  | E7 + E1 mechanism half | demand-driven query graph + result-identity backdating | a long-lived incremental consumer                           | adopt only with the differential harness (incremental ≡ from-scratch over randomized edit scripts) and recomputation counters; decide invalidation granularity first |
| D3  | E6                     | diagnostics placement at memoization boundaries        | D2's boundaries exist                                       | resolve the diagnostics/caching/lifecycle triad together, empirically (variants A/B per cached design), before queries proliferate                                   |
| D4  | E5                     | offset-free key audit at B6                            | any cross-edit reuse in B6                                  | keys crossing revision/serialization boundaries are closed newtypes; within-phase pointers legal                                                                     |

## Next experiment

RX4. RX1-RX3 are complete, and RX5 is N/A at the current tracer boundary.
The enforcement-register experiment can now bind each repository claim to a
generated, static, tested, runtime-checked, or review-only mechanism.
