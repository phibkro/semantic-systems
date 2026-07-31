import { describe, expect, test } from "bun:test";
import { Effect, Result, Schema } from "effect";
import {
  command,
  defineInterpreterRegistry,
  defineSemanticComponent,
  deriveComponentGraph,
  interpretEffectRequest,
  InvalidInterpreterRegistry,
  InterpreterAttemptFailed,
  react,
  runDirect,
  type InterpreterEntry,
  type InterpreterRegistry,
  type SemanticComponentSpec,
} from "../src/semantic-system/index.ts";

const StateSchema = Schema.Struct({
  value: Schema.Finite,
  confirmed: Schema.Boolean,
});
const CommandSchema = Schema.TaggedStruct("Start", {});
const ObservationSchema = Schema.TaggedStruct("Persisted", {
  value: Schema.Finite,
});
const QuerySchema = Schema.TaggedStruct("Status", {});
const EventSchema = Schema.TaggedStruct("Started", { value: Schema.Finite });
const ArtifactSchema = Schema.TaggedStruct("StatusArtifact", {
  value: Schema.Finite,
  confirmed: Schema.Boolean,
});
const RequestSchema = Schema.TaggedStruct("Persist", { value: Schema.Finite });

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
  id: "driver-counter",
  version: "driver-counter.v1",
  state: { schemaId: "driver.state", schema: StateSchema },
  commands: { schemaId: "driver.command", tags: ["Start"], schema: CommandSchema },
  observations: {
    schemaId: "driver.observation",
    tags: ["Persisted"],
    schema: ObservationSchema,
  },
  queries: { schemaId: "driver.query", tags: ["Status"], schema: QuerySchema },
  events: { schemaId: "driver.event", tags: ["Started"], schema: EventSchema },
  artifacts: {
    schemaId: "driver.artifact",
    tags: ["StatusArtifact"],
    schema: ArtifactSchema,
  },
  effects: { schemaId: "driver.request", tags: ["Persist"], schema: RequestSchema },
  protocols: [
    {
      requestTag: "Persist",
      observationTags: ["Persisted"],
      progress: { kind: "bounded", maximumTurns: 1 },
    },
  ],
  react: (state, input) => {
    if (input.category === "observation") {
      return {
        state: { value: input.payload.value, confirmed: true },
        events: [],
        artifacts: [],
        effects: [],
        diagnostics: [],
      };
    }
    const value = state.value + 1;
    return {
      state: { value, confirmed: false },
      events: [
        {
          messageId: `${input.messageId}:event`,
          correlationId: input.correlationId,
          causationId: input.messageId,
          payload: { _tag: "Started", value },
        },
      ],
      artifacts: [],
      effects: [
        {
          messageId: `${input.messageId}:request`,
          correlationId: input.correlationId,
          causationId: input.messageId,
          actionId: `${input.messageId}:persist`,
          payload: { _tag: "Persist", value },
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
        payload: { _tag: "StatusArtifact", ...state },
      },
    ],
    diagnostics: [],
  }),
});

const bounds = {
  maximumInputs: 4,
  maximumEffects: 2,
  maximumQueueStock: 4,
  maximumObservations: 2,
} as const;

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect);

const successEntry: InterpreterEntry<Request, Observation, never> = {
  requestTag: "Persist",
  interpret: (request) =>
    Effect.succeed({
      messageId: `${request.messageId}:observed`,
      provenance: { sourceId: "deterministic-store", basis: "fixture acknowledgement" },
      payload: { _tag: "Persisted", value: request.payload.value },
    }),
};

describe("bounded direct semantic-system driver", () => {
  test("feeds interpreted observations back to quiescence and derives only declared graph edges", async () => {
    const component = await run(defineSemanticComponent(makeSpec()));
    const registry = await run(defineInterpreterRegistry(component, [successEntry]));
    const start = await run(
      command(component, { messageId: "start-1", correlationId: "journey-1" }, { _tag: "Start" }),
    );

    const result = await run(
      runDirect(component, registry, { value: 0, confirmed: false }, [start], bounds),
    );
    expect(result.status).toBe("completed");
    expect(result.state).toEqual({ value: 1, confirmed: true });
    expect(result.counts).toEqual({
      processedInputs: 2,
      interpretedEffects: 1,
      returnedObservations: 1,
    });
    expect(result.attempts).toEqual([
      {
        actionId: "start-1:persist",
        requestMessageId: "start-1:request",
        outcome: "observed",
        observationMessageId: "start-1:request:observed",
      },
    ]);
    expect(result.remainingInputs).toEqual([]);
    expect(result.remainingEffects).toEqual([]);
    expect(result.trace.map((entry) => entry.kind)).toEqual([
      "command",
      "domain_event",
      "effect_request",
      "interpreter_attempt",
      "observation",
      "final_state",
    ]);
    expect(result.trace.map((entry) => entry.sequence)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.trace.at(-1)).toMatchObject({
      kind: "final_state",
      value: { value: 1, confirmed: true },
    });

    const graph = await run(deriveComponentGraph(component, registry));
    expect(graph.nodes.some((node) => node.id.endsWith("effect_request:Persist"))).toBeTrue();
    expect(graph.nodes.filter((node) => node.kind === "handler")).toHaveLength(2);
    expect(
      graph.edges.some(
        (edge) =>
          edge.kind === "consumes" &&
          edge.source.endsWith("command:Start") &&
          edge.target.endsWith("handler:react"),
      ),
    ).toBeTrue();
    expect(
      graph.edges.some(
        (edge) =>
          edge.kind === "observes" &&
          edge.source.endsWith("interpreter:Persist") &&
          edge.target.endsWith("observation:Persisted") &&
          edge.progress?.kind === "bounded" &&
          edge.progress.maximumTurns === 1,
      ),
    ).toBeTrue();
    expect(graph.nodes.some((node) => node.id.includes("StartedButGuessed"))).toBeFalse();
    expect(graph.unsupportedClaims).toContain("observation truth");
    expect(Object.isFrozen(graph.edges)).toBeTrue();
    expect(
      graph.edges.find(
        (edge) => edge.kind === "observes" && edge.target.endsWith("observation:Persisted"),
      )?.progress,
    ).toEqual({ kind: "bounded", maximumTurns: 1 });
  });

  test("requires an exact privately constructed interpreter registry", async () => {
    const component = await run(defineSemanticComponent(makeSpec()));
    await expect(run(defineInterpreterRegistry(component, []))).rejects.toThrow(
      "missing interpreters",
    );
    await expect(
      run(defineInterpreterRegistry(component, [successEntry, successEntry])),
    ).rejects.toThrow("duplicate interpreter");

    const start = await run(
      command(component, { messageId: "start", correlationId: "journey" }, { _tag: "Start" }),
    );
    const lookalike = {
      componentId: component.id,
      requestTags: ["Persist"],
    } as InterpreterRegistry<Request, Observation, never>;
    await expect(
      run(runDirect(component, lookalike, { value: 0, confirmed: false }, [start], bounds)),
    ).rejects.toThrow("not constructed by defineInterpreterRegistry");

    const registry = await run(defineInterpreterRegistry(component, [successEntry]));
    const sameIdDifferentVersion = await run(
      defineSemanticComponent({ ...makeSpec(), version: "driver-counter.v2" }),
    );
    const otherVersionStart = await run(
      command(
        sameIdDifferentVersion,
        { messageId: "other-version", correlationId: "journey" },
        { _tag: "Start" },
      ),
    );
    await expect(
      run(
        runDirect(
          sameIdDifferentVersion,
          registry,
          { value: 0, confirmed: false },
          [otherVersionStart],
          bounds,
        ),
      ),
    ).rejects.toThrow("different component instance");

    const reaction = await run(react(component, { value: 0, confirmed: false }, start));
    await expect(
      run(
        interpretEffectRequest(component, registry, {
          ...reaction.effects[0]!,
          schemaId: "forged.schema",
        }),
      ),
    ).rejects.toThrow("does not match the component protocol");
  });

  test("rejects malformed interpreter programs and observation drafts through typed failures", async () => {
    const component = await run(defineSemanticComponent(makeSpec()));
    const start = await run(
      command(component, { messageId: "malformed", correlationId: "journey" }, { _tag: "Start" }),
    );
    const reaction = await run(react(component, { value: 0, confirmed: false }, start));
    const request = reaction.effects[0]!;
    const malformedInterpreters: ReadonlyArray<
      InterpreterEntry<Request, Observation, never>["interpret"]
    > = [
      (() =>
        Effect.succeed({
          messageId: "missing-payload",
          provenance: { sourceId: "fixture", basis: "malformed draft" },
        })) as unknown as InterpreterEntry<Request, Observation, never>["interpret"],
      (() => Effect.succeed("not-a-draft")) as unknown as InterpreterEntry<
        Request,
        Observation,
        never
      >["interpret"],
      (() => "not-an-effect") as unknown as InterpreterEntry<
        Request,
        Observation,
        never
      >["interpret"],
    ];

    for (const interpret of malformedInterpreters) {
      const registry = await run(
        defineInterpreterRegistry(component, [{ requestTag: "Persist", interpret }]),
      );
      const result = await run(Effect.result(interpretEffectRequest(component, registry, request)));
      expect(Result.isFailure(result)).toBeTrue();
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(InvalidInterpreterRegistry);
      }
    }
  });

  test("converts interpreter defects into an unknown outcome and suspends without replay", async () => {
    const component = await run(defineSemanticComponent(makeSpec()));
    const registry = await run(
      defineInterpreterRegistry(component, [
        {
          requestTag: "Persist",
          interpret: () => Effect.die("acknowledgement outcome unavailable"),
        },
      ]),
    );
    const start = await run(
      command(component, { messageId: "defect", correlationId: "journey" }, { _tag: "Start" }),
    );
    const reaction = await run(react(component, { value: 0, confirmed: false }, start));
    const interpreted = await run(
      Effect.result(interpretEffectRequest(component, registry, reaction.effects[0]!)),
    );
    expect(Result.isFailure(interpreted)).toBeTrue();
    if (Result.isFailure(interpreted)) {
      expect(interpreted.failure).toBeInstanceOf(InterpreterAttemptFailed);
      if (interpreted.failure instanceof InterpreterAttemptFailed) {
        expect(interpreted.failure.outcome).toBe("unknown");
      }
    }

    const result = await run(
      runDirect(component, registry, { value: 0, confirmed: false }, [start], bounds),
    );
    expect(result.status).toBe("suspended");
    if (result.status !== "suspended") throw new Error("expected suspended result");
    expect(result.reason).toBe("interpreter_unknown");
    expect(result.remainingEffects).toHaveLength(1);
    expect(result.attempts).toEqual([
      {
        actionId: "defect:persist",
        requestMessageId: "defect:request",
        outcome: "unknown",
        reason: expect.stringContaining("failed without a typed outcome"),
      },
    ]);
  });

  test("suspends unknown attempts without replay and exposes remaining work", async () => {
    const component = await run(defineSemanticComponent(makeSpec()));
    let executions = 0;
    const unknown: InterpreterEntry<Request, Observation, never> = {
      requestTag: "Persist",
      interpret: (request) => {
        executions += 1;
        return Effect.fail(
          new InterpreterAttemptFailed({
            actionId: request.actionId,
            outcome: "unknown",
            reason: "acknowledgement lost",
          }),
        );
      },
    };
    const registry = await run(defineInterpreterRegistry(component, [unknown]));
    const start = await run(
      command(component, { messageId: "start", correlationId: "journey" }, { _tag: "Start" }),
    );
    const result = await run(
      runDirect(component, registry, { value: 0, confirmed: false }, [start], bounds),
    );

    expect(result.status).toBe("suspended");
    if (result.status !== "suspended") throw new Error("expected suspended result");
    expect(result.reason).toBe("interpreter_unknown");
    expect(executions).toBe(1);
    expect(result.state).toEqual({ value: 1, confirmed: false });
    expect(result.remainingEffects).toHaveLength(1);
    expect(result.attempts[0]?.outcome).toBe("unknown");
  });

  test("reports fuel exhaustion instead of claiming completion", async () => {
    const component = await run(defineSemanticComponent(makeSpec()));
    const registry = await run(defineInterpreterRegistry(component, [successEntry]));
    const start = await run(
      command(component, { messageId: "start", correlationId: "journey" }, { _tag: "Start" }),
    );
    const result = await run(
      runDirect(component, registry, { value: 0, confirmed: false }, [start], {
        ...bounds,
        maximumInputs: 1,
      }),
    );
    expect(result.status).toBe("suspended");
    if (result.status !== "suspended") throw new Error("expected suspended result");
    expect(result.reason).toBe("input_fuel_exhausted");
    expect(result.remainingInputs[0]?.category).toBe("observation");
    expect(result.counts.returnedObservations).toBe(1);
    expect(result.trace.some((entry) => entry.kind === "observation")).toBeTrue();
  });

  test("suspends an overflowing reaction transactionally within the queue bound", async () => {
    const burstBase = makeSpec();
    const burstSpec: typeof burstBase = {
      ...burstBase,
      react: (state, input) => ({
        state: { ...state, value: state.value + 1 },
        events: [],
        artifacts: [],
        effects: [0, 1, 2].map((index) => ({
          messageId: `${input.messageId}:request:${index}`,
          correlationId: input.correlationId,
          causationId: input.messageId,
          actionId: `${input.messageId}:persist:${index}`,
          payload: { _tag: "Persist" as const, value: state.value + 1 },
        })),
        diagnostics: [],
      }),
    };
    const component = await run(defineSemanticComponent(burstSpec));
    const registry = await run(defineInterpreterRegistry(component, [successEntry]));
    const start = await run(
      command(component, { messageId: "burst", correlationId: "journey" }, { _tag: "Start" }),
    );
    const result = await run(
      runDirect(component, registry, { value: 0, confirmed: false }, [start], {
        ...bounds,
        maximumQueueStock: 2,
      }),
    );

    expect(result.status).toBe("suspended");
    if (result.status !== "suspended") throw new Error("expected suspended result");
    expect(result.reason).toBe("queue_stock_exhausted");
    expect(result.state).toEqual({ value: 0, confirmed: false });
    expect(result.effects).toEqual([]);
    expect(result.remainingEffects).toEqual([]);
    expect(result.remainingInputs).toEqual([start]);
    expect(result.remainingInputs.length + result.remainingEffects.length).toBeLessThanOrEqual(2);
    expect(result.counts.processedInputs).toBe(0);
    expect(result.trace.map((entry) => entry.kind)).toEqual(["final_state"]);
  });
});
