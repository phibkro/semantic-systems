import type { CanonicalJsonValue } from "../normalized-core/canonical.ts";

const MAXIMUM_FACT_NODES = 10_000;
const MAXIMUM_FACT_DEPTH = 64;

interface FactInspection {
  readonly seen: WeakSet<object>;
  nodes: number;
}

const INDEX_KEY_PATTERN = /^(0|[1-9][0-9]*)$/;

const projectArray = (
  input: ReadonlyArray<unknown>,
  inspection: FactInspection,
  depth: number,
): ReadonlyArray<CanonicalJsonValue> | undefined => {
  if (Object.getPrototypeOf(input) !== Array.prototype) return undefined;
  // One descriptor snapshot for the whole array, exactly like `projectRecord`:
  // `length` and every element are read from this same snapshot via
  // `descriptor.value`, never through a second, later, live `input.length`
  // or `input[index]` access. A hostile Proxy's `getOwnPropertyDescriptor`
  // trap and its `get` trap are independent and need not agree; validating
  // against one and then reading through the other would let a value the
  // snapshot never saw slip past validation.
  // Cast away the array-specific overload so TypeScript returns the generic
  // `PropertyDescriptorMap` shape instead of pre-typing `length`'s
  // descriptor as `number`; the runtime call is identical either way.
  const descriptors = Object.getOwnPropertyDescriptors(input as object);
  const lengthDescriptor = descriptors["length"];
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return undefined;
  }
  const length = lengthDescriptor.value;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key === "symbol" || !INDEX_KEY_PATTERN.test(key)) return undefined;
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) return undefined;
  }
  const result: Array<CanonicalJsonValue> = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      return undefined;
    }
    const projected = project(descriptor.value, inspection, depth + 1);
    if (projected === undefined) return undefined;
    result.push(projected);
  }
  return result;
};

const projectRecord = (
  input: object,
  inspection: FactInspection,
  depth: number,
): Readonly<Record<string, CanonicalJsonValue>> | undefined => {
  // Only plain data objects and null-prototype records are representable.
  // Date, Map, Set, RegExp, and every class instance carry an exotic or
  // inherited prototype and are rejected here rather than silently
  // rendered as an empty record from their (typically empty) own-property
  // set.
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  if (Object.getOwnPropertySymbols(input).length !== 0) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  // A null-prototype output object: an own `__proto__` input key must
  // become an ordinary data property. Building on `{}` would run the
  // inherited `Object.prototype.__proto__` accessor on assignment instead,
  // which mutates (or silently drops, for a non-object value) the output's
  // own prototype rather than recording the key.
  const result: Record<string, CanonicalJsonValue> = Object.create(null) as Record<
    string,
    CanonicalJsonValue
  >;
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor) || !descriptor.enumerable) return undefined;
    const projected = project(descriptor.value, inspection, depth + 1);
    if (projected === undefined) return undefined;
    result[key] = projected;
  }
  return result;
};

const project = (
  input: unknown,
  inspection: FactInspection,
  depth: number,
): CanonicalJsonValue | undefined => {
  if (input === null) return null;
  if (typeof input === "boolean" || typeof input === "string") return input;
  if (typeof input === "number") return Number.isSafeInteger(input) ? input : undefined;
  if (typeof input !== "object") return undefined; // undefined, function, bigint, symbol
  if (depth > MAXIMUM_FACT_DEPTH) return undefined;
  // Persistent for the whole projection, never released once visited: this
  // rejects a true cycle and a non-cyclic alias (the same reference reached
  // twice through different paths) alike. A cycle-only guard that releases
  // an object once its subtree finishes would let a diamond alias through
  // as an indistinguishable duplicate, which is exactly the earlier defect.
  if (inspection.seen.has(input)) return undefined;
  inspection.nodes += 1;
  if (inspection.nodes > MAXIMUM_FACT_NODES) return undefined;
  inspection.seen.add(input);
  return Array.isArray(input)
    ? projectArray(input, inspection, depth)
    : projectRecord(input, inspection, depth);
};

/**
 * Projects an arbitrary host value through a strict inert canonical JSON
 * value boundary for the `expected`/`actual` diagnostic-fact fields: null,
 * boolean, safe-integer (negative zero included: the accepted 0018/0019/0020
 * contracts already preserve it as a value distinct from positive zero
 * through canonical encoding — `Object.is(-0, 0)` is `false` and this
 * project's `canonicalJson` emits the literal tokens `-0` and `0`, so
 * accepting it here does not collapse two non-interchangeable values), or a
 * finite array or plain record built recursively from the same, with no
 * structural sharing revealed in the output. Everything else that is not
 * injectively representable — `Date`, `Map`, `Set`, `RegExp`, any other
 * exotic or inherited-prototype object, a symbol-keyed or accessor property,
 * a non-safe-integer number, a cycle, or a non-cyclic alias — is rejected
 * outright by returning `undefined`. A fact that cannot cross this boundary
 * is omitted from the observation, not approximated.
 *
 * The whole recursive projection runs inside one closed totality boundary:
 * a revoked or hostile `Proxy` can make `Array.isArray`,
 * `Object.getPrototypeOf`, `Reflect.ownKeys`, a descriptor lookup, or a
 * property read throw at any depth, and every one of those throws is
 * caught here and rejected the same way as any other non-representable
 * shape, rather than escaping as a host error.
 */
export const toPortableFact = (input: unknown): CanonicalJsonValue | undefined => {
  try {
    return project(input, { seen: new WeakSet(), nodes: 0 }, 0);
  } catch {
    return undefined;
  }
};
