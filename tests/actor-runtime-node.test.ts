import assert from "node:assert/strict";
import test from "node:test";
import { Effect } from "effect";
import {
  ActorMessageNotTransferable,
  InvalidActorDefinition,
  spawn,
} from "../src/actor/runtime.ts";

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

test("Node rejects shared memory at actor ownership boundaries", async () => {
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const initialFailure = yield* spawn<
          never,
          { readonly buffer: SharedArrayBuffer },
          never,
          never,
          never
        >({
          id: "node-shared-initial",
          initialState: { buffer: new SharedArrayBuffer(4) },
          mailboxCapacity: 1,
          traceCapacity: 64,
          transition: (_, state) => Effect.succeed([state, undefined as never] as const),
        }).pipe(Effect.flip);
        const actor = yield* spawn<unknown, number, number, never, never>({
          id: "node-shared-message",
          initialState: 0,
          mailboxCapacity: 1,
          traceCapacity: 64,
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

  assert.ok(result.initialFailure instanceof InvalidActorDefinition);
  assert.ok(result.messageFailure instanceof ActorMessageNotTransferable);
  assert.ok(result.viewFailure instanceof ActorMessageNotTransferable);
});

test("Node keeps hostile transfer failures in the typed channel", async () => {
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const initialFailure = yield* spawn<never, object, never, never, never>({
          id: "node-hostile-initial",
          initialState: hostileTransferValue(),
          mailboxCapacity: 1,
          traceCapacity: 64,
          transition: (_, state) => Effect.succeed([state, undefined as never] as const),
        }).pipe(Effect.flip);
        const actor = yield* spawn<object, number, number, never, never>({
          id: "node-hostile-message",
          initialState: 0,
          mailboxCapacity: 1,
          traceCapacity: 64,
          transition: (_, state) => Effect.succeed([state, state] as const),
        });
        const messageFailure = yield* actor.send(hostileTransferValue()).pipe(Effect.flip);
        yield* actor.close;
        return { initialFailure, messageFailure };
      }),
    ),
  );

  assert.ok(result.initialFailure instanceof InvalidActorDefinition);
  assert.ok(result.messageFailure instanceof ActorMessageNotTransferable);
});
