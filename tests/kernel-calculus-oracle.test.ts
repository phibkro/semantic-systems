import { describe, expect, test } from "bun:test";
import {
  addGrades,
  check,
  effectRow,
  effectRowsEqual,
  evaluate,
  force,
  grades,
  int,
  multiplyGrades,
  returnTerm,
  thunk,
  unionEffectRows,
} from "../src/kernel-calculus/index.ts";
import {
  emptyOracleSignature,
  finiteOracleTypes,
  langBangOracleProvenance,
} from "../examples/kernel-calculus/oracle.ts";

describe("finite calculus law and differential oracles", () => {
  test("grade tables are exhaustive, closed, associative, and distributive", () => {
    const expectedAddition = [
      ["0", "0", "0"],
      ["0", "1", "1"],
      ["0", "omega", "omega"],
      ["1", "0", "1"],
      ["1", "1", "omega"],
      ["1", "omega", "omega"],
      ["omega", "0", "omega"],
      ["omega", "1", "omega"],
      ["omega", "omega", "omega"],
    ] as const;
    const expectedMultiplication = [
      ["0", "0", "0"],
      ["0", "1", "0"],
      ["0", "omega", "0"],
      ["1", "0", "0"],
      ["1", "1", "1"],
      ["1", "omega", "omega"],
      ["omega", "0", "0"],
      ["omega", "1", "omega"],
      ["omega", "omega", "omega"],
    ] as const;
    const actualAddition: unknown = grades.flatMap((left) =>
      grades.map((right) => [left, right, addGrades(left, right)]),
    );
    const actualMultiplication: unknown = grades.flatMap((left) =>
      grades.map((right) => [left, right, multiplyGrades(left, right)]),
    );
    expect(actualAddition).toEqual(expectedAddition);
    expect(actualMultiplication).toEqual(expectedMultiplication);
    for (const left of grades) {
      for (const middle of grades) {
        for (const right of grades) {
          expect(addGrades(addGrades(left, middle), right)).toBe(
            addGrades(left, addGrades(middle, right)),
          );
          expect(multiplyGrades(multiplyGrades(left, middle), right)).toBe(
            multiplyGrades(left, multiplyGrades(middle, right)),
          );
          expect(multiplyGrades(left, addGrades(middle, right))).toBe(
            addGrades(multiplyGrades(left, middle), multiplyGrades(left, right)),
          );
        }
      }
    }
  });

  test("counterexample 9: finite-set row laws ignore duplicates and normalize order", () => {
    const rows = [effectRow(), effectRow("a"), effectRow("b"), effectRow("b", "a", "a")];
    expect(effectRow("b", "a", "a")).toEqual(["a", "b"]);
    for (const left of rows) {
      expect(effectRowsEqual(unionEffectRows(left, left), left)).toBeTrue();
      for (const right of rows) {
        expect(
          effectRowsEqual(unionEffectRows(left, right), unionEffectRows(right, left)),
        ).toBeTrue();
        for (const third of rows) {
          expect(
            effectRowsEqual(
              unionEffectRows(unionEffectRows(left, right), third),
              unionEffectRows(left, unionEffectRows(right, third)),
            ),
          ).toBeTrue();
        }
      }
    }
  });

  test("counterexample 10: force(thunk(return(V))) agrees with return(V)", () => {
    const direct = check(emptyOracleSignature, returnTerm("1", int(12)));
    const forced = check(emptyOracleSignature, force(thunk(returnTerm("1", int(12)))));
    expect(direct.status).toBe("accepted");
    expect(forced.status).toBe("accepted");
    if (direct.status !== "accepted" || forced.status !== "accepted") {
      throw new Error("expected accepted");
    }
    expect(evaluate(direct.program)).toMatchObject({
      status: "returned",
      value: { kind: "int", value: 12 },
    });
    expect(evaluate(forced.program)).toMatchObject({
      status: "returned",
      value: { kind: "int", value: 12 },
    });
  });

  test("the pinned Apache-2.0 overlap fixture retains independent provenance", () => {
    expect(langBangOracleProvenance).toEqual({
      source: "lang-bang",
      commit: "5b8e032bcffefb23a3a153d3f5cea99050e589c1",
      license: "Apache-2.0",
      method: "independent expected observations; no source copied",
    });
    expect(finiteOracleTypes).toEqual({
      unit: { kind: "unit" },
      bool: { kind: "bool" },
      integer: { kind: "int" },
      pair: {
        kind: "pair",
        first: { kind: "int" },
        second: { kind: "bool" },
      },
      thunk: {
        kind: "thunk",
        effects: ["fresh"],
        computation: { kind: "return", grade: "1", value: { kind: "int" } },
      },
    });
  });
});
