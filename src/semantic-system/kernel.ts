import { Data, Effect, Schema } from "effect";
import { snapshotSemanticValue, type SemanticValueRejected } from "./custody.ts";
import { requireComponent, type InvalidSemanticComponent } from "./definition.ts";
import type {
  Answer,
  AnswerDraft,
  ArtifactEnvelope,
  CommandEnvelope,
  Diagnostic,
  DomainEventEnvelope,
  EffectRequestEnvelope,
  Emission,
  MessageIdentity,
  ObservationEnvelope,
  ObservationProvenance,
  QueryEnvelope,
  Reaction,
  ReactionDraft,
  SemanticComponent,
  Tagged,
} from "./model.ts";

export class SemanticKernelFailure extends Data.TaggedError("SemanticKernelFailure")<{
  readonly boundary: string;
  readonly reason: string;
}> {
  override get message(): string {
    return `${this.boundary}: ${this.reason}`;
  }
}

type KernelError = SemanticKernelFailure | SemanticValueRejected | InvalidSemanticComponent;

const failure = (boundary: string, reason: string): SemanticKernelFailure =>
  new SemanticKernelFailure({ boundary, reason });

const nonempty = (
  value: unknown,
  boundary: string,
): Effect.Effect<string, SemanticKernelFailure> =>
  typeof value === "string" && value.trim().length > 0
    ? Effect.succeed(value)
    : Effect.fail(failure(boundary, "must be nonempty"));

const record = (
  value: unknown,
  boundary: string,
): Effect.Effect<Readonly<Record<string, unknown>>, SemanticKernelFailure> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Effect.succeed(value as Readonly<Record<string, unknown>>)
    : Effect.fail(failure(boundary, "must be a record"));

const validateIdentity = (
  value: unknown,
  boundary: string,
): Effect.Effect<MessageIdentity, SemanticKernelFailure | SemanticValueRejected> =>
  Effect.gen(function* () {
    const owned = yield* snapshotSemanticValue(value, boundary);
    const fields = yield* record(owned, boundary);
    const messageId = yield* nonempty(fields["messageId"], `${boundary}.messageId`);
    const correlationId = yield* nonempty(fields["correlationId"], `${boundary}.correlationId`);
    const causationId =
      fields["causationId"] === undefined
        ? undefined
        : yield* nonempty(fields["causationId"], `${boundary}.causationId`);
    return {
      messageId,
      correlationId,
      ...(causationId === undefined ? {} : { causationId }),
    };
  });

const decode = <Value>(
  schema: Schema.Decoder<Value, never>,
  value: unknown,
  boundary: string,
): Effect.Effect<Value, SemanticKernelFailure | SemanticValueRejected> =>
  Effect.gen(function* () {
    const ownedInput = yield* snapshotSemanticValue(value, `${boundary}.source`);
    const decoded = yield* Schema.decodeUnknownEffect(schema, {
      onExcessProperty: "error",
    })(ownedInput).pipe(
      Effect.mapError(
        (cause) =>
          new SemanticKernelFailure({
            boundary,
            reason: cause.message,
          }),
      ),
    );
    return yield* snapshotSemanticValue(decoded, boundary);
  });

const validateTag = (
  payload: Tagged,
  tags: ReadonlyArray<string>,
  boundary: string,
): Effect.Effect<void, SemanticKernelFailure> =>
  tags.includes(payload["_tag"])
    ? Effect.void
    : Effect.fail(
        new SemanticKernelFailure({
          boundary,
          reason: `undeclared semantic tag ${JSON.stringify(payload["_tag"])}`,
        }),
      );

const makeInput = <Category extends "command" | "observation" | "query", Payload extends Tagged>(
  category: Category,
  componentId: string,
  schemaId: string,
  tags: ReadonlyArray<string>,
  schema: Schema.Decoder<Payload, never>,
  identity: MessageIdentity,
  payload: unknown,
): Effect.Effect<
  {
    readonly category: Category;
    readonly componentId: string;
    readonly schemaId: string;
    readonly messageId: string;
    readonly correlationId: string;
    readonly causationId?: string;
    readonly payload: Payload;
  },
  SemanticKernelFailure | SemanticValueRejected
> =>
  Effect.gen(function* () {
    const validatedIdentity = yield* validateIdentity(identity, category);
    const decoded = yield* decode(schema, payload, `${category}.payload`);
    yield* validateTag(decoded, tags, `${category}.payload`);
    return yield* snapshotSemanticValue(
      {
        category,
        componentId,
        schemaId,
        messageId: validatedIdentity.messageId,
        correlationId: validatedIdentity.correlationId,
        ...(validatedIdentity.causationId === undefined
          ? {}
          : { causationId: validatedIdentity.causationId }),
        payload: decoded,
      },
      `${category}.envelope`,
    );
  });

export const command = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  identity: MessageIdentity,
  payload: unknown,
): Effect.Effect<CommandEnvelope<Command>, KernelError> =>
  Effect.gen(function* () {
    const { spec } = yield* requireComponent(component);
    return yield* makeInput(
      "command",
      component.id,
      spec.commands.schemaId,
      spec.commands.tags,
      spec.commands.schema,
      identity,
      payload,
    );
  });

export const observation = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  identity: MessageIdentity & {
    readonly provenance: ObservationProvenance;
    readonly actionId?: string;
  },
  payload: unknown,
): Effect.Effect<ObservationEnvelope<Observation>, KernelError> =>
  Effect.gen(function* () {
    const { spec } = yield* requireComponent(component);
    const ownedIdentity = yield* snapshotSemanticValue(identity, "observation.identity");
    const identityFields = yield* record(ownedIdentity, "observation");
    const provenanceFields = yield* record(identityFields["provenance"], "observation.provenance");
    const provenance = {
      sourceId: yield* nonempty(provenanceFields["sourceId"], "observation.provenance.sourceId"),
      basis: yield* nonempty(provenanceFields["basis"], "observation.provenance.basis"),
    };
    const actionId =
      identityFields["actionId"] === undefined
        ? undefined
        : yield* nonempty(identityFields["actionId"], "observation.actionId");
    const input = yield* makeInput(
      "observation",
      component.id,
      spec.observations.schemaId,
      spec.observations.tags,
      spec.observations.schema,
      identity,
      payload,
    );
    return yield* snapshotSemanticValue(
      {
        ...input,
        provenance,
        ...(actionId === undefined ? {} : { actionId }),
      },
      "observation.envelope",
    );
  });

export const query = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  identity: MessageIdentity,
  payload: unknown,
): Effect.Effect<QueryEnvelope<Query>, KernelError> =>
  Effect.gen(function* () {
    const { spec } = yield* requireComponent(component);
    return yield* makeInput(
      "query",
      component.id,
      spec.queries.schemaId,
      spec.queries.tags,
      spec.queries.schema,
      identity,
      payload,
    );
  });

export const validateState = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  value: unknown,
): Effect.Effect<State, KernelError> =>
  Effect.gen(function* () {
    const { spec } = yield* requireComponent(component);
    return yield* decode(spec.state.schema, value, "state");
  });

const diagnostics = (
  value: ReadonlyArray<Diagnostic>,
  boundary: string,
): Effect.Effect<ReadonlyArray<Diagnostic>, SemanticValueRejected | SemanticKernelFailure> =>
  Effect.gen(function* () {
    const canonical = yield* Effect.forEach(value, (entry, index) =>
      Effect.gen(function* () {
        const owned = yield* snapshotSemanticValue(entry, `${boundary}[${index}]`);
        const fields = yield* record(owned, `${boundary}[${index}]`);
        const code = yield* nonempty(fields["code"], `${boundary}[${index}].code`);
        const message = yield* nonempty(fields["message"], `${boundary}[${index}].message`);
        const relatedMessageId =
          fields["relatedMessageId"] === undefined
            ? undefined
            : yield* nonempty(fields["relatedMessageId"], `${boundary}[${index}].relatedMessageId`);
        return {
          code,
          message,
          ...(relatedMessageId === undefined ? {} : { relatedMessageId }),
        };
      }),
    );
    return yield* snapshotSemanticValue(canonical, boundary);
  });

const validateReactionDraft = <
  State,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  value: unknown,
): Effect.Effect<ReactionDraft<State, Event, Artifact, Request>, SemanticKernelFailure> =>
  Effect.try({
    try: () => {
      if (typeof value !== "object" || value === null || !("state" in value)) {
        throw failure("react.handler", "handler must return a reaction object with state");
      }
      const candidate = value as Record<string, unknown>;
      for (const field of ["events", "artifacts", "effects", "diagnostics"] as const) {
        if (!Array.isArray(candidate[field])) {
          throw failure("react.handler", `${field} must be an array`);
        }
      }
      return value as ReactionDraft<State, Event, Artifact, Request>;
    },
    catch: (cause) =>
      cause instanceof SemanticKernelFailure
        ? cause
        : failure("react.handler", "malformed reaction result"),
  });

const validateAnswerDraft = <Artifact extends Tagged>(
  value: unknown,
): Effect.Effect<AnswerDraft<Artifact>, SemanticKernelFailure> =>
  Effect.try({
    try: () => {
      if (typeof value !== "object" || value === null) {
        throw failure("answer.handler", "handler must return an answer object");
      }
      const candidate = value as Record<string, unknown>;
      if (!Array.isArray(candidate.artifacts) || !Array.isArray(candidate.diagnostics)) {
        throw failure("answer.handler", "artifacts and diagnostics must be arrays");
      }
      return value as AnswerDraft<Artifact>;
    },
    catch: (cause) =>
      cause instanceof SemanticKernelFailure
        ? cause
        : failure("answer.handler", "malformed answer result"),
  });

const envelopeEmissions = <Payload extends Tagged, Category extends "domain_event" | "artifact">(
  category: Category,
  componentId: string,
  schemaId: string,
  tags: ReadonlyArray<string>,
  schema: Schema.Decoder<Payload, never>,
  emissions: ReadonlyArray<Emission<Payload>>,
): Effect.Effect<
  ReadonlyArray<
    Category extends "domain_event" ? DomainEventEnvelope<Payload> : ArtifactEnvelope<Payload>
  >,
  SemanticKernelFailure | SemanticValueRejected
> =>
  Effect.forEach(emissions, (emission, index) =>
    Effect.gen(function* () {
      const owned = yield* snapshotSemanticValue(emission, `${category}[${index}]`);
      const fields = yield* record(owned, `${category}[${index}]`);
      const identity = yield* validateIdentity(fields, `${category}[${index}]`);
      const payload = yield* decode(schema, fields["payload"], `${category}[${index}].payload`);
      yield* validateTag(payload, tags, `${category}[${index}].payload`);
      return yield* snapshotSemanticValue(
        {
          category,
          componentId,
          schemaId,
          messageId: identity.messageId,
          correlationId: identity.correlationId,
          ...(identity.causationId === undefined ? {} : { causationId: identity.causationId }),
          payload,
        },
        `${category}[${index}].envelope`,
      );
    }),
  ).pipe(
    Effect.map(
      (entries) =>
        entries as ReadonlyArray<
          Category extends "domain_event" ? DomainEventEnvelope<Payload> : ArtifactEnvelope<Payload>
        >,
    ),
  );

const effectEmissions = <Request extends Tagged>(
  componentId: string,
  schemaId: string,
  tags: ReadonlyArray<string>,
  schema: Schema.Decoder<Request, never>,
  emissions: ReactionDraft<unknown, Tagged, Tagged, Request>["effects"],
): Effect.Effect<
  ReadonlyArray<EffectRequestEnvelope<Request>>,
  SemanticKernelFailure | SemanticValueRejected
> =>
  Effect.gen(function* () {
    const actionIds = new Set<string>();
    return yield* Effect.forEach(emissions, (emission, index) =>
      Effect.gen(function* () {
        const owned = yield* snapshotSemanticValue(emission, `effect_request[${index}]`);
        const fields = yield* record(owned, `effect_request[${index}]`);
        const identity = yield* validateIdentity(fields, `effect_request[${index}]`);
        const actionId = yield* nonempty(fields["actionId"], `effect_request[${index}].actionId`);
        if (actionIds.has(actionId)) {
          return yield* new SemanticKernelFailure({
            boundary: `effect_request[${index}].actionId`,
            reason: "duplicate action identity in one reaction",
          });
        }
        actionIds.add(actionId);
        const payload = yield* decode(
          schema,
          fields["payload"],
          `effect_request[${index}].payload`,
        );
        yield* validateTag(payload, tags, `effect_request[${index}].payload`);
        return yield* snapshotSemanticValue(
          {
            category: "effect_request" as const,
            componentId,
            schemaId,
            messageId: identity.messageId,
            correlationId: identity.correlationId,
            ...(identity.causationId === undefined ? {} : { causationId: identity.causationId }),
            actionId,
            payload,
          },
          `effect_request[${index}].envelope`,
        );
      }),
    );
  });

export const react = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  state: unknown,
  input: CommandEnvelope<Command> | ObservationEnvelope<Observation>,
): Effect.Effect<Reaction<State, Event, Artifact, Request>, KernelError> =>
  Effect.gen(function* () {
    const { spec } = yield* requireComponent(component);
    const ownedInput = yield* snapshotSemanticValue(input, "react.input");
    const inputFields = yield* record(ownedInput, "react.input");
    if (inputFields["componentId"] !== component.id) {
      return yield* new SemanticKernelFailure({
        boundary: "react.input.componentId",
        reason: "input belongs to a different component",
      });
    }
    if (inputFields["category"] !== "command" && inputFields["category"] !== "observation") {
      return yield* failure("react.input.category", "react accepts commands or observations only");
    }
    const expectedSchemaId =
      inputFields["category"] === "command" ? spec.commands.schemaId : spec.observations.schemaId;
    if (inputFields["schemaId"] !== expectedSchemaId) {
      return yield* failure("react.input.schemaId", "input schema identity does not match");
    }
    const decodedState = yield* decode(spec.state.schema, state, "react.state");
    const guardedInput =
      inputFields["category"] === "command"
        ? yield* command(
            component,
            inputFields as unknown as MessageIdentity,
            inputFields["payload"],
          )
        : yield* observation(
            component,
            inputFields as unknown as MessageIdentity & {
              readonly provenance: ObservationProvenance;
              readonly actionId?: string;
            },
            inputFields["payload"],
          );
    const authoredDraft = yield* Effect.try({
      try: () => spec.react(decodedState, guardedInput),
      catch: (cause) =>
        new SemanticKernelFailure({
          boundary: "react.handler",
          reason: cause instanceof Error ? cause.message : "handler threw an unknown value",
        }),
    });
    const draft = yield* snapshotSemanticValue(
      yield* validateReactionDraft<State, Event, Artifact, Request>(authoredDraft),
      "react.draft",
    );
    const nextState = yield* decode(spec.state.schema, draft.state, "react.nextState");
    const events = yield* envelopeEmissions(
      "domain_event",
      component.id,
      spec.events.schemaId,
      spec.events.tags,
      spec.events.schema,
      draft.events,
    );
    const artifacts = yield* envelopeEmissions(
      "artifact",
      component.id,
      spec.artifacts.schemaId,
      spec.artifacts.tags,
      spec.artifacts.schema,
      draft.artifacts,
    );
    const effects = yield* effectEmissions(
      component.id,
      spec.effects.schemaId,
      spec.effects.tags,
      spec.effects.schema,
      draft.effects,
    );
    const outputIds = [...events, ...artifacts, ...effects].map((output) => output.messageId);
    if (new Set(outputIds).size !== outputIds.length) {
      return yield* failure("react.result", "emitted message identities must be unique");
    }
    return yield* snapshotSemanticValue(
      {
        state: nextState,
        events,
        artifacts,
        effects,
        diagnostics: yield* diagnostics(draft.diagnostics, "react.diagnostics"),
      },
      "react.result",
    );
  });

export const answer = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  state: unknown,
  input: QueryEnvelope<Query>,
): Effect.Effect<Answer<Artifact>, KernelError> =>
  Effect.gen(function* () {
    const { spec } = yield* requireComponent(component);
    const ownedInput = yield* snapshotSemanticValue(input, "answer.input");
    const inputFields = yield* record(ownedInput, "answer.input");
    if (inputFields["componentId"] !== component.id) {
      return yield* new SemanticKernelFailure({
        boundary: "answer.input.componentId",
        reason: "query belongs to a different component",
      });
    }
    if (inputFields["category"] !== "query") {
      return yield* failure("answer.input.category", "answer accepts queries only");
    }
    if (inputFields["schemaId"] !== spec.queries.schemaId) {
      return yield* failure("answer.input.schemaId", "query schema identity does not match");
    }
    const decodedState = yield* decode(spec.state.schema, state, "answer.state");
    const guardedQuery = yield* query(
      component,
      inputFields as unknown as MessageIdentity,
      inputFields["payload"],
    );
    const authoredDraft = yield* Effect.try({
      try: () => spec.answer(decodedState, guardedQuery),
      catch: (cause) =>
        new SemanticKernelFailure({
          boundary: "answer.handler",
          reason: cause instanceof Error ? cause.message : "handler threw an unknown value",
        }),
    });
    const draft = yield* snapshotSemanticValue(
      yield* validateAnswerDraft<Artifact>(authoredDraft),
      "answer.draft",
    );
    const artifacts = yield* envelopeEmissions(
      "artifact",
      component.id,
      spec.artifacts.schemaId,
      spec.artifacts.tags,
      spec.artifacts.schema,
      draft.artifacts,
    );
    return yield* snapshotSemanticValue(
      {
        artifacts,
        diagnostics: yield* diagnostics(draft.diagnostics, "answer.diagnostics"),
      },
      "answer.result",
    );
  });
