import { Data, Effect } from "effect";
import { snapshotSemanticValue } from "./custody.ts";
import type {
  AnySemanticComponent,
  SemanticComponent,
  SemanticComponentMetadata,
  SemanticComponentSpec,
  SemanticFamily,
  Tagged,
} from "./model.ts";

export class InvalidSemanticComponent extends Data.TaggedError("InvalidSemanticComponent")<{
  readonly reason: string;
}> {
  override get message(): string {
    return this.reason;
  }
}

interface ComponentInternals<
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> {
  readonly spec: SemanticComponentSpec<
    State,
    Command,
    Observation,
    Query,
    Event,
    Artifact,
    Request
  >;
}

const nonempty = (value: string, field: string): void => {
  if (value.trim().length === 0) {
    throw new InvalidSemanticComponent({ reason: `${field} must be nonempty` });
  }
};

const validateFamily = (name: string, family: SemanticFamily<Tagged>): ReadonlyArray<string> => {
  nonempty(family.schemaId, `${name}.schemaId`);
  if (family.tags.length === 0) {
    throw new InvalidSemanticComponent({ reason: `${name}.tags must be nonempty` });
  }
  const tags = family.tags.map((tag) => {
    nonempty(tag, `${name}.tags`);
    return tag;
  });
  if (new Set(tags).size !== tags.length) {
    throw new InvalidSemanticComponent({ reason: `${name}.tags contains duplicates` });
  }
  return Object.freeze([...tags]);
};

class ComponentImpl<
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> implements SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request> {
  readonly #custody = true;
  readonly #internals: ComponentInternals<
    State,
    Command,
    Observation,
    Query,
    Event,
    Artifact,
    Request
  >;

  readonly id: string;
  readonly version: string;
  readonly metadata: SemanticComponentMetadata;

  constructor(
    spec: SemanticComponentSpec<State, Command, Observation, Query, Event, Artifact, Request>,
    metadata: SemanticComponentMetadata,
  ) {
    this.id = spec.id;
    this.version = spec.version;
    this.metadata = metadata;
    this.#internals = { spec };
    Object.freeze(this);
  }

  static is(
    value: unknown,
  ): value is ComponentImpl<unknown, Tagged, Tagged, Tagged, Tagged, Tagged, Tagged> {
    return typeof value === "object" && value !== null && #custody in value && value.#custody;
  }

  internals(): ComponentInternals<State, Command, Observation, Query, Event, Artifact, Request> {
    return this.#internals;
  }
}

export const requireComponent = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  value: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
): Effect.Effect<
  ComponentInternals<State, Command, Observation, Query, Event, Artifact, Request>,
  InvalidSemanticComponent
> =>
  ComponentImpl.is(value)
    ? Effect.succeed(
        (
          value as unknown as ComponentImpl<
            State,
            Command,
            Observation,
            Query,
            Event,
            Artifact,
            Request
          >
        ).internals(),
      )
    : Effect.fail(
        new InvalidSemanticComponent({
          reason: "component was not constructed by defineSemanticComponent",
        }),
      );

export const defineSemanticComponent = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  authored: SemanticComponentSpec<State, Command, Observation, Query, Event, Artifact, Request>,
): Effect.Effect<
  SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  InvalidSemanticComponent
> =>
  Effect.gen(function* () {
    const id = authored.id;
    const version = authored.version;
    const state = authored.state;
    const commands = authored.commands;
    const observations = authored.observations;
    const queries = authored.queries;
    const events = authored.events;
    const artifacts = authored.artifacts;
    const effects = authored.effects;
    const react = authored.react;
    const answer = authored.answer;
    const protocols = authored.protocols;

    const metadata = yield* Effect.try({
      try: (): SemanticComponentMetadata => {
        nonempty(id, "component.id");
        nonempty(version, "component.version");
        nonempty(state.schemaId, "state.schemaId");
        const familyTags = {
          commands: validateFamily("commands", commands),
          observations: validateFamily("observations", observations),
          queries: validateFamily("queries", queries),
          events: validateFamily("events", events),
          artifacts: validateFamily("artifacts", artifacts),
          effects: validateFamily("effects", effects),
        };
        const allTags = Object.values(familyTags).flat();
        if (new Set(allTags).size !== allTags.length) {
          throw new InvalidSemanticComponent({
            reason: "semantic tags must not overlap across category families",
          });
        }
        const schemaIds = [
          state.schemaId,
          commands.schemaId,
          observations.schemaId,
          queries.schemaId,
          events.schemaId,
          artifacts.schemaId,
          effects.schemaId,
        ];
        if (new Set(schemaIds).size !== schemaIds.length) {
          throw new InvalidSemanticComponent({
            reason: "state and semantic family schema identities must be distinct",
          });
        }
        if (typeof react !== "function" || typeof answer !== "function") {
          throw new InvalidSemanticComponent({
            reason: "component react and answer handlers are required",
          });
        }

        const declaredRequests = new Set(familyTags.effects);
        const declaredObservations = new Set(familyTags.observations);
        const protocolSnapshot = protocols.map((protocol) => {
          if (!declaredRequests.has(protocol.requestTag)) {
            throw new InvalidSemanticComponent({
              reason: `protocol request ${protocol.requestTag} is not declared`,
            });
          }
          if (
            protocol.observationTags.length === 0 ||
            protocol.observationTags.some((tag) => !declaredObservations.has(tag))
          ) {
            throw new InvalidSemanticComponent({
              reason: `protocol ${protocol.requestTag} has undeclared observations`,
            });
          }
          if (
            protocol.progress.kind === "bounded" &&
            (!Number.isSafeInteger(protocol.progress.maximumTurns) ||
              protocol.progress.maximumTurns <= 0)
          ) {
            throw new InvalidSemanticComponent({
              reason: `protocol ${protocol.requestTag} maximumTurns must be a positive safe integer`,
            });
          }
          if (
            protocol.progress.kind === "persistent" &&
            protocol.progress.waitState.trim().length === 0
          ) {
            throw new InvalidSemanticComponent({
              reason: `protocol ${protocol.requestTag} waitState must be nonempty`,
            });
          }
          return {
            requestTag: protocol.requestTag,
            observationTags: Object.freeze([...protocol.observationTags]),
            progress: Object.freeze({ ...protocol.progress }),
          };
        });
        if (
          new Set(protocolSnapshot.map((protocol) => protocol.requestTag)).size !==
          protocolSnapshot.length
        ) {
          throw new InvalidSemanticComponent({ reason: "effect protocols contain duplicates" });
        }
        const protocolRequests = new Set(protocolSnapshot.map((protocol) => protocol.requestTag));
        if (familyTags.effects.some((tag) => !protocolRequests.has(tag))) {
          throw new InvalidSemanticComponent({
            reason: "every declared effect request requires one protocol",
          });
        }

        return {
          id,
          version,
          stateSchemaId: state.schemaId,
          families: {
            commands: { schemaId: commands.schemaId, tags: familyTags.commands },
            observations: {
              schemaId: observations.schemaId,
              tags: familyTags.observations,
            },
            queries: { schemaId: queries.schemaId, tags: familyTags.queries },
            events: { schemaId: events.schemaId, tags: familyTags.events },
            artifacts: { schemaId: artifacts.schemaId, tags: familyTags.artifacts },
            effects: { schemaId: effects.schemaId, tags: familyTags.effects },
          },
          protocols: Object.freeze(protocolSnapshot),
        };
      },
      catch: (cause) =>
        cause instanceof InvalidSemanticComponent
          ? cause
          : new InvalidSemanticComponent({
              reason: cause instanceof Error ? cause.message : "invalid component definition",
            }),
    });

    const frozenMetadata = yield* snapshotSemanticValue(metadata, "component metadata").pipe(
      Effect.mapError(
        (error) =>
          new InvalidSemanticComponent({ reason: `metadata custody failed: ${error.reason}` }),
      ),
    );

    const spec = {
      id,
      version,
      state: { schemaId: state.schemaId, schema: state.schema },
      commands: {
        schemaId: commands.schemaId,
        tags: metadata.families.commands.tags,
        schema: commands.schema,
      },
      observations: {
        schemaId: observations.schemaId,
        tags: metadata.families.observations.tags,
        schema: observations.schema,
      },
      queries: {
        schemaId: queries.schemaId,
        tags: metadata.families.queries.tags,
        schema: queries.schema,
      },
      events: {
        schemaId: events.schemaId,
        tags: metadata.families.events.tags,
        schema: events.schema,
      },
      artifacts: {
        schemaId: artifacts.schemaId,
        tags: metadata.families.artifacts.tags,
        schema: artifacts.schema,
      },
      effects: {
        schemaId: effects.schemaId,
        tags: metadata.families.effects.tags,
        schema: effects.schema,
      },
      protocols: frozenMetadata.protocols,
      react,
      answer,
    } satisfies SemanticComponentSpec<State, Command, Observation, Query, Event, Artifact, Request>;

    return new ComponentImpl(spec, frozenMetadata);
  });

export const isSemanticComponent = (value: unknown): value is AnySemanticComponent =>
  ComponentImpl.is(value);
