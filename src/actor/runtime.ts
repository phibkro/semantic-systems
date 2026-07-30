import { Cause, Data, Deferred, Effect, Exit, Queue, Ref, Semaphore, type Scope } from "effect";
import {
  actorExactCounter,
  appendActorTrace,
  emptyActorTraceState,
  snapshotActorTrace,
  type ActorTrace,
  type ActorTraceSnapshot,
  type ActorTraceState,
} from "./trace-retention-internal.ts";

export type {
  ActorExactCounter,
  ActorTrace,
  ActorTraceSnapshot,
} from "./trace-retention-internal.ts";

export interface DeliveryReceipt<Event> {
  readonly actorId: string;
  readonly sequence: number;
  readonly event: Event;
}

export interface ActorDefinition<Message, State, Event, TransitionError, Requirements> {
  readonly id: string;
  readonly initialState: State;
  readonly mailboxCapacity: number;
  readonly traceCapacity: number;
  readonly transition: (
    message: Message,
    state: State,
  ) => Effect.Effect<readonly [State, Event], TransitionError, Requirements>;
}

export class InvalidActorDefinition extends Data.TaggedError("InvalidActorDefinition")<{
  readonly message: string;
}> {}

export class ActorClosed extends Data.TaggedError("ActorClosed")<{
  readonly actorId: string;
  readonly reason: "closed" | "transition_failed";
}> {
  override get message(): string {
    return `actor ${this.actorId} is ${this.reason === "closed" ? "closed" : "stopped after transition failure"}`;
  }
}

export class ActorTransitionFailed extends Data.TaggedError("ActorTransitionFailed")<{
  readonly actorId: string;
  readonly sequence: number;
  readonly cause: string;
}> {
  override get message(): string {
    return `actor ${this.actorId} transition ${this.sequence} failed: ${this.cause}`;
  }
}

export class ActorMessageNotTransferable extends Data.TaggedError("ActorMessageNotTransferable")<{
  readonly actorId: string;
  readonly cause: string;
}> {
  override get message(): string {
    return `message for actor ${this.actorId} is not transferable without shared memory: ${this.cause}`;
  }
}

export type ActorSendError = ActorClosed | ActorMessageNotTransferable | ActorTransitionFailed;

export interface ActorRef<Message, Event> {
  readonly id: string;
  readonly mailboxCapacity: number;
  readonly send: (message: Message) => Effect.Effect<DeliveryReceipt<Event>, ActorSendError>;
  readonly close: Effect.Effect<ActorTraceSnapshot>;
}

interface Envelope<Message, Event> {
  readonly kind: "message";
  readonly sequence: number;
  readonly message: Message;
  readonly receipt: Deferred.Deferred<DeliveryReceipt<Event>, ActorSendError>;
}

interface CloseSignal {
  readonly kind: "close";
}

type MailboxSignal<Message, Event> = Envelope<Message, Event> | CloseSignal;

const appendTrace = (
  trace: Ref.Ref<ActorTraceState>,
  capacity: number,
  entry: ActorTrace,
): Effect.Effect<void> => Ref.update(trace, (state) => appendActorTrace(state, capacity, entry));

const containsSharedMemory = (root: unknown): boolean => {
  const pending: Array<unknown> = [root];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const value = pending.pop();
    if (value instanceof SharedArrayBuffer) return true;
    if (typeof value !== "object" || value === null || visited.has(value)) continue;
    visited.add(value);
    if (ArrayBuffer.isView(value)) {
      pending.push(value.buffer);
      continue;
    }
    if (value instanceof ArrayBuffer || value instanceof Date || value instanceof RegExp) continue;
    if (value instanceof Map) {
      for (const [key, entry] of value) pending.push(key, entry);
      continue;
    }
    if (value instanceof Set) {
      for (const entry of value) pending.push(entry);
      continue;
    }
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if ("value" in descriptor) pending.push(descriptor.value);
    }
  }
  return false;
};

const cloneActorValue = <Value>(value: Value): Value => {
  if (containsSharedMemory(value)) {
    throw new TypeError("SharedArrayBuffer-backed values cannot cross an actor boundary");
  }
  const cloned = structuredClone(value);
  if (containsSharedMemory(cloned)) {
    throw new TypeError("SharedArrayBuffer-backed values cannot cross an actor boundary");
  }
  return cloned;
};

const renderUnknownCause = (cause: unknown): string => {
  try {
    if (cause instanceof Error) {
      const name = typeof cause.name === "string" && cause.name.length > 0 ? cause.name : "Error";
      const message = typeof cause.message === "string" ? cause.message : "";
      return message.length > 0 ? `${name}: ${message}` : name;
    }
    if (typeof cause === "string") return cause;
    if (
      typeof cause === "number" ||
      typeof cause === "bigint" ||
      typeof cause === "boolean" ||
      cause === null ||
      cause === undefined
    ) {
      return `${cause}`;
    }
    return "uninspectable actor-boundary failure";
  } catch {
    return "uninspectable actor-boundary failure";
  }
};

const renderEffectCause = (cause: Cause.Cause<unknown>): string => {
  try {
    return Cause.pretty(cause);
  } catch {
    return "transition effect failed with an uninspectable cause";
  }
};

/**
 * Spawn one scoped actor.
 *
 * A capacity semaphore is acquired interruptibly before acceptance. Once a
 * permit exists, sequence allocation, trace append, and the unbounded
 * implementation-queue offer run uninterruptibly under one acceptance gate.
 * The permit is transferred to the actor and released only after processing.
 * This makes bounded backpressure interruptible without creating sequence
 * gaps or cancelling already accepted actor-owned work.
 */
export const spawn = <Message, State, Event, TransitionError, Requirements>(
  definition: ActorDefinition<Message, State, Event, TransitionError, Requirements>,
): Effect.Effect<ActorRef<Message, Event>, InvalidActorDefinition, Requirements | Scope.Scope> =>
  Effect.gen(function* () {
    const actorId = definition.id;
    const mailboxCapacity = definition.mailboxCapacity;
    const traceCapacity = definition.traceCapacity;
    const transition = definition.transition;
    const initialState = definition.initialState;
    if (actorId.trim().length === 0) {
      return yield* new InvalidActorDefinition({ message: "actor id must be nonempty" });
    }
    if (!Number.isSafeInteger(mailboxCapacity) || mailboxCapacity <= 0) {
      return yield* new InvalidActorDefinition({
        message: "mailbox capacity must be a positive safe integer",
      });
    }
    if (!Number.isSafeInteger(traceCapacity) || traceCapacity <= 0) {
      return yield* new InvalidActorDefinition({
        message: "trace capacity must be a positive safe integer",
      });
    }

    const mailbox = yield* Queue.unbounded<MailboxSignal<Message, Event>>();
    const capacity = yield* Semaphore.make(mailboxCapacity);
    const acceptanceGate = yield* Semaphore.make(1);
    const trace = yield* Ref.make<ActorTraceState>(emptyActorTraceState);
    const closed = yield* Deferred.make<ActorTraceSnapshot>();
    let accepting: "open" | "closing" | "transition_failed" = "open";
    let nextSequence = 0;
    let acceptedCount = 0n;
    let privateState = yield* Effect.try({
      try: () => cloneActorValue(initialState),
      catch: (cause) =>
        new InvalidActorDefinition({
          message: `initial state must be transferable without shared memory: ${renderUnknownCause(cause)}`,
        }),
    });

    const finishClosed = Effect.gen(function* () {
      const entries = (yield* Ref.get(trace)).entries;
      const alreadyClosed = entries.some((entry) => entry.kind === "closed");
      if (!alreadyClosed) {
        yield* appendTrace(trace, traceCapacity, {
          kind: "closed",
          actorId,
          acceptedCount: actorExactCounter(acceptedCount),
        });
      }
      yield* Deferred.succeed(
        closed,
        snapshotActorTrace(yield* Ref.get(trace), traceCapacity, acceptedCount),
      );
    });

    const failPending = (failure: ActorTransitionFailed): Effect.Effect<void> =>
      Effect.gen(function* () {
        while (true) {
          const candidate = Queue.takeUnsafe(mailbox);
          if (candidate === undefined) break;
          if (Exit.isSuccess(candidate)) {
            const signal = candidate.value;
            if (signal.kind === "message") {
              yield* Deferred.fail(
                signal.receipt,
                new ActorTransitionFailed({
                  actorId,
                  sequence: signal.sequence,
                  cause: `not processed because ${failure.message}`,
                }),
              );
              yield* capacity.release(1);
            }
          }
        }
      });

    const worker = Effect.gen(function* () {
      while (true) {
        const signal = yield* Queue.take(mailbox);
        if (signal.kind === "close") {
          yield* finishClosed;
          return;
        }

        yield* appendTrace(trace, traceCapacity, {
          kind: "started",
          actorId,
          sequence: signal.sequence,
        });
        const result = yield* Effect.exit(
          Effect.try({
            try: () => cloneActorValue(privateState),
            catch: (cause) =>
              new ActorTransitionFailed({
                actorId,
                sequence: signal.sequence,
                cause: `private state could not cross the transition boundary: ${renderUnknownCause(cause)}`,
              }),
          }).pipe(
            Effect.flatMap((transitionState) => transition(signal.message, transitionState)),
            Effect.flatMap(([nextState, event]) =>
              Effect.try({
                try: () =>
                  [cloneActorValue(nextState), cloneActorValue(event)] as readonly [State, Event],
                catch: (cause) =>
                  new ActorTransitionFailed({
                    actorId,
                    sequence: signal.sequence,
                    cause: `transition result must be transferable without shared memory: ${renderUnknownCause(cause)}`,
                  }),
              }),
            ),
          ),
        );
        if (Exit.isFailure(result)) {
          const failure = new ActorTransitionFailed({
            actorId,
            sequence: signal.sequence,
            cause: renderEffectCause(result.cause),
          });
          yield* appendTrace(trace, traceCapacity, {
            kind: "transition_failed",
            actorId,
            sequence: signal.sequence,
            cause: failure.cause,
          });
          yield* acceptanceGate.withPermit(
            Effect.sync(() => {
              accepting = "transition_failed";
            }),
          );
          yield* Deferred.fail(signal.receipt, failure);
          yield* capacity.release(1);
          yield* failPending(failure);
          yield* finishClosed;
          return;
        }

        privateState = result.value[0];
        yield* appendTrace(trace, traceCapacity, {
          kind: "committed",
          actorId,
          sequence: signal.sequence,
        });
        yield* Deferred.succeed(signal.receipt, {
          actorId,
          sequence: signal.sequence,
          event: result.value[1],
        });
        yield* capacity.release(1);
      }
    });

    yield* Effect.forkScoped(worker);

    const accept = (
      message: Message,
    ): Effect.Effect<Envelope<Message, Event>, ActorClosed | ActorMessageNotTransferable> =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          yield* restore(capacity.take(1));
          return yield* acceptanceGate.withPermit(
            Effect.gen(function* () {
              if (accepting !== "open") {
                yield* capacity.release(1);
                return yield* new ActorClosed({
                  actorId,
                  reason: accepting === "transition_failed" ? "transition_failed" : "closed",
                });
              }
              const ownedMessage = yield* Effect.try({
                try: () => cloneActorValue(message),
                catch: (cause) =>
                  new ActorMessageNotTransferable({
                    actorId,
                    cause: renderUnknownCause(cause),
                  }),
              }).pipe(Effect.tapError(() => capacity.release(1)));
              const sequence = nextSequence + 1;
              const receipt = yield* Deferred.make<DeliveryReceipt<Event>, ActorSendError>();
              const envelope: Envelope<Message, Event> = {
                kind: "message",
                sequence,
                message: ownedMessage,
                receipt,
              };
              nextSequence = sequence;
              acceptedCount += 1n;
              yield* appendTrace(trace, traceCapacity, {
                kind: "accepted",
                actorId,
                sequence,
              });
              if (!Queue.offerUnsafe(mailbox, envelope)) {
                return yield* Effect.die(
                  new Error("unbounded actor implementation queue rejected an accepted envelope"),
                );
              }
              return envelope;
            }),
          );
        }),
      );

    const close = acceptanceGate
      .withPermit(
        Effect.gen(function* () {
          if (accepting === "open") {
            accepting = "closing";
            if (!Queue.offerUnsafe(mailbox, { kind: "close" })) {
              return yield* Effect.die(
                new Error("unbounded actor implementation queue rejected close"),
              );
            }
          }
        }),
      )
      .pipe(Effect.flatMap(() => Deferred.await(closed)));

    yield* Effect.addFinalizer(() => close.pipe(Effect.asVoid));

    return {
      id: actorId,
      mailboxCapacity,
      send: (message) =>
        accept(message).pipe(Effect.flatMap((envelope) => Deferred.await(envelope.receipt))),
      close,
    };
  });

export interface ActorRuntime {
  readonly spawn: typeof spawn;
}

export const ActorRuntime: ActorRuntime = { spawn };
