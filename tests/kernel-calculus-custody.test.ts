import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import {
  check,
  CheckResultSchema,
  decodeComputationTerm,
  EvaluationResultSchema,
  evaluate,
  int,
  intType,
  isRuntimeValue,
  normalizeCheckResult,
  normalizeEvaluationResult,
  NormalizedCheckResultSchema,
  NormalizedEvaluationResultSchema,
  operation,
  operationSignature,
  resume,
  returnTerm,
  runtimeBool,
  RuntimeValueSchema,
  unit,
  unitType,
} from "../src/kernel-calculus/index.ts";
import type { CheckedProgram, RuntimeValue } from "../src/kernel-calculus/index.ts";

describe("minimal kernel calculus custody and decode bounds", () => {
  test("counterexample 15: malformed and over-bound unknown input never becomes a decoded term", () => {
    expect(decodeComputationTerm({ kind: "return", grade: "many", value: {} })).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.expected-grade" }],
    });
    expect(
      decodeComputationTerm(
        {
          kind: "return",
          grade: "1",
          value: { kind: "int", value: 1 },
        },
        {
          maximumDepth: 4,
          maximumNodes: 1,
          maximumStringLength: 8,
          maximumCollectionLength: 4,
        },
      ),
    ).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.nodes-exceeded" }],
    });
  });

  test("decoder rejects excess properties, cycles, and hostile input", () => {
    expect(
      decodeComputationTerm({
        kind: "return",
        grade: "1",
        value: { kind: "int", value: 1 },
        authority: "ambient",
      }),
    ).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.excess-property" }],
    });

    const cyclic: Record<string, unknown> = { kind: "force" };
    cyclic["value"] = { kind: "thunk", body: cyclic };
    expect(decodeComputationTerm(cyclic)).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.depth-exceeded" }],
    });

    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("proxy trap");
        },
      },
    );
    expect(decodeComputationTerm(hostile)).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.hostile-input" }],
    });

    let reads = 0;
    const accessor = { kind: "return", grade: "1" };
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get() {
        reads += 1;
        return { kind: "unit" };
      },
    });
    expect(decodeComputationTerm(accessor)).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.non-data" }],
    });
    expect(reads).toBe(0);

    expect(
      decodeComputationTerm({
        kind: "handle",
        label: "fresh",
        computation: { kind: "return", grade: "1", value: { kind: "unit" } },
        returnClause: {
          body: { kind: "return", grade: "1", value: { kind: "variable", index: 0 } },
        },
        operationClauses: [],
        claimedEffects: [],
      }),
    ).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.excess-property", path: "$.claimedEffects" }],
    });
  });

  test("counterexample 16: a structural checked-program lookalike has no execution authority", () => {
    const forged = {
      type: { kind: "return", grade: "1", value: { kind: "int" } },
      effects: [],
    } as unknown as CheckedProgram;
    expect(evaluate(forged)).toMatchObject({
      status: "runtime-rejected",
      diagnostic: { code: "checked-program.required" },
    });
  });

  test("counterexample 17: later mutation cannot change a checked program or prior result", () => {
    const authored = {
      kind: "return" as const,
      grade: "1" as const,
      value: { kind: "int" as const, value: 4 },
    };
    const signature = { operations: [] };
    const result = check(signature, authored);
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");

    authored.value.value = 999;
    signature.operations.push(undefined as never);
    const first = evaluate(result.program);
    expect(first).toMatchObject({
      status: "returned",
      value: { kind: "int", value: 4 },
    });
    expect(() => {
      (first.trace as Array<unknown>).push({});
    }).toThrow();
  });

  test("AST and signature constructors return immutable snapshots", () => {
    const term = returnTerm("1", int(1));
    const signature = operationSignature([]);
    expect(Object.isFrozen(term)).toBeTrue();
    expect(term.kind).toBe("return");
    if (term.kind !== "return") throw new Error("expected return");
    expect(Object.isFrozen(term.value)).toBeTrue();
    expect(Object.isFrozen(signature.operations)).toBeTrue();
  });

  test("public result schemas reject forged principal evidence", () => {
    expect(() =>
      Schema.decodeUnknownSync(CheckResultSchema)({
        status: "accepted",
        type: 42,
        effects: ["forged"],
        usage: [],
        derivation: "not-a-derivation",
        program: { type: {}, effects: [] },
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(EvaluationResultSchema)({
        status: "returned",
        value: { kind: "unit", authority: "ambient" },
        trace: [],
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(EvaluationResultSchema)({
        status: "returned",
        value: { kind: "unit" },
        trace: [{ step: "zero", rule: 4, path: null }],
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(EvaluationResultSchema)({
        status: "exhausted",
        reason: "fuel",
        machineSnapshot: { format: "kernel-machine-v1", state: "not-json" },
        trace: [],
      }),
    ).toThrow();

    const checked = check(operationSignature([]), returnTerm("1", int(1)));
    expect(() => Schema.decodeUnknownSync(CheckResultSchema)(checked)).not.toThrow();
    if (checked.status !== "accepted") throw new Error("expected accepted");
    const rejectedCheck = check(
      operationSignature([]),
      operation("1", "missing", "operation", unit()),
    );
    expect(rejectedCheck.status).toBe("rejected");
    expect(() => Schema.decodeUnknownSync(CheckResultSchema)(rejectedCheck)).not.toThrow();
    const returned = evaluate(checked.program);
    expect(() => Schema.decodeUnknownSync(EvaluationResultSchema)(returned)).not.toThrow();

    expect(() =>
      Schema.decodeUnknownSync(CheckResultSchema)({
        ...checked,
        type: { kind: "return", grade: "1", value: { kind: "bool" } },
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(CheckResultSchema)({
        ...checked,
        authority: "ambient",
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(EvaluationResultSchema)({
        ...returned,
        trace: [],
      }),
    ).toThrow();

    const effectSignature = operationSignature([
      {
        label: "probe",
        operation: "receive",
        argumentType: unitType(),
        resultType: intType(),
      },
    ]);
    const request = check(effectSignature, operation("1", "probe", "receive", unit()));
    if (request.status !== "accepted") throw new Error("expected accepted request");
    const suspended = evaluate(request.program);
    if (suspended.status !== "suspended") throw new Error("expected suspension");
    expect(() => Schema.decodeUnknownSync(EvaluationResultSchema)(suspended)).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(EvaluationResultSchema)({
        ...suspended,
        request: { ...suspended.request, label: "forged" },
      }),
    ).toThrow();

    const exhausted = evaluate(checked.program, { fuel: 0, maximumTraceEntries: 1 });
    if (exhausted.status !== "exhausted") throw new Error("expected exhaustion");
    expect(() => Schema.decodeUnknownSync(EvaluationResultSchema)(exhausted)).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(EvaluationResultSchema)({
        ...exhausted,
        machineSnapshot: exhausted.machineSnapshot,
        authority: "ambient",
      }),
    ).toThrow();

    const normalizedCheck = normalizeCheckResult(checked);
    const normalizedRejectedCheck = normalizeCheckResult(rejectedCheck);
    const normalizedReturned = normalizeEvaluationResult(returned);
    const normalizedSuspended = normalizeEvaluationResult(suspended);
    const normalizedExhausted = normalizeEvaluationResult(exhausted);
    const rejectedResume = resume(suspended.oneShotToken, runtimeBool(true));
    expect(rejectedResume.status).toBe("runtime-rejected");
    expect(() => Schema.decodeUnknownSync(EvaluationResultSchema)(rejectedResume)).not.toThrow();
    const normalizedRejectedResume = normalizeEvaluationResult(rejectedResume);
    expect(() =>
      Schema.decodeUnknownSync(NormalizedCheckResultSchema)(normalizedCheck),
    ).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(NormalizedCheckResultSchema)(normalizedRejectedCheck),
    ).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(NormalizedEvaluationResultSchema)(normalizedReturned),
    ).not.toThrow();
    for (const normalized of [normalizedSuspended, normalizedExhausted, normalizedRejectedResume]) {
      expect(() =>
        Schema.decodeUnknownSync(NormalizedEvaluationResultSchema)(normalized),
      ).not.toThrow();
    }
    expect(() =>
      Schema.decodeUnknownSync(NormalizedCheckResultSchema)({
        ...normalizedCheck,
        authority: "ambient",
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(NormalizedEvaluationResultSchema)({
        ...normalizedReturned,
        value: { kind: "int", value: 1, authority: "ambient" },
      }),
    ).toThrow();
  });

  test("runtime-value guards reject cyclic and over-bound pairs without defects", () => {
    const cyclic: Record<string, unknown> = { kind: "pair" };
    cyclic["first"] = cyclic;
    cyclic["second"] = { kind: "unit" };
    expect(isRuntimeValue(cyclic)).toBeFalse();
    let schemaFailure: unknown;
    try {
      Schema.decodeUnknownSync(RuntimeValueSchema)(cyclic);
    } catch (cause) {
      schemaFailure = cause;
    }
    expect(schemaFailure).toBeDefined();
    expect(schemaFailure).not.toBeInstanceOf(RangeError);

    let deep: RuntimeValue = { kind: "unit" };
    for (let index = 0; index < 70; index += 1) {
      deep = { kind: "pair", first: deep, second: { kind: "unit" } };
    }
    expect(isRuntimeValue(deep)).toBeFalse();

    const signature = operationSignature([
      {
        label: "probe",
        operation: "receive",
        argumentType: unitType(),
        resultType: intType(),
      },
    ]);
    const checked = check(signature, operation("1", "probe", "receive", unit()));
    if (checked.status !== "accepted") throw new Error("expected accepted");
    const suspended = evaluate(checked.program);
    if (suspended.status !== "suspended") throw new Error("expected suspension");
    expect(resume(suspended.oneShotToken, cyclic as RuntimeValue)).toMatchObject({
      status: "runtime-rejected",
      diagnostic: { code: "resumption.result-type-mismatch" },
    });
  });
});
