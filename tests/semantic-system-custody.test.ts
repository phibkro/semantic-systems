import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import {
  command,
  defineSemanticComponent,
  react,
  type SemanticComponentSpec,
} from "../src/semantic-system/index.ts";

const State = Schema.Struct({
  values: Schema.Array(Schema.Finite),
});
const Command = Schema.TaggedStruct("Append", {
  value: Schema.Finite,
});
const Observation = Schema.TaggedStruct("Observed", {});
const Query = Schema.TaggedStruct("Values", {});
const Event = Schema.TaggedStruct("Appended", { value: Schema.Finite });
const Artifact = Schema.TaggedStruct("ValuesArtifact", {
  values: Schema.Array(Schema.Finite),
});
const Request = Schema.TaggedStruct("Persist", {});

type Spec = SemanticComponentSpec<
  typeof State.Type,
  typeof Command.Type,
  typeof Observation.Type,
  typeof Query.Type,
  typeof Event.Type,
  typeof Artifact.Type,
  typeof Request.Type
>;

const makeSpec = (): Spec => ({
  id: "custody",
  version: "custody.v1",
  state: { schemaId: "state", schema: State },
  commands: { schemaId: "commands", tags: ["Append"], schema: Command },
  observations: { schemaId: "observations", tags: ["Observed"], schema: Observation },
  queries: { schemaId: "queries", tags: ["Values"], schema: Query },
  events: { schemaId: "events", tags: ["Appended"], schema: Event },
  artifacts: {
    schemaId: "artifacts",
    tags: ["ValuesArtifact"],
    schema: Artifact,
  },
  effects: { schemaId: "effects", tags: ["Persist"], schema: Request },
  protocols: [
    {
      requestTag: "Persist",
      observationTags: ["Observed"],
      progress: { kind: "bounded", maximumTurns: 1 },
    },
  ],
  react: (state, input) => ({
    state:
      input.category === "command" ? { values: [...state.values, input.payload.value] } : state,
    events:
      input.category === "command"
        ? [
            {
              messageId: `${input.messageId}:event`,
              correlationId: input.correlationId,
              payload: { _tag: "Appended" as const, value: input.payload.value },
            },
          ]
        : [],
    artifacts: [],
    effects: [],
    diagnostics: [],
  }),
  answer: () => ({ artifacts: [], diagnostics: [] }),
});

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect);

describe("semantic-system value and definition custody", () => {
  test("snapshots authored definition metadata and all accepted values", async () => {
    const spec = makeSpec();
    const commandTags = spec.commands.tags as Array<string>;
    const component = await run(defineSemanticComponent(spec));
    commandTags[0] = "Mutated";
    const observationTags = spec.protocols[0]!.observationTags as Array<string>;
    observationTags[0] = "Mutated";

    expect(component.metadata.families.commands.tags).toEqual(["Append"]);
    expect(component.metadata.protocols[0]?.observationTags).toEqual(["Observed"]);
    expect(Object.isFrozen(component.metadata)).toBeTrue();
    expect(Object.isFrozen(component.metadata.protocols[0]?.observationTags)).toBeTrue();

    const payload = { _tag: "Append" as const, value: 2 };
    const input = await run(
      command(component, { messageId: "command", correlationId: "journey" }, payload),
    );
    payload.value = 999;

    const state = { values: [1] };
    const result = await run(react(component, state, input));
    state.values.push(999);

    expect(input.payload.value).toBe(2);
    expect(result.state).toEqual({ values: [1, 2] });
    expect(Object.isFrozen(result)).toBeTrue();
    expect(Object.isFrozen(result.state.values)).toBeTrue();
    expect(() => {
      (result.state.values as Array<number>).push(3);
    }).toThrow();
  });

  test("rejects cycles, accessors, functions, and hostile proxies", async () => {
    const component = await run(defineSemanticComponent(makeSpec()));

    const cyclic: { _tag: "Append"; value: number; self?: unknown } = {
      _tag: "Append",
      value: 1,
    };
    cyclic.self = cyclic;
    await expect(
      run(command(component, { messageId: "cyclic", correlationId: "journey" }, cyclic)),
    ).rejects.toThrow();

    let getterReads = 0;
    const accessorPayload = { _tag: "Append" };
    Object.defineProperty(accessorPayload, "value", {
      enumerable: true,
      get() {
        getterReads += 1;
        return 1;
      },
    });
    await expect(
      run(command(component, { messageId: "accessor", correlationId: "journey" }, accessorPayload)),
    ).rejects.toThrow("accessors");
    expect(getterReads).toBe(0);

    await expect(
      run(
        command(
          component,
          { messageId: "function", correlationId: "journey" },
          { _tag: "Append", value: 1, callback: () => undefined },
        ),
      ),
    ).rejects.toThrow("unsupported semantic value function");

    class ClassPayload {
      readonly _tag = "Append";
      readonly value = 1;
    }
    await expect(
      run(command(component, { messageId: "class", correlationId: "journey" }, new ClassPayload())),
    ).rejects.toThrow("only arrays and plain records");

    const hostile = new Proxy(
      { _tag: "Append", value: 1 },
      {
        get() {
          throw new Error("proxy trap");
        },
      },
    );
    await expect(
      run(command(component, { messageId: "proxy", correlationId: "journey" }, hostile)),
    ).rejects.toThrow();
  });

  test("does not retain a mutable authored handler property", async () => {
    const spec = makeSpec();
    const component = await run(defineSemanticComponent(spec));
    const replacement: Spec["react"] = (state) => ({
      state: { values: [...state.values, 999] },
      events: [],
      artifacts: [],
      effects: [],
      diagnostics: [],
    });
    (spec as { react: Spec["react"] }).react = replacement;

    const input = await run(
      command(
        component,
        { messageId: "command", correlationId: "journey" },
        { _tag: "Append", value: 2 },
      ),
    );
    expect((await run(react(component, { values: [] }, input))).state).toEqual({
      values: [2],
    });
  });
});
