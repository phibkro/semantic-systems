/** Affine cleanup projection of the frozen resource-lifecycle law tracer. */
import { Data, Effect, Exit, Schema } from "effect";
import {
  decodeKernelCheckObservationBytes,
  decodeKernelCheckObservationValue,
  decodeKernelDocumentValue,
  encodeCanonicalKernelCheckObservation,
  type KernelCheckObservation,
  type KernelDocument,
} from "../kernel-json/index.ts";
import {
  encodeCanonicalKernelEffectRunObservation,
  KernelEffectRunObservationSchema,
  toPortableFact,
  type KernelEffectRunObservation,
  type ObservableRuntimeValue,
} from "../kernel-interpreter/index.ts";
import {
  ResourceLifecycleReportSchema,
  ResourceLifecycleScriptSchema,
  traceResourceLifecycle,
  type FinalizerOutcome,
  type ResourceLifecycleFailure,
  type ResourceLifecycleReport,
  type ResourceLifecycleScript,
} from "../resource-lifecycle/index.ts";
import { replaySurfaceDocumentEffects } from "../surface-execution/index.ts";
import type { SurfaceLanguageError } from "../surface-language/index.ts";
import { canonicalBytes, compareCodePoints } from "../normalized-core/canonical.ts";

export const resourceLifecycleProjectionBounds = Object.freeze({
  maximumEvents: 32,
  maximumSuccessfulResources: 16,
  maximumReplayRequests: 48,
  maximumGeneratedLets: 48,
});

export type Int8 = readonly [number, number, number, number, number, number, number, number];

export interface RawEventPayload {
  readonly event_index: number;
  readonly label: "resource_lifecycle";
  readonly operation: "open_scope" | "acquire" | "transfer" | "release" | "exit_scope";
  readonly slots: Int8;
}

export interface CleanupRequest {
  readonly finalization_index: number;
  readonly event_index: number;
  readonly resource: string;
  readonly binder: string;
  readonly label: "resource_cleanup";
  readonly operation: "finalize";
  readonly slots: Int8;
}

export type BinderLedgerEntry =
  | {
      readonly tag: "create";
      readonly event_index: number;
      readonly resource: string;
      readonly owner_scope: string;
      readonly binder: string;
    }
  | {
      readonly tag: "move";
      readonly event_index: number;
      readonly resource: string;
      readonly from_scope: string;
      readonly to_scope: string;
      readonly from_binder: string;
      readonly to_binder: string;
    }
  | {
      readonly tag: "force";
      readonly event_index: number;
      readonly resource: string;
      readonly owner_scope: string;
      readonly binder: string;
      readonly trigger: "release" | "scope-exit";
      readonly finalization_index: number;
    }
  | {
      readonly tag: "live";
      readonly acquisition_event_index: number;
      readonly resource: string;
      readonly owner_scope: string;
      readonly binder: string;
    };

export interface ProjectionComparisons {
  readonly raw_event_bijection: true;
  readonly finalization_multiplicity: true;
  readonly cleanup_order: true;
  readonly blocked_close_non_cleanup: true;
  readonly transfer_chain_conservation: true;
  readonly backend_canonical_agreement: true;
}

type AcceptedCheck = KernelCheckObservation & {
  readonly observation: { readonly tag: "accepted" };
};

const isAcceptedCheck = (check: KernelCheckObservation): check is AcceptedCheck =>
  check.observation.tag === "accepted";

export interface ResourceLifecycleEffectProjectionReport {
  readonly format: "semantic.resource-lifecycle-effect-projection";
  readonly version: 1;
  readonly script: ResourceLifecycleScript;
  readonly lifecycle: ResourceLifecycleReport;
  readonly strings: ReadonlyArray<string>;
  readonly root_scope_index: number;
  readonly event_payloads: ReadonlyArray<RawEventPayload>;
  readonly binder_ledger: ReadonlyArray<BinderLedgerEntry>;
  readonly source: string;
  readonly kernel: KernelDocument;
  readonly check: AcceptedCheck;
  readonly reference: KernelEffectRunObservation;
  readonly compiled: KernelEffectRunObservation;
  readonly raw_requests: ReadonlyArray<RawEventPayload>;
  readonly cleanup_requests: ReadonlyArray<CleanupRequest>;
  readonly comparisons: ProjectionComparisons;
  readonly unsupported_claims: readonly [
    "exactly-once-cleanup",
    "kernel-derived-cleanup-order",
    "kernel-derived-scope-ownership",
    "real-resource-effects",
  ];
}

export class ResourceLifecycleProjectionFailure extends Data.TaggedError(
  "ResourceLifecycleProjectionFailure",
)<{
  readonly code: string;
  readonly path: string;
  readonly message: string;
}> {}

const fail = (code: string, path: string, message: string) =>
  new ResourceLifecycleProjectionFailure({ code, path, message });

const deepFreeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const portableBytes = (value: unknown): Uint8Array => {
  const snapshot = toPortableFact(value);
  if (snapshot === undefined) throw new TypeError("expected finite inert canonical data");
  return canonicalBytes(snapshot);
};

const IntSchema = Schema.Finite.pipe(Schema.check(Schema.isInt()));
const Int8Schema: Schema.Codec<Int8> = Schema.Tuple([
  IntSchema,
  IntSchema,
  IntSchema,
  IntSchema,
  IntSchema,
  IntSchema,
  IntSchema,
  IntSchema,
]);
const EventIndexSchema = Schema.Natural;
const RawEventPayloadSchema: Schema.Codec<RawEventPayload> = Schema.Struct({
  event_index: EventIndexSchema,
  label: Schema.Literal("resource_lifecycle"),
  operation: Schema.Literals(["open_scope", "acquire", "transfer", "release", "exit_scope"]),
  slots: Int8Schema,
});
const CleanupRequestSchema: Schema.Codec<CleanupRequest> = Schema.Struct({
  finalization_index: EventIndexSchema,
  event_index: EventIndexSchema,
  resource: Schema.String,
  binder: Schema.String,
  label: Schema.Literal("resource_cleanup"),
  operation: Schema.Literal("finalize"),
  slots: Int8Schema,
});
const BinderLedgerEntrySchema: Schema.Codec<BinderLedgerEntry> = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("create"),
    event_index: EventIndexSchema,
    resource: Schema.String,
    owner_scope: Schema.String,
    binder: Schema.String,
  }),
  Schema.Struct({
    tag: Schema.Literal("move"),
    event_index: EventIndexSchema,
    resource: Schema.String,
    from_scope: Schema.String,
    to_scope: Schema.String,
    from_binder: Schema.String,
    to_binder: Schema.String,
  }),
  Schema.Struct({
    tag: Schema.Literal("force"),
    event_index: EventIndexSchema,
    resource: Schema.String,
    owner_scope: Schema.String,
    binder: Schema.String,
    trigger: Schema.Literals(["release", "scope-exit"]),
    finalization_index: EventIndexSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("live"),
    acquisition_event_index: EventIndexSchema,
    resource: Schema.String,
    owner_scope: Schema.String,
    binder: Schema.String,
  }),
]);
const ComparisonsSchema: Schema.Codec<ProjectionComparisons> = Schema.Struct({
  raw_event_bijection: Schema.Literal(true),
  finalization_multiplicity: Schema.Literal(true),
  cleanup_order: Schema.Literal(true),
  blocked_close_non_cleanup: Schema.Literal(true),
  transfer_chain_conservation: Schema.Literal(true),
  backend_canonical_agreement: Schema.Literal(true),
});
const KernelDocumentSchema = Schema.declare<KernelDocument>(
  (input): input is KernelDocument => decodeKernelDocumentValue(input).status === "decoded",
  { identifier: "StrictKernelDocument" },
);
const AcceptedCheckSchema = Schema.declare<AcceptedCheck>(
  (input): input is AcceptedCheck => {
    const decoded = decodeKernelCheckObservationValue(input);
    return decoded.status === "decoded" && decoded.value.observation.tag === "accepted";
  },
  { identifier: "AcceptedKernelCheckObservation" },
);

export const ResourceLifecycleEffectProjectionReportSchema: Schema.Codec<ResourceLifecycleEffectProjectionReport> =
  Schema.Struct({
    format: Schema.Literal("semantic.resource-lifecycle-effect-projection"),
    version: Schema.Literal(1),
    script: ResourceLifecycleScriptSchema,
    lifecycle: ResourceLifecycleReportSchema,
    strings: Schema.Array(Schema.String),
    root_scope_index: EventIndexSchema,
    event_payloads: Schema.Array(RawEventPayloadSchema).pipe(
      Schema.check(Schema.isMaxLength(resourceLifecycleProjectionBounds.maximumEvents)),
    ),
    binder_ledger: Schema.Array(BinderLedgerEntrySchema).pipe(
      Schema.check(Schema.isMaxLength(resourceLifecycleProjectionBounds.maximumGeneratedLets + 16)),
    ),
    source: Schema.String,
    kernel: KernelDocumentSchema,
    check: AcceptedCheckSchema,
    reference: KernelEffectRunObservationSchema,
    compiled: KernelEffectRunObservationSchema,
    raw_requests: Schema.Array(RawEventPayloadSchema).pipe(
      Schema.check(Schema.isMaxLength(resourceLifecycleProjectionBounds.maximumEvents)),
    ),
    cleanup_requests: Schema.Array(CleanupRequestSchema).pipe(
      Schema.check(
        Schema.isMaxLength(resourceLifecycleProjectionBounds.maximumSuccessfulResources),
      ),
    ),
    comparisons: ComparisonsSchema,
    unsupported_claims: Schema.Tuple([
      Schema.Literal("exactly-once-cleanup"),
      Schema.Literal("kernel-derived-cleanup-order"),
      Schema.Literal("kernel-derived-scope-ownership"),
      Schema.Literal("real-resource-effects"),
    ]),
  });

const stringTable = (script: ResourceLifecycleScript): ReadonlyArray<string> => {
  const values = new Set<string>([script.root_scope]);
  for (const event of script.events) {
    switch (event.tag) {
      case "open_scope":
        values.add(event.scope).add(event.parent);
        break;
      case "acquire":
        values.add(event.attempt).add(event.scope);
        if (event.outcome.tag === "failed") values.add(event.outcome.message);
        else {
          values.add(event.outcome.resource);
          if (event.outcome.finalizer.tag === "failed") values.add(event.outcome.finalizer.message);
        }
        break;
      case "transfer":
        values.add(event.resource).add(event.from_scope).add(event.to_scope);
        break;
      case "release":
        values.add(event.resource).add(event.scope);
        break;
      case "exit_scope":
        values.add(event.scope);
        break;
    }
  }
  return [...values].sort(compareCodePoints);
};

const eventPayloads = (
  script: ResourceLifecycleScript,
  index: ReadonlyMap<string, number>,
): ReadonlyArray<RawEventPayload> =>
  script.events.map((event, eventIndex): RawEventPayload => {
    const at = (value: string): number => index.get(value)!;
    switch (event.tag) {
      case "open_scope":
        return {
          event_index: eventIndex,
          label: "resource_lifecycle",
          operation: event.tag,
          slots: [eventIndex, at(event.scope), at(event.parent), -1, -1, -1, -1, -1],
        };
      case "acquire": {
        if (event.outcome.tag === "failed") {
          return {
            event_index: eventIndex,
            label: "resource_lifecycle",
            operation: event.tag,
            slots: [
              eventIndex,
              at(event.attempt),
              at(event.scope),
              -1,
              0,
              at(event.outcome.message),
              -1,
              -1,
            ],
          };
        }
        const finalizer = event.outcome.finalizer;
        return {
          event_index: eventIndex,
          label: "resource_lifecycle",
          operation: event.tag,
          slots: [
            eventIndex,
            at(event.attempt),
            at(event.scope),
            at(event.outcome.resource),
            1,
            -1,
            finalizer.tag === "succeeded" ? 1 : 0,
            finalizer.tag === "failed" ? at(finalizer.message) : -1,
          ],
        };
      }
      case "transfer":
        return {
          event_index: eventIndex,
          label: "resource_lifecycle",
          operation: event.tag,
          slots: [
            eventIndex,
            at(event.resource),
            at(event.from_scope),
            at(event.to_scope),
            -1,
            -1,
            -1,
            -1,
          ],
        };
      case "release":
        return {
          event_index: eventIndex,
          label: "resource_lifecycle",
          operation: event.tag,
          slots: [eventIndex, at(event.resource), at(event.scope), -1, -1, -1, -1, -1],
        };
      case "exit_scope": {
        const cause = event.cause === "normal" ? 0 : event.cause === "typed-failure" ? 1 : 2;
        return {
          event_index: eventIndex,
          label: "resource_lifecycle",
          operation: event.tag,
          slots: [eventIndex, at(event.scope), -1, -1, cause, -1, -1, -1],
        };
      }
    }
  });

interface LiveBinder {
  readonly acquisitionEvent: number;
  readonly attempt: string;
  readonly acquiredScope: string;
  readonly finalizer: FinalizerOutcome;
  binder: string;
  owner: string;
  moves: number;
  live: boolean;
}

type SourceAction =
  | { readonly tag: "raw"; readonly payload: RawEventPayload }
  | { readonly tag: "create"; readonly binder: string; readonly slots: Int8 }
  | { readonly tag: "move"; readonly from: string; readonly to: string }
  | { readonly tag: "force"; readonly binder: string; readonly finalization: number };

interface ProjectionPlan {
  readonly ledger: ReadonlyArray<BinderLedgerEntry>;
  readonly actions: ReadonlyArray<SourceAction>;
  readonly cleanups: ReadonlyArray<CleanupRequest>;
  readonly generatedLets: number;
}

const buildPlan = (
  script: ResourceLifecycleScript,
  lifecycle: ResourceLifecycleReport,
  payloads: ReadonlyArray<RawEventPayload>,
  strings: ReadonlyMap<string, number>,
): ProjectionPlan => {
  const states = new Map<string, LiveBinder>();
  const ledger: Array<BinderLedgerEntry> = [];
  const actions: Array<SourceAction> = [];
  const cleanups: Array<CleanupRequest> = [];
  const finalizations = lifecycle.observations.filter((item) => item.tag === "finalization");
  const byEvent = new Map<number, typeof finalizations>();
  for (const item of finalizations) {
    const entries = byEvent.get(item.event_index) ?? [];
    byEvent.set(item.event_index, [...entries, item]);
  }

  for (let eventIndex = 0; eventIndex < script.events.length; eventIndex += 1) {
    const event = script.events[eventIndex]!;
    actions.push({ tag: "raw", payload: payloads[eventIndex]! });
    if (event.tag === "acquire" && event.outcome.tag === "succeeded") {
      const binder = `cleanup_e${eventIndex}_m0`;
      const state: LiveBinder = {
        acquisitionEvent: eventIndex,
        attempt: event.attempt,
        acquiredScope: event.scope,
        finalizer: event.outcome.finalizer,
        binder,
        owner: event.scope,
        moves: 0,
        live: true,
      };
      states.set(event.outcome.resource, state);
      ledger.push({
        tag: "create",
        event_index: eventIndex,
        resource: event.outcome.resource,
        owner_scope: event.scope,
        binder,
      });
      const finalizerCode = event.outcome.finalizer.tag === "succeeded" ? 1 : 0;
      const message =
        event.outcome.finalizer.tag === "failed"
          ? strings.get(event.outcome.finalizer.message)!
          : -1;
      actions.push({
        tag: "create",
        binder,
        slots: [
          eventIndex,
          strings.get(event.outcome.resource)!,
          strings.get(event.attempt)!,
          strings.get(event.scope)!,
          finalizerCode,
          message,
          -1,
          -1,
        ],
      });
    } else if (event.tag === "transfer") {
      const state = states.get(event.resource)!;
      const from = state.binder;
      state.moves += 1;
      state.binder = `cleanup_e${state.acquisitionEvent}_m${state.moves}`;
      state.owner = event.to_scope;
      ledger.push({
        tag: "move",
        event_index: eventIndex,
        resource: event.resource,
        from_scope: event.from_scope,
        to_scope: event.to_scope,
        from_binder: from,
        to_binder: state.binder,
      });
      actions.push({ tag: "move", from, to: state.binder });
    }

    for (const observation of byEvent.get(eventIndex) ?? []) {
      const state = states.get(observation.resource)!;
      const finalizationIndex = cleanups.length;
      const entry: Extract<BinderLedgerEntry, { readonly tag: "force" }> = {
        tag: "force",
        event_index: eventIndex,
        resource: observation.resource,
        owner_scope: observation.scope,
        binder: state.binder,
        trigger: observation.trigger,
        finalization_index: finalizationIndex,
      };
      ledger.push(entry);
      const finalizerCode = state.finalizer.tag === "succeeded" ? 1 : 0;
      const message = state.finalizer.tag === "failed" ? strings.get(state.finalizer.message)! : -1;
      const slots: Int8 = [
        state.acquisitionEvent,
        strings.get(observation.resource)!,
        strings.get(state.attempt)!,
        strings.get(state.acquiredScope)!,
        finalizerCode,
        message,
        -1,
        -1,
      ];
      cleanups.push({
        finalization_index: finalizationIndex,
        event_index: eventIndex,
        resource: observation.resource,
        binder: state.binder,
        label: "resource_cleanup",
        operation: "finalize",
        slots,
      });
      actions.push({ tag: "force", binder: state.binder, finalization: finalizationIndex });
      state.live = false;
    }
  }

  for (const [resource, state] of [...states]
    .filter(([, candidate]) => candidate.live)
    .sort(([left], [right]) => compareCodePoints(left, right))) {
    ledger.push({
      tag: "live",
      acquisition_event_index: state.acquisitionEvent,
      resource,
      owner_scope: state.owner,
      binder: state.binder,
    });
  }
  return { ledger, actions, cleanups, generatedLets: actions.length };
};

const tupleType = "Int * (Int * (Int * (Int * (Int * (Int * (Int * Int))))))";
const tupleValue = (slots: Int8): string =>
  `(${slots[0]}, (${slots[1]}, (${slots[2]}, (${slots[3]}, (${slots[4]}, (${slots[5]}, (${slots[6]}, ${slots[7]})))))))`;

const generateSource = (actions: ReadonlyArray<SourceAction>): string => {
  let body = "return[1] ()";
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]!;
    switch (action.tag) {
      case "raw":
        body = `let raw_e${action.payload.event_index} = perform[0] resource_lifecycle.${action.payload.operation}(${tupleValue(action.payload.slots)}) in\n  ${body}`;
        break;
      case "create":
        body = `let ${action.binder} = return[1] thunk { perform[0] resource_cleanup.finalize(${tupleValue(action.slots)}) } in\n  ${body}`;
        break;
      case "move":
        body = `let ${action.to} = return[1] ${action.from} in\n  ${body}`;
        break;
      case "force":
        body = `let finalized_${action.finalization} = force ${action.binder} in\n  ${body}`;
        break;
    }
  }
  return (
    `kernel "semantic.kernel-calculus/0018/v1";\n` +
    `effect resource_lifecycle.open_scope : ${tupleType} -> Unit;\n` +
    `effect resource_lifecycle.acquire : ${tupleType} -> Unit;\n` +
    `effect resource_lifecycle.transfer : ${tupleType} -> Unit;\n` +
    `effect resource_lifecycle.release : ${tupleType} -> Unit;\n` +
    `effect resource_lifecycle.exit_scope : ${tupleType} -> Unit;\n` +
    `effect resource_cleanup.finalize : ${tupleType} -> Unit;\n` +
    `run ${body}`
  );
};

const decodeSlots = (value: ObservableRuntimeValue): Int8 | undefined => {
  const output: Array<number> = [];
  let cursor = value;
  for (let index = 0; index < 7; index += 1) {
    if (cursor.kind !== "pair" || cursor.first.kind !== "int") return undefined;
    output.push(cursor.first.value);
    cursor = cursor.second;
  }
  if (cursor.kind !== "int") return undefined;
  output.push(cursor.value);
  return [
    output[0]!,
    output[1]!,
    output[2]!,
    output[3]!,
    output[4]!,
    output[5]!,
    output[6]!,
    output[7]!,
  ];
};

interface DecodedRequests {
  readonly raw: ReadonlyArray<RawEventPayload>;
  readonly cleanup: ReadonlyArray<CleanupRequest>;
}

const decodeRequests = (
  run: KernelEffectRunObservation,
  planned: ReadonlyArray<CleanupRequest>,
  expectedCount: number,
): DecodedRequests | ResourceLifecycleProjectionFailure => {
  const observation = run.observation;
  if (
    observation.tag !== "executed" ||
    observation.provided_observations !== expectedCount ||
    observation.applied_observations !== expectedCount ||
    observation.requests.length !== expectedCount ||
    observation.result.tag !== "returned" ||
    observation.result.value.kind !== "unit"
  ) {
    return fail(
      "backend.incomplete",
      "$.observation",
      "backend did not apply every unit acknowledgement and return unit",
    );
  }
  const raw: Array<RawEventPayload> = [];
  const cleanup: Array<CleanupRequest> = [];
  for (const request of observation.requests) {
    if (request.result_type.kind !== "unit")
      return fail(
        "request.result-type",
        "$.observation.requests",
        "projected request result type was not Unit",
      );
    const slots = decodeSlots(request.argument);
    if (slots === undefined)
      return fail(
        "request.payload",
        "$.observation.requests",
        "projected request did not contain exactly eight integers",
      );
    if (
      request.label === "resource_lifecycle" &&
      ["open_scope", "acquire", "transfer", "release", "exit_scope"].includes(request.operation)
    ) {
      raw.push({
        event_index: slots[0],
        label: "resource_lifecycle",
        operation: request.operation as RawEventPayload["operation"],
        slots,
      });
    } else if (request.label === "resource_cleanup" && request.operation === "finalize") {
      const metadata = planned[cleanup.length];
      if (metadata === undefined)
        return fail(
          "request.cleanup-unplanned",
          "$.observation.requests",
          "backend emitted an unplanned cleanup request",
        );
      cleanup.push({ ...metadata, slots });
    } else
      return fail(
        "request.operation",
        "$.observation.requests",
        "backend emitted an operation outside the frozen projection protocol",
      );
  }
  return { raw, cleanup };
};

const reportBytes = (report: ResourceLifecycleEffectProjectionReport): Uint8Array =>
  portableBytes(report);

export const projectResourceLifecycleEffects = (
  input: unknown,
): Effect.Effect<
  ResourceLifecycleEffectProjectionReport,
  ResourceLifecycleFailure | ResourceLifecycleProjectionFailure | SurfaceLanguageError
> =>
  Effect.gen(function* () {
    const lifecycle = yield* traceResourceLifecycle(input);
    const script = lifecycle.script;
    if (script.events.length > resourceLifecycleProjectionBounds.maximumEvents) {
      return yield* fail(
        "limit.events",
        "$.events",
        "source event count exceeds the 32-event projection limit",
      );
    }
    if (lifecycle.resources.length > resourceLifecycleProjectionBounds.maximumSuccessfulResources) {
      return yield* fail(
        "limit.resources",
        "$.events",
        "successful resource count exceeds the 16-resource projection limit",
      );
    }
    const strings = stringTable(script);
    const indices = new Map(strings.map((value, index) => [value, index] as const));
    const payloads = eventPayloads(script, indices);
    const plan = buildPlan(script, lifecycle, payloads, indices);
    const replayRequests = payloads.length + plan.cleanups.length;
    if (replayRequests > resourceLifecycleProjectionBounds.maximumReplayRequests) {
      return yield* fail(
        "limit.requests",
        "$.events",
        "replay request count exceeds the 48-request projection limit",
      );
    }
    if (plan.generatedLets > resourceLifecycleProjectionBounds.maximumGeneratedLets) {
      return yield* fail(
        "limit.lets",
        "$.events",
        "generated let count exceeds the 48-let projection limit",
      );
    }
    const source = generateSource(plan.actions);
    const observations = {
      format: "semantic.kernel-observation-script",
      version: 1,
      observations: Array.from({ length: replayRequests }, () => ({ kind: "unit" as const })),
    };
    const replay = yield* replaySurfaceDocumentEffects(source, observations);
    if (replay.compilation.check.observation.tag !== "accepted") {
      return yield* fail(
        "kernel.rejected",
        "$.check",
        "generated affine cleanup projection was rejected by the kernel checker",
      );
    }
    const checked = decodeKernelCheckObservationBytes(
      encodeCanonicalKernelCheckObservation(replay.compilation.check),
    );
    if (checked.status !== "decoded" || !isAcceptedCheck(checked.value)) {
      return yield* fail(
        "internal.check",
        "$.check",
        "accepted check failed its existing strict canonical codec",
      );
    }
    const acceptedCheck = checked.value;
    const detachedScript = yield* Schema.decodeUnknownEffect(ResourceLifecycleScriptSchema, {
      onExcessProperty: "error",
    })(script).pipe(
      Effect.mapError(() =>
        fail("internal.script", "$.script", "validated script failed its strict codec"),
      ),
    );
    const detachedLifecycle = yield* Schema.decodeUnknownEffect(ResourceLifecycleReportSchema, {
      onExcessProperty: "error",
    })(lifecycle).pipe(
      Effect.mapError(() =>
        fail("internal.lifecycle", "$.lifecycle", "lifecycle report failed its strict codec"),
      ),
    );
    const reference = decodeRequests(replay.reference, plan.cleanups, replayRequests);
    if (reference instanceof ResourceLifecycleProjectionFailure) return yield* reference;
    const compiled = decodeRequests(replay.compiled, plan.cleanups, replayRequests);
    if (compiled instanceof ResourceLifecycleProjectionFailure) return yield* compiled;

    const rawEqual = equalBytes(portableBytes(reference.raw), portableBytes(payloads));
    const cleanupEqual = equalBytes(portableBytes(reference.cleanup), portableBytes(plan.cleanups));
    const backendRunsEqual = equalBytes(
      encodeCanonicalKernelEffectRunObservation(replay.reference),
      encodeCanonicalKernelEffectRunObservation(replay.compiled),
    );
    const backendRequestsEqual = equalBytes(portableBytes(reference), portableBytes(compiled));
    const blocked = new Set(
      lifecycle.observations
        .filter((item) => item.tag === "scope-close-blocked")
        .map((item) => item.event_index),
    );
    const blockedOkay = plan.cleanups.every((item) => !blocked.has(item.event_index));
    if (!rawEqual || !cleanupEqual || !backendRunsEqual || !backendRequestsEqual || !blockedOkay) {
      return yield* fail(
        "comparison.disagreed",
        "$",
        "projected lifecycle, cleanup, or backend observations disagreed",
      );
    }
    const report: ResourceLifecycleEffectProjectionReport = {
      format: "semantic.resource-lifecycle-effect-projection",
      version: 1,
      script: detachedScript,
      lifecycle: detachedLifecycle,
      strings,
      root_scope_index: indices.get(script.root_scope)!,
      event_payloads: payloads,
      binder_ledger: plan.ledger,
      source,
      kernel: replay.compilation.kernel,
      check: acceptedCheck,
      reference: replay.reference,
      compiled: replay.compiled,
      raw_requests: reference.raw,
      cleanup_requests: reference.cleanup,
      comparisons: {
        raw_event_bijection: true,
        finalization_multiplicity: true,
        cleanup_order: true,
        blocked_close_non_cleanup: true,
        transfer_chain_conservation: true,
        backend_canonical_agreement: true,
      },
      unsupported_claims: [
        "exactly-once-cleanup",
        "kernel-derived-cleanup-order",
        "kernel-derived-scope-ownership",
        "real-resource-effects",
      ],
    };
    return deepFreeze(report);
  });

const decodeRepresentation = (input: unknown) => {
  const snapshot = toPortableFact(input);
  if (snapshot === undefined)
    return Effect.fail(
      fail(
        "report.non-inert",
        "$",
        "report must be finite inert JSON without aliases or accessors",
      ),
    );
  return Schema.decodeUnknownEffect(ResourceLifecycleEffectProjectionReportSchema, {
    onExcessProperty: "error",
  })(snapshot).pipe(
    Effect.mapError(() =>
      fail(
        "report.representation-rejected",
        "$",
        "report does not match semantic.resource-lifecycle-effect-projection/v1",
      ),
    ),
  );
};

export const decodeResourceLifecycleEffectProjectionReport = (
  input: unknown,
): Effect.Effect<ResourceLifecycleEffectProjectionReport, ResourceLifecycleProjectionFailure> =>
  Effect.gen(function* () {
    const decoded = yield* decodeRepresentation(input);
    const expected = yield* projectResourceLifecycleEffects(decoded.script).pipe(
      Effect.mapError(() =>
        fail(
          "report.script-invalid",
          "$.script",
          "embedded script does not produce a projection report",
        ),
      ),
    );
    if (!equalBytes(reportBytes(decoded), reportBytes(expected))) {
      return yield* fail(
        "report.derived-fields-mismatch",
        "$",
        "report does not equal the projection rederived from its embedded script",
      );
    }
    return expected;
  });

export const encodeResourceLifecycleEffectProjectionReport = (
  report: ResourceLifecycleEffectProjectionReport,
): Uint8Array => {
  const decoded = Effect.runSyncExit(decodeResourceLifecycleEffectProjectionReport(report));
  if (Exit.isFailure(decoded))
    throw new TypeError(
      "expected a strictly rederived semantic.resource-lifecycle-effect-projection/v1 report",
    );
  return reportBytes(decoded.value);
};
