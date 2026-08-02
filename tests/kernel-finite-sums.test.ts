import { expect, test } from "bun:test";
import { BunCrypto } from "@effect/platform-bun";
import { Effect } from "effect";
import {
  caseTerm,
  check,
  decodeComputationTerm,
  evaluate,
  force,
  handle,
  injectLeft,
  injectRight,
  int,
  intType,
  joinGrades,
  lambda,
  letTerm,
  pair,
  operation,
  operationClause,
  operationSignature,
  resume,
  resumeTerm,
  returnClause,
  returnTerm,
  runtimeInjectLeft,
  runtimeInjectRight,
  runtimeInt,
  sumType,
  thunk,
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
  projectKernelProgram,
} from "../src/kernel-json/index.ts";
import { deriveIdentity, identityDomains } from "../src/normalized-core/identity.ts";
import { emitNormalizedCore } from "../src/normalized-core/index.ts";
test("finite-sum grade join is a commutative upper bound", () => {
  expect(joinGrades("0", "1")).toBe("1");
  expect(joinGrades("1", "omega")).toBe("omega");
  expect(joinGrades("omega", "0")).toBe("omega");
  expect(joinGrades("1", "1")).toBe("1");
});
test("case q=0 keeps captured scrutinee use absent with no at-least-once floor", () => {
  const checked = check(
    operationSignature([]),
    lambda(
      sumType(unitType(), intType()),
      "1",
      caseTerm(variable(0), returnTerm("1", int(0)), returnTerm("1", int(1))),
    ),
  );
  expect(checked.status).toBe("accepted");
  if (checked.status !== "accepted") return;
  const caseJudgment = checked.judgments.find(
    (judgment) => judgment.tag === "computation-judgment" && judgment.rule === "computation.case",
  );
  expect(caseJudgment?.usage).toEqual(["0"]);
  expect(caseJudgment?.premises.map((index) => checked.judgments[index]?.path)).toEqual([
    "$.body.value",
    "$.body.leftBranch",
    "$.body.rightBranch",
  ]);
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
test("left injection selects the left branch and binds its payload at zero", () => {
  expect(runtimeInjectLeft(runtimeInt(3))).toEqual({
    kind: "inject-left",
    value: { kind: "int", value: 3 },
  });
  const checked = check(
    operationSignature([]),
    caseTerm(injectLeft(int(7), unitType()), returnTerm("1", variable(0)), returnTerm("1", int(0))),
  );
  expect(checked.status).toBe("accepted");
  if (checked.status !== "accepted") return;
  const result = evaluate(checked.program);
  expect(result.status).toBe("returned");
  if (result.status !== "returned") return;
  expect(result.value).toEqual({ kind: "int", value: 7 });
  expect(result.trace.map((entry) => entry.rule)).toContain("computation.case-left");
  expect(result.trace.map((entry) => entry.rule)).not.toContain("computation.case-right");
});
test("case rejects a non-sum scrutinee with the frozen diagnostic", () => {
  const checked = check(
    operationSignature([]),
    caseTerm(int(1), returnTerm("1", unit()), returnTerm("1", unit())),
  );
  expect(checked.status).toBe("rejected");
  if (checked.status !== "rejected") return;
  expect(checked.diagnostics[0]).toMatchObject({
    code: "type.expected-sum",
    rule: "computation.case",
    path: "$.value",
  });
});
test("case payload duplication scales the scrutinee use to omega", () => {
  const checked = check(
    operationSignature([]),
    lambda(
      intType(),
      "1",
      caseTerm(
        injectRight(unitType(), variable(0)),
        returnTerm("1", pair(int(0), int(0))),
        returnTerm("1", pair(variable(0), variable(0))),
      ),
    ),
  );
  expect(checked.status).toBe("rejected");
  if (checked.status !== "rejected") return;
  expect(checked.diagnostics[0]).toMatchObject({
    code: "usage.affine-duplicated",
    rule: "computation.lambda",
  });
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

test("case rejects affine resumption use shared by its scrutinee and selected branch", () => {
  const term = handle(
    "fresh",
    operation("1", "fresh", "allocate", unit()),
    returnClause(returnTerm("1", variable(0))),
    [
      operationClause(
        "allocate",
        caseTerm(
          injectRight(unitType(), thunk(resumeTerm(0, int(1)))),
          returnTerm("1", int(0)),
          letTerm(force(variable(0)), resumeTerm(0, int(2))),
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
        left_type: {
          tag: "thunk",
          effects: ["fresh"],
          computation: {
            tag: "function",
            parameter: { tag: "unit" },
            grade: "1",
            effects: ["fresh"],
            result: { tag: "return", grade: "1", value: { tag: "unit" } },
          },
        },
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
  expect(checked.observation.types).toContainEqual(expect.objectContaining({ tag: "sum" }));
  expect(checked.observation.types).toContainEqual(
    expect.objectContaining({ tag: "thunk", effects: [0] }),
  );
  expect(checked.observation.types).toContainEqual(
    expect.objectContaining({ tag: "function", effects: [0] }),
  );
  expect(decodeKernelCheckObservationValue(JSON.parse(JSON.stringify(checked))).status).toBe(
    "decoded",
  );
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

test("fuel exhaustion snapshots a custodied sum value in the machine environment", () => {
  const checked = check(
    operationSignature([]),
    caseTerm(
      injectRight(unitType(), injectRight(unitType(), int(11))),
      returnTerm("1", injectRight(unitType(), int(0))),
      returnTerm("1", variable(0)),
    ),
  );
  expect(checked.status).toBe("accepted");
  if (checked.status !== "accepted") return;
  const exhausted = evaluate(checked.program, { fuel: 1, maximumTraceEntries: 10 });
  expect(exhausted).toMatchObject({
    status: "exhausted",
    reason: "fuel",
    machineSnapshot: { format: "kernel-machine-v2" },
    trace: [{ rule: "computation.case-right" }],
  });
  if (exhausted.status !== "exhausted") return;
  expect(Object.isFrozen(exhausted.machineSnapshot)).toBeTrue();
  expect(JSON.parse(exhausted.machineSnapshot.state)).toMatchObject({
    control: {
      environment: {
        values: [{ kind: "inject-right", value: { kind: "int", value: 11 } }],
      },
    },
  });
});
test("strict checked-observation decoder accepts v2 sum facts and rejects unknown rules", () => {
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
  const tampered = JSON.parse(JSON.stringify(strictObservation)) as {
    observation: { judgments: Array<{ rule: string }> };
  };
  tampered.observation.judgments[0]!.rule = "computation.unknown";
  expect(decodeKernelCheckObservationValue(tampered)).toMatchObject({
    status: "rejected",
    diagnostics: [{ code: "decode.expected-rule" }],
  });
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
  const nonSum = decodeKernelDocumentValue({
    format: "semantic.kernel-json",
    version: 2,
    kernel: "semantic.kernel-calculus/0018/v2",
    signature: [],
    program: {
      tag: "case",
      value: { tag: "int", value: 1 },
      left_branch: { tag: "return", grade: "1", value: { tag: "unit" } },
      right_branch: { tag: "return", grade: "1", value: { tag: "unit" } },
    },
  });
  expect(nonSum.status).toBe("decoded");
  if (nonSum.status !== "decoded") return;
  const nonSumObservation = checkKernelDocument(nonSum.value);
  expect(nonSumObservation.observation).toMatchObject({
    tag: "rejected",
    diagnostics: [{ code: "type.expected-sum", rule: "computation.case" }],
  });
  expect(
    decodeKernelCheckObservationValue(JSON.parse(JSON.stringify(nonSumObservation))).status,
  ).toBe("decoded");
});

test("normalized sum tracer matches its golden and changes projected identities", async () => {
  const decoded = decodeKernelDocumentBytes(
    new Uint8Array(
      await Bun.file(
        new URL("../examples/kernel-json/sum-case.kernel.json", import.meta.url),
      ).arrayBuffer(),
    ),
  );
  expect(decoded.status).toBe("decoded");
  if (decoded.status !== "decoded") return;
  const projected = projectKernelProgram(decoded.value);
  expect(projected.status).toBe("projected");
  if (projected.status !== "projected") return;
  const checked = check(projected.value.signature, projected.value.term);
  expect(checked.status).toBe("accepted");
  if (checked.status !== "accepted") return;
  const metadata = {
    assumptions: [{ kind: "declared" as const, statement: "SHA-256 is collision resistant" }],
    source: {
      units: [
        {
          source_key: "sum-case",
          uri: "memory:sum-case",
          content_identity: `sha256:${"1".repeat(64)}`,
          byte_length: 1,
        },
      ],
      correspondence: [
        {
          node_path: "/term",
          source_key: "sum-case",
          role: "expression" as const,
          start_byte: 0,
          end_byte: 1,
        },
      ],
    },
  };
  const emitted = await Effect.runPromise(
    emitNormalizedCore(checked.program, metadata).pipe(Effect.provide(BunCrypto.layer)),
  );
  expect(emitted.status).toBe("emitted");
  if (emitted.status !== "emitted") return;
  expect(emitted.artifact).toEqual(
    await Bun.file(
      new URL("../examples/normalized-core/sum-case.expected.json", import.meta.url),
    ).json(),
  );

  const changed = check(
    operationSignature([]),
    letTerm(
      returnTerm("1", injectLeft(int(8), unitType())),
      caseTerm(variable(0), returnTerm("1", variable(0)), returnTerm("1", int(0))),
    ),
  );
  expect(changed.status).toBe("accepted");
  if (changed.status !== "accepted") return;
  const changedEmission = await Effect.runPromise(
    emitNormalizedCore(changed.program, metadata).pipe(Effect.provide(BunCrypto.layer)),
  );
  expect(changedEmission.status).toBe("emitted");
  if (changedEmission.status !== "emitted") return;
  expect(changedEmission.artifact.semantic_identity).not.toBe(emitted.artifact.semantic_identity);
  expect(changedEmission.artifact.artifact_identity).not.toBe(emitted.artifact.artifact_identity);
});

test("normalized identity domains are exactly version 2", () => {
  expect(identityDomains).toEqual({
    operation: "semantic.normalized-core/operation/v2",
    assumption: "semantic.normalized-core/assumption/v2",
    sourceUnit: "semantic.normalized-core/source-unit/v2",
    semantic: "semantic.normalized-core/semantic/v2",
    artifact: "semantic.normalized-core/artifact/v2",
  });
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
