/** Deterministic baseline compiler from genuine checker custody to closed instructions. */
import { Data, Effect } from "effect";
import type {
  ComputationTerm,
  ComputationType,
  OperationSignature,
  ValueTerm,
  ValueType,
} from "../kernel-calculus/ast.ts";
import { requireCheckedProgram, type CheckedProgram } from "../kernel-calculus/checker.ts";
import { isCompiledRuntimeAuthority } from "./custody.ts";
import type {
  Constant,
  Instruction,
  InstructionBlock,
  InstructionGraph,
  VmSlot,
} from "./instruction.ts";
import type { KernelBytecodeBounds } from "./schema.ts";
import type {
  ObservableComputationType,
  ObservableValueType,
} from "../kernel-interpreter/schema.ts";

export class BytecodeCompilationFailure extends Data.TaggedError("BytecodeCompilationFailure")<{
  readonly code: string;
  readonly message: string;
}> {}

interface CompileContext {
  readonly valueSlots: ReadonlyArray<VmSlot>;
  readonly resumptionSlots: ReadonlyArray<VmSlot>;
}

const observableValueType = (type: ValueType): ObservableValueType => {
  switch (type.kind) {
    case "unit":
    case "bool":
    case "int":
      return { kind: type.kind };
    case "pair":
      return {
        kind: "pair",
        first: observableValueType(type.first),
        second: observableValueType(type.second),
      };
    case "thunk":
      return {
        kind: "thunk",
        effects: [...type.effects],
        computation: observableComputationType(type.computation),
      };
  }
};

const observableComputationType = (type: ComputationType): ObservableComputationType => {
  switch (type.kind) {
    case "return":
      return {
        kind: "return",
        grade: type.grade,
        value: observableValueType(type.value),
      };
    case "function":
      return {
        kind: "function",
        parameter: observableValueType(type.parameter),
        grade: type.grade,
        effects: [...type.effects],
        result: observableComputationType(type.result),
      };
  }
};

class Builder {
  readonly #bounds: KernelBytecodeBounds;
  readonly #signature: OperationSignature;
  readonly #blocks: Array<Array<Instruction>> = [];
  readonly #constants: Array<Constant> = [];
  #instructionCount = 0;
  #nextSlot = 0;

  constructor(bounds: KernelBytecodeBounds, signature: OperationSignature) {
    this.#bounds = bounds;
    this.#signature = signature;
  }

  slot(): VmSlot {
    const slot = this.#nextSlot;
    this.#nextSlot += 1;
    return slot;
  }

  constant(constant: Constant): number {
    if (this.#constants.length >= this.#bounds.maximumConstants) {
      throw new BytecodeCompilationFailure({
        code: "bytecode.compile.constants-exceeded",
        message: "compiled constant capacity was exceeded",
      });
    }
    const slot = this.#constants.length;
    this.#constants.push(constant);
    return slot;
  }

  block(): number {
    if (this.#blocks.length >= this.#bounds.maximumBlocks) {
      throw new BytecodeCompilationFailure({
        code: "bytecode.compile.blocks-exceeded",
        message: "compiled block capacity was exceeded",
      });
    }
    const block = this.#blocks.length;
    this.#blocks.push([]);
    return block;
  }

  emit(block: number, instruction: Instruction): void {
    if (this.#instructionCount >= this.#bounds.maximumInstructions) {
      throw new BytecodeCompilationFailure({
        code: "bytecode.compile.instructions-exceeded",
        message: "compiled instruction capacity was exceeded",
      });
    }
    const instructions = this.#blocks[block];
    if (instructions === undefined) {
      throw new BytecodeCompilationFailure({
        code: "bytecode.compile.invalid-block",
        message: "compiler selected an unknown instruction block",
      });
    }
    instructions.push(instruction);
    this.#instructionCount += 1;
  }

  compileValue(block: number, term: ValueTerm, context: CompileContext): void {
    switch (term.kind) {
      case "variable": {
        const slot = context.valueSlots[term.index];
        if (slot === undefined) this.invalidCustody("variable slot was not resolved by checking");
        this.emit(block, { kind: "LoadSlot", slot });
        return;
      }
      case "unit":
        this.emit(block, { kind: "PushUnit" });
        return;
      case "bool":
        this.emit(block, {
          kind: "PushBool",
          constantSlot: this.constant({ kind: "BoolConstant", value: term.value }),
        });
        return;
      case "int":
        this.emit(block, {
          kind: "PushInt",
          constantSlot: this.constant({ kind: "IntConstant", value: term.value }),
        });
        return;
      case "pair":
        this.compileValue(block, term.first, context);
        this.compileValue(block, term.second, context);
        this.emit(block, { kind: "MakePair" });
        return;
      case "thunk": {
        const entryBlock = this.compileClosedBlock(term.body, context);
        this.emit(block, {
          kind: "MakeThunk",
          entryBlock,
          capturedSlots: [...context.valueSlots, ...context.resumptionSlots],
        });
        return;
      }
      case "resumption":
        this.invalidCustody("raw resumption value escaped checker custody");
    }
  }

  compileComputation(block: number, term: ComputationTerm, context: CompileContext): void {
    switch (term.kind) {
      case "return":
        this.compileValue(block, term.value, context);
        return;
      case "let": {
        this.compileComputation(block, term.bound, context);
        const slot = this.slot();
        this.emit(block, { kind: "BindSlot", slot });
        this.compileComputation(block, term.body, {
          ...context,
          valueSlots: [slot, ...context.valueSlots],
        });
        return;
      }
      case "force":
        this.compileValue(block, term.value, context);
        this.emit(block, { kind: "Force" });
        return;
      case "lambda": {
        const parameterSlot = this.slot();
        const entryBlock = this.compileClosedBlock(term.body, {
          ...context,
          valueSlots: [parameterSlot, ...context.valueSlots],
        });
        this.emit(block, {
          kind: "MakeFunction",
          entryBlock,
          parameterSlot,
          capturedSlots: [...context.valueSlots, ...context.resumptionSlots],
        });
        return;
      }
      case "apply":
        this.compileComputation(block, term.computation, context);
        this.compileValue(block, term.argument, context);
        this.emit(block, { kind: "Call" });
        return;
      case "operation": {
        this.compileValue(block, term.argument, context);
        const declaration = this.#signature.operations.find(
          (candidate) => candidate.label === term.label && candidate.operation === term.operation,
        );
        if (declaration === undefined) {
          this.invalidCustody("operation was not resolved by checking");
        }
        this.emit(block, {
          kind: "Request",
          labelConstantSlot: this.constant({ kind: "TextConstant", value: term.label }),
          operationConstantSlot: this.constant({ kind: "TextConstant", value: term.operation }),
          resultTypeConstantSlot: this.constant({
            kind: "ObservableTypeConstant",
            descriptor: observableValueType(declaration.resultType),
          }),
        });
        return;
      }
      case "handle": {
        const returnSlot = this.slot();
        const returnBlock = this.compileClosedBlock(term.returnClause.body, {
          ...context,
          valueSlots: [returnSlot, ...context.valueSlots],
        });
        const clauses = term.operationClauses.map((clause) => {
          const argumentSlot = this.slot();
          const resumptionSlot = this.slot();
          return {
            operationConstantSlot: this.constant({
              kind: "TextConstant" as const,
              value: clause.operation,
            }),
            entryBlock: this.compileClosedBlock(clause.body, {
              valueSlots: [argumentSlot, ...context.valueSlots],
              resumptionSlots: [resumptionSlot, ...context.resumptionSlots],
            }),
            argumentSlot,
            resumptionSlot,
          };
        });
        this.emit(block, {
          kind: "EnterHandler",
          labelConstantSlot: this.constant({ kind: "TextConstant", value: term.label }),
          returnBlock,
          returnSlot,
          clauses,
        });
        this.compileComputation(block, term.computation, context);
        this.emit(block, { kind: "LeaveHandler" });
        return;
      }
      case "resume": {
        const resumptionSlot = context.resumptionSlots[term.resumption];
        if (resumptionSlot === undefined) {
          this.invalidCustody("resumption slot was not resolved by checking");
        }
        this.compileValue(block, term.value, context);
        this.emit(block, { kind: "ResumeSlot", resumptionSlot });
        return;
      }
    }
  }

  compileClosedBlock(term: ComputationTerm, context: CompileContext): number {
    const block = this.block();
    this.compileComputation(block, term, context);
    this.emit(block, { kind: "Return" });
    return block;
  }

  graph(term: ComputationTerm): InstructionGraph {
    const entryBlock = this.compileClosedBlock(term, { valueSlots: [], resumptionSlots: [] });
    const blocks: ReadonlyArray<InstructionBlock> = this.#blocks.map((instructions) => ({
      instructions,
    }));
    return { entryBlock, blocks, constants: this.#constants };
  }

  private invalidCustody(message: string): never {
    throw new BytecodeCompilationFailure({
      code: "bytecode.compile.invalid-checked-custody",
      message,
    });
  }
}

export type CheckedProgramGraphCompiler = (
  program: CheckedProgram,
  bounds: KernelBytecodeBounds,
) => Effect.Effect<InstructionGraph, BytecodeCompilationFailure>;

export const createCheckedProgramGraphCompiler = (
  authority: unknown,
): CheckedProgramGraphCompiler => {
  if (!isCompiledRuntimeAuthority(authority)) {
    throw new TypeError("compiled graph compiler requires lexical runtime authority");
  }
  return (program, bounds) =>
    Effect.try({
      try: () => {
        const checked = requireCheckedProgram(program);
        if (checked === undefined) {
          throw new BytecodeCompilationFailure({
            code: "bytecode.compile.invalid-checked-custody",
            message: "compilation requires a checked program in private custody",
          });
        }
        return new Builder(bounds, checked.signature).graph(checked.term);
      },
      catch: (cause) =>
        cause instanceof BytecodeCompilationFailure
          ? cause
          : new BytecodeCompilationFailure({
              code: "bytecode.compile.internal",
              message: "compiler failed while selecting source-free instructions",
            }),
    });
};
