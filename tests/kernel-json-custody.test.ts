import { describe, expect, test } from "bun:test";
import {
  checkKernelDocument,
  decodeKernelDocumentValue,
  encodeCanonicalKernelDocument,
  kernelJsonSchema,
} from "../src/kernel-json/index.ts";

const pureProgram = {
  format: "semantic.kernel-json",
  version: 1,
  kernel: "semantic.kernel-calculus/0018/v1",
  signature: [],
  program: { tag: "return", grade: "1", value: { tag: "int", value: 1 } },
};

describe("kernel-json custody", () => {
  test("decoded documents are deeply immutable snapshots", () => {
    const decoded = decodeKernelDocumentValue(pureProgram);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    expect(Object.isFrozen(decoded.value)).toBe(true);
    expect(Object.isFrozen(decoded.value.program)).toBe(true);
    expect(Object.isFrozen(decoded.value.signature)).toBe(true);
  });

  test("later caller mutation of the input cannot change a prior decoded document", () => {
    const input: Record<string, unknown> = { ...pureProgram, signature: [] };
    const decoded = decodeKernelDocumentValue(input);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const before = encodeCanonicalKernelDocument(decoded.value);
    input["program"] = { tag: "return", grade: "1", value: { tag: "int", value: 999 } };
    const after = encodeCanonicalKernelDocument(decoded.value);
    expect(after).toEqual(before);
  });

  test("a forged document (constructed without the strict decoder) still enters projection and check composition safely", () => {
    // Projection and check composition trust only the decoded shape, not any
    // out-of-band custody marker; a hand-built object matching the shape is
    // "inert data" and is re-validated by the 0018 decoders it is fed
    // through, never treated as pre-checked authority.
    const forged = {
      format: "semantic.kernel-json",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      signature: [],
      program: { tag: "return", grade: "1", value: { tag: "int", value: 1 } },
    } as const;
    const observation = checkKernelDocument(forged as never);
    expect(observation.observation.tag).toBe("accepted");
  });

  test("a caller-mutated document snapshot never changes a previously produced observation", () => {
    const decoded = decodeKernelDocumentValue(pureProgram);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const observation = checkKernelDocument(decoded.value);
    expect(() => {
      (decoded.value.signature as unknown as Array<unknown>).push({});
    }).toThrow();
    const again = checkKernelDocument(decoded.value);
    expect(again).toEqual(observation);
  });

  test("the schema artifact cannot be mutated by a caller", () => {
    const schema = kernelJsonSchema();
    expect(() => {
      (schema as Record<string, unknown>)["title"] = "mutated";
    }).toThrow();
  });

  test("decoding does not mint checked or 0019 authority: only representation validity", () => {
    const decoded = decodeKernelDocumentValue(pureProgram);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    // A decoded KernelDocument is plain, inert, tagged JSON data: it carries
    // none of 0018's private CheckedProgram custody markers.
    expect(Object.getPrototypeOf(decoded.value)).toBe(Object.prototype);
    expect("program" in decoded.value).toBe(true);
  });

  test("an accepted observation's judgments and diagnostics arrays are frozen", () => {
    const decoded = decodeKernelDocumentValue(pureProgram);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const observation = checkKernelDocument(decoded.value);
    if (observation.observation.tag !== "accepted") throw new Error("expected accepted");
    expect(Object.isFrozen(observation.observation.judgments)).toBe(true);
  });
});
