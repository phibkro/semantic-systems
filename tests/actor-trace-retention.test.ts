import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  ActorTransitionFailed,
  InvalidActorDefinition,
  spawn,
  type ActorDefinition,
  type ActorTrace,
} from "../src/actor/runtime.ts";
import {
  acceptActorEnvelope,
  actorExactCounter,
  appendActorObservation,
  closeActorTrace,
  snapshotActorTrace,
  type ActorTraceState,
} from "../src/actor/trace-retention-internal.ts";

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect);
const exact = actorExactCounter;

const counterDefinition = (
  id: string,
  traceCapacity: number,
): ActorDefinition<number, number, number, never, never> => ({
  id,
  initialState: 0,
  mailboxCapacity: 4,
  traceCapacity,
  transition: (message, state) => Effect.succeed([state + message, state + message] as const),
});

describe("bounded actor trace retention", () => {
  test("retains the newest chronological window with exact eviction counters", async () => {
    const snapshot = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn(counterDefinition("bounded-trace", 5));
          for (let sequence = 1; sequence <= 100; sequence++) {
            const receipt = yield* actor.send(1);
            expect(receipt.sequence).toBe(sequence);
          }
          return yield* actor.close;
        }),
      ),
    );

    expect(snapshot).toEqual({
      capacity: 5,
      entries: [
        { kind: "committed", actorId: "bounded-trace", sequence: 99 },
        { kind: "accepted", actorId: "bounded-trace", sequence: 100 },
        { kind: "started", actorId: "bounded-trace", sequence: 100 },
        { kind: "committed", actorId: "bounded-trace", sequence: 100 },
        { kind: "closed", actorId: "bounded-trace", acceptedCount: exact(100n) },
      ],
      totalObserved: exact(301n),
      evicted: exact(296n),
      acceptedCount: exact(100n),
      completeHistory: false,
    });
  });

  test("capacity one retains the final close observation and discloses lost history", async () => {
    const snapshot = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn(counterDefinition("single-trace", 1));
          yield* actor.send(1);
          return yield* actor.close;
        }),
      ),
    );

    expect(snapshot.entries).toEqual([
      { kind: "closed", actorId: "single-trace", acceptedCount: exact(1n) },
    ]);
    expect(snapshot.totalObserved).toBe(exact(4n));
    expect(snapshot.evicted).toBe(exact(3n));
    expect(snapshot.completeHistory).toBe(false);
  });

  test("the production accepted transition stays exact and distinct from observations", () => {
    const maximumSafe = BigInt(Number.MAX_SAFE_INTEGER);
    const injected: ActorTraceState = {
      entries: [
        {
          kind: "committed",
          actorId: "exact-boundary",
          sequence: Number.MAX_SAFE_INTEGER,
        },
      ],
      totalObserved: maximumSafe,
      acceptedCount: maximumSafe,
    };
    const afterObservation = appendActorObservation(injected, 2, {
      kind: "committed",
      actorId: "exact-boundary",
      sequence: 1,
    });
    expect(afterObservation.acceptedCount).toBe(maximumSafe);

    const afterFirstAcceptance = acceptActorEnvelope(afterObservation, 2, "exact-boundary", 1);
    expect(afterFirstAcceptance.acceptedCount).toBe(maximumSafe + 1n);
    const afterSecondAcceptance = acceptActorEnvelope(afterFirstAcceptance, 2, "exact-boundary", 2);
    expect(afterSecondAcceptance.acceptedCount).toBe(maximumSafe + 2n);

    const afterClose = closeActorTrace(afterSecondAcceptance, 2, "exact-boundary");
    const snapshot = snapshotActorTrace(afterClose, 2);

    expect(snapshot).toEqual({
      capacity: 2,
      entries: [
        { kind: "accepted", actorId: "exact-boundary", sequence: 2 },
        {
          kind: "closed",
          actorId: "exact-boundary",
          acceptedCount: exact(9_007_199_254_740_993n),
        },
      ],
      totalObserved: exact(9_007_199_254_740_995n),
      evicted: exact(9_007_199_254_740_993n),
      acceptedCount: exact(9_007_199_254_740_993n),
      completeHistory: false,
    });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(() => actorExactCounter(-1n)).toThrow("actor exact counters must be non-negative");
  });

  test("rejects missing and invalid trace capacities before creating an actor", async () => {
    const invalid = [undefined, 0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1];
    for (const traceCapacity of invalid) {
      const definition = {
        id: "invalid-trace",
        initialState: 0,
        mailboxCapacity: 1,
        traceCapacity,
        transition: (message: number, state: number) =>
          Effect.succeed([state + message, state + message] as const),
      } as ActorDefinition<number, number, number, never, never>;
      const failure = await run(Effect.scoped(spawn(definition).pipe(Effect.flip)));
      expect(failure).toBeInstanceOf(InvalidActorDefinition);
      expect((failure as InvalidActorDefinition).message).toContain(
        "trace capacity must be a positive safe integer",
      );
    }
  });

  test("snapshots trace capacity and returns one deeply immutable settled snapshot", async () => {
    const definition = counterDefinition("trace-custody", 4) as {
      id: string;
      initialState: number;
      mailboxCapacity: number;
      traceCapacity: number;
      transition: (message: number, state: number) => Effect.Effect<readonly [number, number]>;
    };
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn(definition);
          definition.traceCapacity = 1;
          yield* actor.send(1);
          const first = yield* actor.close;
          const second = yield* actor.close;
          return { first, second };
        }),
      ),
    );

    expect(result.first.capacity).toBe(4);
    expect(result.first.completeHistory).toBe(true);
    expect(result.first).toBe(result.second);
    expect(Object.isFrozen(result.first)).toBe(true);
    expect(Object.isFrozen(result.first.entries)).toBe(true);
    expect(result.first.entries.every(Object.isFrozen)).toBe(true);

    const firstEntry = result.first.entries[0] as ActorTrace & { kind: string };
    expect(() => {
      firstEntry.kind = "closed";
    }).toThrow();
    expect(result.second.entries[0]?.kind).toBe("accepted");
  });

  test("transition failure and close obey the same bounded retention invariant", async () => {
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const actor = yield* spawn<number, number, number, "boom", never>({
            id: "failed-trace",
            initialState: 0,
            mailboxCapacity: 1,
            traceCapacity: 3,
            transition: () => Effect.fail("boom"),
          });
          const failure = yield* actor.send(1).pipe(Effect.flip);
          return { failure, snapshot: yield* actor.close };
        }),
      ),
    );

    expect(result.failure).toBeInstanceOf(ActorTransitionFailed);
    expect(result.snapshot.entries.map((entry) => entry.kind)).toEqual([
      "started",
      "transition_failed",
      "closed",
    ]);
    expect(result.snapshot.totalObserved).toBe(exact(4n));
    expect(result.snapshot.evicted).toBe(exact(1n));
    expect(result.snapshot.entries.length).toBeLessThanOrEqual(result.snapshot.capacity);
  });
});
