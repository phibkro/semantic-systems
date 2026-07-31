import { describe, expect, test } from "bun:test";
import {
  canonicalKernelCheckObservationJson,
  checkKernelDocument,
  decodeKernelDocumentValue,
} from "../src/kernel-json/index.ts";

const readGoldenJson = async (name: string): Promise<unknown> =>
  Bun.file(new URL(`../examples/kernel-json/${name}`, import.meta.url)).json();

const checkGolden = async (documentFile: string, observationFile: string) => {
  const documentJson = await readGoldenJson(documentFile);
  const decoded = decodeKernelDocumentValue(documentJson);
  expect(decoded.status).toBe("decoded");
  if (decoded.status !== "decoded") throw new Error("unreachable");
  const observation = checkKernelDocument(decoded.value);
  const expectedJson = await readGoldenJson(observationFile);
  expect(canonicalKernelCheckObservationJson(observation)).toBe(
    canonicalKernelCheckObservationJson(expectedJson as never),
  );
  return observation;
};

describe("checkKernelDocument reproduces the frozen golden observations", () => {
  test("pure let program: accepted, byte-exact", async () => {
    await checkGolden("pure-program.kernel.json", "pure-program.accepted.kernel-check.json");
  });

  test("handled fresh.allocate program: accepted with one resumption, byte-exact", async () => {
    const observation = await checkGolden(
      "handled-program.kernel.json",
      "handled-program.accepted.kernel-check.json",
    );
    if (observation.observation.tag !== "accepted") throw new Error("expected accepted");
    // Complete signature_origins for both computation.operation (one entry)
    // and handler.deep (every declaration under the handled label).
    const operationJudgment = observation.observation.judgments.find(
      (judgment) =>
        judgment.tag === "computation-judgment" && judgment.rule === "computation.operation",
    );
    const handlerJudgment = observation.observation.judgments.find(
      (judgment) => judgment.tag === "computation-judgment" && judgment.rule === "handler.deep",
    );
    expect(
      operationJudgment &&
        "signature_origins" in operationJudgment &&
        operationJudgment.signature_origins,
    ).toEqual(["/signature/0"]);
    expect(
      handlerJudgment &&
        "signature_origins" in handlerJudgment &&
        handlerJudgment.signature_origins,
    ).toEqual(["/signature/0"]);
  });

  test("double-resume clause: rejected with usage.affine-duplicated, byte-exact", async () => {
    const observation = await checkGolden(
      "rejected-double-resume.kernel.json",
      "rejected-double-resume.rejected.kernel-check.json",
    );
    if (observation.observation.tag !== "rejected") throw new Error("expected rejected");
    expect(observation.observation.diagnostics[0]?.code).toBe("usage.affine-duplicated");
    expect(observation.observation.diagnostics[0]?.occurrence_path).toBe(
      "/program/operation_clauses/0/body",
    );
  });

  test("a schema-valid document rejected for signature disagreement", () => {
    const decoded = decodeKernelDocumentValue({
      format: "semantic.kernel-json",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      signature: [],
      program: {
        tag: "operation",
        grade: "1",
        label: "fresh",
        operation: "allocate",
        argument: { tag: "unit" },
      },
    });
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const observation = checkKernelDocument(decoded.value);
    expect(observation.observation.tag).toBe("rejected");
    if (observation.observation.tag !== "rejected") return;
    expect(observation.observation.diagnostics[0]?.code).toBe("signature.operation-unknown");
  });

  test("an out-of-range distance is rejected by the checker, not the schema", () => {
    const decoded = decodeKernelDocumentValue({
      format: "semantic.kernel-json",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      signature: [],
      program: { tag: "return", grade: "1", value: { tag: "bound-value", distance: 0 } },
    });
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const observation = checkKernelDocument(decoded.value);
    expect(observation.observation.tag).toBe("rejected");
    if (observation.observation.tag !== "rejected") return;
    expect(observation.observation.diagnostics[0]?.code).toBe("scope.variable-out-of-range");
  });

  test("a resumption value structurally accepted is semantically rejected", () => {
    const decoded = decodeKernelDocumentValue({
      format: "semantic.kernel-json",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      signature: [],
      program: { tag: "return", grade: "1", value: { tag: "resumption", distance: 0 } },
    });
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const observation = checkKernelDocument(decoded.value);
    expect(observation.observation.tag).toBe("rejected");
    if (observation.observation.tag !== "rejected") return;
    expect(observation.observation.diagnostics[0]?.code).toBe("resumption.escape");
  });
});
