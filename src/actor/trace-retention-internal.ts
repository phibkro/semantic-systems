/**
 * A JSON-safe projection of an exact non-negative actor lifetime counter.
 *
 * Actor-private state uses bigint. The public surface is always a canonical
 * base-10 string so ordinary JSON serialization cannot round or reject it.
 */
declare const actorExactCounterBrand: unique symbol;

export type ActorExactCounter = string & {
  readonly [actorExactCounterBrand]: "ActorExactCounter";
};

export type ActorTrace =
  | { readonly kind: "accepted"; readonly actorId: string; readonly sequence: number }
  | { readonly kind: "started"; readonly actorId: string; readonly sequence: number }
  | { readonly kind: "committed"; readonly actorId: string; readonly sequence: number }
  | {
      readonly kind: "transition_failed";
      readonly actorId: string;
      readonly sequence: number;
      readonly cause: string;
    }
  | {
      readonly kind: "closed";
      readonly actorId: string;
      readonly acceptedCount: ActorExactCounter;
    };

export interface ActorTraceSnapshot {
  readonly capacity: number;
  readonly entries: ReadonlyArray<ActorTrace>;
  readonly totalObserved: ActorExactCounter;
  readonly evicted: ActorExactCounter;
  readonly acceptedCount: ActorExactCounter;
  readonly completeHistory: boolean;
}

/**
 * @internal Pure actor-private retention state. The runtime re-exports only
 * public observation types; direct state access exists only for bounded oracle
 * tests.
 */
export interface ActorTraceState {
  readonly entries: ReadonlyArray<ActorTrace>;
  readonly totalObserved: bigint;
}

export const emptyActorTraceState: ActorTraceState = Object.freeze({
  entries: Object.freeze([]),
  totalObserved: 0n,
});

/** @internal The only constructor for the opaque public counter value. */
export const actorExactCounter = (value: bigint): ActorExactCounter => {
  if (value < 0n) throw new RangeError("actor exact counters must be non-negative");
  return value.toString(10) as ActorExactCounter;
};

/**
 * @internal Pure transition shared by the live Ref update and the MAX_SAFE
 * boundary oracle. Work and retained stock are bounded by capacity, never
 * lifetime.
 */
export const appendActorTrace = (
  state: ActorTraceState,
  capacity: number,
  entry: ActorTrace,
): ActorTraceState => ({
  entries:
    state.entries.length < capacity
      ? [...state.entries, entry]
      : [...state.entries.slice(1), entry],
  totalObserved: state.totalObserved + 1n,
});

/** @internal */
export const snapshotActorTrace = (
  state: ActorTraceState,
  capacity: number,
  acceptedCount: bigint,
): ActorTraceSnapshot => {
  const retainedCount = BigInt(state.entries.length);
  if (state.totalObserved < retainedCount) {
    throw new RangeError("actor trace total cannot be smaller than its retained entry count");
  }
  const entries = Object.freeze(
    state.entries.map((entry) => Object.freeze({ ...entry }) as ActorTrace),
  );
  const evicted = state.totalObserved - retainedCount;
  return Object.freeze({
    capacity,
    entries,
    totalObserved: actorExactCounter(state.totalObserved),
    evicted: actorExactCounter(evicted),
    acceptedCount: actorExactCounter(acceptedCount),
    completeHistory: evicted === 0n,
  });
};
