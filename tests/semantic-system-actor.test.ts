import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  command,
  deterministicFreshIdentifierRegistry,
  interpretEffectRequest,
  inventorySemanticComponent,
  inventorySemanticState,
  normalizeActorReactions,
  projectInventoryReferenceState,
  runDirect,
  spawnSemanticActor,
  type Reaction,
} from "../src/semantic-system/index.ts";

const initialState = {
  stock: { widget: 3 },
  reservations: {},
} as const;

const bounds = {
  maximumInputs: 8,
  maximumEffects: 4,
  maximumQueueStock: 8,
  maximumObservations: 4,
} as const;

describe("semantic component actor realization", () => {
  test("delegates one complete slice to the same component and matches the direct driver", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const component = yield* inventorySemanticComponent;
          const directRegistry = yield* deterministicFreshIdentifierRegistry(component, [
            "reservation-1",
          ]);
          const actorRegistry = yield* deterministicFreshIdentifierRegistry(component, [
            "reservation-1",
          ]);
          const reserve = yield* command(
            component,
            { messageId: "reserve-1", correlationId: "journey-1" },
            { _tag: "Reserve", item: "widget", quantity: 2 },
          );
          const direct = yield* runDirect(
            component,
            directRegistry,
            inventorySemanticState(initialState),
            [reserve],
            bounds,
          );
          const actor = yield* spawnSemanticActor(component, inventorySemanticState(initialState), {
            mailboxCapacity: 2,
            traceCapacity: 32,
          });
          const firstOutput = (yield* actor.send(reserve)).event;
          if (firstOutput.category !== "reaction") {
            return yield* Effect.die("command unexpectedly returned an answer");
          }
          const request = firstOutput.value.effects[0];
          if (request === undefined) {
            return yield* Effect.die("eligible reservation emitted no request");
          }
          const returnedObservation = yield* interpretEffectRequest(
            component,
            actorRegistry,
            request,
          );
          const secondOutput = (yield* actor.send(returnedObservation)).event;
          if (secondOutput.category !== "reaction") {
            return yield* Effect.die("observation unexpectedly returned an answer");
          }
          yield* actor.close;
          return {
            direct,
            actor: normalizeActorReactions([
              firstOutput.value,
              secondOutput.value,
            ] as unknown as readonly [
              Reaction<
                typeof secondOutput.value.state,
                (typeof secondOutput.value.events)[number]["payload"],
                (typeof secondOutput.value.artifacts)[number]["payload"],
                (typeof secondOutput.value.effects)[number]["payload"]
              >,
              ...ReadonlyArray<
                Reaction<
                  typeof secondOutput.value.state,
                  (typeof secondOutput.value.events)[number]["payload"],
                  (typeof secondOutput.value.artifacts)[number]["payload"],
                  (typeof secondOutput.value.effects)[number]["payload"]
                >
              >,
            ]),
          };
        }),
      ),
    );

    expect(result.direct.status).toBe("completed");
    expect(projectInventoryReferenceState(result.actor.state)).toEqual(
      projectInventoryReferenceState(result.direct.state),
    );
    expect(result.actor.events).toEqual(result.direct.events.map((event) => event.payload));
    expect(result.actor.artifacts).toEqual(
      result.direct.artifacts.map((artifact) => artifact.payload),
    );
    expect(result.actor.effects).toEqual(result.direct.effects.map((effect) => effect.payload));
    expect(result.actor.diagnostics).toEqual(result.direct.diagnostics);
  });
});
