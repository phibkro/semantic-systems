/**
 * Label-bound counterexample and bound-derivation gate for design spec 0020.
 *
 * Independent review falsified the previous observation bounds with an
 * accepted 0018 input: a balanced value type with 300 thunk leaves, each
 * carrying 256 unique labels, inside a lambda applied to unit. This file
 * commits that counterexample as a compact TypeScript generator (never a
 * giant checked-in JSON) and keeps every revised raw-input and
 * observation-envelope maximum tied to its executable derivation.
 */
import { describe, expect, test } from "bun:test";
import {
  apply,
  check,
  decodeComputationTerm,
  effectRow,
  lambda,
  operationSignature,
  pairType,
  returnTerm,
  returnType,
  thunkType,
  unit,
  unitType,
  variable,
  type ComputationTerm,
  type ValueType,
} from "../src/kernel-calculus/index.ts";

const RAW_MAXIMUM_BYTES = 1_048_576;
const RAW_MAXIMUM_NODES = 524_288;
const PREVIOUS_RAW_MAXIMUM_NODES = 65_536;
const PREVIOUS_MAXIMUM_LABELS = 65_536;
const MAXIMUM_LABELS = 1_048_576;
const TIGHT_LABEL_LEMMA = Math.floor(RAW_MAXIMUM_BYTES / 3);
const MAXIMUM_TYPE_NODES = 16_384;
const MAXIMUM_OBSERVATION_NODES = 4_194_304;
const MAXIMUM_OBSERVATION_COLLECTION_LENGTH = 1_048_576;
const MAXIMUM_OBSERVATION_BYTES = 33_554_432;
const KERNEL_0018_MAXIMUM_NODES = 4_096;
const KERNEL_0018_MAXIMUM_ROW_LABELS = 256;
const WIDEST_TYPE_NODE_OCCURRENCES = 262;
const MAXIMUM_REJECTION_TYPE_NODES = 3 * KERNEL_0018_MAXIMUM_NODES;

interface LabelBoundCounterexample {
  readonly distinctLabels: number;
  readonly typeRecordNodes: number;
  readonly term: ComputationTerm;
}

const buildLabelBoundCounterexample = (
  leaves: number,
  labelsPerRow: number,
): LabelBoundCounterexample => {
  let label = 0;
  const makeLeaf = (): ValueType =>
    thunkType(
      effectRow(...Array.from({ length: labelsPerRow }, () => `x${(label++).toString(36)}`)),
      returnType("1", unitType()),
    );
  let level: ValueType[] = Array.from({ length: leaves }, makeLeaf);
  let pairNodes = 0;
  while (level.length > 1) {
    const next: ValueType[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const right = level[index + 1];
      if (right === undefined) {
        next.push(level[index]!);
      } else {
        next.push(pairType(level[index]!, right));
        pairNodes += 1;
      }
    }
    level = next;
  }
  return {
    distinctLabels: label,
    typeRecordNodes: leaves * 3 + pairNodes,
    term: apply(lambda(level[0]!, "1", returnTerm("1", variable(0))), unit()),
  };
};

const jsonValueOccurrences = (value: unknown): number => {
  if (Array.isArray(value)) {
    let sum = 1;
    for (const item of value) sum += jsonValueOccurrences(item);
    return sum;
  }
  if (typeof value === "object" && value !== null) {
    let sum = 1;
    for (const item of Object.values(value)) sum += jsonValueOccurrences(item);
    return sum;
  }
  return 1;
};

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).byteLength;

const denseZeroArray = (elements: number): string =>
  elements === 0 ? "[]" : `[${"0,".repeat(elements - 1)}0]`;

describe("0020 label-bound counterexample", () => {
  test("reduced mechanism: mismatched thunk rows reject through the normal checker", () => {
    const reduced = buildLabelBoundCounterexample(2, 3);
    const decoded = decodeComputationTerm(JSON.parse(JSON.stringify(reduced.term)));
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const checked = check(operationSignature([]), decoded.value);
    expect(checked.status).toBe("rejected");
    if (checked.status !== "rejected") return;
    expect(checked.diagnostics[0]?.code).toBe("type.argument-mismatch");
  });

  test("review scale: the full KernelDocument fits raw arithmetic and its 0018 program rejects normally", () => {
    const full = buildLabelBoundCounterexample(300, 256);
    expect(full.distinctLabels).toBe(76_800);

    const documentJson = JSON.stringify({
      format: "semantic.kernel-json",
      kernel: "semantic.kernel-calculus/0018/v1",
      program: full.term,
      signature: [],
      version: 1,
    });
    expect(utf8Bytes(documentJson)).toBe(605_672);
    expect(utf8Bytes(documentJson)).toBeLessThanOrEqual(RAW_MAXIMUM_BYTES);

    const parsedDocument = JSON.parse(documentJson) as { readonly program: unknown };
    const occurrences = jsonValueOccurrences(parsedDocument);
    expect(occurrences).toBe(79_816);
    expect(occurrences).toBeGreaterThan(PREVIOUS_RAW_MAXIMUM_NODES);
    expect(occurrences).toBeLessThanOrEqual(RAW_MAXIMUM_NODES);

    const decoded = decodeComputationTerm(parsedDocument.program);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const checked = check(operationSignature([]), decoded.value);
    expect(checked.status).toBe("rejected");
    if (checked.status !== "rejected") return;
    const diagnostic = checked.diagnostics[0]!;
    expect(diagnostic.code).toBe("type.argument-mismatch");
    expect(utf8Bytes(String(diagnostic.expected))).toBe(418_807);

    expect(full.distinctLabels).toBeGreaterThan(PREVIOUS_MAXIMUM_LABELS);
    expect(full.distinctLabels).toBeLessThanOrEqual(TIGHT_LABEL_LEMMA);
    expect(full.distinctLabels).toBeLessThanOrEqual(MAXIMUM_LABELS);
    expect(full.typeRecordNodes).toBeLessThanOrEqual(MAXIMUM_TYPE_NODES);
  });
});

describe("0020 bound derivations", () => {
  test("raw maximumNodes follows the JSON grammar bound, including its shortest counterexamples", () => {
    for (const text of ["0", "[0,0]"]) {
      const bytes = utf8Bytes(text);
      const nodes = jsonValueOccurrences(JSON.parse(text));
      expect(nodes).toBeLessThanOrEqual(Math.floor((bytes + 1) / 2));
    }

    expect(jsonValueOccurrences(JSON.parse("0"))).toBe(1);
    expect(utf8Bytes("0")).toBe(1);
    expect(jsonValueOccurrences(JSON.parse("[0,0]"))).toBe(3);
    expect(utf8Bytes("[0,0]")).toBe(5);
    expect(Math.floor((RAW_MAXIMUM_BYTES + 1) / 2)).toBe(RAW_MAXIMUM_NODES);
  });

  test("generated dense arrays witness the exact raw byte/node boundary", () => {
    const largestFitting = denseZeroArray(524_287);
    const firstOverByteLimit = denseZeroArray(524_288);

    expect(utf8Bytes(largestFitting)).toBe(1_048_575);
    expect(jsonValueOccurrences(JSON.parse(largestFitting))).toBe(RAW_MAXIMUM_NODES);
    expect(utf8Bytes(largestFitting)).toBeLessThanOrEqual(RAW_MAXIMUM_BYTES);

    expect(utf8Bytes(firstOverByteLimit)).toBe(1_048_577);
    expect(jsonValueOccurrences(JSON.parse(firstOverByteLimit))).toBe(RAW_MAXIMUM_NODES + 1);
    expect(utf8Bytes(firstOverByteLimit)).toBeGreaterThan(RAW_MAXIMUM_BYTES);
  });

  test("maximumLabels ceiling and tight lemma follow from the raw byte bound", () => {
    expect(MAXIMUM_LABELS).toBe(RAW_MAXIMUM_BYTES);
    expect(TIGHT_LABEL_LEMMA).toBe(349_525);
    expect(TIGHT_LABEL_LEMMA).toBeLessThanOrEqual(MAXIMUM_LABELS);
  });

  test("maximumTypeNodes dominates the 0018 node derivation", () => {
    expect(3 * KERNEL_0018_MAXIMUM_NODES).toBe(12_288);
    expect(3 * KERNEL_0018_MAXIMUM_NODES).toBeLessThanOrEqual(MAXIMUM_TYPE_NODES);
  });

  test("maximumObservationNodes dominates the rejected-observation worst case", () => {
    const labelTable = 1 + TIGHT_LABEL_LEMMA;
    const typeTable = 1 + 3 * KERNEL_0018_MAXIMUM_NODES * WIDEST_TYPE_NODE_OCCURRENCES;
    const envelopeAndDiagnostic = 64;
    const worstCase = labelTable + typeTable + envelopeAndDiagnostic;
    expect(worstCase).toBe(3_569_047);
    expect(worstCase).toBeLessThanOrEqual(MAXIMUM_OBSERVATION_NODES);
  });

  test("maximumObservationCollectionLength is the label table capacity", () => {
    expect(MAXIMUM_OBSERVATION_COLLECTION_LENGTH).toBe(MAXIMUM_LABELS);
    for (const namedCap of [MAXIMUM_TYPE_NODES, 16_384, 1_024, 4_096, 256]) {
      expect(namedCap).toBeLessThanOrEqual(MAXIMUM_OBSERVATION_COLLECTION_LENGTH);
    }
  });

  test("maximumObservationBytes dominates the rejected-observation worst case", () => {
    const labelTableBytes = RAW_MAXIMUM_BYTES + 3 * TIGHT_LABEL_LEMMA;
    const widestFunctionNode = JSON.stringify({
      effects: Array.from(
        { length: KERNEL_0018_MAXIMUM_ROW_LABELS },
        (_, offset) => TIGHT_LABEL_LEMMA - KERNEL_0018_MAXIMUM_ROW_LABELS + offset,
      ),
      grade: "omega",
      parameter: MAXIMUM_REJECTION_TYPE_NODES - 1,
      result: MAXIMUM_REJECTION_TYPE_NODES - 1,
      tag: "function",
    });
    const widestFunctionNodeBytes = utf8Bytes(widestFunctionNode);
    expect(widestFunctionNodeBytes).toBe(1_871);

    const typeTableBytes =
      2 +
      MAXIMUM_REJECTION_TYPE_NODES * widestFunctionNodeBytes +
      (MAXIMUM_REJECTION_TYPE_NODES - 1);
    const envelopeAndDiagnosticBytes = 8_192;
    const worstCase = labelTableBytes + typeTableBytes + envelopeAndDiagnosticBytes;
    expect(typeTableBytes).toBe(23_003_137);
    expect(worstCase).toBe(25_108_480);
    expect(worstCase).toBeLessThanOrEqual(MAXIMUM_OBSERVATION_BYTES);
  });

  test("counterexample rejection fits the envelope with room to spare", () => {
    const full = buildLabelBoundCounterexample(300, 256);
    const estimatedObservationOccurrences =
      1 + full.distinctLabels + 1 + full.typeRecordNodes * WIDEST_TYPE_NODE_OCCURRENCES + 64;
    expect(estimatedObservationOccurrences).toBeLessThanOrEqual(MAXIMUM_OBSERVATION_NODES);
  });

  test("schema constants align with the frozen envelope bounds", async () => {
    const schema = (await Bun.file(
      new URL("../spec/kernel-json/kernel-json-v1.schema.json", import.meta.url),
    ).json()) as {
      $defs: Record<string, { maxItems?: number; maximum?: number }>;
    };
    expect(schema.$defs["label_table"]?.maxItems).toBe(MAXIMUM_LABELS);
    expect(schema.$defs["label_index"]?.maximum).toBe(MAXIMUM_LABELS - 1);
    expect(schema.$defs["type_table"]?.maxItems).toBe(MAXIMUM_TYPE_NODES);
    expect(schema.$defs["type_index"]?.maximum).toBe(MAXIMUM_TYPE_NODES - 1);
  });
});
