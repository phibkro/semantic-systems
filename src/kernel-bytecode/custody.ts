/** Process-local custody for immutable compiled instruction graphs. */
import type { InstructionGraph } from "./instruction.ts";

export interface CompiledProgram {
  readonly format: "semantic.kernel-bytecode/process-local/v1";
}

const custody = new WeakSet<object>();
const graphs = new WeakMap<object, InstructionGraph>();

const deepFreeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

class CompiledProgramImpl implements CompiledProgram {
  readonly format = "semantic.kernel-bytecode/process-local/v1" as const;

  constructor(graph: InstructionGraph) {
    const frozenGraph = deepFreeze(graph);
    custody.add(this);
    graphs.set(this, frozenGraph);
    Object.freeze(this);
  }
}

/** @internal Compiler-owned minting seam; never exported by the public module. */
export const mintCompiledProgram = (graph: InstructionGraph): CompiledProgram =>
  new CompiledProgramImpl(graph);

/** @internal VM-owned custody gate; a structural lookalike returns undefined. */
export const inspectCompiledGraph = (program: CompiledProgram): InstructionGraph | undefined =>
  typeof program === "object" && program !== null && custody.has(program)
    ? graphs.get(program)
    : undefined;

export interface CompiledProgramProjection {
  readonly instructionCount: number;
  readonly blockCount: number;
  readonly constantCount: number;
  readonly instructionKinds: ReadonlyArray<ReadonlyArray<string>>;
}

export const projectCompiledProgram = (
  program: CompiledProgram,
): CompiledProgramProjection | undefined => {
  const graph = inspectCompiledGraph(program);
  if (graph === undefined) return undefined;
  return deepFreeze({
    instructionCount: graph.blocks.reduce((total, block) => total + block.instructions.length, 0),
    blockCount: graph.blocks.length,
    constantCount: graph.constants.length,
    instructionKinds: graph.blocks.map((block) =>
      block.instructions.map((instruction) => instruction.kind),
    ),
  });
};
