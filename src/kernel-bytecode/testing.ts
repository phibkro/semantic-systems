/** @internal Deep-import-only compiled graph perturbations for differential evidence. */
import type { CompiledProgram } from "./custody.ts";
import { inspectCompiledGraph, mintCompiledProgram } from "./custody.ts";
import type { Instruction, InstructionGraph } from "./instruction.ts";

export type CompiledPerturbation = "opcode" | "branch" | "slot";

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

const perturbOpcode = (graph: InstructionGraph): InstructionGraph | undefined =>
  cloneWithOneInstruction(graph, (instruction) =>
    instruction.kind === "PushBool" ? { kind: "PushUnit" } : undefined,
  );

const perturbBranch = (graph: InstructionGraph): InstructionGraph | undefined => {
  const functionTarget = graph.blocks
    .flatMap((block) => block.instructions)
    .find((instruction) => instruction.kind === "MakeFunction");
  if (functionTarget?.kind !== "MakeFunction") return undefined;
  const targetBlock = graph.blocks.findIndex(
    (_, index) => index !== graph.entryBlock && index !== functionTarget.entryBlock,
  );
  if (targetBlock < 0) return undefined;
  return cloneWithOneInstruction(graph, (instruction) =>
    instruction === functionTarget ? { ...instruction, entryBlock: targetBlock } : undefined,
  );
};

const perturbSlot = (graph: InstructionGraph): InstructionGraph | undefined => {
  const instructions = graph.blocks.flatMap((block) => block.instructions);
  const load = instructions.find((instruction) => instruction.kind === "LoadSlot");
  if (load?.kind !== "LoadSlot") return undefined;
  const replacementSlot = instructions.find(
    (instruction) => instruction.kind === "BindSlot" && instruction.slot !== load.slot,
  );
  if (replacementSlot?.kind !== "BindSlot") return undefined;
  return cloneWithOneInstruction(graph, (instruction) =>
    instruction === load ? { ...instruction, slot: replacementSlot.slot } : undefined,
  );
};

export const perturbCompiledProgramForTest = (
  program: CompiledProgram,
  perturbation: CompiledPerturbation,
): CompiledProgram | undefined => {
  const graph = inspectCompiledGraph(program);
  if (graph === undefined) return undefined;
  const perturbed =
    perturbation === "opcode"
      ? perturbOpcode(graph)
      : perturbation === "branch"
        ? perturbBranch(graph)
        : perturbSlot(graph);
  return perturbed === undefined ? undefined : mintCompiledProgram(perturbed);
};
