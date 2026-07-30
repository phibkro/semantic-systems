import { Data, Effect } from "effect";

export class SemanticValueRejected extends Data.TaggedError("SemanticValueRejected")<{
  readonly boundary: string;
  readonly reason: string;
}> {
  override get message(): string {
    return `${this.boundary}: ${this.reason}`;
  }
}

const isPlainRecord = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const freezeSemanticData = (
  value: unknown,
  boundary: string,
  visiting: WeakSet<object>,
  finished: WeakSet<object>,
): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SemanticValueRejected({
        boundary,
        reason: "numbers must be finite",
      });
    }
    return;
  }
  if (typeof value !== "object") {
    throw new SemanticValueRejected({
      boundary,
      reason: `unsupported semantic value ${typeof value}`,
    });
  }
  if (finished.has(value)) return;
  if (visiting.has(value)) {
    throw new SemanticValueRejected({
      boundary,
      reason: "cyclic values are not semantic data",
    });
  }
  visiting.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) freezeSemanticData(entry, boundary, visiting, finished);
    Object.freeze(value);
    visiting.delete(value);
    finished.add(value);
    return;
  }
  if (!isPlainRecord(value)) {
    throw new SemanticValueRejected({
      boundary,
      reason: "only arrays and plain records may carry composite semantic data",
    });
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!("value" in descriptor)) {
      throw new SemanticValueRejected({
        boundary,
        reason: "semantic data cannot contain accessors",
      });
    }
    freezeSemanticData(descriptor.value, boundary, visiting, finished);
  }
  Object.freeze(value);
  visiting.delete(value);
  finished.add(value);
};

export const snapshotSemanticValue = <Value>(
  value: Value,
  boundary: string,
): Effect.Effect<Value, SemanticValueRejected> =>
  Effect.try({
    try: () => {
      const snapshot = structuredClone(value);
      freezeSemanticData(snapshot, boundary, new WeakSet(), new WeakSet());
      return snapshot;
    },
    catch: (cause) =>
      cause instanceof SemanticValueRejected
        ? cause
        : new SemanticValueRejected({
            boundary,
            reason: cause instanceof Error ? cause.message : "value could not be snapshotted",
          }),
  });
