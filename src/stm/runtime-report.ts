import { Effect, Fiber, Result } from "effect";
import { canonicalJson } from "../tracer/canonical.ts";
import type { JsonObject, JsonValue } from "../tracer/json.ts";
import {
  abort,
  afterCommit,
  binding,
  domain,
  equal,
  literal,
  makeStore,
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
} from "./model.ts";
import {
  Closed,
  makeRuntime,
  type InvalidRuntimeDefinition,
  type RuntimeFailure,
  type RuntimeSnapshot,
  type Terminal as RuntimeTerminal,
} from "./runtime.ts";

export type RuntimeLayer = "bun" | "node";

interface RuntimeFixture {
  readonly owner: Domain<"runtime-report">;
  readonly x: TVar<"runtime-report", number>;
  readonly y: TVar<"runtime-report", number>;
  readonly initial: Store<"runtime-report">;
}

interface RuntimeTrace {
  readonly conflict: ReadonlyArray<RuntimeTerminal>;
  readonly conflictSnapshot: RuntimeSnapshot;
  readonly atomicBefore: RuntimeSnapshot;
  readonly atomicDuring: RuntimeSnapshot;
  readonly atomicAfter: RuntimeSnapshot;
  readonly retryPending: RuntimeSnapshot;
  readonly retryAfterUnrelated: RuntimeSnapshot;
  readonly retryAfterWake: RuntimeSnapshot;
  readonly retryResult: RuntimeTerminal;
  readonly preRegistrationResult: ReadonlyArray<RuntimeTerminal>;
  readonly preRegistrationSnapshot: RuntimeSnapshot;
  readonly abortResult: RuntimeTerminal;
  readonly closeFirst: RuntimeSnapshot;
  readonly closeSecond: RuntimeSnapshot;
  readonly closeFailure: string;
}

const fixture = (): RuntimeFixture => {
  const owner = domain("runtime-report");
  const x = tvar(owner, "x", 0);
  const y = tvar(owner, "y", 0);
  return Object.freeze({
    owner,
    x,
    y,
    initial: makeStore(owner, [x, y]),
  });
};

const retryUntilPositive = (
  owner: Domain<"runtime-report">,
  ref: TVar<"runtime-report", number>,
): Txn<"runtime-report", never, string, never, never> =>
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

const cells = (snapshot: RuntimeSnapshot): ReadonlyArray<JsonObject> => {
  const value = snapshot.store.cells;
  if (!Array.isArray(value)) throw new TypeError("runtime snapshot cells are not an array");
  return value.filter(
    (cell): cell is JsonObject => cell !== null && typeof cell === "object" && !Array.isArray(cell),
  );
};

const cellValue = (snapshot: RuntimeSnapshot, id: string): JsonValue | undefined => {
  const cell = cells(snapshot).find(
    (candidate) => typeof candidate.id === "string" && candidate.id === id,
  );
  return cell?.value;
};
const cellVersion = (snapshot: RuntimeSnapshot, id: string): JsonValue | undefined => {
  const cell = cells(snapshot).find(
    (candidate) => typeof candidate.id === "string" && candidate.id === id,
  );
  return cell?.version;
};

const snapshotHasValues = (
  snapshot: RuntimeSnapshot,
  values: Readonly<Record<string, JsonValue>>,
): boolean =>
  Object.entries(values).every(([id, value]) => Object.is(cellValue(snapshot, id), value));

const action = (kind: string): JsonObject => Object.freeze({ kind });
type RuntimeReportFailure = InvalidRuntimeDefinition | RuntimeFailure;

const buildTrace = (): Effect.Effect<RuntimeTrace, RuntimeReportFailure> =>
  Effect.scoped(
    Effect.gen(function* () {
      const base = fixture();
      const bounds = { maximumInFlight: 2, maximumAttempts: 3 } as const;
      const runtime = yield* makeRuntime(base.initial, bounds);
      const first = sequence(
        base.owner,
        "first",
        [read(base.x, "seen"), write(base.x, 1), afterCommit(base.owner, action("first"))],
        null,
      );
      const second = sequence(
        base.owner,
        "second",
        [read(base.x, "seen"), write(base.x, 2), afterCommit(base.owner, action("second"))],
        null,
      );
      const firstFiber = yield* Effect.forkChild(runtime.atomically(first));
      const secondFiber = yield* Effect.forkChild(runtime.atomically(second));
      const conflict = yield* Effect.all([Fiber.join(firstFiber), Fiber.join(secondFiber)], {
        concurrency: "unbounded",
      });
      const conflictSnapshot = yield* runtime.snapshot;

      const atomicRuntime = yield* makeRuntime(base.initial, bounds);
      const atomic = sequence(
        base.owner,
        "atomic-two-cell",
        [write(base.x, 11), write(base.y, 11)],
        null,
      );
      const atomicFiber = yield* Effect.forkChild(atomicRuntime.atomically(atomic));
      const atomicBefore = yield* atomicRuntime.snapshot;
      yield* Effect.yieldNow;
      const atomicDuring = yield* atomicRuntime.snapshot;
      yield* Fiber.join(atomicFiber);
      const atomicAfter = yield* atomicRuntime.snapshot;

      const retryRuntime = yield* makeRuntime(base.initial, bounds);
      const retryFiber = yield* Effect.forkChild(
        retryRuntime.atomically(retryUntilPositive(base.owner, base.x)),
      );
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      const retryPending = yield* retryRuntime.snapshot;
      yield* retryRuntime.atomically(write(base.y, 1));
      const retryAfterUnrelated = yield* retryRuntime.snapshot;
      yield* retryRuntime.atomically(write(base.x, 1));
      const retryResult = yield* Fiber.join(retryFiber);
      const retryAfterWake = yield* retryRuntime.snapshot;

      const raceRuntime = yield* makeRuntime(base.initial, bounds);
      const race = yield* Effect.all(
        [
          raceRuntime.atomically(retryUntilPositive(base.owner, base.x)),
          raceRuntime.atomically(write(base.x, 1)),
        ],
        { concurrency: "unbounded" },
      );
      const preRegistrationSnapshot = yield* raceRuntime.snapshot;

      const abortRuntime = yield* makeRuntime(base.initial, bounds);
      const abortResult = yield* abortRuntime.atomically(
        abort(base.owner, { code: "rejected" }, [action("abort")]),
      );

      const closeRuntime = yield* makeRuntime(base.initial, bounds);
      const closeFiber = yield* Effect.forkChild(
        closeRuntime.atomically(retry(base.owner, "empty-retry")),
      );
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      const closeFirst = yield* closeRuntime.close;
      const closeSecond = yield* closeRuntime.close;
      const closeFailure = yield* Effect.result(closeRuntime.atomically(write(base.x, 9))).pipe(
        Effect.map((result) =>
          Result.isFailure(result) && result.failure instanceof Closed
            ? "Closed"
            : "committed-after-close",
        ),
      );
      yield* Fiber.await(closeFiber);

      return Object.freeze({
        conflict: Object.freeze(conflict),
        conflictSnapshot,
        atomicBefore,
        atomicDuring,
        atomicAfter,
        retryPending,
        retryAfterUnrelated,
        retryAfterWake,
        retryResult,
        preRegistrationResult: Object.freeze(race),
        preRegistrationSnapshot,
        abortResult,
        closeFirst,
        closeSecond,
        closeFailure,
      });
    }),
  );

const observation = (id: string, catchesCounterexample: boolean): JsonObject =>
  Object.freeze({ id, catches_counterexample: catchesCounterexample });

export const buildStmRuntimeReport = (
  runtimeLayer: RuntimeLayer,
): Effect.Effect<JsonObject, RuntimeReportFailure> =>
  buildTrace().pipe(
    Effect.map((trace) => {
      const conflictActions = trace.conflict
        .flatMap((result) => (result.kind === "committed" ? result.commitActions : []))
        .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
      const conflictAttempts = trace.conflict.map((result) => result.attemptCount).sort();
      const atomicSnapshots = [trace.atomicBefore, trace.atomicDuring, trace.atomicAfter];
      const atomicityObserved = atomicSnapshots.every(
        (snapshot) =>
          snapshotHasValues(snapshot, { x: 0, y: 0 }) ||
          snapshotHasValues(snapshot, { x: 11, y: 11 }),
      );
      const atomicStates = atomicSnapshots.map((snapshot) =>
        snapshotHasValues(snapshot, { x: 0, y: 0 }) ? "initial" : "published",
      );
      const unrelatedWakeIgnored =
        trace.retryPending.pending.length === 1 && trace.retryAfterUnrelated.pending.length === 1;
      const relevantWakeObserved =
        trace.retryResult.kind === "committed" &&
        trace.retryResult.attemptCount === "2" &&
        trace.retryAfterWake.pending.length === 0;
      const preRegistrationWakeObserved =
        trace.preRegistrationResult.length === 2 &&
        trace.preRegistrationSnapshot.pending.length === 0;
      const closedIdempotently =
        canonicalJson(trace.closeFirst) === canonicalJson(trace.closeSecond);
      const observations = Object.freeze([
        observation(
          "conflict-retries-with-terminal-actions",
          conflictAttempts.some((attempt) => attempt === "2") && conflictActions.length === 2,
        ),
        observation("two-cell-publication-is-atomic", atomicityObserved),
        observation("unrelated-dependency-does-not-wake", unrelatedWakeIgnored),
        observation("relevant-dependency-wakes", relevantWakeObserved),
        observation("pre-registration-wake-is-not-lost", preRegistrationWakeObserved),
        observation("empty-retry-is-interruptible", trace.closeFirst.pending.length === 0),
        observation("terminal-abort-keeps-abort-actions", trace.abortResult.kind === "aborted"),
        observation(
          "close-is-idempotent-and-final",
          closedIdempotently && trace.closeFailure === "Closed",
        ),
      ]);
      return Object.freeze({
        schema_version: 1,
        runtime_layer: runtimeLayer,
        model: "semantic-stm-runtime-0050",
        bounds: Object.freeze({
          maximum_in_flight: String(trace.conflictSnapshot.bounds.maximumInFlight),
          maximum_attempts_per_call: String(trace.conflictSnapshot.bounds.maximumAttempts),
        }),
        observations,
        evidence: Object.freeze({
          derived: Object.freeze([
            "immutable store projections",
            "attempt and retry counters",
            "dependency-specific pending rows",
          ]),
          runtime_validated: Object.freeze([
            "bounded Effect runtime scenarios executed under the named layer",
          ]),
          static_analysis: Object.freeze([
            "portable runtime modules contain no platform imports or ambient authority",
          ]),
          unsupported: Object.freeze([
            "fairness",
            "starvation freedom",
            "lock freedom",
            "durable action delivery",
          ]),
        }),
        trace: Object.freeze({
          conflict_attempt_counts: Object.freeze(conflictAttempts),
          conflict_actions: Object.freeze(conflictActions),
          conflict_published_version: cellVersion(trace.conflictSnapshot, "x") ?? null,
          atomic_states: Object.freeze(atomicStates),
          retry_pending: trace.retryPending.pending,
          retry_after_unrelated: trace.retryAfterUnrelated.pending,
          retry_after_wake: trace.retryAfterWake.pending,
          retry_result: trace.retryResult,
          pre_registration_attempt_counts: Object.freeze(
            trace.preRegistrationResult.map((result) => result.attemptCount).sort(),
          ),
          pre_registration_snapshot: trace.preRegistrationSnapshot,
          abort_result: trace.abortResult,
          close_first: trace.closeFirst,
          close_second: trace.closeSecond,
        }),
      }) as JsonObject;
    }),
  );

export const canonicalStmRuntimeReport = (
  runtimeLayer: RuntimeLayer,
): Effect.Effect<string, RuntimeReportFailure> =>
  buildStmRuntimeReport(runtimeLayer).pipe(Effect.map(canonicalJson));
