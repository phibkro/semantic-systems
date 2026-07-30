import { Context, Data, Effect, Layer, Ref } from "effect";
import {
  prepareReferenceTransition,
  type Event,
  type Message,
  type State,
} from "../tracer/domain.ts";
import type { ActorDefinition } from "./runtime.ts";

export class FreshIdentifierExhausted extends Data.TaggedError("FreshIdentifierExhausted")<{
  readonly requestedIndex: number;
}> {
  override get message(): string {
    return `deterministic fresh-identifier input exhausted at index ${this.requestedIndex}`;
  }
}

export interface FreshIdentifierShape {
  readonly next: Effect.Effect<string, FreshIdentifierExhausted>;
}

export class FreshIdentifier extends Context.Service<FreshIdentifier, FreshIdentifierShape>()(
  "actor/FreshIdentifier",
) {}

export const deterministicFreshIdentifierLayer = (
  identifiers: ReadonlyArray<string>,
): Layer.Layer<FreshIdentifier> =>
  Layer.effect(
    FreshIdentifier,
    Effect.gen(function* () {
      const index = yield* Ref.make(0);
      return {
        next: Effect.gen(function* () {
          const current = yield* Ref.get(index);
          const value = identifiers[current];
          if (value === undefined) {
            return yield* new FreshIdentifierExhausted({ requestedIndex: current });
          }
          yield* Ref.set(index, current + 1);
          return value;
        }),
      };
    }),
  );

export const inventoryActorDefinition = (
  id: string,
  initialState: State,
  mailboxCapacity: number,
  traceCapacity: number,
): ActorDefinition<Message, State, Event, FreshIdentifierExhausted, FreshIdentifier> => ({
  id,
  initialState,
  mailboxCapacity,
  traceCapacity,
  transition: (message, state) =>
    Effect.gen(function* () {
      const prepared = prepareReferenceTransition(message, state);
      if (prepared.kind === "complete") return prepared.result;
      const identifiers = yield* FreshIdentifier;
      return prepared.complete(yield* identifiers.next);
    }),
});
