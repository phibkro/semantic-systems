import { describe, expect, test } from "bun:test";
import {
  check,
  decodeComputationTerm,
  evaluate,
  int,
  operationSignature,
  returnTerm,
} from "../src/kernel-calculus/index.ts";
import type { CheckedProgram } from "../src/kernel-calculus/index.ts";

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
});
