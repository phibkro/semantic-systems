/**
 * Deterministic reference model for the frozen STM laws in design spec 0014.
 *
 * Provenance: the journal/validate/retry shape was evaluated against Effect
 * 4.0.0-beta.102's MIT-licensed Effect.tx and TxRef implementation. The
 * transaction language and model below are original, closed data structures:
 * no Effect, Promise, callback, or external action enters an attempt.
 */
import type { JsonObject, JsonValue } from "../tracer/json.ts";

const DomainTypeId: unique symbol = Symbol.for("semantic-systems/stm/Domain");
const TVarTypeId: unique symbol = Symbol.for("semantic-systems/stm/TVar");
const TxnTypeId: unique symbol = Symbol.for("semantic-systems/stm/Txn");
const StoreTypeId: unique symbol = Symbol.for("semantic-systems/stm/Store");
const AttemptTypeId: unique symbol = Symbol.for("semantic-systems/stm/Attempt");
const SuspensionTypeId: unique symbol = Symbol.for("semantic-systems/stm/Suspension");
const domainCustody = new WeakSet<object>();
const tvarCustody = new WeakSet<object>();
const descriptionCustody = new WeakSet<object>();
const knownAttemptCustody = new WeakSet<object>();
const liveAttemptCustody = new WeakSet<object>();
const rerunnableAttemptCustody = new WeakSet<object>();
const liveSuspensionCustody = new WeakSet<object>();
const expressionCustody = new WeakSet<object>();
const storeCustody = new WeakSet<object>();

export interface Domain<out Name extends string = string> {
  readonly [DomainTypeId]: true;
  readonly name: Name;
}

export interface TVar<out DomainName extends string, out Value extends JsonValue> {
  readonly [TVarTypeId]: true;
  readonly domain: Domain<DomainName>;
  readonly id: string;
  readonly initialValue: Value;
}

export type Expression =
  | { readonly kind: "literal"; readonly value: JsonValue }
  | { readonly kind: "binding"; readonly name: string }
  | { readonly kind: "add"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "subtract"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "equal"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "greater_than"; readonly left: Expression; readonly right: Expression };

type Instruction =
  | { readonly kind: "read"; readonly ref: TVar<string, JsonValue>; readonly bind: string }
  | { readonly kind: "write"; readonly ref: TVar<string, JsonValue>; readonly value: Expression }
  | { readonly kind: "after_commit"; readonly action: JsonValue }
  | {
      readonly kind: "abort";
      readonly error: JsonValue;
      readonly actions: ReadonlyArray<JsonValue>;
    }
  | { readonly kind: "retry" }
  | {
      readonly kind: "or_else";
      readonly left: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>;
      readonly right: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>;
      readonly bind: string;
    }
  | {
      readonly kind: "nested";
      readonly transaction: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>;
      readonly bind?: string;
    }
  | {
      readonly kind: "when";
      readonly condition: Expression;
      readonly ifTrue: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>;
      readonly ifFalse: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>;
      readonly bind?: string;
    };

interface TxnVariance<
  DomainName extends string,
  Error extends JsonValue,
  Value extends JsonValue,
  CommitAction extends JsonValue,
  AbortAction extends JsonValue,
> {
  readonly domain: DomainName;
  readonly error: Error;
  readonly value: Value;
  readonly commitAction: CommitAction;
  readonly abortAction: AbortAction;
}

export interface Txn<
  out DomainName extends string,
  out Error extends JsonValue,
  out Value extends JsonValue,
  out CommitAction extends JsonValue,
  out AbortAction extends JsonValue,
> {
  readonly [TxnTypeId]: TxnVariance<DomainName, Error, Value, CommitAction, AbortAction>;
  readonly domain: Domain<DomainName>;
  readonly id: string;
  readonly instructions: ReadonlyArray<Instruction>;
  readonly result: Expression;
}

interface CellState {
  readonly id: string;
  readonly value: JsonValue;
  readonly version: bigint;
}

export interface Store<out DomainName extends string = string> {
  readonly [StoreTypeId]: true;
  readonly domain: Domain<DomainName>;
  readonly cells: ReadonlyArray<CellState>;
}

interface JournalEntry {
  readonly id: string;
  readonly startVersion: bigint;
  readonly value: JsonValue;
}

interface ReadObservation {
  readonly id: string;
  readonly version: bigint;
  readonly value: JsonValue;
}

type Evaluation =
  | { readonly kind: "success"; readonly value: JsonValue }
  | { readonly kind: "retry"; readonly dependencies: ReadonlyArray<string> }
  | {
      readonly kind: "typed_abort";
      readonly error: JsonValue;
      readonly abortActions: ReadonlyArray<JsonValue>;
    };

export interface Attempt {
  readonly [AttemptTypeId]: true;
  readonly description: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>;
  readonly ordinal: bigint;
  readonly startVersions: ReadonlyArray<{ readonly id: string; readonly version: bigint }>;
  readonly readSet: ReadonlyArray<ReadObservation>;
  readonly writeSet: ReadonlyArray<JournalEntry>;
  readonly commitActions: ReadonlyArray<JsonValue>;
  readonly evaluation: Evaluation;
}

export interface DomainRejection {
  readonly kind: "domain_rejected";
  readonly transactionId: string;
  readonly expectedDomain: string;
  readonly encounteredDomain: string;
  readonly referenceOrTransaction: string;
  readonly attemptStarted: false;
}

export interface DescriptionRejection {
  readonly kind: "description_rejected";
  readonly transactionId: string;
  readonly reason: "not_handler_custodied";
  readonly attemptStarted: false;
}

export interface StoreRejection {
  readonly kind: "store_rejected";
  readonly reason: "not_handler_custodied";
  readonly attemptStarted: false;
}

export interface InvalidAttempt {
  readonly kind: "invalid_attempt";
  readonly store: Store<string>;
  readonly reason:
    | "not_handler_custodied"
    | "store_not_handler_custodied"
    | "already_settled"
    | "not_rerunnable";
  readonly commitActions: readonly [];
  readonly abortActions: readonly [];
}

export type BeginResult =
  | { readonly kind: "attempt"; readonly attempt: Attempt }
  | DomainRejection
  | DescriptionRejection
  | StoreRejection
  | InvalidAttempt;

export interface Suspension {
  readonly [SuspensionTypeId]: true;
  readonly description: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>;
  readonly attemptOrdinal: bigint;
  readonly dependencies: ReadonlyArray<{
    readonly id: string;
    readonly observedVersion: bigint;
  }>;
}

export interface CommitRecord {
  readonly transactionId: string;
  readonly reads: ReadonlyArray<{ readonly id: string; readonly value: JsonValue }>;
  readonly writes: ReadonlyArray<{ readonly id: string; readonly value: JsonValue }>;
}

export type Settlement =
  | {
      readonly kind: "committed";
      readonly store: Store<string>;
      readonly value: JsonValue;
      readonly commitActions: ReadonlyArray<JsonValue>;
      readonly abortActions: readonly [];
      readonly attemptOrdinal: bigint;
      readonly history: CommitRecord;
    }
  | {
      readonly kind: "conflict";
      readonly store: Store<string>;
      readonly stale: ReadonlyArray<string>;
      readonly commitActions: readonly [];
      readonly abortActions: readonly [];
      readonly attemptOrdinal: bigint;
    }
  | {
      readonly kind: "suspended";
      readonly store: Store<string>;
      readonly suspension: Suspension;
      readonly commitActions: readonly [];
      readonly abortActions: readonly [];
      readonly attemptOrdinal: bigint;
    }
  | {
      readonly kind: "aborted";
      readonly store: Store<string>;
      readonly error: JsonValue;
      readonly commitActions: readonly [];
      readonly abortActions: ReadonlyArray<JsonValue>;
      readonly attemptOrdinal: bigint;
    }
  | InvalidAttempt;

export interface DiscardedAttempt {
  readonly kind: "interrupted" | "defect";
  readonly store: Store<string>;
  readonly commitActions: readonly [];
  readonly abortActions: readonly [];
  readonly attemptOrdinal: bigint;
}

interface PortableObjectSnapshot {
  readonly array: boolean;
  readonly keys: ReadonlyArray<string>;
  readonly descriptors: Readonly<Record<PropertyKey, PropertyDescriptor>>;
}

const inertDataFailure = (): TypeError =>
  new TypeError("transaction values must be plain inert JSON data");

const snapshotPortableObjects = (
  input: unknown,
  snapshots: Map<object, PortableObjectSnapshot>,
  visiting: Set<object>,
): void => {
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "boolean" ||
    (typeof input === "number" && Number.isFinite(input))
  ) {
    return;
  }
  if (typeof input !== "object") {
    throw new TypeError("transaction values must be inert JSON data");
  }
  if (visiting.has(input)) throw new TypeError("transaction values must not contain cycles");
  if (snapshots.has(input)) return;
  visiting.add(input);
  try {
    let array: boolean;
    let prototype: object | null;
    let descriptors: Record<PropertyKey, PropertyDescriptor>;
    try {
      array = Array.isArray(input);
      prototype = Object.getPrototypeOf(input);
      descriptors = Object.getOwnPropertyDescriptors(input);
    } catch {
      throw inertDataFailure();
    }
    if (
      (array && prototype !== Array.prototype) ||
      (!array && prototype !== Object.prototype && prototype !== null)
    ) {
      throw inertDataFailure();
    }
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some((key) => typeof key === "symbol")) throw inertDataFailure();
    const keys = ownKeys.filter((key): key is string => typeof key === "string");
    const valueKeys = array ? keys.filter((key) => key !== "length") : keys;
    if (
      (!array && valueKeys.length !== keys.length) ||
      valueKeys.some((key) => {
        const descriptor = descriptors[key];
        return (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor) ||
          "get" in descriptor ||
          "set" in descriptor
        );
      })
    ) {
      throw inertDataFailure();
    }
    if (array) {
      const lengthDescriptor = descriptors["length"];
      if (
        lengthDescriptor === undefined ||
        !("value" in lengthDescriptor) ||
        typeof lengthDescriptor.value !== "number" ||
        valueKeys.length !== lengthDescriptor.value ||
        valueKeys.some((key, index) => key !== String(index))
      ) {
        throw inertDataFailure();
      }
    }
    const snapshot = Object.freeze({
      array,
      keys: Object.freeze([...valueKeys]),
      descriptors: Object.freeze(descriptors),
    });
    snapshots.set(input, snapshot);
    for (const key of valueKeys) {
      snapshotPortableObjects(descriptors[key]!.value, snapshots, visiting);
    }
  } finally {
    visiting.delete(input);
  }
};

const clonePortableSnapshot = (
  input: unknown,
  snapshots: ReadonlyMap<object, PortableObjectSnapshot>,
  clones: Map<object, JsonValue>,
): JsonValue => {
  if (input === null || typeof input !== "object") return input as JsonValue;
  const existing = clones.get(input);
  if (existing !== undefined) return existing;
  const snapshot = snapshots.get(input);
  if (snapshot === undefined) throw inertDataFailure();
  if (snapshot.array) {
    const output = snapshot.keys.map((key) =>
      clonePortableSnapshot(snapshot.descriptors[key]!.value, snapshots, clones),
    );
    const frozen = Object.freeze(output);
    clones.set(input, frozen);
    return frozen;
  }
  const output = Object.fromEntries(
    [...snapshot.keys]
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [
        key,
        clonePortableSnapshot(snapshot.descriptors[key]!.value, snapshots, clones),
      ]),
  ) as JsonObject;
  const frozen = Object.freeze(output);
  clones.set(input, frozen);
  return frozen;
};

const portableValue = (input: unknown): JsonValue => {
  const snapshots = new Map<object, PortableObjectSnapshot>();
  snapshotPortableObjects(input, snapshots, new Set());
  if (typeof input === "object" && input !== null) {
    try {
      structuredClone(input);
    } catch {
      throw inertDataFailure();
    }
  }
  return clonePortableSnapshot(input, snapshots, new Map());
};

export const isPortableData = (input: unknown): input is JsonValue => {
  try {
    portableValue(input);
    return true;
  } catch {
    return false;
  }
};

const requireId = (value: string, label: string): string => {
  if (!/^[a-z][a-z0-9._-]*$/.test(value)) {
    throw new TypeError(`${label} must be a stable lowercase identifier`);
  }
  return value;
};

const ownExpression = <A extends Expression>(expression: A): A => {
  const frozen = Object.freeze(expression);
  expressionCustody.add(frozen);
  return frozen;
};

const requireExpression = (expression: Expression): Expression => {
  if (!expressionCustody.has(expression)) {
    throw new TypeError("expression is not handler-custodied");
  }
  return expression;
};

const requireCustodiedDescription = (
  transaction: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>,
): void => {
  if (!descriptionCustody.has(transaction)) {
    throw new TypeError("nested transaction description is not handler-custodied");
  }
};

const freezeInstruction = (instruction: Instruction): Instruction => {
  switch (instruction.kind) {
    case "read": {
      if (!tvarCustody.has(instruction.ref)) {
        throw new TypeError("read TVar is not handler-custodied");
      }
      return Object.freeze({
        kind: "read",
        ref: instruction.ref,
        bind: requireId(instruction.bind, "binding"),
      });
    }
    case "write": {
      if (!tvarCustody.has(instruction.ref)) {
        throw new TypeError("write TVar is not handler-custodied");
      }
      return Object.freeze({
        kind: "write",
        ref: instruction.ref,
        value: requireExpression(instruction.value),
      });
    }
    case "after_commit":
      return Object.freeze({
        kind: "after_commit",
        action: portableValue(instruction.action),
      });
    case "abort":
      return Object.freeze({
        kind: "abort",
        error: portableValue(instruction.error),
        actions: Object.freeze(instruction.actions.map((action) => portableValue(action))),
      });
    case "retry":
      return Object.freeze({ kind: "retry" });
    case "nested":
      requireCustodiedDescription(instruction.transaction);
      return Object.freeze({
        kind: "nested",
        transaction: instruction.transaction,
        ...(instruction.bind === undefined ? {} : { bind: requireId(instruction.bind, "binding") }),
      });
    case "or_else":
      requireCustodiedDescription(instruction.left);
      requireCustodiedDescription(instruction.right);
      return Object.freeze({
        kind: "or_else",
        left: instruction.left,
        right: instruction.right,
        bind: requireId(instruction.bind, "binding"),
      });
    case "when":
      requireCustodiedDescription(instruction.ifTrue);
      requireCustodiedDescription(instruction.ifFalse);
      return Object.freeze({
        kind: "when",
        condition: requireExpression(instruction.condition),
        ifTrue: instruction.ifTrue,
        ifFalse: instruction.ifFalse,
        ...(instruction.bind === undefined ? {} : { bind: requireId(instruction.bind, "binding") }),
      });
  }
};

const makeTxn = <
  D extends string,
  E extends JsonValue,
  A extends JsonValue,
  C extends JsonValue,
  X extends JsonValue,
>(
  domain: Domain<D>,
  id: string,
  instructions: ReadonlyArray<Instruction>,
  result: Expression,
): Txn<D, E, A, C, X> => {
  if (!domainCustody.has(domain)) {
    throw new TypeError("transaction domain is not handler-custodied");
  }
  const transaction = Object.freeze({
    [TxnTypeId]: Object.freeze({
      domain: domain.name,
      error: null,
      value: null,
      commitAction: null,
      abortAction: null,
    }) as unknown as TxnVariance<D, E, A, C, X>,
    domain,
    id: requireId(id, "transaction id"),
    instructions: Object.freeze(instructions.map(freezeInstruction)),
    result: requireExpression(result),
  });
  descriptionCustody.add(transaction);
  return transaction;
};

export const domain = <const Name extends string>(name: Name): Domain<Name> => {
  const owner = Object.freeze({
    [DomainTypeId]: true as const,
    name: requireId(name, "domain name") as Name,
  });
  domainCustody.add(owner);
  return owner;
};

export const tvar = <D extends string, A extends JsonValue>(
  owner: Domain<D>,
  id: string,
  initialValue: A,
): TVar<D, A> => {
  if (!domainCustody.has(owner)) throw new TypeError("TVar domain is not handler-custodied");
  const ref = Object.freeze({
    [TVarTypeId]: true as const,
    domain: owner,
    id: requireId(id, "TVar id"),
    initialValue: portableValue(initialValue) as A,
  });
  tvarCustody.add(ref);
  return ref;
};

export const literal = (value: JsonValue): Expression =>
  ownExpression({ kind: "literal", value: portableValue(value) });

export const binding = (name: string): Expression =>
  ownExpression({ kind: "binding", name: requireId(name, "binding") });

const binaryExpression = (
  kind: "add" | "subtract" | "equal" | "greater_than",
  left: Expression,
  right: Expression,
): Expression =>
  ownExpression({
    kind,
    left: requireExpression(left),
    right: requireExpression(right),
  });

export const subtract = (left: Expression, right: Expression): Expression =>
  binaryExpression("subtract", left, right);

export const equal = (left: Expression, right: Expression): Expression =>
  binaryExpression("equal", left, right);

export const greaterThan = (left: Expression, right: Expression): Expression =>
  binaryExpression("greater_than", left, right);

export const add = (left: Expression, right: Expression): Expression =>
  binaryExpression("add", left, right);

export const succeed = <D extends string, A extends JsonValue>(
  owner: Domain<D>,
  id: string,
  value: A | Expression,
): Txn<D, never, A, never, never> =>
  makeTxn(owner, id, [], isExpression(value) ? value : literal(value));

export const read = <D extends string, A extends JsonValue>(
  ref: TVar<D, A>,
  bind: string,
): Txn<D, never, A, never, never> =>
  makeTxn(
    ref.domain,
    `read-${ref.id}`,
    [{ kind: "read", ref: ref as TVar<string, JsonValue>, bind: requireId(bind, "binding") }],
    binding(bind),
  );

export const write = <D extends string, A extends JsonValue>(
  ref: TVar<D, A>,
  value: Expression | A,
): Txn<D, never, null, never, never> =>
  makeTxn(
    ref.domain,
    `write-${ref.id}`,
    [
      {
        kind: "write",
        ref: ref as TVar<string, JsonValue>,
        value: isExpression(value) ? value : literal(value),
      },
    ],
    literal(null),
  );

export const retry = <D extends string>(
  owner: Domain<D>,
  id = "retry",
): Txn<D, never, never, never, never> => makeTxn(owner, id, [{ kind: "retry" }], literal(null));

export const abort = <D extends string, E extends JsonValue, X extends JsonValue>(
  owner: Domain<D>,
  error: E,
  actions: ReadonlyArray<X>,
  id = "abort",
): Txn<D, E, never, never, X> =>
  makeTxn(
    owner,
    id,
    [
      {
        kind: "abort",
        error: portableValue(error),
        actions: actions.map((action) => portableValue(action)),
      },
    ],
    literal(null),
  );

export const afterCommit = <D extends string, C extends JsonValue>(
  owner: Domain<D>,
  action: C,
  id = "after-commit",
): Txn<D, never, null, C, never> =>
  makeTxn(owner, id, [{ kind: "after_commit", action: portableValue(action) }], literal(null));

export const sequence = <
  D extends string,
  E extends JsonValue,
  A extends JsonValue,
  C extends JsonValue,
  X extends JsonValue,
>(
  owner: Domain<D>,
  id: string,
  parts: ReadonlyArray<Txn<D, E, JsonValue, C, X>>,
  result: Expression | A = null as A,
): Txn<D, E, A, C, X> => {
  for (const part of parts) requireCustodiedDescription(part);
  return makeTxn(
    owner,
    id,
    parts.flatMap((part) => part.instructions),
    isExpression(result) ? result : literal(result),
  );
};

export const nested = <
  D extends string,
  E extends JsonValue,
  A extends JsonValue,
  C extends JsonValue,
  X extends JsonValue,
>(
  owner: Domain<D>,
  transaction: Txn<string, E, A, C, X>,
  bind?: string,
): Txn<D, E, A, C, X> =>
  makeTxn(
    owner,
    `nested-${transaction.id}`,
    [
      {
        kind: "nested",
        transaction: transaction as Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>,
        ...(bind === undefined ? {} : { bind: requireId(bind, "binding") }),
      },
    ],
    bind === undefined ? transaction.result : binding(bind),
  );

export const orElse = <
  D extends string,
  E extends JsonValue,
  A extends JsonValue,
  C extends JsonValue,
  X extends JsonValue,
>(
  left: Txn<D, E, A, C, X>,
  right: Txn<D, E, A, C, X>,
): Txn<D, E, A, C, X> => {
  const resultBinding = `or-else-value-${left.id}-${right.id}`;
  return makeTxn(
    left.domain,
    `or-else-${left.id}-${right.id}`,
    [
      {
        kind: "or_else",
        left: left as Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>,
        right: right as Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>,
        bind: resultBinding,
      },
    ],
    binding(resultBinding),
  );
};

export const when = <
  D extends string,
  E extends JsonValue,
  A extends JsonValue,
  C extends JsonValue,
  X extends JsonValue,
>(
  owner: Domain<D>,
  condition: Expression,
  ifTrue: Txn<D, E, A, C, X>,
  ifFalse: Txn<D, E, A, C, X>,
  bind?: string,
): Txn<D, E, A, C, X> =>
  makeTxn(
    owner,
    `when-${ifTrue.id}-${ifFalse.id}`,
    [
      {
        kind: "when",
        condition,
        ifTrue: ifTrue as Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>,
        ifFalse: ifFalse as Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>,
        ...(bind === undefined ? {} : { bind: requireId(bind, "binding") }),
      },
    ],
    bind === undefined ? literal(null) : binding(bind),
  );

const isExpression = (value: JsonValue | Expression): value is Expression =>
  typeof value === "object" && value !== null && expressionCustody.has(value);

export const makeStore = <D extends string>(
  owner: Domain<D>,
  refs: ReadonlyArray<TVar<D, JsonValue>>,
  initialVersion = 0n,
): Store<D> => {
  if (!domainCustody.has(owner)) throw new TypeError("store domain is not handler-custodied");
  if (initialVersion < 0n) throw new RangeError("initial store version must be non-negative");
  const ids = new Set<string>();
  const cells = refs
    .map((ref) => {
      if (!tvarCustody.has(ref)) throw new TypeError("TVar is not handler-custodied");
      if (ref.domain !== owner) throw new TypeError(`TVar ${ref.id} belongs to another domain`);
      if (ids.has(ref.id)) throw new TypeError(`duplicate TVar id ${ref.id}`);
      ids.add(ref.id);
      return Object.freeze({
        id: ref.id,
        value: portableValue(ref.initialValue),
        version: initialVersion,
      });
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const store = Object.freeze({
    [StoreTypeId]: true as const,
    domain: owner,
    cells: Object.freeze(cells),
  });
  storeCustody.add(store);
  return store;
};

const cellOf = (store: Store<string>, id: string): CellState => {
  const cell = store.cells.find((candidate) => candidate.id === id);
  if (cell === undefined) throw new RangeError(`unknown TVar ${id}`);
  return cell;
};

export const inspectCell = (
  store: Store<string>,
  ref: TVar<string, JsonValue>,
): { readonly value: JsonValue; readonly version: bigint } => {
  if (!storeCustody.has(store)) throw new TypeError("store is not handler-custodied");
  if (!tvarCustody.has(ref)) throw new TypeError("TVar is not handler-custodied");
  if (ref.domain !== store.domain) throw new TypeError(`TVar ${ref.id} belongs to another domain`);
  const cell = cellOf(store, ref.id);
  return Object.freeze({ value: cell.value, version: cell.version });
};

const domainMismatch = (
  root: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>,
  expected: Domain<string>,
): DomainRejection | undefined => {
  if (root.domain !== expected) {
    return Object.freeze({
      kind: "domain_rejected",
      transactionId: root.id,
      expectedDomain: expected.name,
      encounteredDomain: root.domain.name,
      referenceOrTransaction: root.id,
      attemptStarted: false,
    });
  }
  for (const instruction of root.instructions) {
    if (
      (instruction.kind === "read" || instruction.kind === "write") &&
      instruction.ref.domain !== expected
    ) {
      return Object.freeze({
        kind: "domain_rejected",
        transactionId: root.id,
        expectedDomain: expected.name,
        encounteredDomain: instruction.ref.domain.name,
        referenceOrTransaction: instruction.ref.id,
        attemptStarted: false,
      });
    }
    const children =
      instruction.kind === "or_else"
        ? [instruction.left, instruction.right]
        : instruction.kind === "when"
          ? [instruction.ifTrue, instruction.ifFalse]
          : instruction.kind === "nested"
            ? [instruction.transaction]
            : [];
    for (const child of children) {
      const mismatch = domainMismatch(child, expected);
      if (mismatch !== undefined) return mismatch;
    }
  }
  return undefined;
};

interface MutableContext {
  readonly store: Store<string>;
  readonly bindings: Map<string, JsonValue>;
  readonly reads: Map<string, ReadObservation>;
  readonly writes: Map<string, JournalEntry>;
  readonly dependencies: Set<string>;
  readonly commitActions: JsonValue[];
}

const cloneContext = (context: MutableContext): MutableContext => ({
  store: context.store,
  bindings: new Map(context.bindings),
  reads: new Map(context.reads),
  writes: new Map(context.writes),
  dependencies: new Set(context.dependencies),
  commitActions: [...context.commitActions],
});

const evalExpression = (expression: Expression, bindings: Map<string, JsonValue>): JsonValue => {
  if (expression.kind === "literal") return expression.value;
  if (expression.kind === "binding") {
    if (!bindings.has(expression.name)) throw new RangeError(`unknown binding ${expression.name}`);
    return bindings.get(expression.name)!;
  }
  const left = evalExpression(expression.left, bindings);
  const right = evalExpression(expression.right, bindings);
  if (expression.kind === "equal") return Object.is(left, right);
  if (typeof left !== "number" || typeof right !== "number") {
    throw new TypeError(`${expression.kind} requires numeric operands`);
  }
  switch (expression.kind) {
    case "add":
      return left + right;
    case "subtract":
      return left - right;
    case "greater_than":
      return left > right;
  }
};

const copyContextInto = (target: MutableContext, source: MutableContext): void => {
  target.bindings.clear();
  target.reads.clear();
  target.writes.clear();
  target.dependencies.clear();
  target.commitActions.length = 0;
  for (const [key, value] of source.bindings) target.bindings.set(key, value);
  for (const [key, value] of source.reads) target.reads.set(key, value);
  for (const [key, value] of source.writes) target.writes.set(key, value);
  for (const value of source.dependencies) target.dependencies.add(value);
  target.commitActions.push(...source.commitActions);
};

const evaluate = (
  transaction: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>,
  context: MutableContext,
): Evaluation => {
  for (const instruction of transaction.instructions) {
    switch (instruction.kind) {
      case "read": {
        const staged = context.writes.get(instruction.ref.id);
        if (staged !== undefined) {
          context.bindings.set(instruction.bind, staged.value);
          context.dependencies.add(instruction.ref.id);
          break;
        }
        const cell = cellOf(context.store, instruction.ref.id);
        if (!context.reads.has(cell.id)) {
          context.reads.set(
            cell.id,
            Object.freeze({ id: cell.id, version: cell.version, value: cell.value }),
          );
        }
        context.dependencies.add(cell.id);
        context.bindings.set(instruction.bind, cell.value);
        break;
      }
      case "write": {
        const cell = cellOf(context.store, instruction.ref.id);
        const observed = context.reads.get(cell.id);
        const startVersion = observed?.version ?? cell.version;
        if (observed === undefined) {
          context.reads.set(
            cell.id,
            Object.freeze({ id: cell.id, version: startVersion, value: cell.value }),
          );
        }
        context.writes.set(
          cell.id,
          Object.freeze({
            id: cell.id,
            startVersion,
            value: portableValue(evalExpression(instruction.value, context.bindings)),
          }),
        );
        break;
      }
      case "after_commit":
        context.commitActions.push(instruction.action);
        break;
      case "abort":
        return Object.freeze({
          kind: "typed_abort",
          error: instruction.error,
          abortActions: Object.freeze([...instruction.actions]),
        });
      case "retry":
        return Object.freeze({
          kind: "retry",
          dependencies: Object.freeze([...context.dependencies].sort()),
        });
      case "nested": {
        const nestedResult = evaluate(instruction.transaction, context);
        if (nestedResult.kind !== "success") return nestedResult;
        if (instruction.bind !== undefined) {
          context.bindings.set(instruction.bind, nestedResult.value);
        }
        break;
      }
      case "when": {
        const condition = evalExpression(instruction.condition, context.bindings);
        if (typeof condition !== "boolean") throw new TypeError("when condition must be boolean");
        const branchResult = evaluate(
          condition ? instruction.ifTrue : instruction.ifFalse,
          context,
        );
        if (branchResult.kind !== "success") return branchResult;
        if (instruction.bind !== undefined) {
          context.bindings.set(instruction.bind, branchResult.value);
        }
        break;
      }
      case "or_else": {
        const branchInput = cloneContext(context);
        const leftContext = cloneContext(branchInput);
        const leftResult = evaluate(instruction.left, leftContext);
        if (leftResult.kind !== "retry") {
          copyContextInto(context, leftContext);
          if (leftResult.kind === "success" && instruction.bind !== undefined) {
            context.bindings.set(instruction.bind, leftResult.value);
          }
          if (leftResult.kind !== "success") return leftResult;
          break;
        }
        const rightContext = cloneContext(branchInput);
        const rightResult = evaluate(instruction.right, rightContext);
        if (rightResult.kind === "retry") {
          const dependencyIds = [
            ...new Set([...leftResult.dependencies, ...rightResult.dependencies]),
          ].sort();
          for (const id of dependencyIds) {
            const observation = leftContext.reads.get(id) ?? rightContext.reads.get(id);
            if (observation === undefined) {
              throw new RangeError(`retry dependency ${id} has no branch observation`);
            }
            context.reads.set(id, observation);
            context.dependencies.add(id);
          }
          return Object.freeze({
            kind: "retry",
            dependencies: Object.freeze(dependencyIds),
          });
        }
        copyContextInto(context, rightContext);
        if (rightResult.kind === "success" && instruction.bind !== undefined) {
          context.bindings.set(instruction.bind, rightResult.value);
        }
        if (rightResult.kind !== "success") return rightResult;
        break;
      }
    }
  }
  return Object.freeze({
    kind: "success",
    value: portableValue(evalExpression(transaction.result, context.bindings)),
  });
};

export const beginAttempt = <
  D extends string,
  E extends JsonValue,
  A extends JsonValue,
  C extends JsonValue,
  X extends JsonValue,
>(
  store: Store<D>,
  transaction: Txn<D, E, A, C, X>,
  ordinal = 1n,
): BeginResult => {
  if (ordinal < 1n) throw new RangeError("attempt ordinal must be positive");
  if (!storeCustody.has(store)) {
    return Object.freeze({
      kind: "store_rejected",
      reason: "not_handler_custodied",
      attemptStarted: false,
    });
  }
  const erased = transaction as Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>;
  if (!descriptionCustody.has(erased)) {
    return Object.freeze({
      kind: "description_rejected",
      transactionId: typeof erased.id === "string" ? erased.id : "unknown",
      reason: "not_handler_custodied",
      attemptStarted: false,
    });
  }
  const rejection = domainMismatch(erased, store.domain);
  if (rejection !== undefined) return rejection;
  const context: MutableContext = {
    store,
    bindings: new Map(),
    reads: new Map(),
    writes: new Map(),
    dependencies: new Set(),
    commitActions: [],
  };
  const evaluation = evaluate(erased, context);
  const attempt = Object.freeze({
    [AttemptTypeId]: true as const,
    description: erased,
    ordinal,
    startVersions: Object.freeze(
      store.cells.map((cell) => Object.freeze({ id: cell.id, version: cell.version })),
    ),
    readSet: Object.freeze([...context.reads.values()].sort((a, b) => a.id.localeCompare(b.id))),
    writeSet: Object.freeze([...context.writes.values()].sort((a, b) => a.id.localeCompare(b.id))),
    commitActions: Object.freeze([...context.commitActions]),
    evaluation,
  });
  knownAttemptCustody.add(attempt);
  liveAttemptCustody.add(attempt);
  return Object.freeze({
    kind: "attempt",
    attempt,
  });
};

const unchangedStore = (store: Store<string>): Store<string> => store;
const emptyTuple: readonly [] = Object.freeze([]) as readonly [];
const invalidAttempt = (store: Store<string>, reason: InvalidAttempt["reason"]): InvalidAttempt =>
  Object.freeze({
    kind: "invalid_attempt",
    store,
    reason,
    commitActions: emptyTuple,
    abortActions: emptyTuple,
  });

export const settleAttempt = (currentStore: Store<string>, attempt: Attempt): Settlement => {
  if (!storeCustody.has(currentStore)) {
    return invalidAttempt(currentStore, "store_not_handler_custodied");
  }
  if (!knownAttemptCustody.has(attempt)) {
    return invalidAttempt(currentStore, "not_handler_custodied");
  }
  if (!liveAttemptCustody.delete(attempt)) {
    return invalidAttempt(currentStore, "already_settled");
  }
  if (currentStore.domain !== attempt.description.domain) {
    throw new TypeError("attempt cannot settle against another transaction domain");
  }
  if (attempt.evaluation.kind === "retry") {
    const dependencies = attempt.evaluation.dependencies.map((id) => {
      const observed = attempt.readSet.find((entry) => entry.id === id);
      if (observed === undefined) {
        throw new RangeError(`retry dependency ${id} has no attempt observation`);
      }
      return Object.freeze({ id, observedVersion: observed.version });
    });
    const suspension = Object.freeze({
      [SuspensionTypeId]: true as const,
      description: attempt.description,
      attemptOrdinal: attempt.ordinal,
      dependencies: Object.freeze(dependencies),
    });
    liveSuspensionCustody.add(suspension);
    return Object.freeze({
      kind: "suspended",
      store: unchangedStore(currentStore),
      suspension,
      commitActions: emptyTuple,
      abortActions: emptyTuple,
      attemptOrdinal: attempt.ordinal,
    });
  }
  if (attempt.evaluation.kind === "typed_abort") {
    return Object.freeze({
      kind: "aborted",
      store: unchangedStore(currentStore),
      error: attempt.evaluation.error,
      commitActions: emptyTuple,
      abortActions: attempt.evaluation.abortActions,
      attemptOrdinal: attempt.ordinal,
    });
  }
  const stale = attempt.readSet
    .filter((observation) => cellOf(currentStore, observation.id).version !== observation.version)
    .map((observation) => observation.id)
    .sort();
  if (stale.length > 0) {
    rerunnableAttemptCustody.add(attempt);
    return Object.freeze({
      kind: "conflict",
      store: unchangedStore(currentStore),
      stale: Object.freeze(stale),
      commitActions: emptyTuple,
      abortActions: emptyTuple,
      attemptOrdinal: attempt.ordinal,
    });
  }
  const writes = new Map(attempt.writeSet.map((entry) => [entry.id, entry]));
  const cells = currentStore.cells.map((cell) => {
    const writeEntry = writes.get(cell.id);
    if (writeEntry === undefined || Object.is(writeEntry.value, cell.value)) return cell;
    return Object.freeze({
      id: cell.id,
      value: writeEntry.value,
      version: cell.version + 1n,
    });
  });
  const nextStore = Object.freeze({
    [StoreTypeId]: true,
    domain: currentStore.domain,
    cells: Object.freeze(cells),
  }) as Store<string>;
  storeCustody.add(nextStore);
  return Object.freeze({
    kind: "committed",
    store: nextStore,
    value: attempt.evaluation.value,
    commitActions: attempt.commitActions,
    abortActions: emptyTuple,
    attemptOrdinal: attempt.ordinal,
    history: Object.freeze({
      transactionId: attempt.description.id,
      reads: Object.freeze(
        attempt.readSet.map((entry) => Object.freeze({ id: entry.id, value: entry.value })),
      ),
      writes: Object.freeze(
        attempt.writeSet.map((entry) => Object.freeze({ id: entry.id, value: entry.value })),
      ),
    }),
  });
};

export const discardAttempt = (
  store: Store<string>,
  attempt: Attempt,
  reason: "interrupted" | "defect",
): DiscardedAttempt | InvalidAttempt => {
  if (!storeCustody.has(store)) {
    return invalidAttempt(store, "store_not_handler_custodied");
  }
  if (!knownAttemptCustody.has(attempt)) {
    return invalidAttempt(store, "not_handler_custodied");
  }
  if (!liveAttemptCustody.delete(attempt)) {
    return invalidAttempt(store, "already_settled");
  }
  return Object.freeze({
    kind: reason,
    store: unchangedStore(store),
    commitActions: emptyTuple,
    abortActions: emptyTuple,
    attemptOrdinal: attempt.ordinal,
  });
};

export const rerunAttempt = (store: Store<string>, attempt: Attempt): BeginResult => {
  if (!storeCustody.has(store)) {
    return Object.freeze({
      kind: "store_rejected",
      reason: "not_handler_custodied",
      attemptStarted: false,
    });
  }
  if (!knownAttemptCustody.has(attempt)) {
    return invalidAttempt(store, "not_handler_custodied");
  }
  if (!rerunnableAttemptCustody.delete(attempt)) {
    return invalidAttempt(store, "not_rerunnable");
  }
  return beginAttempt(store, attempt.description, attempt.ordinal + 1n);
};

export const changedDependencies = (
  suspension: Suspension,
  store: Store<string>,
): ReadonlyArray<string> => {
  if (!storeCustody.has(store)) throw new TypeError("store is not handler-custodied");
  return Object.freeze(
    suspension.dependencies
      .filter((dependency) => cellOf(store, dependency.id).version !== dependency.observedVersion)
      .map((dependency) => dependency.id)
      .sort(),
  );
};

export const wakeAndRerun = (
  suspension: Suspension,
  store: Store<string>,
): BeginResult | undefined => {
  if (!storeCustody.has(store)) {
    return Object.freeze({
      kind: "store_rejected",
      reason: "not_handler_custodied",
      attemptStarted: false,
    });
  }
  if (!liveSuspensionCustody.has(suspension)) return undefined;
  if (changedDependencies(suspension, store).length === 0) return undefined;
  liveSuspensionCustody.delete(suspension);
  return beginAttempt(store, suspension.description, suspension.attemptOrdinal + 1n);
};

export const projectStore = (store: Store<string>): JsonObject => {
  if (!storeCustody.has(store)) throw new TypeError("store is not handler-custodied");
  return Object.freeze({
    domain: store.domain.name,
    cells: Object.freeze(
      store.cells.map((cell) =>
        Object.freeze({
          id: cell.id,
          value: cell.value,
          version: cell.version.toString(10),
        }),
      ),
    ),
  });
};

const permutations = <A>(items: ReadonlyArray<A>): ReadonlyArray<ReadonlyArray<A>> => {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((tail) =>
      [item].concat(tail),
    ),
  );
};

const valueMap = (initial: Store<string>): Map<string, JsonValue> =>
  new Map(initial.cells.map((cell) => [cell.id, cell.value]));

export const serialOrderingsFor = (
  initial: Store<string>,
  history: ReadonlyArray<CommitRecord>,
): ReadonlyArray<ReadonlyArray<string>> => {
  if (!storeCustody.has(initial)) throw new TypeError("store is not handler-custodied");
  return Object.freeze(
    permutations(history).flatMap((ordering) => {
      const state = valueMap(initial);
      for (const record of ordering) {
        if (
          record.reads.some((readValue) => !Object.is(state.get(readValue.id), readValue.value))
        ) {
          return [];
        }
        for (const writeValue of record.writes) state.set(writeValue.id, writeValue.value);
      }
      return [Object.freeze(ordering.map((record) => record.transactionId))];
    }),
  );
};

export const isSeriallyEquivalent = (
  initial: Store<string>,
  history: ReadonlyArray<CommitRecord>,
): boolean => serialOrderingsFor(initial, history).length > 0;
