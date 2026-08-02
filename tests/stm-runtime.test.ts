import { describe, expect, test } from "bun:test";
import { Effect, Fiber, Result } from "effect";
import {
  abort,
  afterCommit,
  binding,
  domain,
  equal,
  greaterThan,
  literal,
  makeStore,
  nested,
  read,
  retry,
  sequence,
  sequenceExpression,
  succeed,
  tvar,
  when,
  write,
  type Domain,
  type Store,
  type TVar,
  type Txn,
} from "../src/stm/model.ts";
import {
  AttemptsExhausted,
  Closed,
  InvalidRuntimeDefinition,
  TransactionRejected,
  makeRuntime,
  type RuntimeBounds,
  type RuntimeFailure,
  type RuntimeSnapshot,
  type StmRuntime,
} from "../src/stm/runtime.ts";
import { buildStmRuntimeReport, canonicalStmRuntimeReport } from "../src/stm/runtime-report.ts";

interface Fixture {
  readonly owner: Domain<"runtime-tests">;
  readonly x: TVar<"runtime-tests", number>;
  readonly y: TVar<"runtime-tests", number>;
  readonly initial: Store<"runtime-tests">;
}

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect);

const fixture = (): Fixture => {
  const owner = domain("runtime-tests");
  const x = tvar(owner, "x", 0);
  const y = tvar(owner, "y", 0);
  return { owner, x, y, initial: makeStore(owner, [x, y]) };
};

const withRuntime = <A>(
  bounds: RuntimeBounds,
  body: (
    runtime: StmRuntime<"runtime-tests">,
    fixture: Fixture,
  ) => Effect.Effect<A, RuntimeFailure>,
): Effect.Effect<A, InvalidRuntimeDefinition | RuntimeFailure, never> => {
  const values = fixture();
  return Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* makeRuntime(values.initial, bounds);
      return yield* body(runtime, values);
    }),
  );
};

const retryUntilPositive = <DomainName extends string>(
  owner: Domain<DomainName>,
  ref: TVar<DomainName, number>,
): Txn<DomainName, never, string, never, never> =>
  sequenceExpression(
    owner,
    "retry-until-positive",
    [
      read(ref, "seen"),
      when(
        owner,
        equal(binding("seen"), literal(0)),
        retry(owner, "retry-zero"),
        succeed(owner, "ready", "ready"),
        "decision",
      ),
    ],
    binding("decision"),
  );

const cellValue = (snapshot: RuntimeSnapshot, id: string): unknown => {
  const cells = snapshot.store.cells;
  if (!Array.isArray(cells)) throw new Error("snapshot cells are not a list");
  const cell = cells.find(
    (candidate) =>
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      typeof candidate.id === "string" &&
      candidate.id === id,
  );
  return cell?.value;
};

const failureOf = <A, E>(result: Result.Result<A, E>): E => {
  if (Result.isSuccess(result)) throw new Error("expected an Effect failure");
  return result.failure;
};

const commitAction = (kind: string) => ({ kind });

describe("bounded STM runtime 0050", () => {
  test("rejects invalid bounds and unauthenticated initial stores before allocation", async () => {
    const values = fixture();
    const invalid = await run(
      Effect.result(
        Effect.scoped(makeRuntime(values.initial, { maximumInFlight: 0, maximumAttempts: 1 })),
      ),
    );
    const invalidError = failureOf(invalid);
    expect(invalidError).toBeInstanceOf(InvalidRuntimeDefinition);
    expect(invalidError.reason).toBe("invalid_bounds");

    const forged = Object.freeze({ ...values.initial }) as Store<"runtime-tests">;
    const rejected = await run(
      Effect.result(Effect.scoped(makeRuntime(forged, { maximumInFlight: 1, maximumAttempts: 1 }))),
    );
    const storeError = failureOf(rejected);
    expect(storeError).toBeInstanceOf(InvalidRuntimeDefinition);
    expect(storeError.reason).toBe("store_rejected");
  });

  test("conflicting calls rerun and return only terminal attempt actions", async () => {
    const result = await run(
      withRuntime({ maximumInFlight: 2, maximumAttempts: 3 }, (runtime, values) =>
        Effect.gen(function* () {
          const left = sequence(
            values.owner,
            "left",
            [
              read(values.x, "seen"),
              write(values.x, 1),
              afterCommit(values.owner, commitAction("left")),
            ],
            null,
          );
          const right = sequence(
            values.owner,
            "right",
            [
              read(values.x, "seen"),
              write(values.x, 2),
              afterCommit(values.owner, commitAction("right")),
            ],
            null,
          );
          const firstFiber = yield* Effect.forkChild(runtime.atomically(left));
          const secondFiber = yield* Effect.forkChild(runtime.atomically(right));
          const fibers = [firstFiber, secondFiber] as const;
          const outcomes = yield* Effect.all([Fiber.join(fibers[0]!), Fiber.join(fibers[1]!)], {
            concurrency: "unbounded",
          });
          const snapshot = yield* runtime.snapshot;
          const attemptCounts = outcomes.map((outcome) => String(outcome.attemptCount));
          const actions = outcomes.flatMap((outcome) =>
            outcome.kind === "committed" ? outcome.commitActions : [],
          );
          expect(attemptCounts.sort()).toEqual(["1", "2"]);
          expect(actions).toHaveLength(2);
          const actionKinds = actions.map((action) =>
            action !== null &&
            typeof action === "object" &&
            !Array.isArray(action) &&
            typeof action.kind === "string"
              ? action.kind
              : "unknown",
          );
          expect(new Set(actionKinds)).toEqual(new Set(["left", "right"]));
          const cells = snapshot.store.cells;
          expect(Array.isArray(cells)).toBe(true);
          if (Array.isArray(cells)) {
            const first = cells[0];
            expect(first !== null && typeof first === "object" && !Array.isArray(first)).toBe(true);
            if (first !== null && typeof first === "object" && !Array.isArray(first)) {
              expect(first.version).toBe("2");
            }
          }
          return outcomes;
        }),
      ),
    );
    expect(result).toHaveLength(2);
  });

  test("publication exposes both cells or neither cell", async () => {
    await run(
      withRuntime({ maximumInFlight: 1, maximumAttempts: 2 }, (runtime, values) =>
        Effect.gen(function* () {
          const update = sequence(
            values.owner,
            "two-cell",
            [write(values.x, 11), write(values.y, 11)],
            null,
          );
          const fiber = yield* Effect.forkChild(runtime.atomically(update));
          const before = yield* runtime.snapshot;
          yield* Effect.yieldNow;
          const during = yield* runtime.snapshot;
          yield* Fiber.join(fiber);
          const after = yield* runtime.snapshot;
          for (const snapshot of [before, during, after]) {
            const valuesAreOld = cellValue(snapshot, "x") === 0 && cellValue(snapshot, "y") === 0;
            const valuesAreNew = cellValue(snapshot, "x") === 11 && cellValue(snapshot, "y") === 11;
            expect(valuesAreOld || valuesAreNew).toBe(true);
          }
        }),
      ),
    );
  });

  test("unrelated changes do not wake and relevant changes do wake", async () => {
    await run(
      withRuntime({ maximumInFlight: 2, maximumAttempts: 3 }, (runtime, values) =>
        Effect.gen(function* () {
          const waiter = yield* Effect.forkChild(
            runtime.atomically(retryUntilPositive(values.owner, values.x)),
          );
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;
          const pending = yield* runtime.snapshot;
          expect(pending.pending).toHaveLength(1);
          yield* runtime.atomically(write(values.y, 1));
          const unrelated = yield* runtime.snapshot;
          expect(unrelated.pending).toHaveLength(1);
          yield* runtime.atomically(write(values.x, 1));
          const outcome = yield* Fiber.join(waiter);
          const after = yield* runtime.snapshot;
          expect(outcome.kind).toBe("committed");
          expect(String(outcome.attemptCount)).toBe("2");
          expect(after.pending).toHaveLength(0);
        }),
      ),
    );
  });

  test("the pre-registration schedule cannot lose a dependency wake", async () => {
    await run(
      withRuntime({ maximumInFlight: 2, maximumAttempts: 3 }, (runtime, values) =>
        Effect.gen(function* () {
          const outcomes = yield* Effect.all(
            [
              runtime.atomically(retryUntilPositive(values.owner, values.x)),
              runtime.atomically(write(values.x, 1)),
            ],
            { concurrency: "unbounded" },
          );
          const snapshot = yield* runtime.snapshot;
          expect(outcomes.every((outcome) => outcome.kind === "committed")).toBe(true);
          expect(snapshot.pending).toHaveLength(0);
        }),
      ),
    );
  });

  test("empty retry interruption removes its waiter and releases capacity", async () => {
    await run(
      withRuntime({ maximumInFlight: 1, maximumAttempts: 2 }, (runtime, values) =>
        Effect.gen(function* () {
          const waiter = yield* Effect.forkChild(runtime.atomically(retry(values.owner, "empty")));
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;
          expect((yield* runtime.snapshot).pending).toHaveLength(1);
          const blocked = yield* Effect.forkChild(runtime.atomically(write(values.y, 1)));
          yield* Effect.yieldNow;
          yield* Fiber.interrupt(blocked);
          yield* Fiber.interrupt(waiter);
          expect((yield* runtime.snapshot).pending).toHaveLength(0);
          const after = yield* runtime.atomically(write(values.x, 1));
          expect(after.kind).toBe("committed");
        }),
      ),
    );
  });
  test("wake-time evaluation rejection preserves publication and sibling wakeups", async () => {
    const owner = domain("wake-evaluation-rejection");
    const flag = tvar(owner, "flag", 0);
    const message = tvar(owner, "message", "not-a-number");
    const initial = makeStore(owner, [flag, message]);
    const badBranch = sequenceExpression(
      owner,
      "bad-branch",
      [read(message, "text")],
      greaterThan(binding("text"), literal(0)),
    );
    const badWaiter = sequenceExpression(
      owner,
      "bad-waiter",
      [
        read(flag, "seen"),
        when(
          owner,
          equal(binding("seen"), literal(0)),
          retry(owner, "bad-waiter-retry"),
          badBranch,
          "decision",
        ),
      ],
      binding("decision"),
    );

    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* makeRuntime(initial, {
            maximumInFlight: 3,
            maximumAttempts: 3,
          });
          const badFiber = yield* Effect.forkChild(Effect.result(runtime.atomically(badWaiter)));
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;
          const healthyFiber = yield* Effect.forkChild(
            runtime.atomically(retryUntilPositive(owner, flag)),
          );
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;
          expect((yield* runtime.snapshot).pending).toHaveLength(2);

          const writer = yield* runtime.atomically(write(flag, 1));
          const badResult = yield* Fiber.join(badFiber);
          const healthyResult = yield* Fiber.join(healthyFiber);
          const snapshot = yield* runtime.snapshot;

          expect(writer.kind).toBe("committed");
          const badFailure = failureOf(badResult);
          expect(badFailure).toBeInstanceOf(TransactionRejected);
          if (!(badFailure instanceof TransactionRejected))
            throw new Error("expected wake evaluation rejection");
          expect(badFailure.reason.kind).toBe("evaluation_rejected");
          expect(healthyResult.kind).toBe("committed");
          expect(cellValue(snapshot, "flag")).toBe(1);
          expect(snapshot.pending).toHaveLength(0);
        }),
      ),
    );
  });

  test("retry wake does not start an attempt beyond the configured maximum", async () => {
    await run(
      withRuntime({ maximumInFlight: 2, maximumAttempts: 1 }, (runtime, values) =>
        Effect.gen(function* () {
          const waiter = yield* Effect.forkChild(
            Effect.result(runtime.atomically(retryUntilPositive(values.owner, values.x))),
          );
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;
          expect((yield* runtime.snapshot).pending).toHaveLength(1);

          const writer = yield* runtime.atomically(write(values.x, 1));
          const waiterResult = yield* Fiber.join(waiter);
          expect(writer.kind).toBe("committed");
          expect(failureOf(waiterResult)).toBeInstanceOf(AttemptsExhausted);
          expect((yield* runtime.snapshot).pending).toHaveLength(0);
        }),
      ),
    );
  });

  test("attempt exhaustion fails before an attempt beyond the configured maximum", async () => {
    await run(
      withRuntime({ maximumInFlight: 2, maximumAttempts: 1 }, (runtime, values) =>
        Effect.gen(function* () {
          const left = sequence(
            values.owner,
            "exhaust-left",
            [read(values.x, "x"), write(values.x, 1)],
            null,
          );
          const right = sequence(
            values.owner,
            "exhaust-right",
            [read(values.x, "x"), write(values.x, 2)],
            null,
          );
          const firstFiber = yield* Effect.forkChild(Effect.result(runtime.atomically(left)));
          const secondFiber = yield* Effect.forkChild(Effect.result(runtime.atomically(right)));
          const fibers = [firstFiber, secondFiber] as const;
          const outcomes = yield* Effect.all([Fiber.join(fibers[0]!), Fiber.join(fibers[1]!)], {
            concurrency: "unbounded",
          });
          const failures = outcomes.filter(Result.isFailure);
          expect(failures).toHaveLength(1);
          expect(failures[0]?.failure).toBeInstanceOf(AttemptsExhausted);
          expect(outcomes.filter(Result.isSuccess)).toHaveLength(1);
        }),
      ),
    );
  });

  test("cross-domain and forged descriptions are rejected before attempts", async () => {
    await run(
      withRuntime({ maximumInFlight: 1, maximumAttempts: 2 }, (runtime, values) =>
        Effect.gen(function* () {
          const other = domain("other-runtime-domain");
          const otherRef = tvar(other, "other", 0);
          const foreign = write(otherRef, 1);
          const foreignForRuntime = foreign as unknown as Txn<
            "runtime-tests",
            never,
            null,
            never,
            never
          >;
          const foreignResult = yield* Effect.result(runtime.atomically(foreignForRuntime));
          const foreignError = failureOf(foreignResult);
          expect(foreignError).toBeInstanceOf(TransactionRejected);
          if (!(foreignError instanceof TransactionRejected))
            throw new Error("expected domain rejection");
          expect(foreignError.reason.kind).toBe("domain_rejected");

          const forged = Object.freeze({ ...foreign }) as unknown as Txn<
            "runtime-tests",
            never,
            null,
            never,
            never
          >;
          const forgedResult = yield* Effect.result(runtime.atomically(forged));
          const forgedError = failureOf(forgedResult);
          expect(forgedError).toBeInstanceOf(TransactionRejected);
          if (!(forgedError instanceof TransactionRejected))
            throw new Error("expected description rejection");
          expect(forgedError.reason.kind).toBe("description_rejected");
          expect((yield* runtime.snapshot).store.domain).toBe(values.owner.name);
          const missing = tvar(values.owner, "missing-from-store", 0);
          const missingResult = yield* Effect.result(runtime.atomically(write(missing, 1)));
          const missingError = failureOf(missingResult);
          expect(missingError).toBeInstanceOf(TransactionRejected);
          if (!(missingError instanceof TransactionRejected))
            throw new Error("expected evaluation rejection");
          expect(missingError.reason.kind).toBe("evaluation_rejected");
        }),
      ),
    );
  });

  test("nested work publishes atomically and typed abort returns abort actions", async () => {
    await run(
      withRuntime({ maximumInFlight: 1, maximumAttempts: 2 }, (runtime, values) =>
        Effect.gen(function* () {
          const inner = sequence(
            values.owner,
            "inner",
            [write(values.x, 3), afterCommit(values.owner, commitAction("inner"))],
            null,
          );
          const outer = sequence(
            values.owner,
            "outer",
            [write(values.y, 4), nested(values.owner, inner)],
            null,
          );
          const committed = yield* runtime.atomically(outer);
          expect(committed.kind).toBe("committed");
          if (committed.kind === "committed")
            expect(committed.commitActions).toEqual([{ kind: "inner" }]);
          const aborted = yield* runtime.atomically(
            abort(values.owner, { code: "nope" }, [commitAction("abort")]),
          );
          expect(aborted.kind).toBe("aborted");
          if (aborted.kind === "aborted") {
            expect(aborted.error).toEqual({ code: "nope" });
          }
          const snapshot = yield* runtime.snapshot;
          expect(cellValue(snapshot, "x")).toBe(3);
          expect(cellValue(snapshot, "y")).toBe(4);
        }),
      ),
    );
  });

  test("close is idempotent, resolves waiters, and snapshots are immutable", async () => {
    await run(
      withRuntime({ maximumInFlight: 1, maximumAttempts: 2 }, (runtime, values) =>
        Effect.gen(function* () {
          const waiter = yield* Effect.forkChild(runtime.atomically(retry(values.owner, "close")));
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;
          const first = yield* runtime.close;
          const second = yield* runtime.close;
          expect(first).toEqual(second);
          expect(first.status).toBe("closed");
          const waiterResult = yield* Effect.result(Fiber.join(waiter));
          expect(failureOf(waiterResult)).toBeInstanceOf(Closed);
          const closedResult = yield* Effect.result(runtime.atomically(write(values.x, 1)));
          expect(failureOf(closedResult)).toBeInstanceOf(Closed);
          expect(Object.isFrozen(first)).toBe(true);
          expect(Object.isFrozen(first.bounds)).toBe(true);
          expect(Object.isFrozen(first.store)).toBe(true);
          expect(Object.isFrozen(first.pending)).toBe(true);
          expect(() => (first.pending as unknown[]).push({})).toThrow();
        }),
      ),
    );
  });

  test("runtime report shape is deterministic and preserves exact counters", async () => {
    const report = await run(canonicalStmRuntimeReport("bun"));
    const parsed = JSON.parse(report) as Record<string, unknown>;
    expect(parsed.schema_version).toBe(1);
    expect(parsed.model).toBe("semantic-stm-runtime-0050");
    expect(parsed.runtime_layer).toBe("bun");
    expect(parsed.observations).toBeInstanceOf(Array);
    expect(report).toBe(await run(canonicalStmRuntimeReport("bun")));
    const direct = await run(buildStmRuntimeReport("node"));
    expect(direct.runtime_layer).toBe("node");
    expect(direct.bounds).toEqual({ maximum_in_flight: "2", maximum_attempts_per_call: "3" });
  });
});
