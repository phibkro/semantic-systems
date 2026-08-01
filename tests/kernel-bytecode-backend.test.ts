import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { compareKernelRunObservations } from "../src/kernel-bytecode/differential.ts";
import {
  defaultKernelBytecodeBackendBounds,
  runCompiledKernelJsonBytes,
} from "../src/kernel-bytecode/index.ts";
import { compileAndProjectCheckedProgramForTest } from "../src/kernel-bytecode/testing.ts";
import { prepareKernelJsonBytes } from "../src/kernel-execution/prepare.ts";
import {
  encodeCanonicalKernelRunObservation,
  interpretKernelJsonBytes,
} from "../src/kernel-interpreter/index.ts";

const bytes = (program: unknown): Uint8Array =>
  new TextEncoder().encode(
    JSON.stringify({
      format: "semantic.kernel-json",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      signature: [],
      program,
    }),
  );

const purePrograms = [
  { tag: "return", grade: "1", value: { tag: "unit" } },
  { tag: "return", grade: "1", value: { tag: "bool", value: true } },
  {
    tag: "return",
    grade: "1",
    value: {
      tag: "pair",
      first: { tag: "int", value: 3 },
      second: { tag: "bool", value: false },
    },
  },
  {
    tag: "let",
    bound: { tag: "return", grade: "1", value: { tag: "int", value: 42 } },
    body: {
      tag: "return",
      grade: "1",
      value: { tag: "bound-value", distance: 0 },
    },
  },
  {
    tag: "force",
    value: {
      tag: "thunk",
      body: { tag: "return", grade: "1", value: { tag: "int", value: 9 } },
    },
  },
  {
    tag: "apply",
    computation: {
      tag: "lambda",
      parameter_type: { tag: "int" },
      grade: "1",
      body: {
        tag: "return",
        grade: "1",
        value: { tag: "bound-value", distance: 0 },
      },
    },
    argument: { tag: "int", value: 11 },
  },
  {
    tag: "let",
    bound: { tag: "return", grade: "1", value: { tag: "int", value: 5 } },
    body: {
      tag: "force",
      value: {
        tag: "thunk",
        body: {
          tag: "return",
          grade: "1",
          value: { tag: "bound-value", distance: 0 },
        },
      },
    },
  },
  {
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
] as const;

describe("baseline bytecode pure vertical journey", () => {
  test("pure constructors agree byte-for-byte with the reference interpreter", () => {
    for (const program of purePrograms) {
      const source = bytes(program);
      const reference = interpretKernelJsonBytes(source);
      const compiled = runCompiledKernelJsonBytes(source);
      expect(encodeCanonicalKernelRunObservation(compiled)).toEqual(
        encodeCanonicalKernelRunObservation(reference),
      );
      expect(compareKernelRunObservations(reference, compiled).tag).toBe("agreement");
    }
  });

  test("the compiler emits only the closed pure instruction vocabulary", () => {
    const checked = Effect.runSync(prepareKernelJsonBytes(bytes(purePrograms.at(-1))));
    const projection = Effect.runSync(
      compileAndProjectCheckedProgramForTest(
        checked.program,
        defaultKernelBytecodeBackendBounds.bytecode,
      ),
    );
    expect(projection.instructionKinds).toEqual([
      ["PushInt", "BindSlot", "MakeFunction", "PushInt", "Call", "Return"],
      ["LoadSlot", "LoadSlot", "MakePair", "Return"],
    ]);
    expect(projection.constantCount).toBe(2);
  });

  test("a handled operation and one-shot resume agree exactly", async () => {
    const source = await Bun.file(
      new URL("../examples/kernel-json/handled-program.kernel.json", import.meta.url),
    ).bytes();
    const reference = interpretKernelJsonBytes(source);
    const compiled = runCompiledKernelJsonBytes(source);
    expect(compiled.observation).toEqual({
      tag: "returned",
      value: { kind: "int", value: 7 },
    });
    expect(compareKernelRunObservations(reference, compiled).tag).toBe("agreement");
  });

  test("an unhandled operation suspends with the exact observable request", () => {
    const source = new TextEncoder().encode(
      JSON.stringify({
        format: "semantic.kernel-json",
        version: 1,
        kernel: "semantic.kernel-calculus/0018/v1",
        signature: [
          {
            label: "outside",
            operation: "read",
            argument_type: { tag: "bool" },
            result_type: { tag: "int" },
          },
        ],
        program: {
          tag: "operation",
          grade: "1",
          label: "outside",
          operation: "read",
          argument: { tag: "bool", value: true },
        },
      }),
    );
    const reference = interpretKernelJsonBytes(source);
    const compiled = runCompiledKernelJsonBytes(source);
    expect(compiled.observation).toEqual({
      tag: "suspended",
      request: {
        label: "outside",
        operation: "read",
        argument: { kind: "bool", value: true },
        result_type: { kind: "int" },
      },
    });
    expect(compareKernelRunObservations(reference, compiled).tag).toBe("agreement");
  });
});
