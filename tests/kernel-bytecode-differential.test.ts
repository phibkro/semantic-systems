import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { compareKernelRunObservations } from "../src/kernel-bytecode/differential.ts";
import { runCompiledKernelJsonBytes } from "../src/kernel-bytecode/index.ts";
import { interpretKernelJsonBytes } from "../src/kernel-interpreter/index.ts";

type Grade = "0" | "1" | "omega";

interface GeneratedCase {
  readonly document: Readonly<Record<string, unknown>>;
  readonly coverage: ReadonlyArray<string>;
}

const grades = ["0", "1", "omega"] as const;
const encoder = new TextEncoder();
const bytes = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));
const document = (program: unknown, signature: ReadonlyArray<unknown> = []) => ({
  format: "semantic.kernel-json",
  version: 1,
  kernel: "semantic.kernel-calculus/0018/v1",
  signature,
  program,
});

const gradeCoverage = (position: "return" | "lambda" | "operation", grade: Grade): string =>
  `grade.${position}.${grade}`;
const typeGradeCoverage = (position: "return" | "function", grade: Grade): string =>
  `type.grade.${position}.${grade}`;

const primitiveCase = fc
  .tuple(
    fc.constantFrom("unit" as const, "bool" as const, "int" as const),
    fc.boolean(),
    fc.integer({ min: -1_000, max: 1_000 }),
    fc.constantFrom(...grades),
  )
  .map(([kind, booleanValue, integerValue, grade]): GeneratedCase => {
    const value =
      kind === "unit"
        ? { tag: "unit" }
        : kind === "bool"
          ? { tag: "bool", value: booleanValue }
          : { tag: "int", value: integerValue };
    return {
      document: document({ tag: "return", grade, value }),
      coverage: [
        `value.${kind}`,
        `type.value.${kind}`,
        "computation.return",
        "type.computation.return",
        gradeCoverage("return", grade),
        typeGradeCoverage("return", grade),
      ],
    };
  });

const pairCase = fc
  .tuple(fc.integer({ min: -1_000, max: 1_000 }), fc.boolean(), fc.constantFrom(...grades))
  .map(
    ([integerValue, booleanValue, grade]): GeneratedCase => ({
      document: document({
        tag: "return",
        grade,
        value: {
          tag: "pair",
          first: { tag: "int", value: integerValue },
          second: { tag: "bool", value: booleanValue },
        },
      }),
      coverage: [
        "value.pair",
        "value.int",
        "value.bool",
        "type.value.pair",
        "type.value.int",
        "type.value.bool",
        "computation.return",
        "type.computation.return",
        gradeCoverage("return", grade),
        typeGradeCoverage("return", grade),
      ],
    }),
  );

const variableLetCase = fc.integer({ min: -1_000, max: 1_000 }).map(
  (value): GeneratedCase => ({
    document: document({
      tag: "let",
      bound: { tag: "return", grade: "1", value: { tag: "int", value } },
      body: {
        tag: "return",
        grade: "1",
        value: { tag: "bound-value", distance: 0 },
      },
    }),
    coverage: [
      "value.variable",
      "value.int",
      "type.value.int",
      "computation.let",
      "computation.return",
      "type.computation.return",
      gradeCoverage("return", "1"),
      typeGradeCoverage("return", "1"),
    ],
  }),
);

const consumedThunkCase = fc
  .tuple(fc.integer({ min: -1_000, max: 1_000 }), fc.constantFrom(...grades))
  .map(
    ([value, grade]): GeneratedCase => ({
      document: document({
        tag: "force",
        value: {
          tag: "thunk",
          body: { tag: "return", grade, value: { tag: "int", value } },
        },
      }),
      coverage: [
        "value.thunk",
        "value.int",
        "type.value.thunk",
        "type.value.int",
        "computation.force",
        "computation.return",
        "type.computation.return",
        gradeCoverage("return", grade),
        typeGradeCoverage("return", grade),
      ],
    }),
  );

const consumedFunctionCase = fc
  .tuple(
    fc.integer({ min: -1_000, max: 1_000 }),
    fc.constantFrom(...grades),
    fc.constantFrom(...grades),
  )
  .map(([argument, lambdaGrade, returnGrade]): GeneratedCase => {
    const usesParameter =
      lambdaGrade === "omega" ||
      (lambdaGrade === "1" && returnGrade !== "omega") ||
      (lambdaGrade === "0" && returnGrade === "0");
    return {
      document: document({
        tag: "apply",
        computation: {
          tag: "lambda",
          parameter_type: { tag: "int" },
          grade: lambdaGrade,
          body: {
            tag: "return",
            grade: returnGrade,
            value: usesParameter ? { tag: "bound-value", distance: 0 } : { tag: "unit" },
          },
        },
        argument: { tag: "int", value: argument },
      }),
      coverage: [
        usesParameter ? "value.variable" : "value.unit",
        "value.int",
        "type.value.int",
        "type.value.unit",
        "computation.lambda",
        "computation.apply",
        "computation.return",
        "type.computation.function",
        "type.computation.return",
        gradeCoverage("lambda", lambdaGrade),
        gradeCoverage("return", returnGrade),
        typeGradeCoverage("function", lambdaGrade),
        typeGradeCoverage("return", returnGrade),
      ],
    };
  });

const operationSignature = [
  {
    label: "generated",
    operation: "choose",
    argument_type: { tag: "unit" },
    result_type: { tag: "int" },
  },
] as const;

const unhandledOperationCase = fc.constantFrom(...grades).map(
  (grade): GeneratedCase => ({
    document: document(
      {
        tag: "operation",
        grade,
        label: "generated",
        operation: "choose",
        argument: { tag: "unit" },
      },
      operationSignature,
    ),
    coverage: [
      "value.unit",
      "type.value.unit",
      "type.value.int",
      "computation.operation",
      "type.computation.return",
      gradeCoverage("operation", grade),
      typeGradeCoverage("return", grade),
    ],
  }),
);

const handledResumeCase = fc
  .tuple(fc.integer({ min: -1_000, max: 1_000 }), fc.constantFrom(...grades))
  .map(
    ([value, grade]): GeneratedCase => ({
      document: document(
        {
          tag: "handle",
          label: "generated",
          computation: {
            tag: "operation",
            grade,
            label: "generated",
            operation: "choose",
            argument: { tag: "unit" },
          },
          return_clause: {
            body: {
              tag: "return",
              grade,
              value: grade === "0" ? { tag: "unit" } : { tag: "bound-value", distance: 0 },
            },
          },
          operation_clauses: [
            {
              operation: "choose",
              body: {
                tag: "resume",
                resumption_distance: 0,
                value: { tag: "int", value },
              },
            },
          ],
        },
        operationSignature,
      ),
      coverage: [
        "value.variable",
        "value.unit",
        "value.int",
        "type.value.unit",
        "type.value.int",
        "computation.operation",
        "computation.handle",
        "computation.resume",
        "computation.return",
        "type.computation.return",
        gradeCoverage("operation", grade),
        gradeCoverage("return", grade),
        typeGradeCoverage("return", grade),
      ],
    }),
  );

const validProgramArbitrary: fc.Arbitrary<GeneratedCase> = fc.oneof(
  primitiveCase,
  pairCase,
  variableLetCase,
  consumedThunkCase,
  consumedFunctionCase,
  unhandledOperationCase,
  handledResumeCase,
);

const expectedCoverage = [
  "value.variable",
  "value.unit",
  "value.bool",
  "value.int",
  "value.pair",
  "value.thunk",
  "type.value.unit",
  "type.value.bool",
  "type.value.int",
  "type.value.pair",
  "type.value.thunk",
  "computation.return",
  "computation.let",
  "computation.force",
  "computation.lambda",
  "computation.apply",
  "computation.operation",
  "computation.handle",
  "computation.resume",
  "type.computation.return",
  "type.computation.function",
  ...grades.flatMap((grade) => [
    gradeCoverage("return", grade),
    gradeCoverage("lambda", grade),
    gradeCoverage("operation", grade),
    typeGradeCoverage("return", grade),
    typeGradeCoverage("function", grade),
  ]),
] as const;

describe("baseline bytecode fixed-seed differential corpus", () => {
  test("every generated valid program agrees and every constructor/grade remains covered", () => {
    const coverage = new Map<string, number>();
    fc.assert(
      fc.property(validProgramArbitrary, (candidate) => {
        for (const key of candidate.coverage) coverage.set(key, (coverage.get(key) ?? 0) + 1);
        const source = bytes(candidate.document);
        const reference = interpretKernelJsonBytes(source);
        const compiled = runCompiledKernelJsonBytes(source);
        expect(reference.observation.tag).not.toBe("representation-rejected");
        expect(reference.observation.tag).not.toBe("check-rejected");
        expect(compareKernelRunObservations(reference, compiled).tag).toBe("agreement");
      }),
      { seed: 0x0032, numRuns: 360, endOnFailure: true },
    );

    for (const key of expectedCoverage) {
      expect(coverage.get(key) ?? 0).toBeGreaterThan(0);
    }
  });
});
