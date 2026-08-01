/** Independent iterative VM for the closed source-free instruction graph. */
import { Data, Effect } from "effect";
import type {
  ObservableRuntimeResult,
  ObservableRuntimeValue,
} from "../kernel-interpreter/schema.ts";
import { inspectCompiledGraph, type CompiledProgram } from "./custody.ts";
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

type RuntimeValue =
  | { readonly kind: "unit" }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "int"; readonly value: number }
  | { readonly kind: "pair"; readonly first: RuntimeValue; readonly second: RuntimeValue }
  | RuntimeThunk;

interface RuntimeThunk {
  readonly kind: "thunk";
  readonly entryBlock: number;
  readonly locals: ReadonlyMap<VmSlot, RuntimeValue>;
}

interface RuntimeFunction {
  readonly kind: "function";
  readonly entryBlock: number;
  readonly parameterSlot: VmSlot;
  readonly locals: ReadonlyMap<VmSlot, RuntimeValue>;
}

type RuntimeResult = RuntimeValue | RuntimeFunction;

interface ReturnFrame {
  readonly block: number;
  readonly programCounter: number;
  readonly locals: ReadonlyMap<VmSlot, RuntimeValue>;
  readonly operandStack: ReadonlyArray<RuntimeResult>;
}

interface Machine {
  block: number;
  programCounter: number;
  locals: Map<VmSlot, RuntimeValue>;
  operandStack: Array<RuntimeResult>;
  continuationStack: Array<ReturnFrame>;
  fuel: number;
  traceEntries: number;
}

export interface BytecodeVmReturned {
  readonly value: ObservableRuntimeResult;
}

type InternalResult =
  | { readonly status: "returned"; readonly value: ObservableRuntimeResult }
  | { readonly status: "failed"; readonly error: BytecodeVmError };

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
  locals: ReadonlyMap<VmSlot, RuntimeValue>,
): Map<VmSlot, RuntimeValue> | undefined => {
  const captured = new Map<VmSlot, RuntimeValue>();
  for (const slot of slots) {
    const value = locals.get(slot);
    if (value === undefined) return undefined;
    captured.set(slot, value);
  }
  return captured;
};

const constantAt = (graph: InstructionGraph, slot: number): Constant | undefined =>
  Number.isSafeInteger(slot) && slot >= 0 ? graph.constants[slot] : undefined;

const run = (graph: InstructionGraph, bounds: KernelBytecodeBounds): InternalResult => {
  const machine: Machine = {
    block: graph.entryBlock,
    programCounter: 0,
    locals: new Map(),
    operandStack: [],
    continuationStack: [],
    fuel: bounds.vmFuel,
    traceEntries: 0,
  };

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

  const pushContinuation = (frame: ReturnFrame): InternalResult | undefined => {
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
        if (value === undefined) {
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
      case "Return": {
        const result = machine.operandStack.pop();
        if (result === undefined) {
          return failure("bytecode.vm.missing-result", "Return requires one runtime result");
        }
        const frame = machine.continuationStack.pop();
        if (frame === undefined) {
          return { status: "returned", value: freeze(observableResult(result)) };
        }
        machine.block = frame.block;
        machine.programCounter = frame.programCounter;
        machine.locals = new Map(frame.locals);
        machine.operandStack = [...frame.operandStack];
        const rejected = pushOperand(result);
        if (rejected !== undefined) return rejected;
        break;
      }
      case "EnterHandler":
      case "LeaveHandler":
      case "Request":
      case "ResumeSlot":
        return failure(
          "bytecode.vm.effect-instruction-not-yet-implemented",
          `VM effect instruction is not implemented for ${instruction.kind}`,
        );
    }
  }
};

export const executeCompiledProgram = (
  program: CompiledProgram,
  bounds: KernelBytecodeBounds,
): Effect.Effect<BytecodeVmReturned, BytecodeVmError> =>
  Effect.gen(function* () {
    const graph = inspectCompiledGraph(program);
    if (graph === undefined) {
      return yield* new BytecodeVmFailure({
        code: "bytecode.vm.invalid-compiled-custody",
        message: "execution requires a compiled program in private custody",
      });
    }
    const result = run(graph, bounds);
    if (result.status === "failed") return yield* result.error;
    return freeze({ value: result.value });
  });
