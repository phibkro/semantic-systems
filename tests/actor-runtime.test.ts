import { describe, expect, test } from "bun:test";
import { Deferred, Effect, Fiber, Layer, Ref } from "effect";
import {
  deterministicFreshIdentifierLayer,
  FreshIdentifier,
  inventoryActorDefinition,
} from "../src/actor/inventory.ts";
import { prepareActorScenarioInputs } from "../src/actor/journey.ts";
import {
  ActorClosed,
  ActorMessageNotTransferable,
  ActorTransitionFailed,
  InvalidActorDefinition,
  spawn,
  type ActorTrace,
} from "../src/actor/runtime.ts";
import {
  referenceTransition,
  replay,
  runSteps,
  stateToJson,
  type Event,
  type Message,
  type State,
} from "../src/tracer/domain.ts";
import type { JsonObject } from "../src/tracer/json.ts";

const initialState: State = { stock: { apple: 5 }, reservations: {} };
const messages: ReadonlyArray<Message> = [
  { kind: "Reserve", item: "apple", quantity: 2 },
  { kind: "Release", reservationId: "r-demo" },
];
const scenarioSteps: ReadonlyArray<JsonObject> = [
  { message: { kind: "Reserve", item: "apple", quantity: 2 }, fresh_id: "r-demo" },
  { message: { kind: "Release", reservation_id: "r-demo" } },
];

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect);

const hostileCause = (): Error =>
  Object.defineProperties(new Error(), {
    name: {
      get: () => {
        throw new Error("hostile-name");
      },
    },
    message: {
      get: () => {
        throw new Error("hostile-message");
      },
    },
  });

const hostileTransferValue = (): object =>
  new Proxy(
    {},
    {
      ownKeys: () => {
        throw hostileCause();
      },
    },
  );

describe("minimal actor runtime", () => {
  test("inventory messages are receiver-FIFO and replay-equivalent to the pure realization", async () => {
    const observation = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn(inventoryActorDefinition("inventory-actor", initialState, 2));
          const receipts = [];
          for (const message of messages) receipts.push(yield* actor.send(message));
          const trace = yield* actor.close;
          return { actor, receipts, trace };
        }).pipe(Effect.provide(deterministicFreshIdentifierLayer(["r-demo"]))),
      ),
    );

    expect(observation.receipts.map((receipt) => receipt.sequence)).toEqual([1, 2]);
    const actorEvents = observation.receipts.map((receipt) => receipt.event);
    const [pureEvents, pureState] = runSteps(initialState, scenarioSteps, referenceTransition);
    expect(actorEvents).toEqual([...pureEvents]);
    expect(stateToJson(replay(initialState, actorEvents))).toEqual(stateToJson(pureState));
    expect(
      observation.trace
        .filter((entry) => entry.kind === "committed")
        .map((entry) => entry.sequence),
    ).toEqual([1, 2]);
    expect(Object.keys(observation.actor).sort()).toEqual([
      "close",
      "id",
      "mailboxCapacity",
      "send",
    ]);
    expect("state" in observation.actor).toBe(false);
  });

  test("an invalid reservation does not consume a fresh identifier", async () => {
    const requested = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const calls = yield* Ref.make(0);
          const layer = Layer.succeed(FreshIdentifier, {
            next: Ref.updateAndGet(calls, (value) => value + 1).pipe(
              Effect.map((value) => `r-${value}`),
            ),
          });
          const result = yield* Effect.gen(function* () {
            const actor = yield* spawn(
              inventoryActorDefinition("inventory-freshness", initialState, 1),
            );
            const invalid = yield* actor.send({
              kind: "Reserve",
              item: "apple",
              quantity: 0,
            });
            const valid = yield* actor.send({
              kind: "Reserve",
              item: "apple",
              quantity: 1,
            });
            yield* actor.close;
            return { invalid, valid, calls: yield* Ref.get(calls) };
          }).pipe(Effect.provide(layer));
          return result;
        }),
      ),
    );

    expect(requested.invalid.event.kind).toBe("ReservationRejected");
    expect(requested.valid.event).toEqual({
      kind: "Reserved",
      reservation_id: "r-1",
      item: "apple",
      quantity: 1,
    });
    expect(requested.calls).toBe(1);
  });

  test("interruption before bounded-mailbox acceptance leaves no sequence or work", async () => {
    const trace = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const actor = yield* spawn<Message, State, Event, never, never>({
            id: "backpressure",
            initialState,
            mailboxCapacity: 1,
            transition: (message, state) =>
              Effect.gen(function* () {
                yield* Deferred.succeed(started, undefined);
                yield* Deferred.await(release);
                return referenceTransition(
                  message,
                  state,
                  message.kind === "Reserve" ? "r-first" : null,
                );
              }),
          });
          const first = yield* Effect.forkChild(
            actor.send({ kind: "Reserve", item: "apple", quantity: 1 }),
          );
          yield* Deferred.await(started);
          const blocked = yield* Effect.forkChild(
            actor.send({ kind: "Reserve", item: "apple", quantity: 1 }),
          );
          yield* Effect.yieldNow;
          yield* Fiber.interrupt(blocked);
          yield* Deferred.succeed(release, undefined);
          yield* Fiber.join(first);
          return yield* actor.close;
        }),
      ),
    );

    expect(
      trace.filter((entry) => entry.kind === "accepted").map((entry) => entry.sequence),
    ).toEqual([1]);
    expect(
      trace.filter((entry) => entry.kind === "committed").map((entry) => entry.sequence),
    ).toEqual([1]);
  });

  test("caller interruption after acceptance cannot cancel actor-owned work", async () => {
    const trace = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const actor = yield* spawn<number, number, number, never, never>({
            id: "owned-envelope",
            initialState: 0,
            mailboxCapacity: 1,
            transition: (message, state) =>
              Effect.gen(function* () {
                yield* Deferred.succeed(started, undefined);
                yield* Deferred.await(release);
                return [state + message, state + message] as const;
              }),
          });
          const caller = yield* Effect.forkChild(actor.send(1));
          yield* Deferred.await(started);
          yield* Fiber.interrupt(caller);
          yield* Deferred.succeed(release, undefined);
          return yield* actor.close;
        }),
      ),
    );

    expect(trace.map((entry) => entry.kind)).toEqual([
      "accepted",
      "started",
      "committed",
      "closed",
    ]);
  });

  test("initial state and accepted messages cross the actor boundary by value", async () => {
    const mutableInitial = { total: 0 };
    const mutableMessage = { amount: 1 };
    const receipt = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const actor = yield* spawn<{ amount: number }, { total: number }, number, never, never>({
            id: "value-boundary",
            initialState: mutableInitial,
            mailboxCapacity: 1,
            transition: (message, state) =>
              Effect.gen(function* () {
                yield* Deferred.succeed(started, undefined);
                yield* Deferred.await(release);
                const next = state.total + message.amount;
                return [{ total: next }, next] as const;
              }),
          });
          mutableInitial.total = 100;
          const delivery = yield* Effect.forkChild(actor.send(mutableMessage));
          yield* Deferred.await(started);
          mutableMessage.amount = 200;
          yield* Deferred.succeed(release, undefined);
          const result = yield* Fiber.join(delivery);
          yield* actor.close;
          return result;
        }),
      ),
    );

    expect(receipt.event).toBe(1);
  });

  test("receipt events cannot retain or mutate actor-private state aliases", async () => {
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn<number, Array<number>, Array<number>, never, never>({
            id: "event-boundary",
            initialState: [],
            mailboxCapacity: 1,
            transition: (message, state) => {
              const next = [...state, message];
              return Effect.succeed([next, next] as const);
            },
          });
          const first = yield* actor.send(1);
          first.event.push(999);
          const second = yield* actor.send(2);
          yield* actor.close;
          return second.event;
        }),
      ),
    );

    expect(result).toEqual([1, 2]);
  });

  test("a transition-retained state input is not the subsequently committed state", async () => {
    let retainedState: { count: number } | undefined;
    const second = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn<number, { count: number }, number, never, never>({
            id: "transition-boundary",
            initialState: { count: 0 },
            mailboxCapacity: 1,
            transition: (message, state) => {
              retainedState = state;
              state.count += message;
              return Effect.succeed([state, state.count] as const);
            },
          });
          yield* actor.send(1);
          if (retainedState === undefined) return yield* Effect.die("transition did not run");
          retainedState.count = 100;
          const receipt = yield* actor.send(1);
          yield* actor.close;
          return receipt.event;
        }),
      ),
    );

    expect(second).toBe(2);
  });

  test("non-transferable messages fail before acceptance without consuming a sequence", async () => {
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn<
            { readonly callback: () => void },
            number,
            number,
            never,
            never
          >({
            id: "message-transfer",
            initialState: 0,
            mailboxCapacity: 1,
            transition: (_, state) => Effect.succeed([state, state] as const),
          });
          const failure = yield* actor.send({ callback: () => undefined }).pipe(Effect.flip);
          const trace = yield* actor.close;
          const postClose = yield* actor.send({ callback: () => undefined }).pipe(Effect.flip);
          return { failure, postClose, trace };
        }),
      ),
    );

    expect(result.failure).toBeInstanceOf(ActorMessageNotTransferable);
    expect(result.postClose).toBeInstanceOf(ActorClosed);
    expect(result.trace).toEqual([
      { kind: "closed", actorId: "message-transfer", acceptedCount: 0 },
    ]);
  });

  test("non-transferable initial state is an invalid actor definition", async () => {
    const failure = await run(
      Effect.scoped(
        spawn<never, { readonly callback: () => void }, never, never, never>({
          id: "state-transfer",
          initialState: { callback: () => undefined },
          mailboxCapacity: 1,
          transition: (_, state) => Effect.succeed([state, undefined as never] as const),
        }).pipe(Effect.flip),
      ),
    );

    expect(failure).toBeInstanceOf(InvalidActorDefinition);
    expect((failure as InvalidActorDefinition).message).toContain(
      "initial state must be transferable without shared memory",
    );
  });

  test("shared-memory values are rejected even when the host can structured-clone them", async () => {
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const initialFailure = yield* spawn<
            never,
            { readonly buffer: SharedArrayBuffer },
            never,
            never,
            never
          >({
            id: "shared-initial",
            initialState: { buffer: new SharedArrayBuffer(4) },
            mailboxCapacity: 1,
            transition: (_, state) => Effect.succeed([state, undefined as never] as const),
          }).pipe(Effect.flip);
          const actor = yield* spawn<unknown, number, number, never, never>({
            id: "shared-message",
            initialState: 0,
            mailboxCapacity: 1,
            transition: (_, state) => Effect.succeed([state, state] as const),
          });
          const messageFailure = yield* actor
            .send({ buffer: new SharedArrayBuffer(4) })
            .pipe(Effect.flip);
          const viewFailure = yield* actor
            .send({ nested: { view: new Uint8Array(new SharedArrayBuffer(4)) } })
            .pipe(Effect.flip);
          yield* actor.close;
          return { initialFailure, messageFailure, viewFailure };
        }),
      ),
    );

    expect(result.initialFailure).toBeInstanceOf(InvalidActorDefinition);
    expect(result.messageFailure).toBeInstanceOf(ActorMessageNotTransferable);
    expect(result.viewFailure).toBeInstanceOf(ActorMessageNotTransferable);
  });

  test("hostile transfer failures remain typed at every ownership boundary", async () => {
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const initialFailure = yield* spawn<never, object, never, never, never>({
            id: "hostile-initial",
            initialState: hostileTransferValue(),
            mailboxCapacity: 1,
            transition: (_, state) => Effect.succeed([state, undefined as never] as const),
          }).pipe(Effect.flip);
          const messageActor = yield* spawn<object, number, number, never, never>({
            id: "hostile-message",
            initialState: 0,
            mailboxCapacity: 1,
            transition: (_, state) => Effect.succeed([state, state] as const),
          });
          const messageFailure = yield* messageActor.send(hostileTransferValue()).pipe(Effect.flip);
          yield* messageActor.close;
          const outputActor = yield* spawn<number, number, object, never, never>({
            id: "hostile-output",
            initialState: 0,
            mailboxCapacity: 1,
            transition: (message, state) =>
              Effect.succeed([state + message, hostileTransferValue()] as const),
          });
          const outputFailure = yield* outputActor.send(1).pipe(Effect.flip);
          yield* outputActor.close;
          return { initialFailure, messageFailure, outputFailure };
        }),
      ),
    );

    expect(result.initialFailure).toBeInstanceOf(InvalidActorDefinition);
    expect(result.messageFailure).toBeInstanceOf(ActorMessageNotTransferable);
    expect(result.outputFailure).toBeInstanceOf(ActorTransitionFailed);
  });

  test("spawn snapshots the definition container before caller mutation", async () => {
    const definition = {
      id: "definition-original",
      initialState: 0,
      mailboxCapacity: 1,
      transition: (message: number, state: number) =>
        Effect.succeed([state + message, state + message] as const),
    };
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn(definition);
          definition.id = "definition-mutated";
          definition.mailboxCapacity = 99;
          definition.transition = (message, state) =>
            Effect.succeed([state - message, state - message] as const);
          const receipt = yield* actor.send(1);
          const trace = yield* actor.close;
          return { actor, receipt, trace };
        }),
      ),
    );

    expect(result.actor.id).toBe("definition-original");
    expect(result.actor.mailboxCapacity).toBe(1);
    expect(result.receipt).toEqual({
      actorId: "definition-original",
      sequence: 1,
      event: 1,
    });
    expect(result.trace.every((entry) => entry.actorId === "definition-original")).toBe(true);
  });

  test("actor freshness inputs exclude guarded reservations that cannot request an identifier", async () => {
    const scenario: JsonObject = {
      initial_state: initialState as unknown as JsonObject,
      steps: [
        {
          message: { kind: "Reserve", item: "apple", quantity: 0 },
          fresh_id: "r-unused-invalid",
        },
        {
          message: { kind: "Reserve", item: "apple", quantity: 99 },
          fresh_id: "r-unused-insufficient",
        },
        {
          message: { kind: "Reserve", item: "apple", quantity: 1 },
          fresh_id: "r-used",
        },
      ],
    };
    const inputs = await run(prepareActorScenarioInputs(scenario));
    const actorEvents = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn(
            inventoryActorDefinition("fresh-alignment", inputs.initialState, 1),
          );
          const events: Array<Event> = [];
          for (const message of inputs.messages) events.push((yield* actor.send(message)).event);
          yield* actor.close;
          return events;
        }).pipe(Effect.provide(deterministicFreshIdentifierLayer(inputs.freshIdentifiers))),
      ),
    );
    const [pureEvents] = runSteps(initialState, inputs.steps, referenceTransition);

    expect(inputs.freshIdentifiers).toEqual(["r-used"]);
    expect([...actorEvents]).toEqual([...pureEvents]);
  });

  test("non-transferable transition output stops the actor as a transition failure", async () => {
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn<
            number,
            number,
            { readonly callback: () => void },
            never,
            never
          >({
            id: "result-transfer",
            initialState: 0,
            mailboxCapacity: 1,
            transition: (message, state) =>
              Effect.succeed([state + message, { callback: () => undefined }] as const),
          });
          const failure = yield* actor.send(1).pipe(Effect.flip);
          const future = yield* actor.send(2).pipe(Effect.flip);
          const trace = yield* actor.close;
          return { failure, future, trace };
        }),
      ),
    );

    expect(result.failure).toBeInstanceOf(ActorTransitionFailed);
    expect(result.future).toBeInstanceOf(ActorClosed);
    expect(result.trace.some((entry) => entry.kind === "committed")).toBe(false);
  });

  test("graceful close is idempotent and later sends fail visibly", async () => {
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn<number, number, number, never, never>({
            id: "close",
            initialState: 0,
            mailboxCapacity: 1,
            transition: (message, state) => Effect.succeed([state + message, message] as const),
          });
          const receipt = yield* actor.send(1);
          const firstClose = yield* actor.close;
          const secondClose = yield* actor.close;
          const sendError = yield* actor.send(2).pipe(Effect.flip);
          return { receipt, firstClose, secondClose, sendError };
        }),
      ),
    );

    expect(result.receipt.sequence).toBe(1);
    expect(result.firstClose).toEqual(result.secondClose);
    expect(result.sendError).toBeInstanceOf(ActorClosed);
    expect((result.sendError as ActorClosed).reason).toBe("closed");
  });

  test("typed transition failure is not rendered as a domain rejection", async () => {
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn<number, number, number, "transition-defect", never>({
            id: "failure",
            initialState: 0,
            mailboxCapacity: 2,
            transition: () => Effect.fail("transition-defect" as const),
          });
          const first = yield* actor.send(1).pipe(Effect.flip);
          const second = yield* actor.send(2).pipe(Effect.flip);
          const future = yield* actor.send(3).pipe(Effect.flip);
          const trace = yield* actor.close;
          return { first, second, future, trace };
        }),
      ),
    );

    expect(result.first).toBeInstanceOf(ActorTransitionFailed);
    expect(result.second).toBeInstanceOf(ActorTransitionFailed);
    expect(result.future).toBeInstanceOf(ActorClosed);
    expect((result.future as ActorClosed).reason).toBe("transition_failed");
    expect(result.trace.some((entry: ActorTrace) => entry.kind === "transition_failed")).toBe(true);
    expect(
      result.trace.some(
        (entry: ActorTrace) =>
          entry.kind === "committed" &&
          entry.sequence === (result.first as ActorTransitionFailed).sequence,
      ),
    ).toBe(false);
  });
});
