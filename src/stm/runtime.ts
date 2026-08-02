import { Data, Deferred, Effect, Ref, Result, Semaphore, type Scope } from "effect";
import {
  beginAttempt,
  changedDependencies,
  projectStore,
  rerunAttempt,
  settleAttempt,
  wakeAndRerun,
  type Attempt,
  type BeginResult,
  type Store,
  type Suspension,
  type Txn,
} from "./model.ts";
import type { JsonObject, JsonValue } from "../tracer/json.ts";

declare const runtimeExactCounterBrand: unique symbol;

export type RuntimeExactCounter = string & {
  readonly [runtimeExactCounterBrand]: "RuntimeExactCounter";
};

export interface RuntimeBounds extends JsonObject {
  readonly maximumInFlight: number;
  readonly maximumAttempts: number;
}

export class InvalidRuntimeDefinition extends Data.TaggedError("InvalidRuntimeDefinition")<{
  readonly reason: "invalid_bounds" | "store_rejected";
  readonly message: string;
}> {}

export class Closed extends Data.TaggedError("Closed")<{
  readonly message: string;
}> {}

export interface EvaluationRejection {
  readonly kind: "evaluation_rejected";
  readonly transactionId: string;
  readonly reason: "model_evaluation_failed";
  readonly message: string;
  readonly attemptStarted: true;
}

export type TransactionRejection =
  | Exclude<BeginResult, { readonly kind: "attempt" }>
  | EvaluationRejection;

export class TransactionRejected extends Data.TaggedError("TransactionRejected")<{
  readonly reason: TransactionRejection;
}> {}

export class AttemptsExhausted extends Data.TaggedError("AttemptsExhausted")<{
  readonly maximumAttempts: number;
}> {
  override get message(): string {
    return `transaction exhausted the maximum of ${this.maximumAttempts} attempts`;
  }
}

export type RuntimeFailure = Closed | TransactionRejected | AttemptsExhausted;

export interface Committed<
  out Value extends JsonValue = JsonValue,
  out CommitAction extends JsonValue = JsonValue,
> extends JsonObject {
  readonly kind: "committed";
  readonly requestOrdinal: RuntimeExactCounter;
  readonly attemptCount: RuntimeExactCounter;
  readonly value: Value;
  readonly commitActions: ReadonlyArray<CommitAction>;
}

export interface Aborted<
  out Error extends JsonValue = JsonValue,
  out AbortAction extends JsonValue = JsonValue,
> extends JsonObject {
  readonly kind: "aborted";
  readonly requestOrdinal: RuntimeExactCounter;
  readonly attemptCount: RuntimeExactCounter;
  readonly error: Error;
  readonly abortActions: ReadonlyArray<AbortAction>;
}

export type Terminal<
  Error extends JsonValue = JsonValue,
  Value extends JsonValue = JsonValue,
  CommitAction extends JsonValue = JsonValue,
  AbortAction extends JsonValue = JsonValue,
> = Committed<Value, CommitAction> | Aborted<Error, AbortAction>;

export interface PendingRetryDependency extends JsonObject {
  readonly id: string;
  readonly observedVersion: RuntimeExactCounter;
}

export interface PendingRetry extends JsonObject {
  readonly requestOrdinal: RuntimeExactCounter;
  readonly transactionId: string;
  readonly attemptOrdinal: RuntimeExactCounter;
  readonly dependencies: ReadonlyArray<PendingRetryDependency>;
}

export interface RuntimeSnapshot extends JsonObject {
  readonly status: "open" | "closed";
  readonly bounds: RuntimeBounds;
  readonly nextRequestOrdinal: RuntimeExactCounter;
  readonly store: JsonObject;
  readonly pending: ReadonlyArray<PendingRetry>;
}

export interface StmRuntime<DomainName extends string = string> {
  readonly atomically: <
    Error extends JsonValue,
    Value extends JsonValue,
    CommitAction extends JsonValue,
    AbortAction extends JsonValue,
  >(
    transaction: Txn<DomainName, Error, Value, CommitAction, AbortAction>,
  ) => Effect.Effect<Terminal<Error, Value, CommitAction, AbortAction>, RuntimeFailure>;
  readonly snapshot: Effect.Effect<RuntimeSnapshot>;
  readonly close: Effect.Effect<RuntimeSnapshot>;
}

interface RuntimeState {
  readonly status: "open" | "closed";
  readonly store: Store<string>;
  readonly nextRequestOrdinal: bigint;
  readonly pending: ReadonlyMap<bigint, PendingState>;
}

interface PendingState {
  readonly requestOrdinal: bigint;
  readonly transactionId: string;
  readonly attemptOrdinal: bigint;
  readonly suspension: Suspension;
  readonly deferred: Deferred.Deferred<Attempt, RuntimeFailure>;
}

const exactCounter = (value: bigint): RuntimeExactCounter => {
  if (value < 0n) throw new RangeError("runtime counters must be non-negative");
  return value.toString(10) as RuntimeExactCounter;
};

const invalidBounds = (bounds: RuntimeBounds): string | undefined => {
  if (bounds === null || typeof bounds !== "object") {
    return "bounds must be an object";
  }
  if (!Number.isSafeInteger(bounds.maximumInFlight) || bounds.maximumInFlight <= 0) {
    return "maximumInFlight must be a positive safe integer";
  }
  if (!Number.isSafeInteger(bounds.maximumAttempts) || bounds.maximumAttempts <= 0) {
    return "maximumAttempts must be a positive safe integer";
  }
  return undefined;
};

const runtimeClosed = (): Closed => new Closed({ message: "STM runtime is closed" });
const transactionIdOf = (transaction: unknown): string => {
  try {
    if (typeof transaction !== "object" || transaction === null || !("id" in transaction)) {
      return "unknown";
    }
    return typeof transaction.id === "string" ? transaction.id : "unknown";
  } catch {
    return "unknown";
  }
};

const rejection = (reason: TransactionRejection): TransactionRejected =>
  new TransactionRejected({ reason });
const evaluationRejected = (transactionId: string, cause: unknown): TransactionRejected =>
  rejection(
    Object.freeze({
      kind: "evaluation_rejected",
      transactionId,
      reason: "model_evaluation_failed",
      message: cause instanceof Error ? cause.message : String(cause),
      attemptStarted: true,
    }),
  );

const modelResult = <Value>(
  transactionId: string,
  evaluate: () => Value,
): Effect.Effect<Value, TransactionRejected> =>
  Effect.try({
    try: evaluate,
    catch: (cause) => evaluationRejected(transactionId, cause),
  });

const beginModelAttempt = (
  transactionId: string,
  evaluate: () => BeginResult,
): Effect.Effect<Attempt, TransactionRejected> =>
  modelResult(transactionId, evaluate).pipe(
    Effect.flatMap((result) =>
      isAttempt(result) ? Effect.succeed(result.attempt) : Effect.fail(rejection(result)),
    ),
  );

const isAttempt = (result: BeginResult): result is Extract<BeginResult, { kind: "attempt" }> =>
  result.kind === "attempt";

const projectPending = (pending: PendingState): PendingRetry =>
  Object.freeze({
    requestOrdinal: exactCounter(pending.requestOrdinal),
    transactionId: pending.transactionId,
    attemptOrdinal: exactCounter(pending.attemptOrdinal),
    dependencies: Object.freeze(
      pending.suspension.dependencies.map((dependency) =>
        Object.freeze({
          id: dependency.id,
          observedVersion: exactCounter(dependency.observedVersion),
        }),
      ),
    ),
  });

const projectSnapshot = (state: RuntimeState, bounds: RuntimeBounds): RuntimeSnapshot =>
  Object.freeze({
    status: state.status,
    bounds,
    nextRequestOrdinal: exactCounter(state.nextRequestOrdinal),
    store: projectStore(state.store),
    pending: Object.freeze(
      [...state.pending.values()]
        .sort((left, right) =>
          left.requestOrdinal < right.requestOrdinal
            ? -1
            : left.requestOrdinal > right.requestOrdinal
              ? 1
              : 0,
        )
        .map(projectPending),
    ),
  });

const snapshotUnderGate = (
  gate: Semaphore.Semaphore,
  state: Ref.Ref<RuntimeState>,
  bounds: RuntimeBounds,
): Effect.Effect<RuntimeSnapshot> =>
  gate.withPermit(
    Effect.gen(function* () {
      return projectSnapshot(yield* Ref.get(state), bounds);
    }),
  );

const removePending = (
  gate: Semaphore.Semaphore,
  state: Ref.Ref<RuntimeState>,
  requestOrdinal: bigint,
): Effect.Effect<void> =>
  Effect.uninterruptible(
    gate.withPermit(
      Effect.gen(function* () {
        const current = yield* Ref.get(state);
        if (!current.pending.has(requestOrdinal)) return;
        const pending = new Map(current.pending);
        pending.delete(requestOrdinal);
        yield* Ref.set(state, Object.freeze({ ...current, pending }));
      }),
    ),
  );

const closedFailure = (): Effect.Effect<never, Closed> => Effect.fail(runtimeClosed());

export const makeRuntime = <DomainName extends string>(
  initialStore: Store<DomainName>,
  inputBounds: RuntimeBounds,
): Effect.Effect<StmRuntime<DomainName>, InvalidRuntimeDefinition, Scope.Scope> =>
  Effect.gen(function* () {
    const boundsError = invalidBounds(inputBounds);
    if (boundsError !== undefined) {
      return yield* new InvalidRuntimeDefinition({
        reason: "invalid_bounds",
        message: boundsError,
      });
    }

    yield* Effect.try({
      try: () => projectStore(initialStore),
      catch: (cause) =>
        new InvalidRuntimeDefinition({
          reason: "store_rejected",
          message: cause instanceof Error ? cause.message : "initial store is not authenticated",
        }),
    });

    const bounds = Object.freeze({
      maximumInFlight: inputBounds.maximumInFlight,
      maximumAttempts: inputBounds.maximumAttempts,
    });
    const initialState: RuntimeState = Object.freeze({
      status: "open",
      store: initialStore,
      nextRequestOrdinal: 1n,
      pending: new Map<bigint, PendingState>(),
    });
    const state = yield* Ref.make(initialState);
    const gate = yield* Semaphore.make(1);
    const capacity = yield* Semaphore.make(bounds.maximumInFlight);

    const close: Effect.Effect<RuntimeSnapshot> = gate.withPermit(
      Effect.uninterruptible(
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          if (current.status === "closed") return projectSnapshot(current, bounds);
          const pending = [...current.pending.values()];
          const closedState: RuntimeState = Object.freeze({
            status: "closed",
            store: current.store,
            nextRequestOrdinal: current.nextRequestOrdinal,
            pending: new Map<bigint, PendingState>(),
          });
          yield* Ref.set(state, closedState);
          const failure = runtimeClosed();
          for (const waiter of pending) yield* Deferred.fail(waiter.deferred, failure);
          return projectSnapshot(closedState, bounds);
        }),
      ),
    );

    yield* Effect.addFinalizer(() => close.pipe(Effect.asVoid));

    const atomically = <
      Error extends JsonValue,
      Value extends JsonValue,
      CommitAction extends JsonValue,
      AbortAction extends JsonValue,
    >(
      transaction: Txn<DomainName, Error, Value, CommitAction, AbortAction>,
    ): Effect.Effect<Terminal<Error, Value, CommitAction, AbortAction>, RuntimeFailure> =>
      capacity.withPermit(
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const requestOrdinal = yield* gate.withPermit(
              Effect.gen(function* () {
                const current = yield* Ref.get(state);
                if (current.status === "closed") return yield* closedFailure();
                const request = current.nextRequestOrdinal;
                yield* Ref.set(
                  state,
                  Object.freeze({
                    ...current,
                    nextRequestOrdinal: request + 1n,
                  }),
                );
                return request;
              }),
            );

            return yield* Effect.gen(function* () {
              let nextAttempt: Attempt | undefined;
              while (true) {
                if (nextAttempt === undefined) {
                  const current = yield* Ref.get(state);
                  nextAttempt = yield* beginModelAttempt(transactionIdOf(transaction), () =>
                    beginAttempt(current.store, transaction),
                  );
                }

                const attempt = nextAttempt;
                nextAttempt = undefined;
                yield* restore(Effect.yieldNow);

                const decision = yield* gate.withPermit(
                  Effect.uninterruptible(
                    Effect.gen(function* () {
                      const current = yield* Ref.get(state);
                      if (current.status === "closed") return yield* closedFailure();
                      const settlement = yield* modelResult(attempt.description.id, () =>
                        settleAttempt(current.store, attempt),
                      );

                      switch (settlement.kind) {
                        case "committed": {
                          const nextPending = new Map(current.pending);
                          const wakePlans: Array<
                            | {
                                readonly kind: "wake";
                                readonly pending: PendingState;
                              }
                            | {
                                readonly kind: "failure";
                                readonly pending: PendingState;
                                readonly failure: RuntimeFailure;
                              }
                          > = [];

                          for (const pending of current.pending.values()) {
                            const changed = yield* Effect.result(
                              modelResult(pending.transactionId, () =>
                                changedDependencies(pending.suspension, settlement.store),
                              ),
                            );
                            if (Result.isFailure(changed)) {
                              nextPending.delete(pending.requestOrdinal);
                              wakePlans.push({
                                kind: "failure",
                                pending,
                                failure: changed.failure,
                              });
                              continue;
                            }
                            if (changed.success.length === 0) continue;

                            nextPending.delete(pending.requestOrdinal);
                            if (pending.attemptOrdinal >= BigInt(bounds.maximumAttempts)) {
                              wakePlans.push({
                                kind: "failure",
                                pending,
                                failure: new AttemptsExhausted({
                                  maximumAttempts: bounds.maximumAttempts,
                                }),
                              });
                            } else {
                              wakePlans.push({ kind: "wake", pending });
                            }
                          }

                          const published: RuntimeState = Object.freeze({
                            ...current,
                            store: settlement.store,
                            pending: nextPending,
                          });
                          yield* Ref.set(state, published);

                          for (const plan of wakePlans) {
                            if (plan.kind === "failure") {
                              yield* Deferred.fail(plan.pending.deferred, plan.failure);
                              continue;
                            }
                            const awakened = yield* Effect.result(
                              modelResult(plan.pending.transactionId, () =>
                                wakeAndRerun(plan.pending.suspension, settlement.store),
                              ),
                            );
                            if (Result.isFailure(awakened)) {
                              yield* Deferred.fail(plan.pending.deferred, awakened.failure);
                            } else if (awakened.success === undefined) {
                              yield* Deferred.fail(
                                plan.pending.deferred,
                                evaluationRejected(
                                  plan.pending.transactionId,
                                  new Error("registered retry suspension is no longer live"),
                                ),
                              );
                            } else if (!isAttempt(awakened.success)) {
                              yield* Deferred.fail(
                                plan.pending.deferred,
                                rejection(awakened.success),
                              );
                            } else {
                              yield* Deferred.succeed(
                                plan.pending.deferred,
                                awakened.success.attempt,
                              );
                            }
                          }

                          return {
                            kind: "terminal",
                            result: Object.freeze({
                              kind: "committed",
                              requestOrdinal: exactCounter(requestOrdinal),
                              attemptCount: exactCounter(settlement.attemptOrdinal),
                              value: settlement.value as Value,
                              commitActions:
                                settlement.commitActions as ReadonlyArray<CommitAction>,
                            }),
                          } as const;
                        }
                        case "aborted":
                          return {
                            kind: "terminal",
                            result: Object.freeze({
                              kind: "aborted",
                              requestOrdinal: exactCounter(requestOrdinal),
                              attemptCount: exactCounter(settlement.attemptOrdinal),
                              error: settlement.error as Error,
                              abortActions: settlement.abortActions as ReadonlyArray<AbortAction>,
                            }),
                          } as const;
                        case "conflict": {
                          if (settlement.attemptOrdinal >= BigInt(bounds.maximumAttempts)) {
                            return yield* new AttemptsExhausted({
                              maximumAttempts: bounds.maximumAttempts,
                            });
                          }
                          const rerun = yield* beginModelAttempt(attempt.description.id, () =>
                            rerunAttempt(settlement.store, attempt),
                          );
                          return { kind: "attempt", attempt: rerun } as const;
                        }
                        case "suspended": {
                          const changed = yield* modelResult(attempt.description.id, () =>
                            changedDependencies(settlement.suspension, current.store),
                          );
                          if (changed.length > 0) {
                            if (settlement.attemptOrdinal >= BigInt(bounds.maximumAttempts)) {
                              return yield* new AttemptsExhausted({
                                maximumAttempts: bounds.maximumAttempts,
                              });
                            }
                            const awakened = yield* modelResult(attempt.description.id, () =>
                              wakeAndRerun(settlement.suspension, current.store),
                            );
                            if (awakened === undefined) {
                              return yield* evaluationRejected(
                                attempt.description.id,
                                new Error("fresh retry suspension became unavailable before rerun"),
                              );
                            }
                            if (!isAttempt(awakened)) {
                              return yield* rejection(awakened);
                            }
                            return {
                              kind: "attempt",
                              attempt: awakened.attempt,
                            } as const;
                          }

                          const deferred = yield* Deferred.make<Attempt, RuntimeFailure>();
                          const pending: PendingState = Object.freeze({
                            requestOrdinal,
                            transactionId: attempt.description.id,
                            attemptOrdinal: settlement.attemptOrdinal,
                            suspension: settlement.suspension,
                            deferred,
                          });
                          const nextPending = new Map(current.pending);
                          nextPending.set(requestOrdinal, pending);
                          yield* Ref.set(
                            state,
                            Object.freeze({ ...current, pending: nextPending }),
                          );
                          const awaitAttempt = Effect.onExit(
                            restore(Deferred.await(pending.deferred)),
                            () => removePending(gate, state, pending.requestOrdinal),
                          );
                          return { kind: "wait", awaitAttempt } as const;
                        }
                        case "invalid_attempt":
                          return yield* rejection(settlement);
                      }
                    }),
                  ),
                );

                if (decision.kind === "terminal") return decision.result;
                if (decision.kind === "attempt") {
                  nextAttempt = decision.attempt;
                  continue;
                }
                nextAttempt = yield* decision.awaitAttempt;
              }
            });
          }),
        ),
      );

    return {
      atomically,
      snapshot: snapshotUnderGate(gate, state, bounds),
      close,
    } satisfies StmRuntime<DomainName>;
  });
