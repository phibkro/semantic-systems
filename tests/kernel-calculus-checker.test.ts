import { describe, expect, test } from "bun:test";
import {
  apply,
  check,
  checkEffectAssertion,
  decodeComputationTerm,
  decodeValueTerm,
  effectRow,
  force,
  handle,
  int,
  intType,
  lambda,
  letTerm,
  operation,
  operationClause,
  operationSignature,
  pair,
  resumption,
  resumeTerm,
  returnClause,
  returnTerm,
  thunk,
  unit,
  unitType,
  variable,
} from "../src/kernel-calculus/index.ts";

const emptySignature = operationSignature([]);
const effectsSignature = operationSignature([
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

const accepted = (term: Parameters<typeof check>[1]) => {
  const result = check(effectsSignature, term);
  expect(result.status).toBe("accepted");
  if (result.status !== "accepted") throw new Error(result.diagnostics[0]?.message);
  return result;
};

describe("minimal kernel calculus checker", () => {
  test("positive: pure return, strict sequencing, and retained derivations", () => {
    const pure = accepted(returnTerm("1", int(7)));
    expect(pure.type).toEqual({ kind: "return", grade: "1", value: { kind: "int" } });
    expect(pure.effects).toEqual([]);
    expect(pure.usage).toEqual([]);
    expect(pure.derivation.rule).toBe("computation.return");

    const sequenced = accepted(letTerm(returnTerm("1", int(1)), returnTerm("1", variable(0))));
    expect(sequenced.derivation.rule).toBe("computation.let");
  });

  test("positive: 0 permits unused binders, 1 permits one use, and omega permits repeats", () => {
    expect(check(emptySignature, lambda(intType(), "0", returnTerm("1", unit()))).status).toBe(
      "accepted",
    );
    expect(check(emptySignature, lambda(intType(), "1", returnTerm("1", variable(0)))).status).toBe(
      "accepted",
    );
    expect(
      check(
        emptySignature,
        lambda(intType(), "omega", returnTerm("1", pair(variable(0), variable(0)))),
      ).status,
    ).toBe("accepted");
  });

  test("counterexample 3: an affine ordinary binder used twice is rejected", () => {
    const result = check(
      emptySignature,
      lambda(intType(), "1", returnTerm("1", pair(variable(0), variable(0)))),
    );
    expect(result).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "usage.affine-duplicated", rule: "computation.lambda" }],
    });
  });

  test("positive: thunk/force and computation-level application are inferred algorithmically", () => {
    const forced = accepted(force(thunk(returnTerm("1", int(3)))));
    expect(forced.type).toEqual({ kind: "return", grade: "1", value: { kind: "int" } });

    const applied = accepted(apply(lambda(intType(), "1", returnTerm("1", variable(0))), int(4)));
    expect(applied.type).toEqual({ kind: "return", grade: "1", value: { kind: "int" } });
  });

  test("counterexamples 1 and 2: runtime decoding separates value and computation families", () => {
    expect(decodeComputationTerm({ kind: "unit" })).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.expected-computation" }],
    });
    expect(decodeValueTerm({ kind: "return", grade: "1", value: { kind: "unit" } })).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.expected-value" }],
    });
  });

  test("counterexample 4: a one-shot resumption binder used twice is rejected", () => {
    const duplicated = handle(
      "fresh",
      operation("1", "fresh", "allocate", unit()),
      returnClause(returnTerm("1", variable(0))),
      [operationClause("allocate", letTerm(resumeTerm(0, int(1)), resumeTerm(0, int(2))))],
    );
    expect(check(effectsSignature, duplicated)).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "usage.affine-duplicated", rule: "handler.operation" }],
    });
  });

  test("counterexample 5: resumptions cannot escape through values", () => {
    for (const value of [
      resumption(0),
      pair(resumption(0), unit()),
      thunk(returnTerm("1", resumption(0))),
    ]) {
      const escaping = handle(
        "fresh",
        operation("1", "fresh", "allocate", unit()),
        returnClause(returnTerm("1", variable(0))),
        [operationClause("allocate", returnTerm("1", value))],
      );
      expect(check(effectsSignature, escaping)).toMatchObject({
        status: "rejected",
        diagnostics: [{ code: "resumption.escape" }],
      });
    }
    const operationEscape = handle(
      "fresh",
      operation("1", "fresh", "allocate", unit()),
      returnClause(returnTerm("1", variable(0))),
      [operationClause("allocate", operation("1", "foreign", "emit", resumption(0)))],
    );
    expect(check(effectsSignature, operationEscape)).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "resumption.escape" }],
    });
  });

  test("counterexample 8: a handler assertion cannot hide a foreign residual label", () => {
    const term = handle(
      "fresh",
      letTerm(
        operation("1", "fresh", "allocate", unit()),
        operation("1", "foreign", "emit", variable(0)),
      ),
      returnClause(returnTerm("1", variable(0))),
      [operationClause("allocate", resumeTerm(0, int(1)))],
    );
    const checked = check(effectsSignature, term);
    expect(checked).toMatchObject({ status: "accepted", effects: ["foreign"] });
    if (checked.status !== "accepted") throw new Error("expected accepted");
    expect(checkEffectAssertion(checked.program, effectRow())).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "effect.foreign-tunneling", rule: "handler.output-row" }],
    });
  });

  test("operation identity is collision-free for arbitrary nonempty strings", () => {
    const nulSignature = operationSignature([
      {
        label: "a\u0000b",
        operation: "c",
        argumentType: unitType(),
        resultType: intType(),
      },
      {
        label: "a",
        operation: "b\u0000c",
        argumentType: unitType(),
        resultType: intType(),
      },
    ]);
    expect(check(nulSignature, operation("1", "a\u0000b", "c", unit()))).toMatchObject({
      status: "accepted",
    });
    expect(check(nulSignature, operation("1", "a", "b\u0000c", unit()))).toMatchObject({
      status: "accepted",
    });
  });

  test("counterexamples 11 and 12: operation and resumption arguments use calculus types", () => {
    expect(check(effectsSignature, operation("1", "fresh", "allocate", int(0)))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "type.operation-argument-mismatch" }],
    });

    const wrongResume = handle(
      "fresh",
      operation("1", "fresh", "allocate", unit()),
      returnClause(returnTerm("1", variable(0))),
      [operationClause("allocate", resumeTerm(0, unit()))],
    );
    expect(check(effectsSignature, wrongResume)).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "type.resumption-argument-mismatch" }],
    });
  });
});
