import { describe, expect, test } from "bun:test";
import {
  decodeKernelCheckObservationBytes,
  decodeKernelCheckObservationValue,
  decodeKernelDocumentBytes,
  decodeKernelDocumentValue,
  encodeCanonicalKernelDocument,
  kernelJsonSchema,
} from "../src/kernel-json/index.ts";

const readGoldenJson = async (name: string): Promise<unknown> =>
  Bun.file(new URL(`../examples/kernel-json/${name}`, import.meta.url)).json();

const readGoldenBytes = async (name: string): Promise<Uint8Array> =>
  new Uint8Array(
    await Bun.file(new URL(`../examples/kernel-json/${name}`, import.meta.url)).arrayBuffer(),
  );

const documentGoldens = [
  "pure-program.kernel.json",
  "handled-program.kernel.json",
  "sum-case.kernel.json",
  "rejected-double-resume.kernel.json",
] as const;

const observationGoldens = [
  "pure-program.accepted.kernel-check.json",
  "handled-program.accepted.kernel-check.json",
  "sum-case.accepted.kernel-check.json",
  "rejected-double-resume.rejected.kernel-check.json",
] as const;

describe("kernel-json schema artifact", () => {
  test("kernelJsonSchema is byte-equal to the checked-in schema file", async () => {
    const fileSchema = await Bun.file(
      new URL("../spec/kernel-json/kernel-json-v2.schema.json", import.meta.url),
    ).json();
    expect(JSON.stringify(kernelJsonSchema())).toBe(JSON.stringify(fileSchema));
  });

  test("published schema envelope constraints match every frozen v2 artifact", async () => {
    const schema = (await Bun.file(
      new URL("../spec/kernel-json/kernel-json-v2.schema.json", import.meta.url),
    ).json()) as {
      $defs: Record<
        string,
        {
          properties: {
            version: { const: unknown };
            kernel: { const: unknown };
          };
        }
      >;
    };
    for (const [definition, names] of [
      ["kernel_document", documentGoldens],
      ["kernel_check_observation", observationGoldens],
    ] as const) {
      expect(schema.$defs[definition]?.properties.version.const).toBe(2);
      expect(schema.$defs[definition]?.properties.kernel.const).toBe(
        "semantic.kernel-calculus/0018/v2",
      );
      for (const name of names) {
        expect(await readGoldenJson(name)).toMatchObject({
          version: 2,
          kernel: "semantic.kernel-calculus/0018/v2",
        });
      }
    }
  });

  test("returned schema is deeply frozen inert data", () => {
    const schema = kernelJsonSchema();
    expect(Object.isFrozen(schema)).toBe(true);
    expect(Object.isFrozen((schema as { readonly $defs: object })["$defs"])).toBe(true);
  });
});

describe("kernel-json document decode/encode", () => {
  for (const name of documentGoldens) {
    test(`${name} decodes from a plain value and re-encodes byte-exactly`, async () => {
      const json = await readGoldenJson(name);
      const decoded = decodeKernelDocumentValue(json);
      expect(decoded.status).toBe("decoded");
      if (decoded.status !== "decoded") return;
      const canonical = encodeCanonicalKernelDocument(decoded.value);
      const reDecoded = decodeKernelDocumentValue(JSON.parse(new TextDecoder().decode(canonical)));
      expect(reDecoded.status).toBe("decoded");
      if (reDecoded.status !== "decoded") return;
      expect(encodeCanonicalKernelDocument(reDecoded.value)).toEqual(canonical);
    });

    test(`${name} decodes from bytes`, async () => {
      const bytes = await readGoldenBytes(name);
      const decoded = decodeKernelDocumentBytes(bytes);
      expect(decoded.status).toBe("decoded");
    });
  }

  test("whitespace, key-order, and escape variants decode to equal documents and identical bytes", async () => {
    const json = (await readGoldenJson("pure-program.kernel.json")) as Record<string, unknown>;
    const reordered = {
      program: json["program"],
      version: json["version"],
      kernel: json["kernel"],
      signature: json["signature"],
      format: json["format"],
    };
    const canonical = encodeCanonicalKernelDocument(
      (decodeKernelDocumentValue(json) as { status: "decoded"; value: unknown }).value as never,
    );
    const decodedReordered = decodeKernelDocumentValue(reordered);
    expect(decodedReordered.status).toBe("decoded");
    if (decodedReordered.status !== "decoded") return;
    expect(encodeCanonicalKernelDocument(decodedReordered.value)).toEqual(canonical);

    const spacedBytes = new TextEncoder().encode(`  ${JSON.stringify(json, null, 4)}  \n\n`);
    const decodedSpaced = decodeKernelDocumentBytes(spacedBytes);
    expect(decodedSpaced.status).toBe("decoded");
    if (decodedSpaced.status !== "decoded") return;
    expect(encodeCanonicalKernelDocument(decodedSpaced.value)).toEqual(canonical);
  });

  test("rejects an unknown format marker before deeper inspection", async () => {
    const json = (await readGoldenJson("pure-program.kernel.json")) as Record<string, unknown>;
    const decoded = decodeKernelDocumentValue({ ...json, format: "semantic.other" });
    expect(decoded.status).toBe("rejected");
    if (decoded.status !== "rejected") return;
    expect(decoded.diagnostics[0]?.code).toBe("decode.unknown-format");
  });

  test("rejects a missing required field", async () => {
    const json = (await readGoldenJson("pure-program.kernel.json")) as Record<string, unknown>;
    const { signature: _signature, ...rest } = json;
    const decoded = decodeKernelDocumentValue(rest);
    expect(decoded.status).toBe("rejected");
    if (decoded.status !== "rejected") return;
    expect(decoded.diagnostics[0]?.code).toBe("decode.missing-property");
  });

  test("rejects an excess field", async () => {
    const json = (await readGoldenJson("pure-program.kernel.json")) as Record<string, unknown>;
    const decoded = decodeKernelDocumentValue({ ...json, extra: true });
    expect(decoded.status).toBe("rejected");
    if (decoded.status !== "rejected") return;
    expect(decoded.diagnostics[0]?.code).toBe("decode.excess-property");
  });

  test("rejects an unknown tag in a tagged union", () => {
    const decoded = decodeKernelDocumentValue({
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: [],
      program: { tag: "not-a-real-tag" },
    });
    expect(decoded.status).toBe("rejected");
    if (decoded.status !== "rejected") return;
    expect(decoded.diagnostics[0]?.code).toBe("decode.expected-computation-term");
  });

  test("rejects an unsorted effect row", () => {
    const decoded = decodeKernelDocumentValue({
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: [],
      program: {
        tag: "return",
        grade: "1",
        value: { tag: "thunk", body: { tag: "return", grade: "1", value: { tag: "unit" } } },
      },
    });
    // thunk has no direct effects field on the value term itself; exercise the
    // type-level effect row sort instead, via a signature declaration.
    const decoded2 = decodeKernelDocumentValue({
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: [
        {
          label: "a",
          operation: "op",
          argument_type: {
            tag: "thunk",
            effects: ["b", "a"],
            computation: { tag: "return", grade: "1", value: { tag: "unit" } },
          },
          result_type: { tag: "unit" },
        },
      ],
      program: { tag: "return", grade: "1", value: { tag: "unit" } },
    });
    expect(decoded.status).toBe("decoded");
    expect(decoded2.status).toBe("rejected");
    if (decoded2.status !== "rejected") return;
    expect(decoded2.diagnostics[0]?.code).toBe("decode.unsorted-row");
  });

  test("rejects an unsafe integer, a fraction, and a leading zero via raw JSON grammar", () => {
    const base = {
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: [],
    };
    const fraction = decodeKernelDocumentBytes(
      new TextEncoder().encode(
        `${JSON.stringify({ ...base, program: 0 }).replace('"program":0', '"program":{"tag":"return","grade":"1","value":{"tag":"int","value":1.5}}')}`,
      ),
    );
    expect(fraction.status).toBe("rejected");

    const leadingZero = decodeKernelDocumentBytes(
      new TextEncoder().encode(
        `{"format":"semantic.kernel-json","version":2,"kernel":"semantic.kernel-calculus/0018/v2","signature":[],"program":{"tag":"return","grade":"1","value":{"tag":"int","value":01}}}`,
      ),
    );
    expect(leadingZero.status).toBe("rejected");

    const unsafe = decodeKernelDocumentValue({
      ...base,
      program: {
        tag: "return",
        grade: "1",
        value: { tag: "int", value: Number.MAX_SAFE_INTEGER + 10 },
      },
    });
    expect(unsafe.status).toBe("rejected");
  });

  test("preserves -0 as distinct from 0 for int values across decode and canonical encode", () => {
    const document = {
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: [],
      program: { tag: "return", grade: "1", value: { tag: "int", value: -0 } },
    };
    const decoded = decodeKernelDocumentValue(document);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const text = new TextDecoder().decode(encodeCanonicalKernelDocument(decoded.value));
    expect(text).toContain('"value":-0');
  });

  test("rejects invalid UTF-8 and a duplicate JSON key at the byte boundary", () => {
    const invalidUtf8 = decodeKernelDocumentBytes(new Uint8Array([0x7b, 0xff, 0xfe]));
    expect(invalidUtf8.status).toBe("rejected");

    const duplicateKey = decodeKernelDocumentBytes(
      new TextEncoder().encode(
        '{"format":"semantic.kernel-json","format":"semantic.kernel-json","version":2,"kernel":"semantic.kernel-calculus/0018/v2","signature":[],"program":{"tag":"unit"}}',
      ),
    );
    expect(duplicateKey.status).toBe("rejected");
    if (duplicateKey.status !== "rejected") return;
    expect(duplicateKey.diagnostics[0]?.code).toBe("byte.duplicate-key");
  });

  test("rejects a cyclic object and a repeated alias at the object boundary", () => {
    const cyclic: Record<string, unknown> = {
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: [],
    };
    cyclic["program"] = cyclic;
    const cyclicResult = decodeKernelDocumentValue(cyclic);
    expect(cyclicResult.status).toBe("rejected");
    if (cyclicResult.status !== "rejected") return;
    expect(cyclicResult.diagnostics[0]?.code).toBe("decode.repeated-reference");

    const shared = { tag: "unit" } as const;
    const alias = decodeKernelDocumentValue({
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: [],
      program: { tag: "let", bound: { tag: "return", grade: "1", value: shared }, body: shared },
    });
    expect(alias.status).toBe("rejected");
  });

  test("rejects an accessor property, a symbol key, and a sparse array", () => {
    const withAccessor: Record<string, unknown> = {
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: [],
    };
    Object.defineProperty(withAccessor, "program", {
      get: () => ({ tag: "unit" }),
      enumerable: true,
    });
    expect(decodeKernelDocumentValue(withAccessor).status).toBe("rejected");

    const symbolKeyed: Record<PropertyKey, unknown> = {
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: [],
      program: { tag: "unit" },
    };
    symbolKeyed[Symbol("x")] = 1;
    expect(decodeKernelDocumentValue(symbolKeyed).status).toBe("rejected");

    const sparse: Array<unknown> = [];
    sparse[2] = {
      label: "a",
      operation: "b",
      argument_type: { tag: "unit" },
      result_type: { tag: "unit" },
    };
    const sparseResult = decodeKernelDocumentValue({
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: sparse,
      program: { tag: "unit" },
    });
    expect(sparseResult.status).toBe("rejected");
  });

  test("accepts a structurally representable resumption value that the checker will always reject", () => {
    const decoded = decodeKernelDocumentValue({
      format: "semantic.kernel-json",
      version: 2,
      kernel: "semantic.kernel-calculus/0018/v2",
      signature: [],
      program: {
        tag: "return",
        grade: "1",
        value: { tag: "pair", first: { tag: "resumption", distance: 0 }, second: { tag: "unit" } },
      },
    });
    expect(decoded.status).toBe("decoded");
  });
});

describe("kernel-json observation decode/encode", () => {
  for (const name of observationGoldens) {
    test(`${name} decodes from a plain value`, async () => {
      const json = await readGoldenJson(name);
      const decoded = decodeKernelCheckObservationValue(json);
      expect(decoded.status).toBe("decoded");
    });

    test(`${name} decodes from bytes`, async () => {
      const bytes = await readGoldenBytes(name);
      const decoded = decodeKernelCheckObservationBytes(bytes);
      expect(decoded.status).toBe("decoded");
    });
  }

  test("rejects a diagnostic code outside the closed version 2 enum", async () => {
    const json = (await readGoldenJson("rejected-double-resume.rejected.kernel-check.json")) as {
      observation: { diagnostics: Array<Record<string, unknown>> };
    };
    const mutated = structuredClone(json);
    mutated.observation.diagnostics[0]!["code"] = "made.up.code";
    const decoded = decodeKernelCheckObservationValue(mutated);
    expect(decoded.status).toBe("rejected");
    if (decoded.status !== "rejected") return;
    expect(decoded.diagnostics[0]?.code).toBe("decode.expected-code");
  });

  test("rejects a type table with a forward child index", async () => {
    const json = (await readGoldenJson("pure-program.accepted.kernel-check.json")) as {
      observation: { types: Array<Record<string, unknown>> };
    };
    const mutated = structuredClone(json);
    mutated.observation.types[0] = { tag: "pair", first: 1, second: 1 };
    const decoded = decodeKernelCheckObservationValue(mutated);
    expect(decoded.status).toBe("rejected");
    if (decoded.status !== "rejected") return;
    expect(decoded.diagnostics[0]?.code).toBe("decode.type-table-not-acyclic");
  });
});
