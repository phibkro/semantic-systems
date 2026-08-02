import { expect, test } from "bun:test";
import { BunCrypto } from "@effect/platform-bun";
import { Effect } from "effect";
import {
  caseTerm,
  check,
  decodeComputationTerm,
  evaluate,
  handle,
  injectRight,
  int,
  intType,
  lambda,
  joinGrades,
  letTerm,
  operation,
  operationClause,
  operationSignature,
  resume,
  resumeTerm,
  returnClause,
  returnTerm,
  runtimeInjectRight,
  runtimeInt,
  sumType,
  unit,
  unitType,
  variable,
} from "../src/kernel-calculus/index.ts";
import {
  canonicalKernelDocumentJson,
  checkKernelDocument,
  decodeKernelCheckObservationValue,
  decodeKernelDocumentBytes,
  decodeKernelDocumentValue,
} from "../src/kernel-json/index.ts";
import { deriveIdentity, identityDomains } from "../src/normalized-core/identity.ts";
test("finite-sum grade join is a commutative upper bound", () => {
  expect(joinGrades("0", "1")).toBe("1");
  expect(joinGrades("1", "omega")).toBe("omega");
  expect(joinGrades("omega", "0")).toBe("omega");
  expect(joinGrades("1", "1")).toBe("1");
});
test("case q=0 keeps branch payload use absent and has no at-least-once floor", () => {
  const checked = check(
    operationSignature([]),
    caseTerm(injectRight(unitType(), unit()), returnTerm("1", int(0)), returnTerm("1", int(1))),
  );
  expect(checked.status).toBe("accepted");
  if (checked.status !== "accepted") return;
  const caseJudgment = checked.judgments.find(
    (judgment) => judgment.tag === "computation-judgment" && judgment.rule === "computation.case",
  );
  expect(caseJudgment?.usage).toEqual([]);
  expect(evaluate(checked.program)).toMatchObject({
    status: "returned",
    value: { kind: "int", value: 1 },
  });
});
test("case joins mutually exclusive uses of one affine outer binder", () => {
  const checked = check(
    operationSignature([]),
    lambda(
      sumType(unitType(), intType()),
      "1",
      caseTerm(variable(0), returnTerm("1", variable(1)), returnTerm("1", variable(1))),
    ),
  );
  expect(checked.status).toBe("accepted");
});
test("right injection selects one case branch and binds payload at zero", () => {
  const term = caseTerm(
    injectRight(unitType(), int(7)),
    returnTerm("1", int(0)),
    returnTerm("1", variable(0)),
  );
  const checked = check(operationSignature([]), term);
  expect(checked.status).toBe("accepted");
  if (checked.status !== "accepted") return;
  const result = evaluate(checked.program);
  expect(result.status).toBe("returned");
  if (result.status !== "returned") return;
  expect(result.value).toEqual({ kind: "int", value: 7 });
  expect(result.trace.map((entry) => entry.rule)).toContain("computation.case-right");
  expect(result.trace.map((entry) => entry.rule)).not.toContain("computation.case-left");
});
test("case joins both branch resumption usage vectors at nonzero context length", () => {
  const term = handle(
    "fresh",
    operation("1", "fresh", "allocate", unit()),
    returnClause(returnTerm("1", variable(0))),
    [
      operationClause(
        "allocate",
        caseTerm(injectRight(unitType(), unit()), resumeTerm(0, int(1)), resumeTerm(0, int(2))),
      ),
    ],
  );
  const checked = check(
    operationSignature([
      { label: "fresh", operation: "allocate", argumentType: unitType(), resultType: intType() },
    ]),
    term,
  );
  expect(checked.status).toBe("accepted");
  if (checked.status !== "accepted") return;
  const caseJudgment = checked.judgments.find(
    (judgment) => judgment.tag === "computation-judgment" && judgment.rule === "computation.case",
  );
  expect(caseJudgment?.resumptionUsage).toEqual(["1"]);
});

test("case rejects affine scrutinee-and-branch resumption duplication", () => {
  const term = handle(
    "fresh",
    operation("1", "fresh", "allocate", unit()),
    returnClause(returnTerm("1", variable(0))),
    [
      operationClause(
        "allocate",
        caseTerm(
          injectRight(unitType(), unit()),
          letTerm(resumeTerm(0, int(1)), resumeTerm(0, int(2))),
          resumeTerm(0, int(3)),
        ),
      ),
    ],
  );
  const checked = check(
    operationSignature([
      { label: "fresh", operation: "allocate", argumentType: unitType(), resultType: intType() },
    ]),
    term,
  );
  expect(checked.status).toBe("rejected");
  if (checked.status !== "rejected") return;
  expect(checked.diagnostics[0]).toMatchObject({
    code: "usage.affine-duplicated",
    rule: "handler.operation",
  });
});
test("case rejects unequal branch computation types at the right branch path", () => {
  const term = caseTerm(
    injectRight(unitType(), int(7)),
    returnTerm("1", int(0)),
    returnTerm("1", unit()),
  );
  const checked = check(operationSignature([]), term);
  expect(checked.status).toBe("rejected");
  if (checked.status !== "rejected") return;
  expect(checked.diagnostics[0]).toMatchObject({
    code: "type.case-branch-mismatch",
    rule: "computation.case",
    path: "$.rightBranch",
  });
});
test("sum values preserve latent effect rows through strict JSON roundtrip", () => {
  const document = {
    format: "semantic.kernel-json",
    version: 2,
    kernel: "semantic.kernel-calculus/0018/v2",
    signature: [
      {
        label: "fresh",
        operation: "allocate",
        argument_type: { tag: "unit" },
        result_type: { tag: "int" },
      },
    ],
    program: {
      tag: "return",
      grade: "1",
      value: {
        tag: "inject-right",
        left_type: { tag: "unit" },
        value: {
          tag: "thunk",
          body: {
            tag: "operation",
            grade: "1",
            label: "fresh",
            operation: "allocate",
            argument: { tag: "unit" },
          },
        },
      },
    },
  };
  const decoded = decodeKernelDocumentValue(document);
  expect(decoded.status).toBe("decoded");
  if (decoded.status !== "decoded") return;
  const canonical = canonicalKernelDocumentJson(decoded.value);
  const roundTripped = decodeKernelDocumentBytes(new TextEncoder().encode(canonical));
  expect(roundTripped.status).toBe("decoded");
  if (roundTripped.status !== "decoded") return;
  const checked = checkKernelDocument(roundTripped.value);
  expect(checked.observation.tag).toBe("accepted");
  if (checked.observation.tag !== "accepted") return;
  const sumTypeEntry = checked.observation.types.find((entry) => entry.tag === "sum");
  expect(sumTypeEntry).toEqual({ tag: "sum", left: 0, right: 3 });
  expect(checked.observation.types).toContainEqual({
    tag: "thunk",
    effects: [0],
    computation: 2,
  });
});
test("external resumption accepts and returns a custodied sum value", () => {
  const sum = sumType(unitType(), intType());
  const checked = check(
    operationSignature([
      { label: "receive", operation: "read", argumentType: unitType(), resultType: sum },
    ]),
    operation("1", "receive", "read", unit()),
  );
  expect(checked.status).toBe("accepted");
  if (checked.status !== "accepted") return;
  const suspended = evaluate(checked.program);
  expect(suspended.status).toBe("suspended");
  if (suspended.status !== "suspended") return;
  const resumed = resume(suspended.oneShotToken, runtimeInjectRight(runtimeInt(9)));
  expect(resumed).toMatchObject({
    status: "returned",
    value: { kind: "inject-right", value: { kind: "int", value: 9 } },
  });
});

test("sum runtime values are deeply frozen custody snapshots", () => {
  const value = runtimeInjectRight(runtimeInjectRight(runtimeInt(11)));
  expect(Object.isFrozen(value)).toBeTrue();
  if (value.kind !== "inject-right") throw new Error("expected outer sum value");
  expect(Object.isFrozen(value.value)).toBeTrue();
  if (value.value.kind !== "inject-right") throw new Error("expected nested sum value");
  expect(Object.isFrozen(value.value.value)).toBeTrue();
  expect(value).toEqual({
    kind: "inject-right",
    value: { kind: "inject-right", value: { kind: "int", value: 11 } },
  });
});
test("strict checked-observation decoder accepts sum judgments and rejects mismatch facts", () => {
  const accepted = decodeKernelDocumentValue({
    format: "semantic.kernel-json",
    version: 2,
    kernel: "semantic.kernel-calculus/0018/v2",
    signature: [],
    program: {
      tag: "case",
      value: { tag: "inject-right", left_type: { tag: "unit" }, value: { tag: "int", value: 7 } },
      left_branch: { tag: "return", grade: "1", value: { tag: "int", value: 0 } },
      right_branch: { tag: "return", grade: "1", value: { tag: "bound-value", distance: 0 } },
    },
  });
  expect(accepted.status).toBe("decoded");
  if (accepted.status !== "decoded") return;
  const observation = checkKernelDocument(accepted.value);
  const strictObservation = observation;
  expect(
    decodeKernelCheckObservationValue(JSON.parse(JSON.stringify(strictObservation))).status,
  ).toBe("decoded");
  const rejected = decodeKernelDocumentValue({
    format: "semantic.kernel-json",
    version: 2,
    kernel: "semantic.kernel-calculus/0018/v2",
    signature: [],
    program: {
      tag: "case",
      value: { tag: "inject-right", left_type: { tag: "unit" }, value: { tag: "int", value: 7 } },
      left_branch: { tag: "return", grade: "1", value: { tag: "int", value: 0 } },
      right_branch: { tag: "return", grade: "1", value: { tag: "unit" } },
    },
  });
  expect(rejected.status).toBe("decoded");
  if (rejected.status !== "decoded") return;
  const rejectedObservation = checkKernelDocument(rejected.value);
  expect(rejectedObservation.observation.tag).toBe("rejected");
  expect(
    decodeKernelCheckObservationValue(JSON.parse(JSON.stringify(rejectedObservation))).status,
  ).toBe("decoded");
});
const identityDomainCases = Object.entries(identityDomains) as Array<
  [keyof typeof identityDomains, (typeof identityDomains)[keyof typeof identityDomains]]
>;
for (const [name, domain] of identityDomainCases) {
  test(`sum syntax changes the ${name} identity domain`, async () => {
    const base = {
      tag: "sum" as const,
      left: { tag: "unit" as const },
      right: { tag: "int" as const },
    };
    const changed = {
      ...base,
      right: { tag: "bool" as const },
    };
    const first = await Effect.runPromise(
      deriveIdentity(domain, base).pipe(Effect.provide(BunCrypto.layer)),
    );
    const second = await Effect.runPromise(
      deriveIdentity(domain, changed).pipe(Effect.provide(BunCrypto.layer)),
    );
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(second).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });
}

test("active kernel JSON rejects historical v1 markers", () => {
  const result = decodeKernelDocumentValue({
    format: "semantic.kernel-json",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    signature: [],
    program: { tag: "return", grade: "1", value: { tag: "int", value: 7 } },
  });
  expect(result.status).toBe("rejected");
});

test("sum type equality remains ordered", () => {
  const left = decodeComputationTerm({
    kind: "return",
    grade: "1",
    value: { kind: "inject-right", leftType: { kind: "unit" }, value: { kind: "int", value: 1 } },
  });
  expect(left.status).toBe("decoded");
  expect(sumType(unitType(), intType())).not.toEqual(sumType(intType(), unitType()));
});
