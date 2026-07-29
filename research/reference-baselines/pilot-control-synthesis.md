# Reference-baselines routed pilot: control synthesis

Status: **partial research artifact; not accepted as boundary-mapped portfolio**

Run: `wf_4acac964-579`

Date observed: 2026-07-29

## What ran

The structured Fable-led control workflow completed all 14 child tasks:

- 7 Sonnet retrieval/repair tasks;
- 5 Opus comparison and verification tasks;
- 2 Fable synthesis/ranking tasks;
- live concurrency 1;
- 2h07m workflow wall time;
- 1,608,084 subagent tokens;
- 245 tool calls;
- zero child errors.

The result contains 17 project cards across all eight required clusters, 119
typed claims (95 fact, 20 unverified, 3 inference, 1 refuted), 31 candidate
methods, 12 accepted methods, 12 ranked experiments, 133 counterexamples, 17
unresolved questions, and 8 rejected patterns.

The author separately spot-checked Koka's Apache-2.0 license and
TigerBeetle's `src/tidy.zig` enforcement artifact. Those observations do not
upgrade the rest of the corpus.

## Known defect and blast radius

The workflow received its argument object as a JSON string. The script did not
parse that string, so project context was empty:

- `run_date` became unknown in the structured result;
- frozen boundaries and current frontier were absent from downstream prompts;
- every `target_boundary` value was a forced default.

Retrieval, source verification, license observations, claim typing, method
rungs, and experiment mechanics are mostly context-independent and remain
useful. The operator-required target-boundary mapping is not established.
Therefore this pilot is a control measurement and method candidate source, not
the completed design-spec 0002 portfolio.

The repair must replay cached retrieval with correctly parsed arguments and
re-run classification, synthesis, ranking, and boundary mapping. It must not
silently fill boundaries after the fact.

## Accepted method candidates

These are research recommendations, not project decisions.

| Method ID | Rung | Reusable method | Important limit |
|---|---|---|---|
| `sem.per-artifact-assumption-query` | generated | Derive an artifact's assumptions by walking the same recorded dependency edges that produced it. | Opaque primitives remain invisible and require an explicit register. |
| `sem.small-kernel-rechecks-untrusted-producer` | static | Only a small checker can construct an admitted type; scope trust claims by producer failures, property, escapes, and version. | Generating producer and checker from one decision implementation destroys redundancy. |
| `sem.replay-the-artifact-not-the-build` | tested | Persist the consumer-facing artifact and revalidate it in a separate process with seeded corruptions. | Independent from the producing run, not necessarily from checker defects. |
| `sem.effect-rows-in-function-types` | static | Thread ambient effects through explicit capabilities and deny bypasses statically. | A closed capability discipline is weaker than Koka-style open effect rows. |
| `dod.demand-driven-memoized-query-graph` | tested | Record query dependencies and compare incremental results with from-scratch evaluation. | Purity and invalidation granularity remain explicit preconditions. |
| `dod.result-identity-short-circuit` | tested | Backdate equal recomputed results and assert named recomputation truncation in CI. | Requires canonical deterministic outputs. |
| `dod.diagnostics-as-data-side-channel` | static | Keep diagnostics out of memoized result identity while testing delivery and span-only edits. | Applies at memoization boundaries, not necessarily everywhere. |
| `dod.structured-diagnostic-record-with-provenance` | static | Stable typed diagnostic records feed multiple renderers and carry producer/code/documentation/confidence fields. | Call-site spans and confidence can still be wrong. |
| `dod.green-red-lossless-syntax-tree` | tested | Separate immutable offset-free shared syntax from derived positions; test round-trip identity and fuzz it. | Losslessness is not established by the representation alone. |
| `dod.stable-ids-over-addresses-and-offsets` | static | Use closed newtype IDs across revisions/wire boundaries; forbid offset constructors. | Within-revision storage may still share by pointer. |
| `disc.tool-normalized-formatting` | generated | Generate canonical formatting and gate drift; map every claimed rule to its enforcing artifact. | The checked-versus-review-only register remains maintained knowledge. |
| `disc.zero-warning-tool-gate` | static | Treat selected analyzers and warnings as merge-blocking; seed a warning to prove the gate can fail. | Warning-free is not defect-free and analyzer coverage is chosen. |

## Ranked experiments

1. `E1-shape-probe-and-double-run-determinism` — first establish project shape
   and byte-identical repeated outputs.
2. `E2-ambient-effect-inventory-and-capability-gate` — inventory ambient access
   and statically gate one capability wall.
3. `E3-round-trip-losslessness-property` — round-trip syntax over the fixture
   corpus plus a bounded fuzz budget.
4. `E4-assumption-query-over-recorded-edges` — derive assumptions and include a
   deliberate opaque-primitive negative case.
5. `E5-offset-free-key-audit` — inventory keys and convert one cross-revision
   identity to a closed newtype.
6. `E6-identity-excluded-diagnostics-at-one-boundary` — compare diagnostic
   placement variants and require no recomputation on span-only edits.
7. `E7-incremental-vs-from-scratch-differential` — randomized edit scripts
   compare incremental and clean evaluation.
8. `E8-typed-diagnostic-record-and-registry` — one producer, two renderers, and
   a completeness failure fixture.
9. `E9-checked-admission-gate` — prove non-mintability and reject seeded
   corruptions at one trust boundary.
10. `E10-ci-artifact-replay` — reload persisted artifacts and reject bit flips
    and schema drift.
11. `E11-zero-warning-gate` — make one seeded warning turn CI red.
12. `E12-fmt-check-plus-enforcement-register` — make formatting drift red and
    require an artifact for every “checked” rule.

Each experiment in the raw result includes a success threshold, kill criterion,
and dependency on unresolved assumptions. Boundary ranking must be recomputed
after the input repair.

## Rejected imports

The pilot rejects:

- blanket recursion bans for tree-shaped compiler data;
- abort-on-assert as a universal rule in a long-lived editor process;
- a universal post-start allocation ban for input-proportional front ends;
- vendor benchmark numbers without workload, comparison scope, and date;
- unscopeable “honest bugs” or trusted-library claims;
- assertion-density targets presented as defect-rate evidence;
- diagnostics embedded in memoized value identity at incremental boundaries;
- enforcement claims based only on prose, README paths, or fetch-layer absence.

## Most useful process learning

Every substantive refutation in the run came from comparing prose with an
enforcing repository artifact. The resulting rule is:

```text
enforcement claim
-> pinned enforcing artifact
-> executable negative fixture
```

Documentation without that edge is convention, not static enforcement. A
missing fetch is not evidence that the artifact does not exist.

## Evidence and custody

Full unreviewed payload and resumable script are preserved locally under
`.research-cache/reference-baselines/` and excluded from Git:

- result SHA-256:
  `51bb064ba951578948654c25027359b33c9f3647e4e55c75d80b077c8807f9fc`;
- workflow script SHA-256:
  `3963a2d23c3d38a038316eabc625b4a543b956d3c9365a059cf4012fd20635b9`.

This checked-in synthesis is `assertion` plus source-backed research
provenance. It is not proof, static analysis, legal advice, or an accepted
architecture decision. Source cards and licenses still require the custody
tool and independent acceptance review before canonical graph integration.

## Next action

Repair string-argument parsing and use cached retrieval to regenerate the
boundary-aware synthesis. Compare the repaired parallel treatment with this
sequential control on:

- wall time;
- token and tool cost;
- verified-claim rate;
- cluster and boundary coverage;
- refutation rate;
- correlated-source and consensus flags.
