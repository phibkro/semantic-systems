# Design spec 0045: affine resource cleanup effect projection

Status: frozen for implementation

Date: 2026-08-01

Depends-On-Feature-IDs: 0026-semantic-surface-language,
0038-surface-effect-replay, 0044-resource-lifecycle-law-tracer

Design-Lens-Version: open-semantic-system-v1

## Problem

Feature 0044 establishes a finite resource-lifecycle law model, but does not
show which laws the existing surface language and 0018 affine kernel can
reflect. Merely emitting one generic effect per source event would repeat the
0038 effect-replay result without exercising cleanup ownership.

Feature 0045 translates a bounded accepted lifecycle script into ordinary
surface effects plus grade-`1` cleanup thunks. Transfer consumes the current
cleanup binder into a fresh affine binder. Release or accepted scope exit
forces the current binder in the exact order derived by 0044. A blocked close
forces nothing, and a live resource leaves its affine binder unused. The
reference interpreter and bytecode VM then replay the same generated program.

The 0044 tracer remains lifecycle semantic authority. The kernel checker can
reject duplicated affine cleanup, but grade `1` permits omission; it does not
independently prove scope completeness or derive cleanup order.

## Felt journey

An agent supplies a resource script with acquisition, transfer, a blocked
parent close, child exit, and finalizer failure. It receives readable Semantic
source, the checked kernel document, a resource-to-binder movement ledger, and
both affine traces. Cleanup requests occur once and in the same order as the
0044 finalization observations; the failed cleanup remains inert payload data
and later cleanup requests still occur.

## Open semantic system design lens

### Boundary and warranted state

Feature 0045 owns:

- a deterministic string table and fixed-width event payload projection;
- generated existing surface syntax for lifecycle events and cleanup thunks;
- an explicit resource-to-binder movement ledger;
- one `semantic.resource-lifecycle-effect-projection` version 1 report;
- comparisons of raw events, projected cleanup, transfer chains, blocked
  closes, and backend observations; and
- strict report rederivation from the embedded script.

The 0044 tracer owns transition validity, ownership, and lifecycle laws. The
surface compiler owns source-to-kernel elaboration, the kernel checker owns
affine-use judgments, and each backend owns its execution trace. The
projection composes those observations without taking over their authority.

### Semantic inputs

The public operation accepts an unknown 0044 lifecycle-script value and first
runs `traceResourceLifecycle`. Its inert snapshotting, strict Effect Schema,
identity bounds, transition rejection, and caller custody are reused.

Version 1 additionally permits at most:

- 32 source events;
- 16 successful resources;
- 48 replay requests; and
- 48 generated nested `let` terms.

All four limits are checked before surface compilation. They are deliberately
narrower than 0044 because current surface sequencing and canonical kernel
decoding retain structural depth. Exceeding a projection limit returns one
typed diagnostic and never truncates the script.

All identities and diagnostic messages form one deduplicated string table
sorted by Unicode code-point order. The root scope is represented by its table
index. Every raw lifecycle event becomes one `resource_lifecycle.<event>`
operation with a right-associated eight-int payload:

```text
0 event index             4 outcome or exit-cause code
1 primary string index    5 outcome-message index
2 secondary string index  6 finalizer-outcome code
3 tertiary string index   7 finalizer-message index
```

Unused slots are `-1`. Encodings are:

- `open_scope`: primary scope, secondary parent;
- `acquire`: primary attempt, secondary scope, tertiary resource or `-1`,
  outcome `0` failed or `1` succeeded, failure message when failed, finalizer
  `-1` absent, `0` failed, or `1` succeeded, and finalizer failure message;
- `transfer`: primary resource, secondary source, tertiary target;
- `release`: primary resource, secondary scope; and
- `exit_scope`: primary scope, with outcome `0` normal, `1` typed failure, or
  `2` cancellation.

Each raw event operation returns `Unit` at grade `0`; its acknowledgement is
sequenced and discarded. Successful acquisition then introduces one grade-`1`
thunk whose force emits `resource_cleanup.finalize` with a fixed eight-int
payload. Its slots are acquisition event index, resource index, attempt index,
acquired-scope index, finalizer code (`0` failed or `1` succeeded), finalizer
message index or `-1`, then two `-1` sentinels. Failed acquisition creates no
thunk.

Transfer emits the raw event and consumes the current cleanup binder exactly
once through `let cleanup_next = return[1] cleanup_current in ...`. Release and
each 0044 finalization observation at accepted scope exit force only the
current binder. The generator follows the 0044 finalization observation order.
Blocked close emits its raw event but forces none. The program ends exactly
with `return[1] ()`.

One unit observation acknowledges every raw event and projected cleanup
request. Scripted finalizer failure remains encoded in the cleanup request; a
unit acknowledgement does not turn it into success and does not stop later
cleanup requests.

### Semantic outputs

Success returns one deeply immutable report with this exact public shape. The
named imported types are their already-frozen version-1 representations.

```ts
type Int8 = readonly [number, number, number, number, number, number, number, number]

interface RawEventPayload {
  readonly event_index: number
  readonly label: "resource_lifecycle"
  readonly operation: "open_scope" | "acquire" | "transfer" | "release" | "exit_scope"
  readonly slots: Int8
}

interface CleanupRequest {
  readonly finalization_index: number
  readonly event_index: number
  readonly resource: string
  readonly binder: string
  readonly label: "resource_cleanup"
  readonly operation: "finalize"
  readonly slots: Int8
}

type BinderLedgerEntry =
  | {
      readonly tag: "create"
      readonly event_index: number
      readonly resource: string
      readonly owner_scope: string
      readonly binder: string
    }
  | {
      readonly tag: "move"
      readonly event_index: number
      readonly resource: string
      readonly from_scope: string
      readonly to_scope: string
      readonly from_binder: string
      readonly to_binder: string
    }
  | {
      readonly tag: "force"
      readonly event_index: number
      readonly resource: string
      readonly owner_scope: string
      readonly binder: string
      readonly trigger: "release" | "scope-exit"
      readonly finalization_index: number
    }
  | {
      readonly tag: "live"
      readonly acquisition_event_index: number
      readonly resource: string
      readonly owner_scope: string
      readonly binder: string
    }

interface ProjectionComparisons {
  readonly raw_event_bijection: true
  readonly finalization_multiplicity: true
  readonly cleanup_order: true
  readonly blocked_close_non_cleanup: true
  readonly transfer_chain_conservation: true
  readonly backend_canonical_agreement: true
}

interface ResourceLifecycleEffectProjectionReport {
  readonly format: "semantic.resource-lifecycle-effect-projection"
  readonly version: 1
  readonly script: ResourceLifecycleScript
  readonly lifecycle: ResourceLifecycleReport
  readonly strings: ReadonlyArray<string>
  readonly root_scope_index: number
  readonly event_payloads: ReadonlyArray<RawEventPayload>
  readonly binder_ledger: ReadonlyArray<BinderLedgerEntry>
  readonly source: string
  readonly kernel: KernelDocument
  readonly check: KernelCheckObservation & { readonly observation: { readonly tag: "accepted" } }
  readonly reference: KernelEffectRunObservation
  readonly compiled: KernelEffectRunObservation
  readonly raw_requests: ReadonlyArray<RawEventPayload>
  readonly cleanup_requests: ReadonlyArray<CleanupRequest>
  readonly comparisons: ProjectionComparisons
  readonly unsupported_claims: readonly [
    "exactly-once-cleanup",
    "kernel-derived-cleanup-order",
    "kernel-derived-scope-ownership",
    "real-resource-effects",
  ]
}
```

The accepted-check refinement above is semantic, not a second structural copy
of the check. Implementations compose the existing strict kernel document,
check, and effect-run codecs; they do not replace those authorities with
`Schema.Unknown` or a permissive declaration.

Binder identities are deterministic ASCII surface identifiers. An acquisition
at event `e` creates `cleanup_e<e>_m0`; its `n`th accepted transfer creates
`cleanup_e<e>_m<n>`. No other binder naming scheme is valid in version 1.

Arrays have one canonical order:

- `strings` use Unicode code-point order after deduplication;
- `event_payloads` and `raw_requests` use ascending source `event_index`;
- create, move, and force ledger entries occur in generated source order;
- forces and `cleanup_requests` use 0044 finalization-observation order, with
  zero-based `finalization_index` in that order; and
- live ledger entries follow all event-derived entries and sort by resource
  identity in Unicode code-point order.

The `raw_requests` and `cleanup_requests` records are decoded from the backend
request arguments rather than copied from the planned payloads. Both backends
must yield those same decoded arrays; the report stores one copy only after
canonical equality is established.

Success requires all comparison fields to be true. The decoder snapshots the
unknown report, strictly decodes its bounded representation, reprojects only
from the embedded script, and compares canonical bytes. Forged source, tables,
ledger, kernel data, traces, or comparisons reject.

### Effect protocols and uncertainty

1. Validate the script and derive its 0044 report.
2. Derive string/event tables and the cleanup binder plan.
3. Enforce projection and generated-depth limits.
4. Generate and compile one surface program.
5. Require the kernel check observation to be accepted.
6. Replay one captured unit-observation script through the independent
   reference and bytecode paths.
7. Decode requests and compare them with raw events, 0044 finalizations, and
   the binder ledger.
8. Require exact canonical backend agreement and emit the derived report.

Unit acknowledgements are scripted observations, not evidence that a real
resource was acquired or finalized. Lifecycle and backend traces remain
separate evidence structures in the report.

### Components and orthogonal structures

```text
0044 script -> strict tracer -> lifecycle report / finalization oracle
     |                              |
     v                              v
raw event payloads       cleanup thunk + binder-move plan
     |                              |
     +----------> readable Semantic source
                            |
                            v
                 elaborator + kernel checker
                      /             \
                     v               v
             reference replay   bytecode replay
                      \             /
                       v           v
                  law-trace comparisons
```

Script identity, string-table indices, named surface binders, de Bruijn
indices, affine continuation custody, cleanup ownership, and external runtime
authority remain distinct.

### Bounded autonomy and resources

- the four explicit projection limits above;
- exactly eight safe integers per raw event and cleanup request;
- existing 0044, source, kernel JSON, evaluator, VM, trace, and observation
  limits still apply;
- no I/O, network, clock, random source, retry, queue, background task, or real
  resource access; and
- iterative table/ledger comparison; only the generated surface program is
  structurally nested.

### Evidence, assumptions, and unsupported claims

Acceptance covers normal, typed-failure, and cancellation exits; successful
and failed acquisition/finalization; transfer; early release; blocked close;
open live resources; exact bounds; Unicode and duplicate table strings; caller
custody; forged reports; request perturbation; grade-`1` transfer followed by
force; accepted unused live cleanup; and rejected duplicate force. Generated
valid scripts compare cleanup order and multiplicity with 0044. A perturbed
backend observation must make the comparator disagree.

This can establish that generated cleanup is at most once, transfer is a
single-use binder move, cleanup request order/multiplicity agrees with 0044,
blocked close forces nothing, live resources remain unforced, and both
backends execute the same projection.

It cannot establish that the kernel independently derives ownership, reverse
order, or close completeness. Grade `1` is affine, so omission is accepted; it
cannot express a must-use cleanup obligation. The result also does not warrant
fresh nominal handles, handle use/escape, regions, real finalizers, host
interruption, child-task termination, a live handler, or external effects.

The current kernel also lacks sums, equality, branching, recursion,
collections, and strings needed to interpret arbitrary lifecycle state inside
the language. That is evidence for external handler capability or future
expressiveness, not by itself evidence that resources need a kernel form.
Feature 0045 therefore does not set the 0042 resource candidate's
`faithful_surface_elaboration` or `kernel_obstruction_established` observation.

## Deep-module contract

```text
projectResourceLifecycleEffects(input)
  -> Effect<ResourceLifecycleEffectProjectionReport,
            ResourceLifecycleFailure |
            ResourceLifecycleProjectionFailure |
            SurfaceLanguageError>

decodeResourceLifecycleEffectProjectionReport(input)
  -> Effect<ResourceLifecycleEffectProjectionReport,
            ResourceLifecycleProjectionFailure>

encodeResourceLifecycleEffectProjectionReport(report) -> Uint8Array
```

Implementation belongs under `src/resource-lifecycle-projection/` and may
depend on `resource-lifecycle`, `surface-language`, `surface-execution`,
`kernel-json`, `kernel-interpreter`, `kernel-bytecode`, and normalized-core
canonical utilities. Lower modules must not depend on this projection.

## Oracle-first counterexamples

1. A script outside any projection limit cannot compile or truncate.
2. A rejected 0044 transition cannot generate source.
3. Locale sorting or duplicate string indices changes canonical evidence.
4. Any raw request tag, slot, order, or sentinel perturbation breaks bijection.
5. Successful acquisition creates one cleanup thunk; failed acquisition none.
6. Transfer that does not consume the old binder breaks conservation.
7. Forcing one grade-`1` cleanup binder twice is rejected by the checker.
8. Omitting a live cleanup binder is accepted and cannot be called exactly-once.
9. Release or accepted exit cleanup order differing from 0044 rejects.
10. Blocked close followed by cleanup rejects.
11. Failed-finalizer payload cannot stop later cleanup requests.
12. Prefix suspension or non-unit acknowledgement cannot count as completion.
13. Backend disagreement cannot be reported as agreement.
14. Forged embedded evidence cannot pass report rederivation.
15. Caller mutation cannot alter an accepted report.
16. Success cannot claim a real resource effect occurred.

## Acceptance

Feature 0045 is accepted when one clean head passes its exact acceptance
script, focused Bun and genuine Node journeys, generated bounded scripts,
strict report revalidation, TypeScript 7 Effect diagnostics, Oxlint, Oxfmt,
project-model validation, generated-view equality, Nix checks, the complete
repository gate, and independent exact-head review.

## Kill or redesign criteria

Recut if one transfer followed by one force does not typecheck, if duplicate
force is not rejected, if 48 generated lets do not survive the complete
surface-to-backend path, if cleanup order cannot be compared to 0044, if
either backend calls the tracer, if lower syntax or bytecode must change, or
if success requires treating scripted acknowledgements as real effects.

## Non-goals

No new surface syntax, kernel constructor, bytecode instruction, general
resource handler, exactly-once type, fresh handle, region checker, runtime
capability, external I/O, concurrency, STM, optimizer, deployment, or kernel
promotion decision.

## Semantic diff

Agents gain an executable projection in which existing affine binders visibly
carry, move, and consume cleanup thunks. The two backends reproduce the 0044
cleanup order and multiplicity for a finite subset, while missing must-use and
general handler machinery remains explicit rather than being mistaken for a
completed resource language.
