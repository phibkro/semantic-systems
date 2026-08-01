import { describe, expect, test } from "bun:test";
import {
  checkKernelDocument,
  decodeKernelCheckObservationBytes,
  decodeKernelCheckObservationValue,
  decodeKernelDocumentValue,
  encodeCanonicalKernelCheckObservation,
  type KernelCheckObservation,
} from "../src/kernel-json/index.ts";

// Correction slice 0024: the frozen 0020 fact kind rules (contract lines
// around the DiagnosticFact grammar) reserve exactly two record shapes —
// {"type_index": TypeIndex} and {"label_indexes": [LabelIndex...]} — as
// references into the observation's shared tables. The decoder must register
// them through the same typeIndex/labelIndexRow authority as every other
// table reference, so range custody and the frozen first-encounter traversal
// order hold; every other fact record key stays a deliberate open vocabulary.

const typeMismatchDocument = {
  format: "semantic.kernel-json",
  version: 1,
  kernel: "semantic.kernel-calculus/0018/v1",
  signature: [],
  program: {
    tag: "apply",
    computation: {
      tag: "lambda",
      parameter_type: { tag: "bool" },
      grade: "1",
      body: { tag: "return", grade: "1", value: { tag: "bound-value", distance: 0 } },
    },
    argument: { tag: "int", value: 1 },
  },
};

const checkTypeMismatch = (): KernelCheckObservation => {
  const decoded = decodeKernelDocumentValue(typeMismatchDocument);
  expect(decoded.status).toBe("decoded");
  if (decoded.status !== "decoded") throw new Error("unreachable");
  return checkKernelDocument(decoded.value);
};

const rejectedObservation = (
  diagnostic: Record<string, unknown>,
  tables: { readonly labels?: unknown; readonly types?: unknown } = {},
) => ({
  format: "semantic.kernel-check",
  version: 1,
  kernel: "semantic.kernel-calculus/0018/v1",
  observation: {
    tag: "rejected",
    labels: tables.labels ?? [],
    types: tables.types ?? [],
    diagnostics: [diagnostic],
  },
});

const diagnosticWith = (facts: Record<string, unknown>) => ({
  code: "type.argument-mismatch",
  rule: "computation.apply",
  occurrence_path: "/program/argument",
  message: "function argument type does not match",
  ...facts,
});

const expectRejectedWith = (candidate: unknown, code: string) => {
  const decoded = decodeKernelCheckObservationValue(candidate);
  expect(decoded.status).toBe("rejected");
  if (decoded.status !== "rejected") return;
  expect(decoded.diagnostics[0]?.code).toBe(code);
};

describe("checker-produced reserved type facts decode through the observation authority", () => {
  test("a type.argument-mismatch check rejection round-trips through value decoding", () => {
    const observation = checkTypeMismatch();
    expect(observation.observation.tag).toBe("rejected");
    if (observation.observation.tag !== "rejected") return;
    expect(observation.observation.diagnostics[0]?.code).toBe("type.argument-mismatch");
    expect(observation.observation.diagnostics[0]?.expected).toEqual({ type_index: 0 });
    expect(observation.observation.diagnostics[0]?.actual).toEqual({ type_index: 1 });
    expect(observation.observation.types.length).toBe(2);

    const reDecoded = decodeKernelCheckObservationValue(observation);
    expect(reDecoded.status).toBe("decoded");
  });

  test("the same rejection round-trips byte-exactly through canonical bytes", () => {
    const observation = checkTypeMismatch();
    const canonical = encodeCanonicalKernelCheckObservation(observation);
    const reDecoded = decodeKernelCheckObservationBytes(canonical);
    expect(reDecoded.status).toBe("decoded");
    if (reDecoded.status !== "decoded") return;
    expect(encodeCanonicalKernelCheckObservation(reDecoded.value)).toEqual(canonical);
  });
});

describe("dangling reserved fact references are rejected, never silently accepted", () => {
  test("a type_index into an empty type table is out of range", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { type_index: 0 } })),
      "decode.type-index-out-of-range",
    );
  });

  test("a type_index one past the type table end is out of range", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { type_index: 1 } }), {
        types: [{ tag: "bool" }],
      }),
      "decode.type-index-out-of-range",
    );
  });

  test("a label_indexes row into an empty label table is out of range", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { label_indexes: [0] } })),
      "decode.label-index-out-of-range",
    );
  });

  test("a nested reserved fact inside an open record is still range-checked", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { clause: { type_index: 2 } } }), {
        types: [{ tag: "bool" }],
      }),
      "decode.type-index-out-of-range",
    );
  });
});

describe("malformed reserved fact shapes are rejected", () => {
  test("a non-integer type_index is rejected", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { type_index: true } }), {
        types: [{ tag: "bool" }],
      }),
      "decode.expected-integer",
    );
  });

  test("a negative type_index is rejected", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { type_index: -1 } }), {
        types: [{ tag: "bool" }],
      }),
      "decode.expected-nonnegative",
    );
  });

  test("a reserved key with excess siblings is not an open record", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { type_index: 0, extra: 1 } }), {
        types: [{ tag: "bool" }],
      }),
      "decode.reserved-fact-shape",
    );
  });

  test("both reserved keys in one record are rejected", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { label_indexes: [], type_index: 0 } }), {
        types: [{ tag: "bool" }],
      }),
      "decode.reserved-fact-shape",
    );
  });

  test("a non-array label_indexes is rejected", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { label_indexes: "fresh" } }), {
        labels: ["fresh"],
      }),
      "decode.expected-array",
    );
  });

  test("an unsorted or duplicated label_indexes row is rejected", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { label_indexes: [1, 0] } }), {
        labels: ["alpha", "beta"],
      }),
      "decode.unsorted-row",
    );
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { label_indexes: [0, 0] } }), {
        labels: ["alpha", "beta"],
      }),
      "decode.unsorted-row",
    );
  });
});

describe("reserved fact references participate in the frozen traversal order", () => {
  test("expected registers before actual, matching the encoder's interner", () => {
    const decoded = decodeKernelCheckObservationValue(
      rejectedObservation(
        diagnosticWith({ expected: { type_index: 0 }, actual: { type_index: 1 } }),
        { types: [{ tag: "bool" }, { tag: "int" }] },
      ),
    );
    expect(decoded.status).toBe("decoded");
  });

  test("a fact-first encounter outside table order is rejected", () => {
    expectRejectedWith(
      rejectedObservation(
        diagnosticWith({ expected: { type_index: 1 }, actual: { type_index: 0 } }),
        { types: [{ tag: "bool" }, { tag: "int" }] },
      ),
      "decode.type-table-order",
    );
  });

  test("a type table entry never referenced by any fact is rejected", () => {
    expectRejectedWith(
      rejectedObservation(diagnosticWith({ actual: { type_index: 1 } }), {
        types: [{ tag: "bool" }, { tag: "int" }],
      }),
      "decode.type-table-order",
    );
  });
});

// Correction slice 0025: the 0024 residual was real. Open fact records are
// an open key vocabulary, and the canonical encoding serializes their keys
// in Unicode code-point order (compareCodePoints). The decoder's traversal
// authority must therefore visit open-record fields in that same order —
// never JS insertion order — or an accepted value's own canonical bytes can
// change which table reference is encountered first and be rejected by
// decode.type-table-order. Traversal AND materialization both follow
// compareCodePoints, so value and byte representations agree by
// construction.

// U+FF5A FULLWIDTH LATIN SMALL LETTER Z sorts BELOW U+1D400 MATHEMATICAL
// BOLD CAPITAL A in code-point order, but its single UTF-16 unit 0xFF5A
// sorts ABOVE the surrogate pair 0xD835 0xDC00: default JS string order
// and code-point order disagree on exactly this pair, so these keys pin
// compareCodePoints as the authority.
const fullwidthZ = "ｚ";
const mathBoldA = "\u{1D400}";

describe("open fact records traverse and materialize in canonical code-point key order", () => {
  test("the 0024 residual counterexample rejects as a value exactly as its bytes reject", () => {
    // Insertion order z,a with the type table in insertion-encounter order:
    // formerly accepted as a value while its own canonical bytes rejected.
    const candidate = rejectedObservation(
      diagnosticWith({ expected: { z: { type_index: 0 }, a: { type_index: 1 } } }),
      { types: [{ tag: "bool" }, { tag: "int" }] },
    );
    expectRejectedWith(candidate, "decode.type-table-order");
    const byteDecoded = decodeKernelCheckObservationBytes(
      encodeCanonicalKernelCheckObservation(candidate as unknown as KernelCheckObservation),
    );
    expect(byteDecoded.status).toBe("rejected");
    if (byteDecoded.status !== "rejected") return;
    expect(byteDecoded.diagnostics[0]?.code).toBe("decode.type-table-order");
  });

  test("the corrected table order survives value decode, canonical bytes, and re-encoding", () => {
    // Same fact, table in code-point first-encounter order: key "a" is
    // traversed first regardless of insertion order, so its type holds
    // index 0.
    const candidate = rejectedObservation(
      diagnosticWith({ expected: { z: { type_index: 1 }, a: { type_index: 0 } } }),
      { types: [{ tag: "int" }, { tag: "bool" }] },
    );
    const decoded = decodeKernelCheckObservationValue(candidate);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const observation = decoded.value.observation;
    expect(observation.tag).toBe("rejected");
    if (observation.tag !== "rejected") return;
    // Materialized open-record keys are in code-point order, not insertion
    // order.
    expect(Object.keys(observation.diagnostics[0]?.expected as object)).toEqual(["a", "z"]);
    const canonical = encodeCanonicalKernelCheckObservation(decoded.value);
    const byteDecoded = decodeKernelCheckObservationBytes(canonical);
    expect(byteDecoded.status).toBe("decoded");
    if (byteDecoded.status !== "decoded") return;
    expect(encodeCanonicalKernelCheckObservation(byteDecoded.value)).toEqual(canonical);
  });

  test("type_index nested at different open-record depths registers in key order", () => {
    // Pre-0025 the mirror failure: insertion order z,a rejected the value
    // while the sorted canonical bytes decoded. Both must accept.
    const candidate = rejectedObservation(
      diagnosticWith({
        actual: { z: { type_index: 1 }, a: { inner: { type_index: 0 } } },
      }),
      { types: [{ tag: "int" }, { tag: "bool" }] },
    );
    const decoded = decodeKernelCheckObservationValue(candidate);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const canonical = encodeCanonicalKernelCheckObservation(decoded.value);
    const byteDecoded = decodeKernelCheckObservationBytes(canonical);
    expect(byteDecoded.status).toBe("decoded");
    if (byteDecoded.status !== "decoded") return;
    expect(encodeCanonicalKernelCheckObservation(byteDecoded.value)).toEqual(canonical);
  });

  test("label_indexes and type_index side by side in an open record stay range-custodied", () => {
    const candidate = rejectedObservation(
      diagnosticWith({
        actual: {
          z: { label_indexes: [0, 1] },
          a: { type_index: 0 },
        },
      }),
      { labels: ["alpha", "beta"], types: [{ tag: "int" }] },
    );
    const decoded = decodeKernelCheckObservationValue(candidate);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const canonical = encodeCanonicalKernelCheckObservation(decoded.value);
    const byteDecoded = decodeKernelCheckObservationBytes(canonical);
    expect(byteDecoded.status).toBe("decoded");
    if (byteDecoded.status !== "decoded") return;
    expect(encodeCanonicalKernelCheckObservation(byteDecoded.value)).toEqual(canonical);
  });

  test("exotic keys where UTF-16 and code-point orders differ follow compareCodePoints", () => {
    // Code-point traversal visits fullwidth z BEFORE mathematical bold A;
    // a hand-rolled UTF-16 comparator would visit them in the opposite
    // order and mis-assign the first-encounter indexes.
    const candidate = rejectedObservation(
      diagnosticWith({
        expected: {
          [mathBoldA]: { type_index: 1 },
          [fullwidthZ]: { type_index: 0 },
        },
      }),
      { types: [{ tag: "int" }, { tag: "bool" }] },
    );
    const decoded = decodeKernelCheckObservationValue(candidate);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const observation = decoded.value.observation;
    if (observation.tag !== "rejected") throw new Error("unreachable");
    expect(Object.keys(observation.diagnostics[0]?.expected as object)).toEqual([
      fullwidthZ,
      mathBoldA,
    ]);
    const canonical = encodeCanonicalKernelCheckObservation(decoded.value);
    const byteDecoded = decodeKernelCheckObservationBytes(canonical);
    expect(byteDecoded.status).toBe("decoded");
    if (byteDecoded.status !== "decoded") return;
    expect(encodeCanonicalKernelCheckObservation(byteDecoded.value)).toEqual(canonical);
  });

  test("the UTF-16-first table order for exotic keys is rejected in both representations", () => {
    const candidate = rejectedObservation(
      diagnosticWith({
        expected: {
          [mathBoldA]: { type_index: 0 },
          [fullwidthZ]: { type_index: 1 },
        },
      }),
      { types: [{ tag: "int" }, { tag: "bool" }] },
    );
    expectRejectedWith(candidate, "decode.type-table-order");
    const byteDecoded = decodeKernelCheckObservationBytes(
      encodeCanonicalKernelCheckObservation(candidate as unknown as KernelCheckObservation),
    );
    expect(byteDecoded.status).toBe("rejected");
    if (byteDecoded.status !== "rejected") return;
    expect(byteDecoded.diagnostics[0]?.code).toBe("decode.type-table-order");
  });
});

describe("the open fact vocabulary outside the reserved shapes is preserved", () => {
  test("an open record of names decodes exactly as before", () => {
    const decoded = decodeKernelCheckObservationValue(
      rejectedObservation(
        {
          code: "signature.operation-unknown",
          rule: "computation.operation",
          occurrence_path: "/program",
          message: "operation is not present in the declared signature",
          actual: { label: "fresh", operation: "allocate" },
        },
        {},
      ),
    );
    expect(decoded.status).toBe("decoded");
  });

  test("lists, scalars, nulls, and near-miss keys stay generic", () => {
    const decoded = decodeKernelCheckObservationValue(
      rejectedObservation(
        diagnosticWith({
          expected: ["allocate", "free"],
          actual: { type_indexes: 3, count: null, shape: "F[q] A" },
        }),
      ),
    );
    expect(decoded.status).toBe("decoded");
  });

  test("an own __proto__ fact key survives value and canonical-byte decoding", () => {
    const expected = JSON.parse('{"__proto__":{"nested":null}}') as Record<string, unknown>;
    const decoded = decodeKernelCheckObservationValue(
      rejectedObservation(diagnosticWith({ expected })),
    );
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const observation = decoded.value.observation;
    if (observation.tag !== "rejected") throw new Error("unreachable");
    const decodedExpected = observation.diagnostics[0]?.expected as Record<string, unknown>;
    expect(Object.hasOwn(decodedExpected, "__proto__")).toBe(true);
    expect(Object.keys(decodedExpected)).toEqual(["__proto__"]);
    expect(decodedExpected["__proto__"]).toEqual({ nested: null });

    const canonical = encodeCanonicalKernelCheckObservation(decoded.value);
    const byteDecoded = decodeKernelCheckObservationBytes(canonical);
    expect(byteDecoded.status).toBe("decoded");
    if (byteDecoded.status !== "decoded") return;
    const byteObservation = byteDecoded.value.observation;
    if (byteObservation.tag !== "rejected") throw new Error("unreachable");
    const byteExpected = byteObservation.diagnostics[0]?.expected as Record<string, unknown>;
    expect(Object.hasOwn(byteExpected, "__proto__")).toBe(true);
    expect(byteExpected["__proto__"]).toEqual({ nested: null });
    expect(encodeCanonicalKernelCheckObservation(byteDecoded.value)).toEqual(canonical);
  });
});
