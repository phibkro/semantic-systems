/** Independent iterative VM for the closed source-free instruction graph. */
import { Data, Effect } from "effect";
import type { ExternalObservationValue } from "../kernel-execution/external-observations.ts";
import type {
  ObservableOperationRequest,
  ObservableRuntimeResult,
  ObservableRuntimeValue,
  ObservableValueType,
} from "../kernel-interpreter/schema.ts";
import { isCompiledRuntimeAuthority } from "./custody.ts";
import type { Constant, InstructionGraph, VmSlot } from "./instruction.ts";
import type { KernelBytecodeBounds } from "./schema.ts";

export class BytecodeVmFailure extends Data.TaggedError("BytecodeVmFailure")<{
  readonly code: string;
  readonly message: string;
}> {}

export class BytecodeVmInconclusive extends Data.TaggedError("BytecodeVmInconclusive")<{
  readonly reason: "fuel" | "trace";
}> {}

export type BytecodeVmError = BytecodeVmFailure | BytecodeVmInconclusive;

export class BytecodeVmResumeFailure extends Data.TaggedError("BytecodeVmResumeFailure")<{
  readonly applied: boolean;
  readonly error: BytecodeVmError;
}> {}

type RuntimeValue =
  | { readonly kind: "unit" }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "int"; readonly value: number }
  | { readonly kind: "pair"; readonly first: RuntimeValue; readonly second: RuntimeValue }
  | RuntimeThunk;

interface RuntimeThunk {
  readonly kind: "thunk";
  readonly entryBlock: number;
  readonly locals: ReadonlyMap<VmSlot, RuntimeBinding>;
}

interface RuntimeFunction {
  readonly kind: "function";
  readonly entryBlock: number;
  readonly parameterSlot: VmSlot;
  readonly locals: ReadonlyMap<VmSlot, RuntimeBinding>;
}

type RuntimeResult = RuntimeValue | RuntimeFunction;

interface InternalResumption {
  readonly expectedType: ObservableValueType;
  readonly continuation: ReturnFrame;
  readonly handler: HandlerFrame;
  readonly capturedFrames: ReadonlyArray<ContinuationFrame>;
}

type RuntimeBinding = RuntimeValue | InternalResumption;

interface ReturnFrame {
  readonly kind: "return";
  readonly block: number;
  readonly programCounter: number;
  readonly locals: ReadonlyMap<VmSlot, RuntimeBinding>;
  readonly operandStack: ReadonlyArray<RuntimeResult>;
}

interface HandlerFrame {
  readonly kind: "handler";
  readonly label: string;
  readonly returnBlock: number;
  readonly returnSlot: VmSlot;
  readonly clauses: ReadonlyArray<{
    readonly operation: string;
    readonly entryBlock: number;
    readonly argumentSlot: VmSlot;
    readonly resumptionSlot: VmSlot;
  }>;
  readonly locals: ReadonlyMap<VmSlot, RuntimeBinding>;
  readonly operandStack: ReadonlyArray<RuntimeResult>;
}

type ContinuationFrame = ReturnFrame | HandlerFrame;

interface Machine {
  block: number;
  programCounter: number;
  locals: Map<VmSlot, RuntimeBinding>;
  operandStack: Array<RuntimeResult>;
  continuationStack: Array<ContinuationFrame>;
  fuel: number;
  traceEntries: number;
}

export interface BytecodeExternalSuspension {
  readonly resultType: ObservableValueType;
}

interface BytecodeExternalSuspensionState {
  readonly owner: object;
  readonly graph: InstructionGraph;
  readonly machine: Machine;
}

const knownExternalSuspensions = new WeakSet<object>();
const liveExternalSuspensions = new WeakSet<object>();
const externalSuspensionState = new WeakMap<object, BytecodeExternalSuspensionState>();

class BytecodeExternalSuspensionImpl implements BytecodeExternalSuspension {
  readonly resultType: ObservableValueType;

  constructor(resultType: ObservableValueType, state: BytecodeExternalSuspensionState) {
    this.resultType = resultType;
    knownExternalSuspensions.add(this);
    liveExternalSuspensions.add(this);
    externalSuspensionState.set(this, state);
    Object.freeze(this);
  }
}

export interface BytecodeVmReturned {
  readonly status: "returned";
  readonly value: ObservableRuntimeResult;
}

export interface BytecodeVmSuspended {
  readonly status: "suspended";
  readonly request: ObservableOperationRequest;
  readonly oneShotToken: BytecodeExternalSuspension;
}

export type BytecodeVmOutcome = BytecodeVmReturned | BytecodeVmSuspended;

type InternalResult =
  | { readonly status: "returned"; readonly value: ObservableRuntimeResult }
  | {
      readonly status: "suspended";
      readonly request: ObservableOperationRequest;
      readonly oneShotToken: BytecodeExternalSuspension;
    }
  | { readonly status: "failed"; readonly error: BytecodeVmError };

const liveResumptions = new WeakSet<object>();

const freeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const failure = (code: string, message: string): InternalResult => ({
  status: "failed",
  error: new BytecodeVmFailure({ code, message }),
});

const observableValue = (value: RuntimeValue): ObservableRuntimeValue => {
  switch (value.kind) {
    case "unit":
    case "thunk":
      return { kind: value.kind };
    case "bool":
      return { kind: "bool", value: value.value };
    case "int":
      return { kind: "int", value: value.value };
    case "pair":
      return {
        kind: "pair",
        first: observableValue(value.first),
        second: observableValue(value.second),
      };
  }
};

const observableResult = (value: RuntimeResult): ObservableRuntimeResult =>
  value.kind === "function" ? { kind: "function" } : observableValue(value);

const capturedLocals = (
  slots: ReadonlyArray<VmSlot>,
  locals: ReadonlyMap<VmSlot, RuntimeBinding>,
): Map<VmSlot, RuntimeBinding> | undefined => {
  const captured = new Map<VmSlot, RuntimeBinding>();
  for (const slot of slots) {
    const value = locals.get(slot);
    if (value === undefined) return undefined;
    captured.set(slot, value);
  }
  return captured;
};

const constantAt = (graph: InstructionGraph, slot: number): Constant | undefined =>
  Number.isSafeInteger(slot) && slot >= 0 ? graph.constants[slot] : undefined;

const textConstantAt = (graph: InstructionGraph, slot: number): string | undefined => {
  const constant = constantAt(graph, slot);
  return constant?.kind === "TextConstant" ? constant.value : undefined;
};

const valueTypeConstantAt = (
  graph: InstructionGraph,
  slot: number,
): ObservableValueType | undefined => {
  const constant = constantAt(graph, slot);
  return constant?.kind === "ObservableTypeConstant" &&
    !["return", "function"].includes(constant.descriptor.kind)
    ? (constant.descriptor as ObservableValueType)
    : undefined;
};

const runtimeValueHasType = (value: RuntimeValue, type: ObservableValueType): boolean => {
  switch (type.kind) {
    case "unit":
      return value.kind === "unit";
    case "bool":
      return value.kind === "bool";
    case "int":
      return value.kind === "int";
    case "pair":
      return (
        value.kind === "pair" &&
        runtimeValueHasType(value.first, type.first) &&
        runtimeValueHasType(value.second, type.second)
      );
    case "thunk":
      return value.kind === "thunk";
  }
};

const cloneMachine = (machine: Machine): Machine => ({
  block: machine.block,
  programCounter: machine.programCounter,
  locals: new Map(machine.locals),
  operandStack: [...machine.operandStack],
  continuationStack: [...machine.continuationStack],
  fuel: machine.fuel,
  traceEntries: machine.traceEntries,
});

const runMachine = (
  graph: InstructionGraph,
  bounds: KernelBytecodeBounds,
  machine: Machine,
  owner: object,
): InternalResult => {
  const pushOperand = (value: RuntimeResult): InternalResult | undefined => {
    if (machine.operandStack.length >= bounds.maximumOperandStackDepth) {
      return failure(
        "bytecode.vm.operand-stack-exceeded",
        "VM operand stack capacity was exceeded",
      );
    }
    machine.operandStack.push(value);
    return undefined;
  };

  const pushContinuation = (frame: ContinuationFrame): InternalResult | undefined => {
    if (machine.continuationStack.length >= bounds.maximumContinuationDepth) {
      return failure(
        "bytecode.vm.continuation-stack-exceeded",
        "VM continuation stack capacity was exceeded",
      );
    }
    machine.continuationStack.push(frame);
    return undefined;
  };

  while (true) {
    if (machine.fuel === 0) {
      return {
        status: "failed",
        error: new BytecodeVmInconclusive({ reason: "fuel" }),
      };
    }
    if (machine.traceEntries >= bounds.maximumTraceEntries) {
      return {
        status: "failed",
        error: new BytecodeVmInconclusive({ reason: "trace" }),
      };
    }

    const block = graph.blocks[machine.block];
    const instruction = block?.instructions[machine.programCounter];
    if (instruction === undefined) {
      return failure("bytecode.vm.invalid-program-counter", "VM selected an unknown instruction");
    }

    machine.fuel -= 1;
    machine.traceEntries += 1;
    machine.programCounter += 1;

    switch (instruction.kind) {
      case "PushUnit": {
        const rejected = pushOperand(freeze({ kind: "unit" }));
        if (rejected !== undefined) return rejected;
        break;
      }
      case "PushBool": {
        const constant = constantAt(graph, instruction.constantSlot);
        if (constant?.kind !== "BoolConstant") {
          return failure(
            "bytecode.vm.invalid-constant",
            "PushBool selected a non-boolean constant",
          );
        }
        const rejected = pushOperand(freeze({ kind: "bool", value: constant.value }));
        if (rejected !== undefined) return rejected;
        break;
      }
      case "PushInt": {
        const constant = constantAt(graph, instruction.constantSlot);
        if (constant?.kind !== "IntConstant") {
          return failure("bytecode.vm.invalid-constant", "PushInt selected a non-integer constant");
        }
        const rejected = pushOperand(freeze({ kind: "int", value: constant.value }));
        if (rejected !== undefined) return rejected;
        break;
      }
      case "LoadSlot": {
        const value = machine.locals.get(instruction.slot);
        if (value === undefined || !("kind" in value)) {
          return failure("bytecode.vm.invalid-slot", "LoadSlot selected an unbound VM slot");
        }
        const rejected = pushOperand(value);
        if (rejected !== undefined) return rejected;
        break;
      }
      case "BindSlot": {
        const value = machine.operandStack.pop();
        if (value === undefined || value.kind === "function") {
          return failure("bytecode.vm.expected-value", "BindSlot requires a runtime value");
        }
        machine.locals.set(instruction.slot, value);
        break;
      }
      case "MakePair": {
        const second = machine.operandStack.pop();
        const first = machine.operandStack.pop();
        if (
          first === undefined ||
          second === undefined ||
          first.kind === "function" ||
          second.kind === "function"
        ) {
          return failure("bytecode.vm.expected-value", "MakePair requires two runtime values");
        }
        const rejected = pushOperand(freeze({ kind: "pair", first, second }));
        if (rejected !== undefined) return rejected;
        break;
      }
      case "MakeThunk": {
        const locals = capturedLocals(instruction.capturedSlots, machine.locals);
        if (locals === undefined) {
          return failure("bytecode.vm.invalid-slot", "MakeThunk selected an unbound capture slot");
        }
        const rejected = pushOperand(
          freeze({ kind: "thunk", entryBlock: instruction.entryBlock, locals }),
        );
        if (rejected !== undefined) return rejected;
        break;
      }
      case "Force": {
        const value = machine.operandStack.pop();
        if (value?.kind !== "thunk") {
          return failure("bytecode.vm.expected-thunk", "Force requires a runtime thunk");
        }
        const rejected = pushContinuation({
          kind: "return",
          block: machine.block,
          programCounter: machine.programCounter,
          locals: machine.locals,
          operandStack: machine.operandStack,
        });
        if (rejected !== undefined) return rejected;
        machine.block = value.entryBlock;
        machine.programCounter = 0;
        machine.locals = new Map(value.locals);
        machine.operandStack = [];
        break;
      }
      case "MakeFunction": {
        const locals = capturedLocals(instruction.capturedSlots, machine.locals);
        if (locals === undefined) {
          return failure(
            "bytecode.vm.invalid-slot",
            "MakeFunction selected an unbound capture slot",
          );
        }
        const rejected = pushOperand(
          freeze({
            kind: "function",
            entryBlock: instruction.entryBlock,
            parameterSlot: instruction.parameterSlot,
            locals,
          }),
        );
        if (rejected !== undefined) return rejected;
        break;
      }
      case "Call": {
        const argument = machine.operandStack.pop();
        const callable = machine.operandStack.pop();
        if (
          argument === undefined ||
          argument.kind === "function" ||
          callable?.kind !== "function"
        ) {
          return failure("bytecode.vm.expected-function", "Call requires a function and value");
        }
        const rejected = pushContinuation({
          kind: "return",
          block: machine.block,
          programCounter: machine.programCounter,
          locals: machine.locals,
          operandStack: machine.operandStack,
        });
        if (rejected !== undefined) return rejected;
        machine.block = callable.entryBlock;
        machine.programCounter = 0;
        machine.locals = new Map(callable.locals);
        machine.locals.set(callable.parameterSlot, argument);
        machine.operandStack = [];
        break;
      }
      case "Jump":
        machine.block = instruction.targetBlock;
        machine.programCounter = 0;
        break;
      case "EnterHandler": {
        const label = textConstantAt(graph, instruction.labelConstantSlot);
        const clauses = instruction.clauses.map((clause) => ({
          operation: textConstantAt(graph, clause.operationConstantSlot),
          entryBlock: clause.entryBlock,
          argumentSlot: clause.argumentSlot,
          resumptionSlot: clause.resumptionSlot,
        }));
        if (label === undefined || clauses.some((clause) => clause.operation === undefined)) {
          return failure(
            "bytecode.vm.invalid-constant",
            "EnterHandler selected a non-text label or operation constant",
          );
        }
        const rejected = pushContinuation({
          kind: "handler",
          label,
          returnBlock: instruction.returnBlock,
          returnSlot: instruction.returnSlot,
          clauses: clauses as HandlerFrame["clauses"],
          locals: new Map(machine.locals),
          operandStack: [...machine.operandStack],
        });
        if (rejected !== undefined) return rejected;
        break;
      }
      case "LeaveHandler": {
        const result = machine.operandStack.at(-1);
        const handler = machine.continuationStack.at(-1);
        if (result === undefined || result.kind === "function" || handler?.kind !== "handler") {
          return failure(
            "bytecode.vm.invalid-handler-boundary",
            "LeaveHandler crossed an invalid handler boundary",
          );
        }
        const returnFrame: ReturnFrame = {
          kind: "return",
          block: machine.block,
          programCounter: machine.programCounter,
          locals: handler.locals,
          operandStack: handler.operandStack,
        };
        machine.operandStack.pop();
        machine.continuationStack[machine.continuationStack.length - 1] = returnFrame;
        machine.block = handler.returnBlock;
        machine.programCounter = 0;
        machine.locals = new Map(handler.locals);
        machine.locals.set(handler.returnSlot, result);
        machine.operandStack = [];
        break;
      }
      case "Request": {
        const label = textConstantAt(graph, instruction.labelConstantSlot);
        const operation = textConstantAt(graph, instruction.operationConstantSlot);
        const resultType = valueTypeConstantAt(graph, instruction.resultTypeConstantSlot);
        const argument = machine.operandStack.at(-1);
        if (
          label === undefined ||
          operation === undefined ||
          resultType === undefined ||
          argument === undefined ||
          argument.kind === "function"
        ) {
          return failure(
            "bytecode.vm.invalid-request",
            "Request crossed an invalid compiled operation boundary",
          );
        }
        let handlerIndex = -1;
        for (let index = machine.continuationStack.length - 1; index >= 0; index -= 1) {
          const frame = machine.continuationStack[index];
          if (frame?.kind === "handler" && frame.label === label) {
            handlerIndex = index;
            break;
          }
        }
        if (handlerIndex < 0) {
          machine.operandStack.pop();
          const request = freeze({
            label,
            operation,
            argument: observableValue(argument),
            result_type: resultType,
          });
          const oneShotToken = new BytecodeExternalSuspensionImpl(resultType, {
            owner,
            graph,
            machine: cloneMachine(machine),
          });
          return {
            status: "suspended",
            request,
            oneShotToken,
          };
        }
        const handler = machine.continuationStack[handlerIndex];
        if (handler?.kind !== "handler") {
          return failure("bytecode.vm.invalid-handler-boundary", "Request lost its handler");
        }
        const clause = handler.clauses.find((candidate) => candidate.operation === operation);
        if (clause === undefined) {
          return failure(
            "bytecode.vm.missing-handler-clause",
            "checked handler has no matching operation clause",
          );
        }
        const token: InternalResumption = freeze({
          expectedType: resultType,
          continuation: {
            kind: "return",
            block: machine.block,
            programCounter: machine.programCounter,
            locals: new Map(machine.locals),
            operandStack: machine.operandStack.slice(0, -1),
          },
          handler,
          capturedFrames: machine.continuationStack.slice(handlerIndex + 1),
        });
        liveResumptions.add(token);
        machine.block = clause.entryBlock;
        machine.programCounter = 0;
        machine.locals = new Map(handler.locals);
        machine.locals.set(clause.argumentSlot, argument);
        machine.locals.set(clause.resumptionSlot, token);
        machine.operandStack = [];
        machine.continuationStack = machine.continuationStack.slice(0, handlerIndex);
        break;
      }
      case "ResumeSlot": {
        const binding = machine.locals.get(instruction.resumptionSlot);
        const value = machine.operandStack.at(-1);
        if (
          binding === undefined ||
          "kind" in binding ||
          value === undefined ||
          value.kind === "function"
        ) {
          return failure(
            "bytecode.vm.invalid-resumption",
            "ResumeSlot crossed an invalid internal resumption boundary",
          );
        }
        if (!runtimeValueHasType(value, binding.expectedType)) {
          return failure(
            "bytecode.vm.resumption-result-type-mismatch",
            "internal resumption value has the wrong type",
          );
        }
        if (!liveResumptions.has(binding)) {
          return failure(
            "bytecode.vm.resumption-already-used",
            "internal resumption token was already consumed",
          );
        }
        const requiredContinuationDepth =
          machine.continuationStack.length + 2 + binding.capturedFrames.length;
        if (requiredContinuationDepth > bounds.maximumContinuationDepth) {
          return failure(
            "bytecode.vm.continuation-stack-exceeded",
            "VM continuation stack capacity was exceeded",
          );
        }
        if (binding.continuation.operandStack.length >= bounds.maximumOperandStackDepth) {
          return failure(
            "bytecode.vm.operand-stack-exceeded",
            "VM operand stack capacity was exceeded",
          );
        }
        machine.operandStack.pop();
        liveResumptions.delete(binding);
        const clauseContinuation: ReturnFrame = {
          kind: "return",
          block: machine.block,
          programCounter: machine.programCounter,
          locals: new Map(machine.locals),
          operandStack: [...machine.operandStack],
        };
        machine.continuationStack = [
          ...machine.continuationStack,
          clauseContinuation,
          binding.handler,
          ...binding.capturedFrames,
        ];
        machine.block = binding.continuation.block;
        machine.programCounter = binding.continuation.programCounter;
        machine.locals = new Map(binding.continuation.locals);
        machine.operandStack = [...binding.continuation.operandStack, value];
        break;
      }
      case "Return": {
        const result = machine.operandStack.pop();
        if (result === undefined) {
          return failure("bytecode.vm.missing-result", "Return requires one runtime result");
        }
        const frame = machine.continuationStack.pop();
        if (frame === undefined) {
          return { status: "returned", value: freeze(observableResult(result)) };
        }
        if (frame.kind !== "return") {
          return failure(
            "bytecode.vm.invalid-handler-boundary",
            "Return crossed a handler without LeaveHandler",
          );
        }
        machine.block = frame.block;
        machine.programCounter = frame.programCounter;
        machine.locals = new Map(frame.locals);
        machine.operandStack = [...frame.operandStack];
        const rejected = pushOperand(result);
        if (rejected !== undefined) return rejected;
        break;
      }
    }
  }
};

const run = (
  graph: InstructionGraph,
  bounds: KernelBytecodeBounds,
  owner: object,
): InternalResult =>
  runMachine(
    graph,
    bounds,
    {
      block: graph.entryBlock,
      programCounter: 0,
      locals: new Map(),
      operandStack: [],
      continuationStack: [],
      fuel: bounds.vmFuel,
      traceEntries: 0,
    },
    owner,
  );

const runtimeObservationValue = (value: ExternalObservationValue): RuntimeValue => {
  switch (value.kind) {
    case "unit":
      return freeze({ kind: "unit" });
    case "bool":
      return freeze({ kind: "bool", value: value.value });
    case "int":
      return freeze({ kind: "int", value: value.value });
    case "pair":
      return freeze({
        kind: "pair",
        first: runtimeObservationValue(value.first),
        second: runtimeObservationValue(value.second),
      });
  }
};

const resume = (
  token: BytecodeExternalSuspension,
  observation: ExternalObservationValue,
  bounds: KernelBytecodeBounds,
  owner: object,
): { readonly applied: boolean; readonly result: InternalResult } => {
  if (
    typeof token !== "object" ||
    token === null ||
    !knownExternalSuspensions.has(token) ||
    externalSuspensionState.get(token)?.owner !== owner
  ) {
    return {
      applied: false,
      result: failure(
        "bytecode.vm.external-resumption-not-custodied",
        "external resume requires a bytecode suspension in private custody",
      ),
    };
  }
  const state = externalSuspensionState.get(token)!;
  const value = runtimeObservationValue(observation);
  if (!runtimeValueHasType(value, token.resultType)) {
    return {
      applied: false,
      result: failure(
        "bytecode.vm.external-resumption-result-type-mismatch",
        "external observation does not match the bytecode suspension result type",
      ),
    };
  }
  if (!liveExternalSuspensions.has(token)) {
    return {
      applied: false,
      result: failure(
        "bytecode.vm.external-resumption-already-used",
        "bytecode external suspension was already consumed",
      ),
    };
  }
  if (state.machine.operandStack.length >= bounds.maximumOperandStackDepth) {
    return {
      applied: false,
      result: failure(
        "bytecode.vm.operand-stack-exceeded",
        "VM operand stack capacity was exceeded",
      ),
    };
  }
  liveExternalSuspensions.delete(token);
  const machine = cloneMachine(state.machine);
  machine.fuel = bounds.vmFuel;
  machine.operandStack.push(value);
  return { applied: true, result: runMachine(state.graph, bounds, machine, owner) };
};

export type InstructionGraphExecutor = (
  graph: InstructionGraph,
  bounds: KernelBytecodeBounds,
) => Effect.Effect<BytecodeVmOutcome, BytecodeVmError>;

export type InstructionGraphResumer = (
  token: BytecodeExternalSuspension,
  observation: ExternalObservationValue,
  bounds: KernelBytecodeBounds,
) => Effect.Effect<BytecodeVmOutcome, BytecodeVmResumeFailure>;

export interface InstructionGraphRuntime {
  readonly execute: InstructionGraphExecutor;
  readonly resume: InstructionGraphResumer;
}

export const createInstructionGraphRuntime = (authority: unknown): InstructionGraphRuntime => {
  if (!isCompiledRuntimeAuthority(authority)) {
    throw new TypeError("instruction graph runtime requires lexical runtime authority");
  }
  const owner = Object.freeze({ owner: "instruction-graph-runtime" });
  const execute: InstructionGraphExecutor = (graph, bounds) =>
    Effect.gen(function* () {
      const result = run(graph, bounds, owner);
      if (result.status === "failed") return yield* result.error;
      return result.status === "returned"
        ? freeze({ status: "returned" as const, value: result.value })
        : freeze({
            status: "suspended" as const,
            request: result.request,
            oneShotToken: result.oneShotToken,
          });
    });
  const resumeRuntime: InstructionGraphResumer = (token, observation, bounds) =>
    Effect.gen(function* () {
      const resumed = resume(token, observation, bounds, owner);
      if (resumed.result.status === "failed") {
        return yield* new BytecodeVmResumeFailure({
          applied: resumed.applied,
          error: resumed.result.error,
        });
      }
      return resumed.result.status === "returned"
        ? freeze({ status: "returned" as const, value: resumed.result.value })
        : freeze({
            status: "suspended" as const,
            request: resumed.result.request,
            oneShotToken: resumed.result.oneShotToken,
          });
    });
  return Object.freeze({
    execute,
    resume: resumeRuntime,
  });
};

export const createInstructionGraphExecutor = (authority: unknown): InstructionGraphExecutor => {
  if (!isCompiledRuntimeAuthority(authority)) {
    throw new TypeError("instruction graph executor requires lexical runtime authority");
  }
  return createInstructionGraphRuntime(authority).execute;
};
