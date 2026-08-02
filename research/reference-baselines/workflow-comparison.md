# Deep-research workflow comparison

Status: accepted operational observation. The structured control's semantic
output has been repaired and boundary-mapped (see
`portfolio.md`); this document remains operational evidence only.

Compared runs:

- native control: `wf_1e8607ba-4a4`;
- explicitly routed treatment: `wf_a3592134-285`, task `wj3mrs8y3`;
- structured Fable-led control: `wf_4acac964-579` (added after completion).

The treatment script was diffed against the persisted native script. Apart
from workflow metadata and five explicit model/effort options, phase graph,
prompts, schemas, deduplication, source and claim caps, three-vote verification,
merge rules, failure persistence, and concurrency were unchanged.

## Routing observation

| Stage         | Requested         | Runtime model observed | Calls |
| ------------- | ----------------- | ---------------------- | ----: |
| Scope         | Fable 5 / high    | `claude-fable-5`       |     1 |
| Search        | Opus 5 / medium   | `claude-opus-5[1m]`    |     5 |
| Fetch/extract | Sonnet 5 / medium | `claude-sonnet-5`      |    25 |
| Verify        | Sonnet 5 / medium | `claude-sonnet-5`      |    75 |
| Synthesize    | Fable 5 / high    | `claude-fable-5`       |     1 |

The workflow journal records the runtime model for every child. It does not
record independently resolved effort, so effort values remain requested
configuration rather than observed telemetry. No child accidentally inherited
the lead model.

## Operational comparison

| Metric                                 | Native control | Routed treatment |
| -------------------------------------- | -------------: | ---------------: |
| Wall time                              |         15m41s |           11m13s |
| Agents                                 |            109 |              107 |
| Peak concurrency                       |             10 |               10 |
| Errors / retries / skips               |      0 / 0 / 0 |        0 / 0 / 0 |
| Subagent output tokens                 |      7,897,414 |        8,330,022 |
| Tool calls                             |            502 |              348 |
| Sources fetched                        |             27 |               25 |
| Primary sources                        |             26 |               23 |
| Claims extracted                       |            134 |              117 |
| Claims selected for verification       |             25 |               25 |
| Confirmed / refuted / error-unverified |     25 / 0 / 0 |       22 / 3 / 0 |
| Merged findings                        |              9 |               10 |
| Fetch phase                            |           166s |             105s |
| Verify phase                           |           562s |             359s |

Routing reduced wall time by about 28% and moved 100 of 107 calls to Sonnet
without increasing failures. Raw token totals were 5.5% higher and are not
cost-equivalent across model tiers. No exact monetary claim is made.

The treatment produced three refutations where the control produced none.
Their correctness is a semantic-quality question requiring independent source
review; it is not counted as an operational win.

## Hard-gate result

Both workflows failed design spec 0002's twelve-project and all-class coverage
gate. Their fixed global `MAX_VERIFY_CLAIMS=25` ranked effects and proof claims
ahead of:

- compiler data-oriented design and incrementality;
- diagnostics and observability;
- engineering and verification discipline;
- Meadows leverage points;
- the System-F-to-dependent-types ladder.

Approximately fifty extracted claims for those classes survived in the
journal but did not enter verification.

Because both model assignments failed identically, the coverage failure is
attributed to shared workflow mechanics rather than model routing.

## Structured control result (`wf_4acac964-579`)

The custom structured workflow (14 children, live concurrency 1, explicit
per-stage routing: 7 Sonnet retrieval, 5 Opus comparison/verification,
2 Fable synthesis/ranking) completed with zero child errors in 2h07m,
1,608,084 subagent tokens, and 245 tool calls. Against the rubric's hard
gates it delivered what both `/deep-research` variants missed:

- 17 projects across all six workflow-defined clusters (its internal
  twelve-project gate met); the frozen type-system refinement area was still
  absent and was supplied by a separate packet;
- full project cards with license fields on every card (17/17 license
  checks executed);
- typed claims preserved through aggregation: 119 claims with per-claim
  category and an independent verification verdict on all of them
  (105 verified / 10 unverified / 3 not_sampled / 1 refuted);
- per-class verification instead of a global top-25 cap — the mechanism
  change this comparison recommended;
- adversarial review of 51 targets, with consensus and authority flags;
- bounded falsifiable local experiments with thresholds and kill criteria.

Cost asymmetry is real: roughly 8× the wall time of the routed
`/deep-research` treatment at concurrency 1, though with ~5× fewer agents
and ~5× fewer subagent tokens. Wall time is not budget-equivalent across
the runs and no monetary claim is made.

One input defect: the argument object arrived as a JSON string, so project
context was empty and every `target_boundary` was a forced default. The
mechanical packets survived; boundary mapping, rungs, and ranking were
re-derived offline from the cached payload (see `portfolio.md`). Operational
lesson recorded: a workflow must fail loudly on an unparseable argument
object rather than defaulting every context field.

## Decision

Use explicit stage routing in future research workflows. Do not reuse the
native global verification budget for heterogeneous portfolios.

The accepted next workflow shape must allocate verification budgets per
comparison class, retain unverified/refuted overflow, and produce the frozen
project-card schema. The routed treatment's A/B/C semantic findings remain
provisional until independent source verification and full-class coverage.

This document is operational workflow evidence. It is not evidence that any
external semantic method is correct or suitable for adoption.
