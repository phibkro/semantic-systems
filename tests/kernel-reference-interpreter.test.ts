import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import {
  canonicalKernelRunObservationJson,
  encodeCanonicalKernelRunObservation,
  interpretKernelJsonBytes,
  isKernelRunObservation,
  type KernelRunObservation,
} from "../src/kernel-interpreter/index.ts";
import { checkKernelDocument, decodeKernelDocumentBytes } from "../src/kernel-json/index.ts";

type PrimitiveNode =
  | { readonly tag: "unit" }
  | { readonly tag: "bool"; readonly value: boolean }
  | { readonly tag: "int"; readonly value: number };

type ValueNode =
  | PrimitiveNode
  | { readonly tag: "pair"; readonly first: ValueNode; readonly second: ValueNode };

const encoder = new TextEncoder();
const bytes = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));

const document = (program: unknown, signature: ReadonlyArray<unknown> = []) => ({
  format: "semantic.kernel-json",
  version: 1,
  kernel: "semantic.kernel-calculus/0018/v1",
  signature,
  program,
});

const primitiveArbitrary: fc.Arbitrary<PrimitiveNode> = fc.oneof(
  fc.constant({ tag: "unit" } as const),
  fc.boolean().map((value) => ({ tag: "bool" as const, value })),
  fc.integer({ min: -1_000_000, max: 1_000_000 }).map((value) => ({ tag: "int" as const, value })),
);

const valueArbitrary: fc.Arbitrary<ValueNode> = fc
  .array(primitiveArbitrary, { maxLength: 12 })
  .map((leaves) => {
    let value: ValueNode = leaves.at(-1) ?? { tag: "unit" };
    for (let index = leaves.length - 2; index >= 0; index -= 1) {
      value = { tag: "pair", first: leaves[index]!, second: value };
    }
    return value;
  });

const pureDocumentArbitrary = valueArbitrary.map((value) =>
  document({ tag: "return", grade: "1", value }),
);

const handledDocumentArbitrary = fc.integer({ min: -1_000_000, max: 1_000_000 }).map((value) =>
  document(
    {
      tag: "handle",
      label: "generated",
      computation: {
        tag: "operation",
        grade: "1",
        label: "generated",
        operation: "choose",
        argument: { tag: "unit" },
      },
      return_clause: {
        body: {
          tag: "return",
          grade: "1",
          value: { tag: "bound-value", distance: 0 },
        },
      },
      operation_clauses: [
        {
          operation: "choose",
          body: {
            tag: "resume",
            resumption_distance: 0,
            value: { tag: "int", value },
          },
        },
      ],
    },
    [
      {
        label: "generated",
        operation: "choose",
        argument_type: { tag: "unit" },
        result_type: { tag: "int" },
      },
    ],
  ),
);

const assertDeeplyFrozen = (input: unknown, seen = new WeakSet<object>()): void => {
  if (typeof input !== "object" || input === null || seen.has(input)) return;
  seen.add(input);
  expect(Object.isFrozen(input)).toBeTrue();
  for (const value of Object.values(input)) assertDeeplyFrozen(value, seen);
};

const propertyConfiguration = Object.freeze({ seed: 0x0022, numRuns: 200 });

describe("kernel reference interpreter examples", () => {
  test("the composition boundary keeps ambient authority and unchecked evaluation out", async () => {
    const source = await Bun.file(
      new URL("../src/kernel-interpreter/observe.ts", import.meta.url),
    ).text();
    for (const forbidden of [
      "JSON.parse",
      'from "node:',
      "Bun.",
      "process.",
      "Math.random",
      "fetch(",
      "console.",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("evaluate(checked.program");
    expect(source).not.toContain("evaluate(projected.value");
  });

  test("selected observations equal the portable golden bytes", async () => {
    for (const name of ["pure-program", "handled-program", "rejected-double-resume"] as const) {
      const source = new Uint8Array(
        await Bun.file(
          new URL(`../examples/kernel-json/${name}.kernel.json`, import.meta.url),
        ).arrayBuffer(),
      );
      const expected = new Uint8Array(
        await Bun.file(
          new URL(`../examples/kernel-json/${name}.kernel-run.json.golden`, import.meta.url),
        ).arrayBuffer(),
      );
      expect(encodeCanonicalKernelRunObservation(interpretKernelJsonBytes(source))).toEqual(
        expected,
      );
    }
  });

  test("pure and fully handled programs return implementation-neutral values", async () => {
    const pure = interpretKernelJsonBytes(
      new Uint8Array(
        await Bun.file(
          new URL("../examples/kernel-json/pure-program.kernel.json", import.meta.url),
        ).arrayBuffer(),
      ),
    );
    const handled = interpretKernelJsonBytes(
      new Uint8Array(
        await Bun.file(
          new URL("../examples/kernel-json/handled-program.kernel.json", import.meta.url),
        ).arrayBuffer(),
      ),
    );
    expect(pure.observation).toEqual({ tag: "returned", value: { kind: "int", value: 42 } });
    expect(handled.observation).toEqual({ tag: "returned", value: { kind: "int", value: 7 } });
    assertDeeplyFrozen(pure);
    assertDeeplyFrozen(handled);
  });

  test("an unhandled operation becomes an explicit suspension without a token identity", () => {
    const observation = interpretKernelJsonBytes(
      bytes(
        document(
          {
            tag: "operation",
            grade: "1",
            label: "outside",
            operation: "read",
            argument: { tag: "bool", value: true },
          },
          [
            {
              label: "outside",
              operation: "read",
              argument_type: { tag: "bool" },
              result_type: { tag: "int" },
            },
          ],
        ),
      ),
    );
    expect(observation.observation).toEqual({
      tag: "suspended",
      request: {
        label: "outside",
        operation: "read",
        argument: { kind: "bool", value: true },
        result_type: { kind: "int" },
      },
    });
    expect(canonicalKernelRunObservationJson(observation)).not.toContain("token");
  });

  test("representation and semantic mistakes remain in their owning phase", async () => {
    const malformed = interpretKernelJsonBytes(
      bytes({ ...document({ tag: "unit" }), extra: true }),
    );
    expect(malformed.observation).toMatchObject({
      tag: "representation-rejected",
      diagnostics: [{ code: "decode.excess-property" }],
    });

    const rejected = interpretKernelJsonBytes(
      new Uint8Array(
        await Bun.file(
          new URL("../examples/kernel-json/rejected-double-resume.kernel.json", import.meta.url),
        ).arrayBuffer(),
      ),
    );
    expect(rejected.observation.tag).toBe("check-rejected");
    if (rejected.observation.tag === "check-rejected") {
      expect(rejected.observation.check.observation.tag).toBe("rejected");
    }
  });

  test("resource exhaustion is inconclusive and wider caller bounds are narrowed", () => {
    const source = bytes(document({ tag: "return", grade: "1", value: { tag: "unit" } }));
    expect(
      interpretKernelJsonBytes(source, {
        json: {
          maximumBytes: 1_048_576,
          maximumDepth: 128,
          maximumNodes: 524_288,
          maximumStringBytes: 4_096,
          maximumCollectionLength: 4_096,
          maximumOperations: 256,
          maximumOperationClauses: 256,
          maximumEffectLabels: 256,
        },
        evaluation: { fuel: 0, maximumTraceEntries: 10_000 },
      }).observation,
    ).toEqual({ tag: "inconclusive", reason: "fuel" });

    const widened = interpretKernelJsonBytes(source, {
      json: {
        maximumBytes: 1_048_577,
        maximumDepth: 129,
        maximumNodes: 524_289,
        maximumStringBytes: 4_097,
        maximumCollectionLength: 4_097,
        maximumOperations: 257,
        maximumOperationClauses: 257,
        maximumEffectLabels: 257,
      },
      evaluation: { fuel: 20_000, maximumTraceEntries: 20_000 },
    });
    expect(widened.observation).toEqual({ tag: "returned", value: { kind: "unit" } });
  });
});

describe("kernel reference interpreter generated evidence", () => {
  test("valid pure programs are deterministic, canonical, strict, and immutable", () => {
    fc.assert(
      fc.property(pureDocumentArbitrary, (candidate) => {
        const first = interpretKernelJsonBytes(bytes(candidate));
        const second = interpretKernelJsonBytes(bytes(candidate));
        expect(first.observation.tag).toBe("returned");
        expect(encodeCanonicalKernelRunObservation(first)).toEqual(
          encodeCanonicalKernelRunObservation(second),
        );
        expect(isKernelRunObservation(JSON.parse(canonicalKernelRunObservationJson(first)))).toBe(
          true,
        );
        assertDeeplyFrozen(first);
      }),
      propertyConfiguration,
    );
  });

  test("valid fully handled programs return the generated result", () => {
    fc.assert(
      fc.property(handledDocumentArbitrary, (candidate) => {
        expect(interpretKernelJsonBytes(bytes(candidate)).observation.tag).toBe("returned");
      }),
      propertyConfiguration,
    );
  });

  test("representation-invalid mutations cannot leak into checking", () => {
    fc.assert(
      fc.property(pureDocumentArbitrary, fc.boolean(), (candidate, marker) => {
        const result = interpretKernelJsonBytes(bytes({ ...candidate, unexpected: marker }));
        expect(result.observation.tag).toBe("representation-rejected");
      }),
      propertyConfiguration,
    );
  });

  test("closed-program scope mutations remain semantic rejections", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000 }), (distance) => {
        const result = interpretKernelJsonBytes(
          bytes(
            document({
              tag: "return",
              grade: "1",
              value: { tag: "bound-value", distance },
            }),
          ),
        );
        expect(result.observation.tag).toBe("check-rejected");
      }),
      propertyConfiguration,
    );
  });
});

describe("kernel run observation schema", () => {
  const internalRejection: KernelRunObservation = {
    format: "semantic.kernel-run",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    observation: {
      tag: "runtime-rejected",
      diagnostic: {
        code: "interpreter.example",
        occurrence_path: "/program",
        message: "example stable internal diagnostic",
        expected: { kind: "int" },
        actual: { kind: "bool" },
      },
    },
  };

  test("accepts the defensive runtime rejection and rejects excess properties", () => {
    expect(isKernelRunObservation(internalRejection)).toBe(true);
    expect(
      isKernelRunObservation({
        ...internalRejection,
        observation: { ...internalRejection.observation, trace: [] },
      }),
    ).toBe(false);
  });

  test("a check-rejected tag cannot wrap an accepted check observation", async () => {
    const source = new Uint8Array(
      await Bun.file(
        new URL("../examples/kernel-json/pure-program.kernel.json", import.meta.url),
      ).arrayBuffer(),
    );
    const decoded = decodeKernelDocumentBytes(source);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const acceptedCheck = checkKernelDocument(decoded.value);
    expect(acceptedCheck.observation.tag).toBe("accepted");
    expect(
      isKernelRunObservation({
        format: "semantic.kernel-run",
        version: 1,
        kernel: "semantic.kernel-calculus/0018/v1",
        observation: { tag: "check-rejected", check: acceptedCheck },
      }),
    ).toBe(false);
  });
});
