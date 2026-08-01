import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { Effect } from "effect";
import { compileCheckedProgram } from "../src/kernel-bytecode/compiler.ts";
import {
  inspectCompiledGraph,
  projectCompiledProgram,
  type CompiledProgram,
} from "../src/kernel-bytecode/custody.ts";
import { defaultKernelBytecodeBackendBounds } from "../src/kernel-bytecode/index.ts";
import { BytecodeVmFailure, executeCompiledProgram } from "../src/kernel-bytecode/vm.ts";
import { prepareKernelJsonBytes } from "../src/kernel-execution/prepare.ts";

const root = resolve(import.meta.dirname, "..");

const relativeImportClosure = async (entry: string): Promise<ReadonlySet<string>> => {
  const scanner = new Bun.Transpiler({ loader: "ts" });
  const visited = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || visited.has(path)) continue;
    visited.add(path);
    const source = await Bun.file(path).text();
    for (const imported of scanner.scanImports(source)) {
      if (!imported.path.startsWith(".")) continue;
      pending.push(resolve(dirname(path), imported.path));
    }
  }
  return visited;
};

const source = new TextEncoder().encode(
  JSON.stringify({
    format: "semantic.kernel-json",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    signature: [],
    program: {
      tag: "let",
      bound: { tag: "return", grade: "1", value: { tag: "int", value: 5 } },
      body: {
        tag: "apply",
        computation: {
          tag: "lambda",
          parameter_type: { tag: "int" },
          grade: "1",
          body: {
            tag: "return",
            grade: "1",
            value: {
              tag: "pair",
              first: { tag: "bound-value", distance: 1 },
              second: { tag: "bound-value", distance: 0 },
            },
          },
        },
        argument: { tag: "int", value: 7 },
      },
    },
  }),
);

const collectObjects = (value: unknown, found = new Set<object>()): ReadonlySet<object> => {
  if (typeof value !== "object" || value === null || found.has(value)) return found;
  found.add(value);
  for (const child of Object.values(value)) collectObjects(child, found);
  return found;
};

describe("baseline bytecode architecture and custody", () => {
  test("the compiled backend cannot transitively reach the reference machine", async () => {
    const closure = await relativeImportClosure(resolve(root, "src/kernel-bytecode/index.ts"));
    const relativePaths = [...closure].map((path) => path.slice(root.length + 1));
    expect(relativePaths).not.toContain("src/kernel-calculus/machine.ts");
    expect(relativePaths).not.toContain("src/kernel-interpreter/index.ts");
    expect(relativePaths).not.toContain("src/kernel-interpreter/observe.ts");
    expect(relativePaths).not.toContain("src/kernel-bytecode/differential.ts");
    expect(relativePaths).not.toContain("src/kernel-bytecode/testing.ts");
  });

  test("compiled custody is frozen, source-free, and resolves binders to VM slots", () => {
    const prepared = Effect.runSync(prepareKernelJsonBytes(source));
    const sourceObjects = collectObjects(prepared.program);
    const compiled = Effect.runSync(
      compileCheckedProgram(prepared.program, defaultKernelBytecodeBackendBounds.bytecode),
    );
    const graph = inspectCompiledGraph(compiled);
    expect(graph).toBeDefined();
    if (graph === undefined) throw new Error("compiler did not mint graph custody");

    for (const object of collectObjects(graph)) {
      expect(sourceObjects.has(object)).toBeFalse();
      expect(Object.isFrozen(object)).toBeTrue();
      expect(Object.hasOwn(object, "tag")).toBeFalse();
      expect(Object.hasOwn(object, "distance")).toBeFalse();
      expect(Object.hasOwn(object, "derivation")).toBeFalse();
    }
    expect(JSON.stringify(graph)).not.toContain("bound-value");
    expect(JSON.stringify(graph)).not.toContain("parameter_type");
    expect(JSON.stringify(graph)).not.toContain("resumption_distance");
    expect(JSON.stringify(graph)).toContain('"slot":');
  });

  test("structural lookalikes cannot project or execute as compiled custody", () => {
    const forged = {
      format: "semantic.kernel-bytecode/process-local/v1",
    } as CompiledProgram;
    expect(projectCompiledProgram(forged)).toBeUndefined();
    const failure = Effect.runSync(
      executeCompiledProgram(forged, defaultKernelBytecodeBackendBounds.bytecode).pipe(Effect.flip),
    );
    expect(failure).toBeInstanceOf(BytecodeVmFailure);
    if (!(failure instanceof BytecodeVmFailure)) throw new Error("expected custody rejection");
    expect(failure.code).toBe("bytecode.vm.invalid-compiled-custody");
  });
});
