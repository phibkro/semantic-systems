import { Effect, Schema } from "effect";
import {
  prepareReferenceTransition,
  type Event as ReferenceEvent,
  type Message as ReferenceMessage,
  type State as ReferenceState,
} from "../tracer/domain.ts";
import { defineSemanticComponent, type InvalidSemanticComponent } from "./definition.ts";
import {
  defineInterpreterRegistry,
  type InvalidInterpreterRegistry,
  type InterpreterEntry,
  type InterpreterRegistry,
} from "./driver.ts";
import type { SemanticValueRejected } from "./custody.ts";
import type {
  Diagnostic,
  Emission,
  ObservationEnvelope,
  ReactionDraft,
  SemanticComponent,
} from "./model.ts";

const ReservationSchema = Schema.Struct({
  item: Schema.String,
  quantity: Schema.Int,
});
const StockSchema = Schema.Record(Schema.String, Schema.Int);
const ReservationsSchema = Schema.Record(Schema.String, ReservationSchema);
const PendingReservationSchema = Schema.Struct({
  commandMessageId: Schema.String,
  correlationId: Schema.String,
  item: Schema.String,
  quantity: Schema.Int,
});
const PendingReservationsSchema = Schema.Record(Schema.String, PendingReservationSchema);
const ProcessedObservationsSchema = Schema.Record(Schema.String, Schema.Literal(true));

export const InventorySemanticStateSchema = Schema.Struct({
  stock: StockSchema,
  reservations: ReservationsSchema,
  pending: PendingReservationsSchema,
  unknown: PendingReservationsSchema,
  processedObservations: ProcessedObservationsSchema,
});

const ReserveSchema = Schema.TaggedStruct("Reserve", {
  item: Schema.String,
  quantity: Schema.Int,
});
const ReleaseSchema = Schema.TaggedStruct("Release", {
  reservationId: Schema.String,
});
export const InventoryCommandSchema = Schema.Union([ReserveSchema, ReleaseSchema]);

const AllocatedSchema = Schema.TaggedStruct("FreshIdentifierAllocated", {
  identifier: Schema.String,
});
const UnavailableSchema = Schema.TaggedStruct("FreshIdentifierUnavailable", {
  reason: Schema.String,
});
const UnknownSchema = Schema.TaggedStruct("FreshIdentifierUnknown", {});
export const InventoryObservationSchema = Schema.Union([
  AllocatedSchema,
  UnavailableSchema,
  UnknownSchema,
]);

export const InventoryQuerySchema = Schema.TaggedStruct("InventoryStatus", {});

const ReservedSchema = Schema.TaggedStruct("Reserved", {
  reservationId: Schema.String,
  item: Schema.String,
  quantity: Schema.Int,
});
const ReleasedSchema = Schema.TaggedStruct("Released", {
  reservationId: Schema.String,
});
const ReservationRejectedSchema = Schema.TaggedStruct("ReservationRejected", {
  item: Schema.String,
  quantity: Schema.Int,
  reason: Schema.String,
});
const ReleaseRejectedSchema = Schema.TaggedStruct("ReleaseRejected", {
  reservationId: Schema.String,
  reason: Schema.String,
});
const IdentifierOutcomeUnknownSchema = Schema.TaggedStruct("IdentifierOutcomeUnknown", {
  actionId: Schema.String,
});
export const InventoryEventSchema = Schema.Union([
  ReservedSchema,
  ReleasedSchema,
  ReservationRejectedSchema,
  ReleaseRejectedSchema,
  IdentifierOutcomeUnknownSchema,
]);

export const InventoryArtifactSchema = Schema.TaggedStruct("InventoryStatusArtifact", {
  stock: StockSchema,
  reservations: ReservationsSchema,
  pending: PendingReservationsSchema,
  unknown: PendingReservationsSchema,
});

export const InventoryEffectRequestSchema = Schema.TaggedStruct("FreshIdentifierRequested", {
  item: Schema.String,
  quantity: Schema.Int,
});

export type InventorySemanticState = typeof InventorySemanticStateSchema.Type;
export type InventoryCommand = typeof InventoryCommandSchema.Type;
export type InventoryObservation = typeof InventoryObservationSchema.Type;
export type InventoryQuery = typeof InventoryQuerySchema.Type;
export type InventoryEvent = typeof InventoryEventSchema.Type;
export type InventoryArtifact = typeof InventoryArtifactSchema.Type;
export type InventoryEffectRequest = typeof InventoryEffectRequestSchema.Type;

export type InventorySemanticComponent = SemanticComponent<
  InventorySemanticState,
  InventoryCommand,
  InventoryObservation,
  InventoryQuery,
  InventoryEvent,
  InventoryArtifact,
  InventoryEffectRequest
>;

const withoutAction = (
  values: Readonly<Record<string, typeof PendingReservationSchema.Type>>,
  actionId: string,
): Readonly<Record<string, typeof PendingReservationSchema.Type>> => {
  const next = { ...values };
  delete next[actionId];
  return next;
};

const referenceState = (state: InventorySemanticState): ReferenceState => ({
  stock: state.stock,
  reservations: state.reservations,
});

export const inventorySemanticState = (state: ReferenceState): InventorySemanticState => ({
  stock: state.stock,
  reservations: state.reservations,
  pending: {},
  unknown: {},
  processedObservations: {},
});

export const projectInventoryReferenceState = (state: InventorySemanticState): ReferenceState => ({
  stock: state.stock,
  reservations: state.reservations,
});

const semanticEvent = (event: ReferenceEvent): InventoryEvent => {
  switch (event.kind) {
    case "Reserved":
      return {
        _tag: "Reserved",
        reservationId: event.reservation_id,
        item: event.item,
        quantity: event.quantity,
      };
    case "Released":
      return { _tag: "Released", reservationId: event.reservation_id };
    case "ReservationRejected":
      return {
        _tag: "ReservationRejected",
        item: event.item,
        quantity: event.quantity,
        reason: event.reason,
      };
    case "ReleaseRejected":
      return {
        _tag: "ReleaseRejected",
        reservationId: event.reservation_id,
        reason: event.reason,
      };
  }
};

export const projectInventoryReferenceEvent = (
  event: InventoryEvent,
): ReferenceEvent | undefined => {
  switch (event["_tag"]) {
    case "Reserved":
      return {
        kind: "Reserved",
        reservation_id: event.reservationId,
        item: event.item,
        quantity: event.quantity,
      };
    case "Released":
      return { kind: "Released", reservation_id: event.reservationId };
    case "ReservationRejected":
      return {
        kind: "ReservationRejected",
        item: event.item,
        quantity: event.quantity,
        reason: event.reason,
      };
    case "ReleaseRejected":
      return {
        kind: "ReleaseRejected",
        reservation_id: event.reservationId,
        reason: event.reason,
      };
    case "IdentifierOutcomeUnknown":
      return undefined;
  }
};

const emittedEvent = (
  input: { readonly messageId: string; readonly correlationId: string },
  event: InventoryEvent,
): Emission<InventoryEvent> => ({
  messageId: `${input.messageId}:event`,
  correlationId: input.correlationId,
  causationId: input.messageId,
  payload: event,
});

const noOutput = (
  state: InventorySemanticState,
  diagnostics: ReadonlyArray<Diagnostic> = [],
): ReactionDraft<
  InventorySemanticState,
  InventoryEvent,
  InventoryArtifact,
  InventoryEffectRequest
> => ({
  state,
  events: [],
  artifacts: [],
  effects: [],
  diagnostics,
});

const reactCommand = (
  state: InventorySemanticState,
  input: {
    readonly messageId: string;
    readonly correlationId: string;
    readonly payload: InventoryCommand;
  },
): ReactionDraft<
  InventorySemanticState,
  InventoryEvent,
  InventoryArtifact,
  InventoryEffectRequest
> => {
  const message: ReferenceMessage =
    input.payload["_tag"] === "Reserve"
      ? {
          kind: "Reserve",
          item: input.payload.item,
          quantity: input.payload.quantity,
        }
      : {
          kind: "Release",
          reservationId: input.payload.reservationId,
        };
  const prepared = prepareReferenceTransition(message, referenceState(state));
  if (prepared.kind === "complete") {
    const [next, event] = prepared.result;
    return {
      state: { ...state, stock: next.stock, reservations: next.reservations },
      events: [emittedEvent(input, semanticEvent(event))],
      artifacts: [],
      effects: [],
      diagnostics: [],
    };
  }
  if (input.payload["_tag"] !== "Reserve") {
    return noOutput(state, [
      {
        code: "invalid_transition",
        message: "release unexpectedly requested a fresh identifier",
        relatedMessageId: input.messageId,
      },
    ]);
  }

  const actionId = `${input.messageId}:fresh-identifier`;
  if (state.pending[actionId] !== undefined || state.unknown[actionId] !== undefined) {
    return noOutput(state, [
      {
        code: "duplicate_action",
        message: `fresh identifier action ${actionId} already exists`,
        relatedMessageId: input.messageId,
      },
    ]);
  }
  const pending = {
    commandMessageId: input.messageId,
    correlationId: input.correlationId,
    item: input.payload.item,
    quantity: input.payload.quantity,
  };
  return {
    state: {
      ...state,
      pending: { ...state.pending, [actionId]: pending },
    },
    events: [],
    artifacts: [],
    effects: [
      {
        messageId: `${input.messageId}:fresh-identifier-request`,
        correlationId: input.correlationId,
        causationId: input.messageId,
        actionId,
        payload: {
          _tag: "FreshIdentifierRequested",
          item: input.payload.item,
          quantity: input.payload.quantity,
        },
      },
    ],
    diagnostics: [],
  };
};

const diagnosticForObservation = (
  input: ObservationEnvelope<InventoryObservation>,
  code: string,
  message: string,
): Diagnostic => ({
  code,
  message,
  relatedMessageId: input.messageId,
});

const reactObservation = (
  state: InventorySemanticState,
  input: ObservationEnvelope<InventoryObservation>,
): ReactionDraft<
  InventorySemanticState,
  InventoryEvent,
  InventoryArtifact,
  InventoryEffectRequest
> => {
  if (state.processedObservations[input.messageId] === true) {
    return noOutput(state, [
      diagnosticForObservation(
        input,
        "duplicate_observation",
        `observation ${input.messageId} was already processed`,
      ),
    ]);
  }
  const processedObservations = {
    ...state.processedObservations,
    [input.messageId]: true as const,
  };
  if (input.actionId === undefined) {
    return noOutput({ ...state, processedObservations }, [
      diagnosticForObservation(input, "missing_action", "effect outcome has no action identity"),
    ]);
  }
  const pending = state.pending[input.actionId] ?? state.unknown[input.actionId];
  if (pending === undefined) {
    return noOutput({ ...state, processedObservations }, [
      diagnosticForObservation(
        input,
        "unknown_action",
        `action ${input.actionId} is not pending or unknown`,
      ),
    ]);
  }

  const base = {
    ...state,
    pending: withoutAction(state.pending, input.actionId),
    unknown: withoutAction(state.unknown, input.actionId),
    processedObservations,
  };
  if (input.payload["_tag"] === "FreshIdentifierUnknown") {
    return {
      ...noOutput({
        ...base,
        unknown: { ...base.unknown, [input.actionId]: pending },
      }),
      events: [
        emittedEvent(input, {
          _tag: "IdentifierOutcomeUnknown",
          actionId: input.actionId,
        }),
      ],
    };
  }
  if (input.payload["_tag"] === "FreshIdentifierUnavailable") {
    return {
      ...noOutput(base),
      events: [
        emittedEvent(input, {
          _tag: "ReservationRejected",
          item: pending.item,
          quantity: pending.quantity,
          reason: `identifier_unavailable:${input.payload.reason}`,
        }),
      ],
    };
  }

  const prepared = prepareReferenceTransition(
    { kind: "Reserve", item: pending.item, quantity: pending.quantity },
    referenceState(base),
  );
  const [next, event] =
    prepared.kind === "complete" ? prepared.result : prepared.complete(input.payload.identifier);
  return {
    ...noOutput({
      ...base,
      stock: next.stock,
      reservations: next.reservations,
    }),
    events: [emittedEvent(input, semanticEvent(event))],
  };
};

export const inventorySemanticComponent: Effect.Effect<
  InventorySemanticComponent,
  InvalidSemanticComponent
> = defineSemanticComponent({
  id: "inventory-reservation",
  version: "inventory-open-protocol.v1",
  state: { schemaId: "inventory.semantic-state.v1", schema: InventorySemanticStateSchema },
  commands: {
    schemaId: "inventory.commands.v1",
    tags: ["Reserve", "Release"],
    schema: InventoryCommandSchema,
  },
  observations: {
    schemaId: "inventory.observations.v1",
    tags: ["FreshIdentifierAllocated", "FreshIdentifierUnavailable", "FreshIdentifierUnknown"],
    schema: InventoryObservationSchema,
  },
  queries: {
    schemaId: "inventory.queries.v1",
    tags: ["InventoryStatus"],
    schema: InventoryQuerySchema,
  },
  events: {
    schemaId: "inventory.events.v1",
    tags: [
      "Reserved",
      "Released",
      "ReservationRejected",
      "ReleaseRejected",
      "IdentifierOutcomeUnknown",
    ],
    schema: InventoryEventSchema,
  },
  artifacts: {
    schemaId: "inventory.artifacts.v1",
    tags: ["InventoryStatusArtifact"],
    schema: InventoryArtifactSchema,
  },
  effects: {
    schemaId: "inventory.effects.v1",
    tags: ["FreshIdentifierRequested"],
    schema: InventoryEffectRequestSchema,
  },
  protocols: [
    {
      requestTag: "FreshIdentifierRequested",
      observationTags: [
        "FreshIdentifierAllocated",
        "FreshIdentifierUnavailable",
        "FreshIdentifierUnknown",
      ],
      progress: { kind: "bounded", maximumTurns: 1 },
    },
  ],
  react: (state, input) =>
    input.category === "command" ? reactCommand(state, input) : reactObservation(state, input),
  answer: (state, input) => ({
    artifacts: [
      {
        messageId: `${input.messageId}:artifact`,
        correlationId: input.correlationId,
        causationId: input.messageId,
        payload: {
          _tag: "InventoryStatusArtifact",
          stock: state.stock,
          reservations: state.reservations,
          pending: state.pending,
          unknown: state.unknown,
        },
      },
    ],
    diagnostics: [],
  }),
});

export const deterministicFreshIdentifierRegistry = (
  component: InventorySemanticComponent,
  identifiers: ReadonlyArray<string>,
): Effect.Effect<
  InterpreterRegistry<InventoryEffectRequest, InventoryObservation, never>,
  InvalidInterpreterRegistry | InvalidSemanticComponent | SemanticValueRejected
> => {
  let index = 0;
  const entry: InterpreterEntry<InventoryEffectRequest, InventoryObservation, never> = {
    requestTag: "FreshIdentifierRequested",
    interpret: (request) => {
      const identifier = identifiers[index];
      index += 1;
      return Effect.succeed({
        messageId: `${request.messageId}:observation`,
        provenance: {
          sourceId: "deterministic-fresh-identifier",
          basis: "authored finite identifier sequence",
        },
        payload:
          identifier === undefined
            ? {
                _tag: "FreshIdentifierUnavailable",
                reason: "deterministic_sequence_exhausted",
              }
            : { _tag: "FreshIdentifierAllocated", identifier },
      });
    },
  };
  return defineInterpreterRegistry(component, [entry]);
};
