/** Lexical owner of compiled graph construction, custody, inspection, and execution. */
import { Effect } from "effect";
import type { CheckedProgram } from "../kernel-calculus/checker.ts";
import type {
  ObservableComputationType,
  ObservableValueType,
} from "../kernel-interpreter/schema.ts";
import {
  createCheckedProgramGraphCompiler,
  type BytecodeCompilationFailure,
  type CheckedProgramGraphCompiler,
} from "./compiler.ts";
import type { Constant, Instruction, InstructionGraph } from "./instruction.ts";
import type { KernelBytecodeBounds } from "./schema.ts";
import {
  BytecodeVmFailure,
  createInstructionGraphExecutor,
  type BytecodeVmError,
  type BytecodeVmOutcome,
  type InstructionGraphExecutor,
} from "./vm.ts";

interface CompiledProgram {
  readonly format: "semantic.kernel-bytecode/process-local/v1";
}

export interface CompiledProgramProjection {
  readonly instructionCount: number;
  readonly blockCount: number;
  readonly constantCount: number;
  readonly instructionKinds: ReadonlyArray<ReadonlyArray<string>>;
}

export interface CompiledGraphAudit {
  readonly allObjectsFrozen: boolean;
  readonly sourceIdentityOverlap: boolean;
  readonly forbiddenSourceVocabularyAbsent: boolean;
  readonly resolvedVmSlotObserved: boolean;
}

export type CompiledPerturbation = "opcode" | "branch" | "slot";

const runtimeAuthority = Object.freeze({ owner: "kernel-bytecode-custody" });

/** @internal Validation only; the accepted authority value never leaves this module. */
export const isCompiledRuntimeAuthority = (candidate: unknown): boolean =>
  candidate === runtimeAuthority;

const deepFreeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const snapshotValueType = (type: ObservableValueType): ObservableValueType => {
  switch (type.kind) {
    case "unit":
    case "bool":
    case "int":
      return { kind: type.kind };
    case "pair":
      return {
        kind: "pair",
        first: snapshotValueType(type.first),
        second: snapshotValueType(type.second),
      };
    case "thunk":
      return {
        kind: "thunk",
        effects: [...type.effects],
        computation: snapshotComputationType(type.computation),
      };
  }
};

const snapshotComputationType = (type: ObservableComputationType): ObservableComputationType => {
  switch (type.kind) {
    case "return":
      return {
        kind: "return",
        grade: type.grade,
        value: snapshotValueType(type.value),
      };
    case "function":
      return {
        kind: "function",
        parameter: snapshotValueType(type.parameter),
        grade: type.grade,
        effects: [...type.effects],
        result: snapshotComputationType(type.result),
      };
  }
};

const snapshotConstant = (constant: Constant): Constant => {
  switch (constant.kind) {
    case "BoolConstant":
      return { kind: "BoolConstant", value: constant.value };
    case "IntConstant":
      return { kind: "IntConstant", value: constant.value };
    case "TextConstant":
      return { kind: "TextConstant", value: constant.value };
    case "ObservableTypeConstant":
      return {
        kind: "ObservableTypeConstant",
        descriptor:
          constant.descriptor.kind === "return" || constant.descriptor.kind === "function"
            ? snapshotComputationType(constant.descriptor)
            : snapshotValueType(constant.descriptor),
      };
  }
};

const snapshotInstruction = (instruction: Instruction): Instruction => {
  switch (instruction.kind) {
    case "PushUnit":
    case "MakePair":
    case "Force":
    case "Call":
    case "LeaveHandler":
    case "Return":
      return { kind: instruction.kind };
    case "PushBool":
    case "PushInt":
      return { kind: instruction.kind, constantSlot: instruction.constantSlot };
    case "LoadSlot":
    case "BindSlot":
      return { kind: instruction.kind, slot: instruction.slot };
    case "MakeThunk":
      return {
        kind: "MakeThunk",
        entryBlock: instruction.entryBlock,
        capturedSlots: [...instruction.capturedSlots],
      };
    case "MakeFunction":
      return {
        kind: "MakeFunction",
        entryBlock: instruction.entryBlock,
        parameterSlot: instruction.parameterSlot,
        capturedSlots: [...instruction.capturedSlots],
      };
    case "EnterHandler":
      return {
        kind: "EnterHandler",
        labelConstantSlot: instruction.labelConstantSlot,
        returnBlock: instruction.returnBlock,
        returnSlot: instruction.returnSlot,
        clauses: instruction.clauses.map((clause) => ({ ...clause })),
      };
    case "Request":
      return {
        kind: "Request",
        labelConstantSlot: instruction.labelConstantSlot,
        operationConstantSlot: instruction.operationConstantSlot,
        resultTypeConstantSlot: instruction.resultTypeConstantSlot,
      };
    case "ResumeSlot":
      return { kind: "ResumeSlot", resumptionSlot: instruction.resumptionSlot };
    case "Jump":
      return { kind: "Jump", targetBlock: instruction.targetBlock };
  }
};

const snapshotGraph = (graph: InstructionGraph): InstructionGraph =>
  deepFreeze({
    entryBlock: graph.entryBlock,
    blocks: graph.blocks.map((block) => ({
      instructions: block.instructions.map(snapshotInstruction),
    })),
    constants: graph.constants.map(snapshotConstant),
  });

let memoizedCompiler: CheckedProgramGraphCompiler | undefined;
const compileGraph: CheckedProgramGraphCompiler = (program, bounds) => {
  const compiler = (memoizedCompiler ??= createCheckedProgramGraphCompiler(runtimeAuthority));
  return compiler(program, bounds);
};

let memoizedExecutor: InstructionGraphExecutor | undefined;
const runGraph: InstructionGraphExecutor = (graph, bounds) => {
  const executor = (memoizedExecutor ??= createInstructionGraphExecutor(runtimeAuthority));
  return executor(graph, bounds);
};

const collectObjects = (value: unknown, found = new Set<object>()): ReadonlySet<object> => {
  if (typeof value !== "object" || value === null || found.has(value)) return found;
  found.add(value);
  for (const child of Object.values(value)) collectObjects(child, found);
  return found;
};

const cloneWithOneInstruction = (
  graph: InstructionGraph,
  replace: (instruction: Instruction) => Instruction | undefined,
): InstructionGraph | undefined => {
  let changed = false;
  const blocks = graph.blocks.map((block) => ({
    instructions: block.instructions.map((instruction) => {
      if (changed) return instruction;
      const replacement = replace(instruction);
      if (replacement === undefined) return instruction;
      changed = true;
      return replacement;
    }),
  }));
  return changed
    ? { entryBlock: graph.entryBlock, blocks, constants: [...graph.constants] }
    : undefined;
};

const perturb = (
  graph: InstructionGraph,
  perturbation: CompiledPerturbation,
): InstructionGraph | undefined => {
  if (perturbation === "opcode") {
    return cloneWithOneInstruction(graph, (instruction) =>
      instruction.kind === "PushBool" ? { kind: "PushUnit" } : undefined,
    );
  }
  if (perturbation === "branch") {
    const functionTarget = graph.blocks
      .flatMap((block) => block.instructions)
      .find((instruction) => instruction.kind === "MakeFunction");
    if (functionTarget?.kind !== "MakeFunction") return undefined;
    const targetBlock = graph.blocks.findIndex(
      (_, index) => index !== graph.entryBlock && index !== functionTarget.entryBlock,
    );
    return targetBlock < 0
      ? undefined
      : cloneWithOneInstruction(graph, (instruction) =>
          instruction === functionTarget ? { ...instruction, entryBlock: targetBlock } : undefined,
        );
  }
  const instructions = graph.blocks.flatMap((block) => block.instructions);
  const load = instructions.find((instruction) => instruction.kind === "LoadSlot");
  if (load?.kind !== "LoadSlot") return undefined;
  const replacementSlot = instructions.find(
    (instruction) => instruction.kind === "BindSlot" && instruction.slot !== load.slot,
  );
  return replacementSlot?.kind !== "BindSlot"
    ? undefined
    : cloneWithOneInstruction(graph, (instruction) =>
        instruction === load ? { ...instruction, slot: replacementSlot.slot } : undefined,
      );
};

interface RuntimeCustody {
  readonly compile: (
    program: CheckedProgram,
    bounds: KernelBytecodeBounds,
  ) => Effect.Effect<CompiledProgram, BytecodeCompilationFailure>;
  readonly execute: (
    program: CompiledProgram,
    bounds: KernelBytecodeBounds,
  ) => Effect.Effect<BytecodeVmOutcome, BytecodeVmError>;
  readonly inspect: (program: CompiledProgram) => InstructionGraph | undefined;
  readonly mint: (graph: InstructionGraph) => CompiledProgram;
  readonly project: (program: CompiledProgram) => CompiledProgramProjection | undefined;
}

const createRuntimeCustody = (): RuntimeCustody => {
  const known = new WeakSet<object>();
  const graphs = new WeakMap<object, InstructionGraph>();
  class CompiledProgramImpl implements CompiledProgram {
    readonly format = "semantic.kernel-bytecode/process-local/v1" as const;
    constructor(graph: InstructionGraph) {
      known.add(this);
      graphs.set(this, snapshotGraph(graph));
      Object.freeze(this);
    }
  }
  const mint = (graph: InstructionGraph): CompiledProgram => new CompiledProgramImpl(graph);
  const inspect = (program: CompiledProgram): InstructionGraph | undefined =>
    typeof program === "object" && program !== null && known.has(program)
      ? graphs.get(program)
      : undefined;
  const execute = (
    program: CompiledProgram,
    bounds: KernelBytecodeBounds,
  ): Effect.Effect<BytecodeVmOutcome, BytecodeVmError> => {
    const graph = inspect(program);
    return graph === undefined
      ? Effect.fail(
          new BytecodeVmFailure({
            code: "bytecode.vm.invalid-compiled-custody",
            message: "execution requires a compiled program in private custody",
          }),
        )
      : runGraph(graph, bounds);
  };
  return {
    mint,
    inspect,
    execute,
    compile: (program, bounds) => Effect.map(compileGraph(program, bounds), mint),
    project: (program) => {
      const graph = inspect(program);
      return graph === undefined
        ? undefined
        : deepFreeze({
            instructionCount: graph.blocks.reduce(
              (total, block) => total + block.instructions.length,
              0,
            ),
            blockCount: graph.blocks.length,
            constantCount: graph.constants.length,
            instructionKinds: graph.blocks.map((block) =>
              block.instructions.map((instruction) => instruction.kind),
            ),
          });
    },
  };
};

const production = createRuntimeCustody();

export const compileAndExecuteCheckedProgram = (
  program: CheckedProgram,
  bounds: KernelBytecodeBounds,
): Effect.Effect<BytecodeVmOutcome, BytecodeCompilationFailure | BytecodeVmError> =>
  Effect.flatMap(production.compile(program, bounds), (compiled) =>
    production.execute(compiled, bounds),
  );

export interface ControlledCompiledTestHarness {
  readonly compileAndProject: (
    program: CheckedProgram,
    bounds: KernelBytecodeBounds,
  ) => Effect.Effect<CompiledProgramProjection, BytecodeCompilationFailure>;
  readonly compileAndAudit: (
    program: CheckedProgram,
    sourceObjects: ReadonlySet<object>,
    bounds: KernelBytecodeBounds,
  ) => Effect.Effect<CompiledGraphAudit, BytecodeCompilationFailure>;
  readonly executePerturbed: (
    program: CheckedProgram,
    bounds: KernelBytecodeBounds,
    perturbation: CompiledPerturbation,
  ) => Effect.Effect<BytecodeVmOutcome, BytecodeCompilationFailure | BytecodeVmError>;
  readonly observeForged: (
    bounds: KernelBytecodeBounds,
  ) => Effect.Effect<BytecodeVmOutcome, BytecodeVmError>;
  readonly observeForeign: (
    bounds: KernelBytecodeBounds,
  ) => Effect.Effect<BytecodeVmOutcome, BytecodeVmError>;
  readonly observeNestedAliasMutation: (
    bounds: KernelBytecodeBounds,
  ) => Effect.Effect<BytecodeVmOutcome, BytecodeVmError>;
}

const minimalGraph = (constant: { readonly kind: "IntConstant"; readonly value: number }) => ({
  entryBlock: 0,
  blocks: [
    {
      instructions: [{ kind: "PushInt" as const, constantSlot: 0 }, { kind: "Return" as const }],
    },
  ],
  constants: [constant],
});

export const createControlledCompiledTestHarness = (): ControlledCompiledTestHarness => {
  const runtime = createRuntimeCustody();
  const harness: ControlledCompiledTestHarness = {
    compileAndProject: (program, bounds) =>
      Effect.flatMap(runtime.compile(program, bounds), (compiled) => {
        const projection = runtime.project(compiled);
        return projection === undefined
          ? Effect.die("test compiler minted foreign custody")
          : Effect.succeed(projection);
      }),
    compileAndAudit: (program, sourceObjects, bounds) =>
      Effect.flatMap(runtime.compile(program, bounds), (compiled) => {
        const graph = runtime.inspect(compiled);
        if (graph === undefined) return Effect.die("test compiler minted foreign custody");
        const objects = collectObjects(graph);
        const forbiddenSourceFields = new Set([
          "tag",
          "distance",
          "derivation",
          "parameter_type",
          "resumption_distance",
        ]);
        const forbiddenSourceValues = new Set(["bound-value"]);
        return Effect.succeed(
          Object.freeze({
            allObjectsFrozen: [...objects].every(Object.isFrozen),
            sourceIdentityOverlap: [...objects].some((object) => sourceObjects.has(object)),
            forbiddenSourceVocabularyAbsent: [...objects].every((object) =>
              Object.entries(object).every(
                ([field, value]) =>
                  !forbiddenSourceFields.has(field) &&
                  !(typeof value === "string" && forbiddenSourceValues.has(value)),
              ),
            ),
            resolvedVmSlotObserved: graph.blocks.some((block) =>
              block.instructions.some(
                (instruction) => instruction.kind === "BindSlot" || instruction.kind === "LoadSlot",
              ),
            ),
          }),
        );
      }),
    executePerturbed: (program, bounds, perturbation) =>
      Effect.flatMap(runtime.compile(program, bounds), (compiled) => {
        const graph = runtime.inspect(compiled);
        if (graph === undefined) return Effect.die("test compiler minted foreign custody");
        const changed = perturb(graph, perturbation);
        return changed === undefined
          ? Effect.die("perturbation did not select an instruction")
          : runtime.execute(runtime.mint(changed), bounds);
      }),
    observeForged: (bounds) =>
      runtime.execute({ format: "semantic.kernel-bytecode/process-local/v1" }, bounds),
    observeForeign: (bounds) => {
      const foreign = createRuntimeCustody();
      return runtime.execute(foreign.mint(minimalGraph({ kind: "IntConstant", value: 1 })), bounds);
    },
    observeNestedAliasMutation: (bounds) => {
      const nestedConstant = { kind: "IntConstant" as const, value: 1 };
      const compiled = runtime.mint(Object.freeze(minimalGraph(nestedConstant)));
      nestedConstant.value = 99;
      return runtime.execute(compiled, bounds);
    },
  };
  return Object.freeze(harness);
};
