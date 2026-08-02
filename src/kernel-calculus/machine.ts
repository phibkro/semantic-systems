import type {
  ComputationTerm,
  ComputationType,
  OperationClause,
  OperationSignature,
  ReturnClause,
  ValueTerm,
  ValueType,
} from "./ast.ts";
import {
  requireCheckedProgram,
  valueTypesEqual,
  type CheckedProgram,
  type KernelDiagnostic,
} from "./checker.ts";

export interface EvaluationBounds {
  readonly fuel: number;
  readonly maximumTraceEntries: number;
}

export const defaultEvaluationBounds: EvaluationBounds = Object.freeze({
  fuel: 10_000,
  maximumTraceEntries: 10_000,
});

export type RuntimeValue =
  | { readonly kind: "unit" }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "int"; readonly value: number }
  | { readonly kind: "pair"; readonly first: RuntimeValue; readonly second: RuntimeValue }
  | { readonly kind: "inject-left"; readonly value: RuntimeValue }
  | { readonly kind: "inject-right"; readonly value: RuntimeValue }
  | RuntimeThunk;

export interface RuntimeThunk {
  readonly kind: "thunk";
}

interface RuntimeFunction {
  readonly kind: "function";
}

export type RuntimeResult = RuntimeValue | RuntimeFunction;

interface Environment {
  readonly values: ReadonlyArray<RuntimeValue>;
  readonly resumptions: ReadonlyArray<InternalResumption>;
}

interface ThunkInternals {
  readonly body: ComputationTerm;
  readonly environment: Environment;
  readonly type: Extract<ValueType, { readonly kind: "thunk" }>;
}

interface FunctionInternals {
  readonly body: ComputationTerm;
  readonly environment: Environment;
}

const thunkCustody = new WeakSet<object>();
const sumValueCustody = new WeakSet<object>();
const thunkInternals = new WeakMap<object, ThunkInternals>();
const functionCustody = new WeakSet<object>();
const functionInternals = new WeakMap<object, FunctionInternals>();

class RuntimeThunkImpl implements RuntimeThunk {
  readonly kind = "thunk" as const;

  constructor(internals: ThunkInternals) {
    thunkCustody.add(this);
    thunkInternals.set(this, internals);
    Object.freeze(this);
  }
}

class RuntimeFunctionImpl implements RuntimeFunction {
  readonly kind = "function" as const;

  constructor(internals: FunctionInternals) {
    functionCustody.add(this);
    functionInternals.set(this, internals);
    Object.freeze(this);
  }
}

interface LetFrame {
  readonly kind: "let";
  readonly body: ComputationTerm;
  readonly environment: Environment;
  readonly path: string;
}

interface ApplyFrame {
  readonly kind: "apply";
  readonly argument: ValueTerm;
  readonly environment: Environment;
  readonly path: string;
}

interface HandlerFrame {
  readonly kind: "handler";
  readonly label: string;
  readonly returnClause: ReturnClause;
  readonly operationClauses: ReadonlyArray<OperationClause>;
  readonly environment: Environment;
  readonly path: string;
}

type Frame = LetFrame | ApplyFrame | HandlerFrame;

interface TermControl {
  readonly kind: "term";
  readonly term: ComputationTerm;
  readonly environment: Environment;
  readonly path: string;
}

interface ResultControl {
  readonly kind: "result";
  readonly result: RuntimeResult;
  readonly path: string;
}

type Control = TermControl | ResultControl;

interface Machine {
  readonly control: Control;
  readonly frames: ReadonlyArray<Frame>;
  readonly signature: OperationSignature;
  readonly valueTypes: ReadonlyMap<object, ValueType>;
  readonly nextIdentity: number;
}

interface InternalResumptionState {
  readonly id: string;
  readonly expectedType: ValueType;
  readonly handler: HandlerFrame;
  readonly capturedFrames: ReadonlyArray<Frame>;
}

interface InternalResumption {
  readonly id: string;
}

const internalKnown = new WeakSet<object>();
const internalLive = new WeakSet<object>();
const internalState = new WeakMap<object, InternalResumptionState>();

class InternalResumptionImpl implements InternalResumption {
  readonly id: string;

  constructor(state: InternalResumptionState) {
    this.id = state.id;
    internalKnown.add(this);
    internalLive.add(this);
    internalState.set(this, state);
    Object.freeze(this);
  }
}

const consumeInternalResumption = (token: InternalResumption): boolean => {
  if (!internalLive.has(token)) return false;
  internalLive.delete(token);
  return true;
};

export interface ExternalSuspension {
  readonly id: string;
  readonly resultType: ValueType;
}

interface ExternalSuspensionState {
  readonly machine: Machine;
  readonly trace: ReadonlyArray<MachineTraceEntry>;
}

const externalKnown = new WeakSet<object>();
const externalLive = new WeakSet<object>();
const externalState = new WeakMap<object, ExternalSuspensionState>();

class ExternalSuspensionImpl implements ExternalSuspension {
  readonly id: string;
  readonly resultType: ValueType;

  constructor(id: string, resultType: ValueType, state: ExternalSuspensionState) {
    this.id = id;
    this.resultType = resultType;
    externalKnown.add(this);
    externalLive.add(this);
    externalState.set(this, state);
    Object.freeze(this);
  }
}

export interface MachineTraceEntry {
  readonly step: number;
  readonly rule: string;
  readonly path: string;
  readonly operation?: {
    readonly label: string;
    readonly name: string;
  };
  readonly resumption?: string;
}

export interface MachineSnapshot {
  readonly format: "kernel-machine-v2";
  readonly state: string;
}

const machineSnapshotCustody = new WeakSet<object>();

export interface OperationRequest {
  readonly label: string;
  readonly operation: string;
  readonly argument: RuntimeValue;
  readonly resultType: ValueType;
}

export interface Returned {
  readonly status: "returned";
  readonly value: RuntimeResult;
  readonly trace: ReadonlyArray<MachineTraceEntry>;
}

export interface Suspended {
  readonly status: "suspended";
  readonly request: OperationRequest;
  readonly oneShotToken: ExternalSuspension;
  readonly trace: ReadonlyArray<MachineTraceEntry>;
}

export interface Exhausted {
  readonly status: "exhausted";
  readonly reason: "fuel" | "trace";
  readonly machineSnapshot: MachineSnapshot;
  readonly trace: ReadonlyArray<MachineTraceEntry>;
}

export interface RuntimeRejected {
  readonly status: "runtime-rejected";
  readonly diagnostic: KernelDiagnostic;
  readonly trace: ReadonlyArray<MachineTraceEntry>;
}

export type EvaluationResult = Returned | Suspended | Exhausted | RuntimeRejected;

const evaluationResultCustody = new WeakSet<object>();

const freeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const observedEvaluationResult = <Result extends EvaluationResult>(result: Result): Result => {
  const observation = freeze(result);
  evaluationResultCustody.add(observation);
  return observation;
};

export const isEvaluationResult = (result: unknown): result is EvaluationResult =>
  typeof result === "object" && result !== null && evaluationResultCustody.has(result);

export const runtimeUnit = (): RuntimeValue => freeze({ kind: "unit" });
export const runtimeBool = (value: boolean): RuntimeValue => freeze({ kind: "bool", value });
export const runtimeInt = (value: number): RuntimeValue => freeze({ kind: "int", value });
export const runtimePair = (first: RuntimeValue, second: RuntimeValue): RuntimeValue =>
  freeze({ kind: "pair", first, second });
export const runtimeInjectLeft = (value: RuntimeValue): RuntimeValue => {
  const result: RuntimeValue = freeze({ kind: "inject-left" as const, value });
  sumValueCustody.add(result);
  return result;
};
export const runtimeInjectRight = (value: RuntimeValue): RuntimeValue => {
  const result: RuntimeValue = freeze({ kind: "inject-right" as const, value });
  sumValueCustody.add(result);
  return result;
};
const runtimeDiagnostic = (
  code: string,
  rule: string,
  path: string,
  message: string,
  expected?: unknown,
  actual?: unknown,
): KernelDiagnostic =>
  freeze({
    code,
    rule,
    path,
    message,
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
  });

const rejected = (
  code: string,
  rule: string,
  path: string,
  message: string,
  trace: ReadonlyArray<MachineTraceEntry>,
  expected?: unknown,
  actual?: unknown,
): RuntimeRejected =>
  observedEvaluationResult({
    status: "runtime-rejected",
    diagnostic: runtimeDiagnostic(code, rule, path, message, expected, actual),
    trace,
  });

const operationDeclaration = (signature: OperationSignature, label: string, operation: string) =>
  signature.operations.find(
    (declaration) => declaration.label === label && declaration.operation === operation,
  );

const evaluateValue = (
  term: ValueTerm,
  environment: Environment,
  valueTypes: ReadonlyMap<object, ValueType>,
): RuntimeValue | undefined => {
  switch (term.kind) {
    case "variable":
      return environment.values[term.index];
    case "unit":
      return runtimeUnit();
    case "bool":
      return runtimeBool(term.value);
    case "int":
      return runtimeInt(term.value);
    case "pair": {
      const first = evaluateValue(term.first, environment, valueTypes);
      const second = evaluateValue(term.second, environment, valueTypes);
      return first === undefined || second === undefined ? undefined : runtimePair(first, second);
    }
    case "inject-left": {
      const value = evaluateValue(term.value, environment, valueTypes);
      return value === undefined ? undefined : runtimeInjectLeft(value);
    }
    case "inject-right": {
      const value = evaluateValue(term.value, environment, valueTypes);
      return value === undefined ? undefined : runtimeInjectRight(value);
    }
    case "thunk": {
      const type = valueTypes.get(term);
      return type?.kind === "thunk"
        ? new RuntimeThunkImpl({ body: term.body, environment, type })
        : undefined;
    }
    case "resumption":
      return undefined;
  }
};

const runtimeValueHasType = (value: RuntimeValue, type: ValueType): boolean => {
  switch (type.kind) {
    case "unit":
      return value.kind === "unit";
    case "bool":
      return value.kind === "bool" && typeof value.value === "boolean";
    case "int":
      return value.kind === "int" && Number.isSafeInteger(value.value);
    case "pair":
      return (
        value.kind === "pair" &&
        runtimeValueHasType(value.first, type.first) &&
        runtimeValueHasType(value.second, type.second)
      );
    case "sum":
      return (
        sumValueCustody.has(value) &&
        ((value.kind === "inject-left" && runtimeValueHasType(value.value, type.left)) ||
          (value.kind === "inject-right" && runtimeValueHasType(value.value, type.right)))
      );
    case "thunk":
      if (value.kind !== "thunk" || !thunkCustody.has(value)) return false;
      const internals = thunkInternals.get(value);
      return internals !== undefined && valueTypesEqual(internals.type, type);
  }
};

const snapshotRuntimeValue = (value: RuntimeValue): RuntimeValue | undefined => {
  switch (value.kind) {
    case "unit":
      return runtimeUnit();
    case "bool":
      return typeof value.value === "boolean" ? runtimeBool(value.value) : undefined;
    case "int":
      return Number.isSafeInteger(value.value) ? runtimeInt(value.value) : undefined;
    case "pair": {
      const first = snapshotRuntimeValue(value.first);
      const second = snapshotRuntimeValue(value.second);
      return first === undefined || second === undefined ? undefined : runtimePair(first, second);
    }
    case "inject-left": {
      if (!sumValueCustody.has(value)) return undefined;
      const inner = snapshotRuntimeValue(value.value);
      return inner === undefined ? undefined : runtimeInjectLeft(inner);
    }
    case "inject-right": {
      if (!sumValueCustody.has(value)) return undefined;
      const inner = snapshotRuntimeValue(value.value);
      return inner === undefined ? undefined : runtimeInjectRight(inner);
    }
    case "thunk":
      return thunkCustody.has(value) ? value : undefined;
  }
};

const machineSnapshot = (machine: Machine): MachineSnapshot => {
  type Pending =
    | { readonly kind: "thunk"; readonly id: string; readonly value: RuntimeThunk }
    | { readonly kind: "function"; readonly id: string; readonly value: RuntimeFunction }
    | { readonly kind: "resumption"; readonly id: string; readonly value: InternalResumption };

  const identifiers = new WeakMap<object, string>();
  const pending: Array<Pending> = [];
  const heap: Array<unknown> = [];
  let nextObjectIdentity = 1;

  const reference = (
    kind: Pending["kind"],
    value: RuntimeThunk | RuntimeFunction | InternalResumption,
  ): { readonly ref: string } => {
    const known = identifiers.get(value);
    if (known !== undefined) return { ref: known };
    const id = `object-${nextObjectIdentity}`;
    nextObjectIdentity += 1;
    identifiers.set(value, id);
    pending.push({ kind, id, value } as Pending);
    return { ref: id };
  };

  const snapshotValue = (value: RuntimeValue): unknown => {
    switch (value.kind) {
      case "unit":
        return { kind: "unit" };
      case "bool":
      case "int":
        return { kind: value.kind, value: value.value };
      case "pair":
        return {
          kind: "pair",
          first: snapshotValue(value.first),
          second: snapshotValue(value.second),
        };
      case "inject-left":
      case "inject-right":
        return { kind: value.kind, value: snapshotValue(value.value) };
      case "thunk":
        return { kind: "thunk", ...reference("thunk", value) };
    }
  };

  const snapshotResult = (result: RuntimeResult): unknown =>
    result.kind === "function"
      ? { kind: "function", ...reference("function", result) }
      : snapshotValue(result);

  const snapshotEnvironment = (environment: Environment): unknown => ({
    values: environment.values.map(snapshotValue),
    resumptions: environment.resumptions.map((token) => reference("resumption", token)),
  });

  const snapshotFrame = (frame: Frame): unknown => {
    switch (frame.kind) {
      case "let":
        return {
          kind: "let",
          body: frame.body,
          environment: snapshotEnvironment(frame.environment),
          path: frame.path,
        };
      case "apply":
        return {
          kind: "apply",
          argument: frame.argument,
          environment: snapshotEnvironment(frame.environment),
          path: frame.path,
        };
      case "handler":
        return {
          kind: "handler",
          label: frame.label,
          returnClause: frame.returnClause,
          operationClauses: frame.operationClauses,
          environment: snapshotEnvironment(frame.environment),
          path: frame.path,
        };
    }
  };

  const control =
    machine.control.kind === "term"
      ? {
          kind: "term",
          term: machine.control.term,
          environment: snapshotEnvironment(machine.control.environment),
          path: machine.control.path,
        }
      : {
          kind: "result",
          result: snapshotResult(machine.control.result),
          path: machine.control.path,
        };
  const frames = machine.frames.map(snapshotFrame);

  while (pending.length > 0) {
    const item = pending.shift()!;
    switch (item.kind) {
      case "thunk": {
        const internals = thunkInternals.get(item.value);
        heap.push({
          id: item.id,
          kind: item.kind,
          live: thunkCustody.has(item.value),
          ...(internals === undefined
            ? { invalid: true }
            : {
                type: internals.type,
                body: internals.body,
                environment: snapshotEnvironment(internals.environment),
              }),
        });
        break;
      }
      case "function": {
        const internals = functionInternals.get(item.value);
        heap.push({
          id: item.id,
          kind: item.kind,
          live: functionCustody.has(item.value),
          ...(internals === undefined
            ? { invalid: true }
            : {
                body: internals.body,
                environment: snapshotEnvironment(internals.environment),
              }),
        });
        break;
      }
      case "resumption": {
        const state = internalState.get(item.value);
        heap.push({
          id: item.id,
          kind: item.kind,
          tokenId: item.value.id,
          live: internalLive.has(item.value),
          ...(state === undefined
            ? { invalid: true }
            : {
                expectedType: state.expectedType,
                handler: snapshotFrame(state.handler),
                capturedFrames: state.capturedFrames.map(snapshotFrame),
              }),
        });
        break;
      }
    }
  }

  const state = JSON.stringify({
    control,
    frames,
    signature: machine.signature,
    valueTypes: [...machine.valueTypes].map(([term, type]) => ({ term, type })),
    heap,
    nextResumptionIdentity: machine.nextIdentity,
  });
  const snapshot: MachineSnapshot = { format: "kernel-machine-v2", state };
  machineSnapshotCustody.add(snapshot);
  return freeze(snapshot);
};

const validateBounds = (
  bounds: EvaluationBounds,
  trace: ReadonlyArray<MachineTraceEntry>,
): RuntimeRejected | undefined => {
  if (!Number.isSafeInteger(bounds.fuel) || bounds.fuel < 0) {
    return rejected(
      "bounds.invalid-fuel",
      "machine.bounds",
      "$.bounds.fuel",
      "fuel must be a nonnegative safe integer",
      trace,
    );
  }
  if (!Number.isSafeInteger(bounds.maximumTraceEntries) || bounds.maximumTraceEntries <= 0) {
    return rejected(
      "bounds.invalid-trace",
      "machine.bounds",
      "$.bounds.maximumTraceEntries",
      "maximumTraceEntries must be a positive safe integer",
      trace,
    );
  }
  return undefined;
};

interface Transition {
  readonly machine?: Machine;
  readonly terminal?: EvaluationResult;
  readonly rule: string;
  readonly path: string;
  readonly operation?: { readonly label: string; readonly name: string };
  readonly resumption?: string;
}

const transition = (machine: Machine): Transition => {
  const control = machine.control;
  if (control.kind === "result") {
    const frame = machine.frames.at(-1);
    if (frame === undefined) {
      return {
        terminal: observedEvaluationResult({
          status: "returned",
          value: control.result,
          trace: freeze([]),
        }),
        rule: "machine.return",
        path: control.path,
      };
    }
    const outerFrames = machine.frames.slice(0, -1);
    switch (frame.kind) {
      case "let":
        if (control.result.kind === "function") {
          return {
            terminal: rejected(
              "runtime.expected-value",
              "machine.let",
              frame.path,
              "let received a function computation instead of a value",
              [],
            ),
            rule: "runtime.reject",
            path: frame.path,
          };
        }
        return {
          machine: {
            ...machine,
            control: {
              kind: "term",
              term: frame.body,
              environment: {
                values: [control.result, ...frame.environment.values],
                resumptions: frame.environment.resumptions,
              },
              path: `${frame.path}.body`,
            },
            frames: outerFrames,
          },
          rule: "machine.let-bind",
          path: frame.path,
        };
      case "apply": {
        if (control.result.kind !== "function" || !functionCustody.has(control.result)) {
          return {
            terminal: rejected(
              "runtime.expected-function",
              "machine.apply",
              frame.path,
              "apply received a non-function computation",
              [],
            ),
            rule: "runtime.reject",
            path: frame.path,
          };
        }
        const argument = evaluateValue(frame.argument, frame.environment, machine.valueTypes);
        const internals = functionInternals.get(control.result);
        if (argument === undefined || internals === undefined) {
          return {
            terminal: rejected(
              "runtime.invalid-closure",
              "machine.apply",
              frame.path,
              "function application crossed an invalid runtime boundary",
              [],
            ),
            rule: "runtime.reject",
            path: frame.path,
          };
        }
        return {
          machine: {
            ...machine,
            control: {
              kind: "term",
              term: internals.body,
              environment: {
                values: [argument, ...internals.environment.values],
                resumptions: internals.environment.resumptions,
              },
              path: `${frame.path}.body`,
            },
            frames: outerFrames,
          },
          rule: "machine.apply-bind",
          path: frame.path,
        };
      }
      case "handler":
        if (control.result.kind === "function") {
          return {
            terminal: rejected(
              "runtime.expected-value",
              "machine.handler-return",
              frame.path,
              "handler received a function computation instead of a returned value",
              [],
            ),
            rule: "runtime.reject",
            path: frame.path,
          };
        }
        return {
          machine: {
            ...machine,
            control: {
              kind: "term",
              term: frame.returnClause.body,
              environment: {
                values: [control.result, ...frame.environment.values],
                resumptions: frame.environment.resumptions,
              },
              path: `${frame.path}.returnClause.body`,
            },
            frames: outerFrames,
          },
          rule: "handler.return",
          path: frame.path,
        };
    }
  }

  const term = control.term;
  switch (term.kind) {
    case "return": {
      const value = evaluateValue(term.value, control.environment, machine.valueTypes);
      return value === undefined
        ? {
            terminal: rejected(
              "runtime.invalid-value",
              "machine.return",
              control.path,
              "return value could not be evaluated",
              [],
            ),
            rule: "runtime.reject",
            path: control.path,
          }
        : {
            machine: {
              ...machine,
              control: { kind: "result", result: value, path: control.path },
            },
            rule: "computation.return",
            path: control.path,
          };
    }
    case "let":
      return {
        machine: {
          ...machine,
          control: {
            kind: "term",
            term: term.bound,
            environment: control.environment,
            path: `${control.path}.bound`,
          },
          frames: [
            ...machine.frames,
            {
              kind: "let",
              body: term.body,
              environment: control.environment,
              path: control.path,
            },
          ],
        },
        rule: "computation.let",
        path: control.path,
      };
    case "force": {
      const value = evaluateValue(term.value, control.environment, machine.valueTypes);
      const internals =
        value !== undefined && value.kind === "thunk" && thunkCustody.has(value)
          ? thunkInternals.get(value)
          : undefined;
      return internals === undefined
        ? {
            terminal: rejected(
              "runtime.expected-thunk",
              "machine.force",
              control.path,
              "force received an invalid thunk",
              [],
            ),
            rule: "runtime.reject",
            path: control.path,
          }
        : {
            machine: {
              ...machine,
              control: {
                kind: "term",
                term: internals.body,
                environment: internals.environment,
                path: `${control.path}.thunk`,
              },
            },
            rule: "computation.force",
            path: control.path,
          };
    }
    case "case": {
      const value = evaluateValue(term.value, control.environment, machine.valueTypes);
      if (value === undefined) {
        return {
          terminal: rejected(
            "runtime.invalid-value",
            "machine.case",
            control.path,
            "case scrutinee could not be evaluated",
            [],
          ),
          rule: "runtime.reject",
          path: control.path,
        };
      }
      if (
        (value.kind === "inject-left" || value.kind === "inject-right") &&
        !sumValueCustody.has(value)
      ) {
        return {
          terminal: rejected(
            "runtime.expected-sum",
            "machine.case",
            control.path,
            "case received an invalid sum runtime value",
            [],
          ),
          rule: "runtime.reject",
          path: control.path,
        };
      }
      if (value.kind === "inject-left") {
        return {
          machine: {
            ...machine,
            control: {
              kind: "term",
              term: term.leftBranch,
              environment: {
                values: [value.value, ...control.environment.values],
                resumptions: control.environment.resumptions,
              },
              path: `${control.path}.leftBranch`,
            },
          },
          rule: "computation.case-left",
          path: control.path,
        };
      }
      if (value.kind === "inject-right") {
        return {
          machine: {
            ...machine,
            control: {
              kind: "term",
              term: term.rightBranch,
              environment: {
                values: [value.value, ...control.environment.values],
                resumptions: control.environment.resumptions,
              },
              path: `${control.path}.rightBranch`,
            },
          },
          rule: "computation.case-right",
          path: control.path,
        };
      }
      return {
        terminal: rejected(
          "runtime.expected-sum",
          "machine.case",
          control.path,
          "case received a non-sum runtime value",
          [],
        ),
        rule: "runtime.reject",
        path: control.path,
      };
    }
    case "lambda":
      return {
        machine: {
          ...machine,
          control: {
            kind: "result",
            result: new RuntimeFunctionImpl({
              body: term.body,
              environment: control.environment,
            }),
            path: control.path,
          },
        },
        rule: "computation.lambda",
        path: control.path,
      };
    case "apply":
      return {
        machine: {
          ...machine,
          control: {
            kind: "term",
            term: term.computation,
            environment: control.environment,
            path: `${control.path}.computation`,
          },
          frames: [
            ...machine.frames,
            {
              kind: "apply",
              argument: term.argument,
              environment: control.environment,
              path: control.path,
            },
          ],
        },
        rule: "computation.apply",
        path: control.path,
      };
    case "operation": {
      const argument = evaluateValue(term.argument, control.environment, machine.valueTypes);
      const declaration = operationDeclaration(machine.signature, term.label, term.operation);
      if (argument === undefined || declaration === undefined) {
        return {
          terminal: rejected(
            "runtime.invalid-operation",
            "machine.operation",
            control.path,
            "operation crossed an invalid checked-program boundary",
            [],
          ),
          rule: "runtime.reject",
          path: control.path,
        };
      }
      let handlerIndex = -1;
      for (let index = machine.frames.length - 1; index >= 0; index -= 1) {
        const frame = machine.frames[index]!;
        if (frame.kind === "handler" && frame.label === term.label) {
          handlerIndex = index;
          break;
        }
      }
      const id = `resumption-${machine.nextIdentity}`;
      if (handlerIndex < 0) {
        const tokenMachine: Machine = {
          ...machine,
          control: { kind: "result", result: runtimeUnit(), path: control.path },
          nextIdentity: machine.nextIdentity + 1,
        };
        const token = new ExternalSuspensionImpl(id, declaration.resultType, {
          machine: tokenMachine,
          trace: freeze([]),
        });
        return {
          terminal: observedEvaluationResult({
            status: "suspended",
            request: freeze({
              label: term.label,
              operation: term.operation,
              argument,
              resultType: declaration.resultType,
            }),
            oneShotToken: token,
            trace: freeze([]),
          }),
          rule: "operation.suspend",
          path: control.path,
          operation: { label: term.label, name: term.operation },
          resumption: id,
        };
      }
      const handler = machine.frames[handlerIndex] as HandlerFrame;
      const clause = handler.operationClauses.find(
        (candidate) => candidate.operation === term.operation,
      );
      if (clause === undefined) {
        return {
          terminal: rejected(
            "runtime.missing-handler-clause",
            "machine.operation",
            control.path,
            "checked handler has no matching operation clause",
            [],
          ),
          rule: "runtime.reject",
          path: control.path,
        };
      }
      const token = new InternalResumptionImpl({
        id,
        expectedType: declaration.resultType,
        handler,
        capturedFrames: machine.frames.slice(handlerIndex + 1),
      });
      return {
        machine: {
          ...machine,
          control: {
            kind: "term",
            term: clause.body,
            environment: {
              values: [argument, ...handler.environment.values],
              resumptions: [token, ...handler.environment.resumptions],
            },
            path: `${handler.path}.operationClauses.${term.operation}`,
          },
          frames: machine.frames.slice(0, handlerIndex),
          nextIdentity: machine.nextIdentity + 1,
        },
        rule: "operation.handle",
        path: control.path,
        operation: { label: term.label, name: term.operation },
        resumption: id,
      };
    }
    case "handle":
      return {
        machine: {
          ...machine,
          control: {
            kind: "term",
            term: term.computation,
            environment: control.environment,
            path: `${control.path}.computation`,
          },
          frames: [
            ...machine.frames,
            {
              kind: "handler",
              label: term.label,
              returnClause: term.returnClause,
              operationClauses: term.operationClauses,
              environment: control.environment,
              path: control.path,
            },
          ],
        },
        rule: "handler.install",
        path: control.path,
      };
    case "resume": {
      const token = control.environment.resumptions[term.resumption];
      const value = evaluateValue(term.value, control.environment, machine.valueTypes);
      if (
        token === undefined ||
        !internalKnown.has(token) ||
        value === undefined ||
        internalState.get(token) === undefined
      ) {
        return {
          terminal: rejected(
            "runtime.invalid-resumption",
            "machine.resume",
            control.path,
            "resume crossed an invalid internal resumption boundary",
            [],
          ),
          rule: "runtime.reject",
          path: control.path,
        };
      }
      const state = internalState.get(token)!;
      if (!runtimeValueHasType(value, state.expectedType)) {
        return {
          terminal: rejected(
            "resumption.result-type-mismatch",
            "machine.resume",
            control.path,
            "internal resumption value has the wrong type",
            [],
          ),
          rule: "runtime.reject",
          path: control.path,
          resumption: token.id,
        };
      }
      if (!consumeInternalResumption(token)) {
        return {
          terminal: rejected(
            "resumption.already-used",
            "machine.resume",
            control.path,
            "internal resumption token was already consumed",
            [],
          ),
          rule: "runtime.reject",
          path: control.path,
          resumption: token.id,
        };
      }
      return {
        machine: {
          ...machine,
          control: { kind: "result", result: value, path: control.path },
          frames: [...machine.frames, state.handler, ...state.capturedFrames],
        },
        rule: "resumption.consume",
        path: control.path,
        resumption: token.id,
      };
    }
  }
};

/**
 * Exercises the same internal custody gate used by `resume` transitions without
 * exposing a token or constructor from the documented public entry point.
 *
 * @internal Test evidence only.
 */
export const observeInternalResumptionOneShotForTest = (): ReadonlyArray<
  "consumed" | "resumption.already-used"
> => {
  const environment: Environment = { values: [], resumptions: [] };
  const handler: HandlerFrame = {
    kind: "handler",
    label: "test",
    returnClause: {
      body: { kind: "return", grade: "1", value: { kind: "unit" } },
    },
    operationClauses: [],
    environment,
    path: "$.test",
  };
  const token = new InternalResumptionImpl({
    id: "resumption-test",
    expectedType: { kind: "unit" },
    handler,
    capturedFrames: [],
  });
  return freeze([
    consumeInternalResumption(token) ? "consumed" : "resumption.already-used",
    consumeInternalResumption(token) ? "consumed" : "resumption.already-used",
  ]);
};

const runMachine = (
  initial: Machine,
  bounds: EvaluationBounds,
  initialTrace: ReadonlyArray<MachineTraceEntry> = [],
): EvaluationResult => {
  const invalid = validateBounds(bounds, initialTrace);
  if (invalid !== undefined) return invalid;
  let machine = initial;
  let fuel = bounds.fuel;
  const trace = [...initialTrace];
  while (true) {
    if (fuel === 0) {
      return observedEvaluationResult({
        status: "exhausted",
        reason: "fuel",
        machineSnapshot: machineSnapshot(machine),
        trace: freeze(trace),
      });
    }
    if (trace.length >= bounds.maximumTraceEntries) {
      return observedEvaluationResult({
        status: "exhausted",
        reason: "trace",
        machineSnapshot: machineSnapshot(machine),
        trace: freeze(trace),
      });
    }
    const next = transition(machine);
    const entry: MachineTraceEntry = freeze({
      step: trace.length,
      rule: next.rule,
      path: next.path,
      ...(next.operation === undefined ? {} : { operation: next.operation }),
      ...(next.resumption === undefined ? {} : { resumption: next.resumption }),
    });
    trace.push(entry);
    fuel -= 1;
    if (next.terminal !== undefined) {
      if (next.terminal.status === "returned") {
        return observedEvaluationResult({ ...next.terminal, trace: freeze(trace) });
      }
      if (next.terminal.status === "suspended") {
        const token = next.terminal.oneShotToken;
        const state = externalState.get(token);
        if (state !== undefined) {
          externalState.set(token, { machine: state.machine, trace: freeze(trace) });
        }
        return observedEvaluationResult({ ...next.terminal, trace: freeze(trace) });
      }
      if (next.terminal.status === "runtime-rejected") {
        return observedEvaluationResult({ ...next.terminal, trace: freeze(trace) });
      }
      return next.terminal;
    }
    machine = next.machine!;
  }
};

export const evaluate = (
  program: CheckedProgram,
  bounds: EvaluationBounds = defaultEvaluationBounds,
): EvaluationResult => {
  const internals = requireCheckedProgram(program);
  if (internals === undefined) {
    return rejected(
      "checked-program.required",
      "machine.entry",
      "$",
      "evaluate requires a checked program in private custody",
      [],
    );
  }
  return runMachine(
    {
      control: {
        kind: "term",
        term: internals.term,
        environment: { values: [], resumptions: [] },
        path: "$",
      },
      frames: [],
      signature: internals.signature,
      valueTypes: internals.valueTypes,
      nextIdentity: 1,
    },
    bounds,
  );
};

export const resume = (
  token: ExternalSuspension,
  value: RuntimeValue,
  bounds: EvaluationBounds = defaultEvaluationBounds,
): EvaluationResult => {
  if (
    typeof token !== "object" ||
    token === null ||
    !externalKnown.has(token) ||
    externalState.get(token) === undefined
  ) {
    return rejected(
      "resumption.not-custodied",
      "machine.external-resume",
      "$",
      "resume requires an external suspension token in private custody",
      [],
    );
  }
  const state = externalState.get(token)!;
  let ownedValue: RuntimeValue | undefined;
  try {
    ownedValue = isRuntimeValue(value) ? snapshotRuntimeValue(value) : undefined;
  } catch {
    ownedValue = undefined;
  }
  if (ownedValue === undefined || !runtimeValueHasType(ownedValue, token.resultType)) {
    return rejected(
      "resumption.result-type-mismatch",
      "machine.external-resume",
      "$.value",
      "external resumption value does not match the declared operation result type",
      state.trace,
      token.resultType,
      ownedValue,
    );
  }
  if (!externalLive.has(token)) {
    return rejected(
      "resumption.already-used",
      "machine.external-resume",
      "$",
      "external suspension token was already consumed",
      state.trace,
    );
  }
  externalLive.delete(token);
  return runMachine(
    {
      ...state.machine,
      control: {
        kind: "result",
        result: ownedValue,
        path: state.machine.control.path,
      },
    },
    bounds,
    state.trace,
  );
};

const exactDataFields = (
  value: object,
  fields: ReadonlyArray<string>,
): Readonly<Record<string, PropertyDescriptor>> | undefined => {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Object.getOwnPropertySymbols(value).length !== 0 ||
      Object.keys(descriptors).length !== fields.length ||
      fields.some((field) => !("value" in (descriptors[field] ?? {}))) ||
      Object.keys(descriptors).some((field) => !fields.includes(field))
    ) {
      return undefined;
    }
    return descriptors;
  } catch {
    return undefined;
  }
};

interface RuntimeValueInspection {
  readonly active: WeakSet<object>;
  nodes: number;
}

const isRuntimeValueWithinBounds = (
  value: unknown,
  inspection: RuntimeValueInspection,
  depth: number,
): value is RuntimeValue => {
  if (typeof value !== "object" || value === null) return false;
  inspection.nodes += 1;
  if (inspection.nodes > 4_096 || depth > 64 || inspection.active.has(value)) return false;
  let kindDescriptor: PropertyDescriptor | undefined;
  try {
    kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
  } catch {
    return false;
  }
  if (kindDescriptor === undefined || !("value" in kindDescriptor)) return false;
  switch (kindDescriptor.value) {
    case "unit":
      return exactDataFields(value, ["kind"]) !== undefined;
    case "bool": {
      const fields = exactDataFields(value, ["kind", "value"]);
      return fields !== undefined && typeof fields["value"]!.value === "boolean";
    }
    case "int": {
      const fields = exactDataFields(value, ["kind", "value"]);
      return fields !== undefined && Number.isSafeInteger(fields["value"]!.value);
    }
    case "pair": {
      const fields = exactDataFields(value, ["kind", "first", "second"]);
      if (fields === undefined) return false;
      inspection.active.add(value);
      const valid =
        isRuntimeValueWithinBounds(fields["first"]!.value, inspection, depth + 1) &&
        isRuntimeValueWithinBounds(fields["second"]!.value, inspection, depth + 1);
      inspection.active.delete(value);
      return valid;
    }
    case "inject-left":
    case "inject-right": {
      if (!sumValueCustody.has(value)) return false;
      const fields = exactDataFields(value, ["kind", "value"]);
      if (fields === undefined) return false;
      inspection.active.add(value);
      const valid = isRuntimeValueWithinBounds(fields["value"]!.value, inspection, depth + 1);
      inspection.active.delete(value);
      return valid;
    }
    case "thunk":
      return exactDataFields(value, ["kind"]) !== undefined && thunkCustody.has(value);
    default:
      return false;
  }
};

export const isRuntimeValue = (value: unknown): value is RuntimeValue =>
  isRuntimeValueWithinBounds(value, { active: new WeakSet<object>(), nodes: 0 }, 0);

export const isRuntimeThunk = (value: unknown): value is RuntimeThunk =>
  typeof value === "object" &&
  value !== null &&
  (value as { readonly kind?: unknown }).kind === "thunk" &&
  thunkCustody.has(value);

export const isRuntimeResult = (value: unknown): value is RuntimeResult =>
  isRuntimeValue(value) ||
  (typeof value === "object" &&
    value !== null &&
    exactDataFields(value, ["kind"])?.["kind"]?.value === "function" &&
    functionCustody.has(value));

export const isExternalSuspension = (value: unknown): value is ExternalSuspension =>
  typeof value === "object" &&
  value !== null &&
  externalKnown.has(value) &&
  externalState.get(value) !== undefined;

export const isMachineSnapshot = (value: unknown): value is MachineSnapshot => {
  return (
    typeof value === "object" &&
    value !== null &&
    machineSnapshotCustody.has(value) &&
    (value as { readonly format?: unknown }).format === "kernel-machine-v2" &&
    typeof (value as { readonly state?: unknown }).state === "string"
  );
};

export const computationResultType = (program: CheckedProgram): ComputationType | undefined =>
  requireCheckedProgram(program) === undefined ? undefined : program.type;
