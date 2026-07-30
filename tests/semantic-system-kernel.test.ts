import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import {
  answer,
  command,
  defineSemanticComponent,
  observation,
  query,
  react,
  type SemanticComponentSpec,
} from "../src/semantic-system/index.ts";

const StateSchema = Schema.Struct({ count: Schema.Finite });
const CommandSchema = Schema.TaggedStruct("Increment", {
  by: Schema.Finite,
});
const ObservationSchema = Schema.TaggedStruct("ResetObserved", {
  to: Schema.Finite,
});
const QuerySchema = Schema.TaggedStruct("Current", {});
const EventSchema = Schema.TaggedStruct("Incremented", {
  by: Schema.Finite,
});
const ArtifactSchema = Schema.TaggedStruct("Count", {
  value: Schema.Finite,
});
const RequestSchema = Schema.TaggedStruct("PersistCount", {
  value: Schema.Finite,
});

type State = typeof StateSchema.Type;
type Command = typeof CommandSchema.Type;
type Observation = typeof ObservationSchema.Type;
type Query = typeof QuerySchema.Type;
type Event = typeof EventSchema.Type;
type Artifact = typeof ArtifactSchema.Type;
type Request = typeof RequestSchema.Type;

const makeSpec = (): SemanticComponentSpec<
  State,
  Command,
  Observation,
  Query,
  Event,
  Artifact,
  Request
> => ({
  id: "counter",
  version: "counter.v1",
  state: { schemaId: "counter.state.v1", schema: StateSchema },
  commands: {
    schemaId: "counter.command.v1",
    tags: ["Increment"],
    schema: CommandSchema,
  },
  observations: {
    schemaId: "counter.observation.v1",
    tags: ["ResetObserved"],
    schema: ObservationSchema,
  },
  queries: { schemaId: "counter.query.v1", tags: ["Current"], schema: QuerySchema },
  events: { schemaId: "counter.event.v1", tags: ["Incremented"], schema: EventSchema },
  artifacts: {
    schemaId: "counter.artifact.v1",
    tags: ["Count"],
    schema: ArtifactSchema,
  },
  effects: {
    schemaId: "counter.request.v1",
    tags: ["PersistCount"],
    schema: RequestSchema,
  },
  protocols: [
    {
      requestTag: "PersistCount",
      observationTags: ["ResetObserved"],
      progress: { kind: "bounded", maximumTurns: 2 },
    },
  ],
  react: (state, input) => {
    if (input.category === "observation") {
      return {
        state: { count: input.payload.to },
        events: [],
        artifacts: [],
        effects: [],
        diagnostics: [],
      };
    }
    const count = state.count + input.payload.by;
    return {
      state: { count },
      events: [
        {
          messageId: `${input.messageId}:event`,
          correlationId: input.correlationId,
          causationId: input.messageId,
          payload: { _tag: "Incremented", by: input.payload.by },
        },
      ],
      artifacts: [],
      effects: [
        {
          messageId: `${input.messageId}:request`,
          correlationId: input.correlationId,
          causationId: input.messageId,
          actionId: `${input.messageId}:persist`,
          payload: { _tag: "PersistCount", value: count },
        },
      ],
      diagnostics: [],
    };
  },
  answer: (state, input) => ({
    artifacts: [
      {
        messageId: `${input.messageId}:artifact`,
        correlationId: input.correlationId,
        causationId: input.messageId,
        payload: { _tag: "Count", value: state.count },
      },
    ],
    diagnostics: [],
  }),
});

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect);

describe("executable semantic-system kernel", () => {
  test("separates command reaction, observation reaction, and state-free query output", async () => {
    const component = await run(defineSemanticComponent(makeSpec()));
    const increment = await run(
      command(
        component,
        { messageId: "command-1", correlationId: "journey-1" },
        { _tag: "Increment", by: 2 },
      ),
    );
    const reaction = await run(react(component, { count: 1 }, increment));

    expect(reaction.state).toEqual({ count: 3 });
    expect(reaction.events.map((event) => event.payload)).toEqual([{ _tag: "Incremented", by: 2 }]);
    expect(reaction.effects.map((effect) => effect.payload)).toEqual([
      { _tag: "PersistCount", value: 3 },
    ]);
    expect(reaction.effects[0]?.actionId).toBe("command-1:persist");

    const reset = await run(
      observation(
        component,
        {
          messageId: "observation-1",
          correlationId: "journey-1",
          causationId: "command-1:request",
          actionId: "command-1:persist",
          provenance: { sourceId: "test-interpreter", basis: "deterministic fixture" },
        },
        { _tag: "ResetObserved", to: 4 },
      ),
    );
    expect((await run(react(component, reaction.state, reset))).state).toEqual({ count: 4 });

    const current = await run(
      query(component, { messageId: "query-1", correlationId: "journey-1" }, { _tag: "Current" }),
    );
    const before = { count: 4 };
    const result = await run(answer(component, before, current));
    expect(result.artifacts.map((artifact) => artifact.payload)).toEqual([
      { _tag: "Count", value: 4 },
    ]);
    expect(before).toEqual({ count: 4 });
    expect("state" in result).toBeFalse();
    expect("effects" in result).toBeFalse();
  });

  test("rejects malformed ingress, foreign components, and unregistered lookalikes", async () => {
    const component = await run(defineSemanticComponent(makeSpec()));
    await expect(
      run(
        command(
          component,
          { messageId: "bad", correlationId: "journey" },
          { _tag: "Increment", by: "not-a-number" },
        ),
      ),
    ).rejects.toThrow("command.payload");

    const input = await run(
      command(
        component,
        { messageId: "command", correlationId: "journey" },
        { _tag: "Increment", by: 1 },
      ),
    );
    await expect(
      run(react({ ...component } as typeof component, { count: 0 }, input)),
    ).rejects.toThrow("not constructed by defineSemanticComponent");

    const other = await run(defineSemanticComponent({ ...makeSpec(), id: "other-counter" }));
    await expect(run(react(other, { count: 0 }, input))).rejects.toThrow("different component");
  });

  test("rejects duplicate or overlapping declarations and malformed progress bounds", async () => {
    const duplicateBase = makeSpec();
    const duplicate: typeof duplicateBase = {
      ...duplicateBase,
      commands: {
        ...duplicateBase.commands,
        tags: ["Increment", "Increment"],
      },
    };
    await expect(run(defineSemanticComponent(duplicate))).rejects.toThrow(
      "commands.tags contains duplicates",
    );

    const overlapBase = makeSpec();
    const overlap = {
      ...overlapBase,
      queries: {
        ...overlapBase.queries,
        tags: ["Increment"],
      },
    } as unknown as typeof overlapBase;
    await expect(run(defineSemanticComponent(overlap))).rejects.toThrow("must not overlap");

    const unboundedBase = makeSpec();
    const unbounded: typeof unboundedBase = {
      ...unboundedBase,
      protocols: [
        {
          requestTag: "PersistCount",
          observationTags: ["ResetObserved"],
          progress: { kind: "bounded", maximumTurns: 0 },
        },
      ],
    };
    await expect(run(defineSemanticComponent(unbounded))).rejects.toThrow("positive safe integer");
  });

  test("rejects undeclared outputs, duplicate action IDs, and thrown handler defects", async () => {
    const undeclaredBase = makeSpec();
    const undeclaredSpec: typeof undeclaredBase = {
      ...undeclaredBase,
      react: (state, input) => ({
        state,
        events: [
          {
            messageId: "event",
            correlationId: input.correlationId,
            payload: { _tag: "NotDeclared", by: 1 } as unknown as Event,
          },
        ],
        artifacts: [],
        effects: [],
        diagnostics: [],
      }),
    };
    const undeclared = await run(defineSemanticComponent(undeclaredSpec));
    const input = await run(
      command(
        undeclared,
        { messageId: "command", correlationId: "journey" },
        { _tag: "Increment", by: 1 },
      ),
    );
    await expect(run(react(undeclared, { count: 0 }, input))).rejects.toThrow(
      "domain_event[0].payload",
    );

    const duplicateSpecBase = makeSpec();
    const duplicateSpec: typeof duplicateSpecBase = {
      ...duplicateSpecBase,
      react: (state, reactionInput) => {
        const request = {
          messageId: "request",
          correlationId: reactionInput.correlationId,
          actionId: "same-action",
          payload: { _tag: "PersistCount" as const, value: state.count },
        };
        return {
          state,
          events: [],
          artifacts: [],
          effects: [request, { ...request, messageId: "request-2" }],
          diagnostics: [],
        };
      },
    };
    const duplicate = await run(defineSemanticComponent(duplicateSpec));
    const duplicateInput = await run(
      command(
        duplicate,
        { messageId: "command-2", correlationId: "journey" },
        { _tag: "Increment", by: 1 },
      ),
    );
    await expect(run(react(duplicate, { count: 0 }, duplicateInput))).rejects.toThrow(
      "duplicate action identity",
    );

    const throwingBase = makeSpec();
    const throwingSpec: typeof throwingBase = {
      ...throwingBase,
      react: () => {
        throw new Error("hostile handler");
      },
    };
    const throwing = await run(defineSemanticComponent(throwingSpec));
    const throwingInput = await run(
      command(
        throwing,
        { messageId: "command-3", correlationId: "journey" },
        { _tag: "Increment", by: 1 },
      ),
    );
    await expect(run(react(throwing, { count: 0 }, throwingInput))).rejects.toThrow(
      "react.handler: hostile handler",
    );
  });
});
