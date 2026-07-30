import { Data, Effect, Result, Schema } from "effect";
import { snapshotSemanticValue, type SemanticValueRejected } from "./custody.ts";
import { requireComponent, type InvalidSemanticComponent } from "./definition.ts";
import { observation, react, SemanticKernelFailure, validateState } from "./kernel.ts";
import type {
  ArtifactEnvelope,
  CommandEnvelope,
  Diagnostic,
  DomainEventEnvelope,
  EffectRequestEnvelope,
  ObservationEnvelope,
  ObservationProvenance,
  Reaction,
  SemanticComponent,
  Tagged,
} from "./model.ts";

export class InvalidInterpreterRegistry extends Data.TaggedError("InvalidInterpreterRegistry")<{
  readonly reason: string;
}> {
  override get message(): string {
    return this.reason;
  }
}

export class InterpreterAttemptFailed extends Data.TaggedError("InterpreterAttemptFailed")<{
  readonly actionId: string;
  readonly outcome: "rejected" | "unknown";
  readonly reason: string;
}> {
  override get message(): string {
    return `${this.actionId}: interpreter ${this.outcome}: ${this.reason}`;
  }
}

export class InvalidDriverBounds extends Data.TaggedError("InvalidDriverBounds")<{
  readonly field: string;
}> {
  override get message(): string {
    return `${this.field} must be a positive safe integer`;
  }
}

export interface InterpreterObservationDraft<Observation extends Tagged> {
  readonly messageId: string;
  readonly provenance: ObservationProvenance;
  readonly payload: Observation;
}

export interface InterpreterEntry<
  Request extends Tagged,
  Observation extends Tagged,
  Requirements,
> {
  readonly requestTag: Request["_tag"];
  readonly interpret: (
    request: EffectRequestEnvelope<Request>,
  ) => Effect.Effect<
    InterpreterObservationDraft<Observation>,
    InterpreterAttemptFailed,
    Requirements
  >;
}

export interface InterpreterRegistry<
  Request extends Tagged,
  Observation extends Tagged,
  Requirements,
> {
  readonly componentId: string;
  readonly requestTags: ReadonlyArray<string>;
  readonly _Types?: {
    readonly request: Request;
    readonly observation: Observation;
    readonly requirements: Requirements;
  };
}

interface RegistryInternals<Request extends Tagged, Observation extends Tagged, Requirements> {
  readonly handlers: ReadonlyMap<
    string,
    (
      request: EffectRequestEnvelope<Request>,
    ) => Effect.Effect<
      InterpreterObservationDraft<Observation>,
      InterpreterAttemptFailed,
      Requirements
    >
  >;
}

class RegistryImpl<
  Request extends Tagged,
  Observation extends Tagged,
  Requirements,
> implements InterpreterRegistry<Request, Observation, Requirements> {
  readonly #custody = true;
  readonly #component: object;
  readonly #internals: RegistryInternals<Request, Observation, Requirements>;
  readonly componentId: string;
  readonly requestTags: ReadonlyArray<string>;

  constructor(
    componentId: string,
    requestTags: ReadonlyArray<string>,
    component: object,
    internals: RegistryInternals<Request, Observation, Requirements>,
  ) {
    this.componentId = componentId;
    this.requestTags = requestTags;
    this.#component = component;
    this.#internals = internals;
    Object.freeze(this);
  }

  static is(value: unknown): value is RegistryImpl<Tagged, Tagged, unknown> {
    return typeof value === "object" && value !== null && #custody in value && value.#custody;
  }

  internals(): RegistryInternals<Request, Observation, Requirements> {
    return this.#internals;
  }

  isFor(component: object): boolean {
    return this.#component === component;
  }
}

export const requireInterpreterRegistry = <
  Request extends Tagged,
  Observation extends Tagged,
  Requirements,
>(
  registry: InterpreterRegistry<Request, Observation, Requirements>,
  component?: object,
): Effect.Effect<
  RegistryInternals<Request, Observation, Requirements>,
  InvalidInterpreterRegistry
> => {
  if (!RegistryImpl.is(registry)) {
    return Effect.fail(
      new InvalidInterpreterRegistry({
        reason: "interpreter registry was not constructed by defineInterpreterRegistry",
      }),
    );
  }
  const guarded = registry as unknown as RegistryImpl<Request, Observation, Requirements>;
  if (component !== undefined && !guarded.isFor(component)) {
    return Effect.fail(
      new InvalidInterpreterRegistry({
        reason: "interpreter registry belongs to a different component instance",
      }),
    );
  }
  return Effect.succeed(guarded.internals());
};

export const defineInterpreterRegistry = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
  Requirements,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  entries: ReadonlyArray<InterpreterEntry<Request, Observation, Requirements>>,
): Effect.Effect<
  InterpreterRegistry<Request, Observation, Requirements>,
  InvalidInterpreterRegistry | InvalidSemanticComponent | SemanticValueRejected
> =>
  Effect.gen(function* () {
    const { spec } = yield* requireComponent(component);
    const handlers = new Map<
      string,
      (
        request: EffectRequestEnvelope<Request>,
      ) => Effect.Effect<
        InterpreterObservationDraft<Observation>,
        InterpreterAttemptFailed,
        Requirements
      >
    >();
    for (const entry of entries) {
      const requestTag = entry.requestTag;
      if (
        typeof requestTag !== "string" ||
        requestTag.trim().length === 0 ||
        !spec.effects.tags.includes(requestTag)
      ) {
        return yield* new InvalidInterpreterRegistry({
          reason: `interpreter request tag ${JSON.stringify(requestTag)} is not declared`,
        });
      }
      if (handlers.has(requestTag)) {
        return yield* new InvalidInterpreterRegistry({
          reason: `duplicate interpreter for request ${requestTag}`,
        });
      }
      if (typeof entry.interpret !== "function") {
        return yield* new InvalidInterpreterRegistry({
          reason: `interpreter for request ${requestTag} must be a function`,
        });
      }
      handlers.set(requestTag, entry.interpret);
    }
    const missing = spec.effects.tags.filter((tag) => !handlers.has(tag));
    if (missing.length > 0) {
      return yield* new InvalidInterpreterRegistry({
        reason: `missing interpreters for ${missing.join(", ")}`,
      });
    }
    const requestTags = yield* snapshotSemanticValue(
      [...handlers.keys()].sort(),
      "interpreter registry tags",
    );
    return new RegistryImpl(component.id, requestTags, component, {
      handlers: new Map(handlers),
    });
  });

export interface DriverBounds {
  readonly maximumInputs: number;
  readonly maximumEffects: number;
  readonly maximumQueueStock: number;
  readonly maximumObservations: number;
}

export interface DriverCounts {
  readonly processedInputs: number;
  readonly interpretedEffects: number;
  readonly returnedObservations: number;
}

export interface InterpreterAttempt {
  readonly actionId: string;
  readonly requestMessageId: string;
  readonly outcome: "observed" | "rejected" | "unknown";
  readonly observationMessageId?: string;
  readonly reason?: string;
}

export type DriverTraceEntry<
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> =
  | {
      readonly sequence: number;
      readonly kind: "command";
      readonly value: CommandEnvelope<Command>;
    }
  | {
      readonly sequence: number;
      readonly kind: "observation";
      readonly value: ObservationEnvelope<Observation>;
    }
  | {
      readonly sequence: number;
      readonly kind: "domain_event";
      readonly value: DomainEventEnvelope<Event>;
    }
  | {
      readonly sequence: number;
      readonly kind: "artifact";
      readonly value: ArtifactEnvelope<Artifact>;
    }
  | {
      readonly sequence: number;
      readonly kind: "effect_request";
      readonly value: EffectRequestEnvelope<Request>;
    }
  | {
      readonly sequence: number;
      readonly kind: "diagnostic";
      readonly value: Diagnostic;
    }
  | {
      readonly sequence: number;
      readonly kind: "interpreter_attempt";
      readonly value: InterpreterAttempt;
    }
  | {
      readonly sequence: number;
      readonly kind: "final_state";
      readonly value: State;
    };

interface DriverResultBase<
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> {
  readonly state: State;
  readonly events: ReadonlyArray<DomainEventEnvelope<Event>>;
  readonly artifacts: ReadonlyArray<ArtifactEnvelope<Artifact>>;
  readonly effects: ReadonlyArray<EffectRequestEnvelope<Request>>;
  readonly observations: ReadonlyArray<ObservationEnvelope<Observation>>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  readonly attempts: ReadonlyArray<InterpreterAttempt>;
  readonly trace: ReadonlyArray<
    DriverTraceEntry<State, Command, Observation, Event, Artifact, Request>
  >;
  readonly counts: DriverCounts;
  readonly remainingInputs: ReadonlyArray<
    CommandEnvelope<Command> | ObservationEnvelope<Observation>
  >;
  readonly remainingEffects: ReadonlyArray<EffectRequestEnvelope<Request>>;
}

export interface DriverCompleted<
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> extends DriverResultBase<State, Command, Observation, Event, Artifact, Request> {
  readonly status: "completed";
}

export interface DriverSuspended<
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> extends DriverResultBase<State, Command, Observation, Event, Artifact, Request> {
  readonly status: "suspended";
  readonly reason:
    | "input_fuel_exhausted"
    | "effect_fuel_exhausted"
    | "observation_bound_exhausted"
    | "queue_stock_exhausted"
    | "duplicate_action"
    | "interpreter_rejected"
    | "interpreter_unknown";
}

export type DriverResult<
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> =
  | DriverCompleted<State, Command, Observation, Event, Artifact, Request>
  | DriverSuspended<State, Command, Observation, Event, Artifact, Request>;

type DriverError =
  | InvalidDriverBounds
  | InvalidInterpreterRegistry
  | InvalidSemanticComponent
  | SemanticKernelFailure
  | SemanticValueRejected;

export const interpretEffectRequest = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
  Requirements,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  registry: InterpreterRegistry<Request, Observation, Requirements>,
  request: EffectRequestEnvelope<Request>,
): Effect.Effect<
  ObservationEnvelope<Observation>,
  | InvalidInterpreterRegistry
  | InvalidSemanticComponent
  | InterpreterAttemptFailed
  | SemanticKernelFailure
  | SemanticValueRejected,
  Requirements
> =>
  Effect.gen(function* () {
    const { spec } = yield* requireComponent(component);
    const ownedRequest = yield* snapshotSemanticValue(request, "interpreter effect request");
    const rawCandidate = ownedRequest as unknown;
    if (typeof rawCandidate !== "object" || rawCandidate === null || Array.isArray(rawCandidate)) {
      return yield* new InvalidInterpreterRegistry({
        reason: "effect request envelope must be a record",
      });
    }
    const fields = rawCandidate as Record<string, unknown>;
    const allowedKeys = new Set([
      "actionId",
      "category",
      "causationId",
      "componentId",
      "correlationId",
      "messageId",
      "payload",
      "schemaId",
    ]);
    if (Object.keys(fields).some((key) => !allowedKeys.has(key))) {
      return yield* new InvalidInterpreterRegistry({
        reason: "effect request envelope contains undeclared fields",
      });
    }
    if (registry.componentId !== component.id || fields["componentId"] !== component.id) {
      return yield* new InvalidInterpreterRegistry({
        reason: "interpreter registry or request belongs to a different component",
      });
    }
    if (
      fields["category"] !== "effect_request" ||
      fields["schemaId"] !== spec.effects.schemaId ||
      typeof fields["messageId"] !== "string" ||
      fields["messageId"].trim().length === 0 ||
      typeof fields["correlationId"] !== "string" ||
      fields["correlationId"].trim().length === 0 ||
      typeof fields["actionId"] !== "string" ||
      fields["actionId"].trim().length === 0 ||
      (fields["causationId"] !== undefined &&
        (typeof fields["causationId"] !== "string" || fields["causationId"].trim().length === 0))
    ) {
      return yield* new InvalidInterpreterRegistry({
        reason: "effect request envelope does not match the component protocol",
      });
    }
    const decodedPayload = yield* Schema.decodeUnknownEffect(spec.effects.schema, {
      onExcessProperty: "error",
    })(fields["payload"]).pipe(
      Effect.mapError(
        (cause) =>
          new InvalidInterpreterRegistry({
            reason: `effect request payload failed its declared schema: ${cause.message}`,
          }),
      ),
    );
    if (!spec.effects.tags.includes(decodedPayload["_tag"])) {
      return yield* new InvalidInterpreterRegistry({
        reason: "effect request payload has an undeclared protocol tag",
      });
    }
    const guardedRequest = yield* snapshotSemanticValue(
      {
        category: "effect_request" as const,
        componentId: component.id,
        schemaId: spec.effects.schemaId,
        messageId: fields["messageId"],
        correlationId: fields["correlationId"],
        ...(fields["causationId"] === undefined ? {} : { causationId: fields["causationId"] }),
        actionId: fields["actionId"],
        payload: decodedPayload,
      },
      "validated interpreter effect request",
    );
    const { handlers } = yield* requireInterpreterRegistry(registry, component);
    const handler = handlers.get(guardedRequest.payload["_tag"]);
    if (handler === undefined) {
      return yield* new InvalidInterpreterRegistry({
        reason: `no interpreter for request ${guardedRequest.payload["_tag"]}`,
      });
    }
    const draft = yield* Effect.try({
      try: () => handler(guardedRequest),
      catch: (cause) =>
        new InterpreterAttemptFailed({
          actionId: guardedRequest.actionId,
          outcome: "unknown",
          reason:
            cause instanceof Error
              ? `interpreter threw before returning an Effect: ${cause.message}`
              : "interpreter threw before returning an Effect",
        }),
    }).pipe(Effect.flatMap((program) => program));
    const ownedDraft = yield* snapshotSemanticValue(draft, "interpreter observation draft");
    const protocol = spec.protocols.find(
      (candidate) => candidate.requestTag === guardedRequest.payload["_tag"],
    );
    if (protocol === undefined || !protocol.observationTags.includes(ownedDraft.payload["_tag"])) {
      return yield* new InvalidInterpreterRegistry({
        reason: `request ${guardedRequest.payload["_tag"]} returned unrelated observation ${ownedDraft.payload["_tag"]}`,
      });
    }
    return yield* observation(
      component,
      {
        messageId: ownedDraft.messageId,
        correlationId: guardedRequest.correlationId,
        causationId: guardedRequest.messageId,
        actionId: guardedRequest.actionId,
        provenance: ownedDraft.provenance,
      },
      ownedDraft.payload,
    );
  });

const validateBound = (value: number, field: string): Effect.Effect<void, InvalidDriverBounds> =>
  Number.isSafeInteger(value) && value > 0
    ? Effect.void
    : Effect.fail(new InvalidDriverBounds({ field }));

const snapshotResult = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  result: DriverResult<State, Command, Observation, Event, Artifact, Request>,
): Effect.Effect<
  DriverResult<State, Command, Observation, Event, Artifact, Request>,
  SemanticValueRejected
> => snapshotSemanticValue(result, "direct driver result");

export const runDirect = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
  Requirements,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  registry: InterpreterRegistry<Request, Observation, Requirements>,
  initialState: unknown,
  initialInputs: ReadonlyArray<CommandEnvelope<Command> | ObservationEnvelope<Observation>>,
  bounds: DriverBounds,
): Effect.Effect<
  DriverResult<State, Command, Observation, Event, Artifact, Request>,
  DriverError,
  Requirements
> =>
  Effect.gen(function* () {
    yield* validateBound(bounds.maximumInputs, "maximumInputs");
    yield* validateBound(bounds.maximumEffects, "maximumEffects");
    yield* validateBound(bounds.maximumQueueStock, "maximumQueueStock");
    yield* validateBound(bounds.maximumObservations, "maximumObservations");
    yield* requireComponent(component);
    if (registry.componentId !== component.id) {
      return yield* new InvalidInterpreterRegistry({
        reason: "interpreter registry belongs to a different component",
      });
    }
    yield* requireInterpreterRegistry(registry, component);

    let state = yield* validateState(component, initialState);
    const inputs = [...initialInputs];
    const pendingEffects: Array<EffectRequestEnvelope<Request>> = [];
    const events: Array<DomainEventEnvelope<Event>> = [];
    const artifacts: Array<ArtifactEnvelope<Artifact>> = [];
    const effects: Array<EffectRequestEnvelope<Request>> = [];
    const observations: Array<ObservationEnvelope<Observation>> = [];
    const driverDiagnostics: Array<Diagnostic> = [];
    const attempts: Array<InterpreterAttempt> = [];
    const trace: Array<DriverTraceEntry<State, Command, Observation, Event, Artifact, Request>> =
      [];
    const tracedReturnedInputs = new WeakSet<object>();
    const seenActions = new Set<string>();
    let processedInputs = 0;
    let interpretedEffects = 0;

    const finish = (
      status: "completed" | "suspended",
      reason?: DriverSuspended<State, Command, Observation, Event, Artifact, Request>["reason"],
    ) =>
      snapshotResult({
        status,
        ...(status === "suspended" ? { reason: reason! } : {}),
        state,
        events,
        artifacts,
        effects,
        observations,
        diagnostics: driverDiagnostics,
        attempts,
        trace: [
          ...trace,
          {
            sequence: trace.length,
            kind: "final_state",
            value: state,
          },
        ],
        counts: {
          processedInputs,
          interpretedEffects,
          returnedObservations: observations.length,
        },
        remainingInputs: inputs,
        remainingEffects: pendingEffects,
      } as DriverResult<State, Command, Observation, Event, Artifact, Request>);

    if (inputs.length > bounds.maximumQueueStock) {
      return yield* new SemanticKernelFailure({
        boundary: "direct-driver.initialInputs",
        reason: `initial queue stock ${inputs.length} exceeds maximumQueueStock ${bounds.maximumQueueStock}`,
      });
    }

    while (inputs.length > 0 || pendingEffects.length > 0) {
      if (inputs.length > 0) {
        if (processedInputs >= bounds.maximumInputs) {
          return yield* finish("suspended", "input_fuel_exhausted");
        }
        const input = inputs.shift()!;
        const result: Reaction<State, Event, Artifact, Request> = yield* react(
          component,
          state,
          input,
        );
        const duplicateAction = result.effects.find((request) => seenActions.has(request.actionId));
        if (duplicateAction !== undefined) {
          inputs.unshift(input);
          const diagnostic = {
            code: "duplicate_action",
            message: `action ${duplicateAction.actionId} was emitted more than once`,
            relatedMessageId: duplicateAction.messageId,
          };
          driverDiagnostics.push(diagnostic);
          trace.push({
            sequence: trace.length,
            kind: "diagnostic",
            value: diagnostic,
          });
          return yield* finish("suspended", "duplicate_action");
        }
        if (
          inputs.length + pendingEffects.length + result.effects.length >
          bounds.maximumQueueStock
        ) {
          inputs.unshift(input);
          return yield* finish("suspended", "queue_stock_exhausted");
        }

        state = result.state;
        processedInputs += 1;
        if (input.category === "command") {
          trace.push({
            sequence: trace.length,
            kind: "command",
            value: input,
          });
        } else if (tracedReturnedInputs.has(input)) {
          tracedReturnedInputs.delete(input);
        } else {
          trace.push({
            sequence: trace.length,
            kind: "observation",
            value: input,
          });
        }
        for (const event of result.events) {
          events.push(event);
          trace.push({
            sequence: trace.length,
            kind: "domain_event",
            value: event,
          });
        }
        for (const artifact of result.artifacts) {
          artifacts.push(artifact);
          trace.push({
            sequence: trace.length,
            kind: "artifact",
            value: artifact,
          });
        }
        for (const request of result.effects) {
          seenActions.add(request.actionId);
          pendingEffects.push(request);
          effects.push(request);
          trace.push({
            sequence: trace.length,
            kind: "effect_request",
            value: request,
          });
        }
        for (const diagnostic of result.diagnostics) {
          driverDiagnostics.push(diagnostic);
          trace.push({
            sequence: trace.length,
            kind: "diagnostic",
            value: diagnostic,
          });
        }
        continue;
      }

      if (interpretedEffects >= bounds.maximumEffects) {
        return yield* finish("suspended", "effect_fuel_exhausted");
      }
      if (observations.length >= bounds.maximumObservations) {
        return yield* finish("suspended", "observation_bound_exhausted");
      }
      const request = pendingEffects.shift()!;
      interpretedEffects += 1;
      const interpreted = yield* Effect.result(
        interpretEffectRequest(component, registry, request),
      );
      if (Result.isFailure(interpreted)) {
        if (!(interpreted.failure instanceof InterpreterAttemptFailed)) {
          return yield* interpreted.failure;
        }
        const attempt: InterpreterAttempt = {
          actionId: request.actionId,
          requestMessageId: request.messageId,
          outcome: interpreted.failure.outcome,
          reason: interpreted.failure.reason,
        };
        attempts.push(attempt);
        trace.push({
          sequence: trace.length,
          kind: "interpreter_attempt",
          value: attempt,
        });
        pendingEffects.unshift(request);
        return yield* finish(
          "suspended",
          interpreted.failure.outcome === "unknown"
            ? "interpreter_unknown"
            : "interpreter_rejected",
        );
      }

      const returned = interpreted.success;
      observations.push(returned);
      const attempt: InterpreterAttempt = {
        actionId: request.actionId,
        requestMessageId: request.messageId,
        outcome: "observed",
        observationMessageId: returned.messageId,
      };
      attempts.push(attempt);
      trace.push({
        sequence: trace.length,
        kind: "interpreter_attempt",
        value: attempt,
      });
      trace.push({
        sequence: trace.length,
        kind: "observation",
        value: returned,
      });
      tracedReturnedInputs.add(returned);
      if (inputs.length + pendingEffects.length + 1 > bounds.maximumQueueStock) {
        return yield* new SemanticKernelFailure({
          boundary: "direct-driver.queue",
          reason: "successful interpretation violated the queue-stock invariant",
        });
      }
      inputs.push(returned);
    }

    return yield* finish("completed");
  });
