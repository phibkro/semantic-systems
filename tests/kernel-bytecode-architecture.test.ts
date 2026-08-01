import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { Effect } from "effect";
import { createCheckedProgramGraphCompiler } from "../src/kernel-bytecode/compiler.ts";
import {
  compileAndAuditCheckedProgramForTest,
  observeForeignCustodyRejectionForTest,
  observeForgedCustodyRejectionForTest,
  observeNestedAliasMutationForTest,
} from "../src/kernel-bytecode/testing.ts";
import { defaultKernelBytecodeBackendBounds } from "../src/kernel-bytecode/index.ts";
import { BytecodeVmFailure, createInstructionGraphExecutor } from "../src/kernel-bytecode/vm.ts";
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
  test("compiler and VM modules initialize when imported as isolated roots", () => {
    for (const module of ["compiler.ts", "vm.ts"]) {
      const imported = Bun.spawnSync({
        cmd: [
          process.execPath,
          "-e",
          `await import(${JSON.stringify(resolve(root, "src/kernel-bytecode", module))})`,
        ],
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(new TextDecoder().decode(imported.stderr)).toBe("");
      expect(imported.exitCode).toBe(0);
    }
  });

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
    const audit = Effect.runSync(
      compileAndAuditCheckedProgramForTest(
        prepared.program,
        sourceObjects,
        defaultKernelBytecodeBackendBounds.bytecode,
      ),
    );
    expect(audit.sourceIdentityOverlap).toBeFalse();
    expect(audit.allObjectsFrozen).toBeTrue();
    expect(audit.forbiddenSourceVocabularyAbsent).toBeTrue();
    expect(audit.resolvedVmSlotObserved).toBeTrue();
  });

  test("structural lookalikes and foreign closure custody cannot execute", () => {
    for (const program of [
      observeForgedCustodyRejectionForTest(defaultKernelBytecodeBackendBounds.bytecode),
      observeForeignCustodyRejectionForTest(defaultKernelBytecodeBackendBounds.bytecode),
    ]) {
      const failure = Effect.runSync(program.pipe(Effect.flip));
      expect(failure).toBeInstanceOf(BytecodeVmFailure);
      if (!(failure instanceof BytecodeVmFailure)) throw new Error("expected custody rejection");
      expect(failure.code).toBe("bytecode.vm.invalid-compiled-custody");
    }
  });

  test("deep importers cannot forge compiler or VM graph authority", () => {
    const lookalike = Object.freeze({ owner: "kernel-bytecode-custody" });
    expect(() => createCheckedProgramGraphCompiler(lookalike)).toThrow(
      "compiled graph compiler requires lexical runtime authority",
    );
    expect(() => createInstructionGraphExecutor(lookalike)).toThrow(
      "instruction graph executor requires lexical runtime authority",
    );
  });

  test("mint snapshots nested aliases even when the caller froze only the graph root", () => {
    const outcome = Effect.runSync(
      observeNestedAliasMutationForTest(defaultKernelBytecodeBackendBounds.bytecode),
    );
    expect(outcome).toEqual({ status: "returned", value: { kind: "int", value: 1 } });
  });
});
