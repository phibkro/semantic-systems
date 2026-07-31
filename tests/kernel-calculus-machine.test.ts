import { describe, expect, test } from "bun:test";
import {
  check,
  effectRow,
  evaluate,
  handle,
  int,
  intType,
  letTerm,
  operation,
  operationClause,
  operationSignature,
  resume,
  resumeTerm,
  returnClause,
  returnTerm,
  runtimeBool,
  runtimeInt,
  unit,
  unitType,
  variable,
} from "../src/kernel-calculus/index.ts";
import { observeInternalResumptionOneShotForTest } from "../src/kernel-calculus/machine.ts";

const signature = operationSignature([
  {
    label: "fresh",
    operation: "allocate",
    argumentType: unitType(),
    resultType: intType(),
  },
  {
    label: "foreign",
    operation: "emit",
    argumentType: intType(),
    resultType: unitType(),
  },
]);

const runChecked = (term: Parameters<typeof check>[1], fuel = 100) => {
  const checked = check(signature, term);
  expect(checked.status).toBe("accepted");
  if (checked.status !== "accepted") throw new Error(checked.diagnostics[0]?.message);
  return evaluate(checked.program, { fuel, maximumTraceEntries: 100 });
};

describe("minimal kernel calculus machine", () => {
  test("positive: pure sequencing returns the expected integer", () => {
    expect(
      runChecked(letTerm(returnTerm("1", int(1)), returnTerm("1", variable(0)))),
    ).toMatchObject({
      status: "returned",
      value: { kind: "int", value: 1 },
    });
  });

  test("positive: a deep handler resumes through repeated handled operations", () => {
    const twice = handle(
      "fresh",
      letTerm(
        operation("1", "fresh", "allocate", unit()),
        operation("1", "fresh", "allocate", unit()),
      ),
      returnClause(returnTerm("1", variable(0))),
      [operationClause("allocate", resumeTerm(0, int(9)))],
      effectRow(),
    );
    const result = runChecked(twice);
    expect(result).toMatchObject({
      status: "returned",
      value: { kind: "int", value: 9 },
    });
    expect(result.trace.filter((entry) => entry.rule === "operation.handle")).toHaveLength(2);
    expect(result.trace.filter((entry) => entry.rule === "resumption.consume")).toHaveLength(2);
  });

  test("positive: a zero-shot clause returns without consuming its resumption", () => {
    const zeroShot = handle(
      "fresh",
      operation("1", "fresh", "allocate", unit()),
      returnClause(returnTerm("1", variable(0))),
      [operationClause("allocate", returnTerm("1", int(77)))],
    );
    expect(runChecked(zeroShot)).toMatchObject({
      status: "returned",
      value: { kind: "int", value: 77 },
    });
  });

  test("positive 10 and counterexample 13: a foreign operation stays visible and suspends", () => {
    const nestedForeign = handle(
      "fresh",
      letTerm(
        operation("1", "fresh", "allocate", unit()),
        operation("1", "foreign", "emit", variable(0)),
      ),
      returnClause(returnTerm("1", variable(0))),
      [operationClause("allocate", resumeTerm(0, int(5)))],
      effectRow("foreign"),
    );
    const checked = check(signature, nestedForeign);
    expect(checked).toMatchObject({ status: "accepted", effects: ["foreign"] });
    if (checked.status !== "accepted") throw new Error("expected accepted");
    const result = evaluate(checked.program);
    expect(result).toMatchObject({
      status: "suspended",
      request: {
        label: "foreign",
        operation: "emit",
        argument: { kind: "int", value: 5 },
        resultType: { kind: "unit" },
      },
    });
  });

  test("positive 9 and counterexample 7: typed external resume is one shot", () => {
    const suspended = runChecked(operation("1", "fresh", "allocate", unit()));
    expect(suspended.status).toBe("suspended");
    if (suspended.status !== "suspended") throw new Error("expected suspension");

    const wrong = resume(suspended.oneShotToken, runtimeBool(true));
    expect(wrong).toMatchObject({
      status: "runtime-rejected",
      diagnostic: { code: "resumption.result-type-mismatch" },
    });

    const returned = resume(suspended.oneShotToken, runtimeInt(42));
    expect(returned).toMatchObject({
      status: "returned",
      value: { kind: "int", value: 42 },
    });

    expect(resume(suspended.oneShotToken, runtimeInt(43))).toMatchObject({
      status: "runtime-rejected",
      diagnostic: { code: "resumption.already-used" },
    });
  });

  test("external values are snapshotted before a resumed machine observes them", () => {
    const suspended = runChecked(operation("1", "fresh", "allocate", unit()));
    if (suspended.status !== "suspended") throw new Error("expected suspension");
    const authored = { kind: "int" as const, value: 17 };
    const returned = resume(suspended.oneShotToken, authored);
    authored.value = 999;
    expect(returned).toMatchObject({
      status: "returned",
      value: { kind: "int", value: 17 },
    });
  });

  test("counterexample 6: the internal custody gate rejects a second consumption", () => {
    expect(observeInternalResumptionOneShotForTest()).toEqual([
      "consumed",
      "resumption.already-used",
    ]);
  });

  test("counterexample 14: zero fuel returns an exact frozen machine snapshot", () => {
    const result = runChecked(returnTerm("1", int(1)), 0);
    expect(result).toEqual({
      status: "exhausted",
      reason: "fuel",
      machineSnapshot: {
        control: "term.return",
        path: "$",
        frames: [],
        nextResumptionIdentity: 1,
      },
      trace: [],
    });
    expect(Object.isFrozen(result)).toBeTrue();
    if (result.status !== "exhausted") throw new Error("expected exhaustion");
    expect(Object.isFrozen(result.machineSnapshot)).toBeTrue();
  });

  test("trace bounds exhaust without truncating a claimed-complete trace", () => {
    const checked = check(signature, returnTerm("1", int(1)));
    if (checked.status !== "accepted") throw new Error("expected accepted");
    expect(evaluate(checked.program, { fuel: 10, maximumTraceEntries: 1 })).toMatchObject({
      status: "exhausted",
      reason: "trace",
      trace: [{ step: 0, rule: "computation.return" }],
    });
  });
});
