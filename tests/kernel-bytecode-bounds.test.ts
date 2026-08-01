import { describe, expect, test } from "bun:test";
import {
  defaultKernelBytecodeBackendBounds,
  runCompiledKernelJsonBytes,
  type KernelBytecodeBounds,
} from "../src/kernel-bytecode/index.ts";
import {
  defaultKernelBytecodeBounds,
  narrowKernelBytecodeBounds,
} from "../src/kernel-bytecode/schema.ts";

const encoder = new TextEncoder();
const source = (program: unknown): Uint8Array =>
  encoder.encode(
    JSON.stringify({
      format: "semantic.kernel-json",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      signature: [],
      program,
    }),
  );

const returnedUnit = source({ tag: "return", grade: "1", value: { tag: "unit" } });
const returnedInt = source({
  tag: "return",
  grade: "1",
  value: { tag: "int", value: 1 },
});
const forcedUnit = source({
  tag: "force",
  value: {
    tag: "thunk",
    body: { tag: "return", grade: "1", value: { tag: "unit" } },
  },
});

const withBytecodeBounds = (
  overrides: Partial<KernelBytecodeBounds>,
): typeof defaultKernelBytecodeBackendBounds => ({
  json: defaultKernelBytecodeBackendBounds.json,
  bytecode: { ...defaultKernelBytecodeBounds, ...overrides },
});

const diagnosticCode = (input: Uint8Array, overrides: Partial<KernelBytecodeBounds>): string => {
  const observation = runCompiledKernelJsonBytes(input, withBytecodeBounds(overrides));
  expect(observation.observation.tag).toBe("runtime-rejected");
  if (observation.observation.tag !== "runtime-rejected") throw new Error("expected rejection");
  expect(observation.observation.diagnostic.occurrence_path).toBe("/program");
  return observation.observation.diagnostic.code;
};

describe("baseline bytecode compilation bounds", () => {
  test("instruction, block, and constant candidates are rejected at their exact limits", () => {
    expect(diagnosticCode(returnedUnit, { maximumInstructions: 1 })).toBe(
      "bytecode.compile.instructions-exceeded",
    );
    expect(diagnosticCode(forcedUnit, { maximumBlocks: 1 })).toBe(
      "bytecode.compile.blocks-exceeded",
    );
    expect(diagnosticCode(returnedInt, { maximumConstants: 0 })).toBe(
      "bytecode.compile.constants-exceeded",
    );
  });
});

describe("baseline bytecode VM bounds", () => {
  test("operand and continuation capacity are semantic runtime rejections", () => {
    expect(diagnosticCode(returnedUnit, { maximumOperandStackDepth: 0 })).toBe(
      "bytecode.vm.operand-stack-exceeded",
    );
    expect(diagnosticCode(forcedUnit, { maximumContinuationDepth: 0 })).toBe(
      "bytecode.vm.continuation-stack-exceeded",
    );
  });

  test("fuel has precedence when fuel and trace become exhausted together", () => {
    const observation = runCompiledKernelJsonBytes(
      returnedUnit,
      withBytecodeBounds({ vmFuel: 1, maximumTraceEntries: 1 }),
    );
    expect(observation.observation).toEqual({ tag: "inconclusive", reason: "fuel" });
  });

  test("trace exhausts independently while fuel remains", () => {
    const observation = runCompiledKernelJsonBytes(
      returnedUnit,
      withBytecodeBounds({ vmFuel: 2, maximumTraceEntries: 1 }),
    );
    expect(observation.observation).toEqual({ tag: "inconclusive", reason: "trace" });
  });
});

describe("version 1 bytecode bound narrowing", () => {
  test("every lower bound and wider caller value resolves exactly", () => {
    expect(narrowKernelBytecodeBounds(undefined)).toEqual(defaultKernelBytecodeBounds);
    expect(
      narrowKernelBytecodeBounds({
        maximumInstructions: 0,
        maximumBlocks: -1,
        maximumConstants: -1,
        maximumOperandStackDepth: -1,
        maximumContinuationDepth: -1,
        vmFuel: -1,
        maximumTraceEntries: 0,
      }),
    ).toEqual(defaultKernelBytecodeBounds);
    expect(
      narrowKernelBytecodeBounds({
        maximumInstructions: Number.MAX_SAFE_INTEGER,
        maximumBlocks: Number.MAX_SAFE_INTEGER,
        maximumConstants: Number.MAX_SAFE_INTEGER,
        maximumOperandStackDepth: Number.MAX_SAFE_INTEGER,
        maximumContinuationDepth: Number.MAX_SAFE_INTEGER,
        vmFuel: Number.MAX_SAFE_INTEGER,
        maximumTraceEntries: Number.MAX_SAFE_INTEGER,
      }),
    ).toEqual(defaultKernelBytecodeBounds);
    expect(
      narrowKernelBytecodeBounds({
        maximumInstructions: 1,
        maximumBlocks: 1,
        maximumConstants: 0,
        maximumOperandStackDepth: 0,
        maximumContinuationDepth: 0,
        vmFuel: 0,
        maximumTraceEntries: 1,
      }),
    ).toEqual({
      maximumInstructions: 1,
      maximumBlocks: 1,
      maximumConstants: 0,
      maximumOperandStackDepth: 0,
      maximumContinuationDepth: 0,
      vmFuel: 0,
      maximumTraceEntries: 1,
    });
  });

  test("outer and admitted nested fields are read once", () => {
    const reads = new Map<string, number>();
    const nested: Record<string, unknown> = {};
    for (const key of Object.keys(defaultKernelBytecodeBounds)) {
      Object.defineProperty(nested, key, {
        enumerable: true,
        get: () => {
          reads.set(key, (reads.get(key) ?? 0) + 1);
          return defaultKernelBytecodeBounds[key as keyof KernelBytecodeBounds];
        },
      });
    }
    let jsonReads = 0;
    let bytecodeReads = 0;
    const bounds = {
      get json() {
        jsonReads += 1;
        return defaultKernelBytecodeBackendBounds.json;
      },
      get bytecode() {
        bytecodeReads += 1;
        return nested;
      },
    };
    expect(runCompiledKernelJsonBytes(returnedUnit, bounds as never).observation).toEqual({
      tag: "returned",
      value: { kind: "unit" },
    });
    expect(jsonReads).toBe(1);
    expect(bytecodeReads).toBe(1);
    for (const key of Object.keys(defaultKernelBytecodeBounds)) expect(reads.get(key)).toBe(1);
  });

  test("throwing and revoked bound objects fall back without a host exception", () => {
    const throwing = new Proxy(
      {},
      {
        get: () => {
          throw new Error("not observable outside narrowing");
        },
      },
    );
    expect(() =>
      runCompiledKernelJsonBytes(returnedUnit, {
        json: defaultKernelBytecodeBackendBounds.json,
        bytecode: throwing as KernelBytecodeBounds,
      }),
    ).not.toThrow();

    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    expect(() => runCompiledKernelJsonBytes(returnedUnit, revocable.proxy as never)).not.toThrow();
    expect(runCompiledKernelJsonBytes(returnedUnit, revocable.proxy as never).observation).toEqual({
      tag: "returned",
      value: { kind: "unit" },
    });
  });
});
