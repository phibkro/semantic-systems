import {
  compareCodePoints,
  hasUnicodeScalarsOnly,
  scanJson,
  trustedUint8ArrayCopy,
} from "../normalized-core/canonical.ts";
import { isGrade, type Grade } from "../kernel-calculus/grade.ts";
import {
  defaultKernelCheckEnvelopeBounds,
  defaultKernelJsonRawBounds,
  type KernelCheckEnvelopeBounds,
  type KernelJsonRawBounds,
} from "./bounds.ts";
import {
  encodeCanonicalKernelCheckObservation,
  encodeCanonicalKernelDocument,
} from "./canonical.ts";
import type {
  BinderOriginKind,
  CheckAccepted,
  CheckDiagnostic,
  CheckRejected,
  DiagnosticFact,
  Judgment,
  KernelCheckObservation,
  KernelComputationTerm,
  KernelComputationType,
  KernelDocument,
  KernelOperationClause,
  KernelReturnClause,
  KernelSignatureOperation,
  KernelTypeNode,
  KernelValueTerm,
  KernelValueType,
  ResumptionBinderEntry,
  ValueBinderEntry,
} from "./types.ts";
import { typeChildIndexes, typeStructuralKey } from "./types.ts";

export interface KernelJsonDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type KernelJsonDecodeResult<Value> =
  | { readonly status: "decoded"; readonly value: Value }
  | { readonly status: "rejected"; readonly diagnostics: ReadonlyArray<KernelJsonDiagnostic> };

class DecodeSignal {
  readonly diagnostic: KernelJsonDiagnostic;
  constructor(diagnostic: KernelJsonDiagnostic) {
    this.diagnostic = diagnostic;
  }
}

const diagnostic = (code: string, path: string, message: string): KernelJsonDiagnostic =>
  Object.freeze({ code, path, message });

const freeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength;

const OCCURRENCE_PATH_PATTERN = /^\/(program|signature)(\/(0|[1-9][0-9]*|[a-z][a-z0-9_]*))*$/;

interface StructuralBounds {
  readonly maximumDepth: number;
  readonly maximumNodes: number;
  readonly maximumStringBytes: number;
  readonly maximumCollectionLength: number;
}

/**
 * Shared strict-decoder primitives. Node counting follows the contract: every
 * JSON value occurrence (object, array, string, number, boolean, null) counts
 * once, in preorder, before its children. The repeated-reference rule tracks
 * every array and object by identity and rejects a second occurrence.
 */
class Decoder {
  readonly #bounds: StructuralBounds;
  #nodes = 0;
  readonly #seen = new WeakSet<object>();

  constructor(bounds: StructuralBounds) {
    this.#bounds = bounds;
  }

  fail(code: string, path: string, message: string): never {
    throw new DecodeSignal(diagnostic(code, path, message));
  }

  #enter(path: string, depth: number): void {
    if (depth > this.#bounds.maximumDepth) {
      this.fail("decode.depth-exceeded", path, "maximum decode depth exceeded");
    }
    this.#nodes += 1;
    if (this.#nodes > this.#bounds.maximumNodes) {
      this.fail("decode.nodes-exceeded", path, "maximum decoded node count exceeded");
    }
  }

  #trackIdentity(value: object, path: string): void {
    if (this.#seen.has(value)) {
      this.fail("decode.repeated-reference", path, "repeated object or array reference rejected");
    }
    this.#seen.add(value);
  }

  record(value: unknown, path: string, depth: number): Readonly<Record<string, unknown>> {
    this.#enter(path, depth);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      this.fail("decode.expected-record", path, "expected a record");
    }
    this.#trackIdentity(value, path);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      this.fail("decode.non-data", path, "expected a plain data record");
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol") {
        this.fail("decode.non-data", path, "symbol-keyed properties are not semantic data");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        this.fail(
          "decode.non-data",
          `${path}/${key}`,
          "accessors and non-enumerable properties are not semantic data",
        );
      }
    }
    return value as Readonly<Record<string, unknown>>;
  }

  array(value: unknown, path: string, depth: number): ReadonlyArray<unknown> {
    this.#enter(path, depth);
    if (!Array.isArray(value)) this.fail("decode.expected-array", path, "expected an array");
    this.#trackIdentity(value, path);
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      this.fail("decode.non-data", path, "expected a plain data array");
    }
    if (value.length > this.#bounds.maximumCollectionLength) {
      this.fail("decode.collection-exceeded", path, "maximum collection length exceeded");
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        this.fail("decode.sparse-array", `${path}/${index}`, "sparse arrays are rejected");
      }
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key === "symbol") {
        this.fail("decode.non-data", path, "symbol-keyed properties are not semantic data");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        this.fail(
          "decode.non-data",
          `${path}/${key}`,
          "accessors and non-enumerable properties are not semantic data",
        );
      }
    }
    return value;
  }

  string(value: unknown, path: string, depth: number, maxBytes: number): string {
    this.#enter(path, depth);
    if (typeof value !== "string") this.fail("decode.expected-string", path, "expected a string");
    if (!hasUnicodeScalarsOnly(value)) {
      this.fail("decode.lone-surrogate", path, "strings must contain only Unicode scalar values");
    }
    if (utf8Bytes(value) > maxBytes) {
      this.fail("decode.string-exceeded", path, "maximum string byte length exceeded");
    }
    return value;
  }

  kernelName(value: unknown, path: string, depth: number): string {
    const text = this.string(value, path, depth, 4_096);
    if (text.length === 0) this.fail("decode.empty-name", path, "expected a nonempty name");
    return text;
  }

  boolean(value: unknown, path: string, depth: number): boolean {
    this.#enter(path, depth);
    if (typeof value !== "boolean")
      this.fail("decode.expected-boolean", path, "expected a boolean");
    return value;
  }

  grade(value: unknown, path: string, depth: number): Grade {
    this.#enter(path, depth);
    if (!isGrade(value)) this.fail("decode.expected-grade", path, 'expected "0", "1", or "omega"');
    return value;
  }

  safeInteger(value: unknown, path: string, depth: number): number {
    this.#enter(path, depth);
    if (!Number.isSafeInteger(value)) {
      this.fail("decode.expected-integer", path, "expected a signed safe integer");
    }
    return value as number;
  }

  nonnegativeInteger(value: unknown, path: string, depth: number): number {
    const number = this.safeInteger(value, path, depth);
    if (number < 0)
      this.fail("decode.expected-nonnegative", path, "expected a nonnegative integer");
    return number;
  }

  exact(
    fields: Readonly<Record<string, unknown>>,
    allowed: ReadonlyArray<string>,
    path: string,
  ): void {
    for (const key of Object.keys(fields)) {
      if (!allowed.includes(key))
        this.fail("decode.excess-property", `${path}/${key}`, "unexpected property");
    }
    for (const key of allowed) {
      if (!(key in fields))
        this.fail("decode.missing-property", `${path}/${key}`, "missing required property");
    }
  }

  occurrencePath(value: unknown, path: string, depth: number): string {
    const text = this.string(value, path, depth, 4_096);
    if (!OCCURRENCE_PATH_PATTERN.test(text)) {
      this.fail("decode.invalid-occurrence-path", path, "expected a strict occurrence path");
    }
    return text;
  }
}

// ---------------------------------------------------------------------------
// KernelDocument raw grammar
// ---------------------------------------------------------------------------

class RawDecoder extends Decoder {
  readonly bounds: KernelJsonRawBounds;

  constructor(bounds: KernelJsonRawBounds) {
    super(bounds);
    this.bounds = bounds;
  }

  effectRow(value: unknown, path: string, depth: number): ReadonlyArray<string> {
    const raw = this.array(value, path, depth);
    if (raw.length > this.bounds.maximumEffectLabels) {
      this.fail("decode.row-exceeded", path, "maximum effect row length exceeded");
    }
    const labels = raw.map((entry, index) => this.kernelName(entry, `${path}/${index}`, depth + 1));
    for (let index = 1; index < labels.length; index += 1) {
      if (compareCodePoints(labels[index - 1]!, labels[index]!) >= 0) {
        this.fail("decode.unsorted-row", path, "effect row must be sorted with no duplicates");
      }
    }
    return freeze(labels);
  }

  valueType(value: unknown, path: string, depth: number): KernelValueType {
    const fields = this.record(value, path, depth);
    switch (fields["tag"]) {
      case "unit":
      case "bool":
      case "int":
        this.exact(fields, ["tag"], path);
        return freeze({ tag: fields["tag"] as "unit" | "bool" | "int" });
      case "pair":
        this.exact(fields, ["tag", "first", "second"], path);
        return freeze({
          tag: "pair",
          first: this.valueType(fields["first"], `${path}/first`, depth + 1),
          second: this.valueType(fields["second"], `${path}/second`, depth + 1),
        });
      case "thunk":
        this.exact(fields, ["tag", "effects", "computation"], path);
        return freeze({
          tag: "thunk",
          effects: this.effectRow(fields["effects"], `${path}/effects`, depth + 1),
          computation: this.computationType(
            fields["computation"],
            `${path}/computation`,
            depth + 1,
          ),
        });
      default:
        return this.fail("decode.expected-value-type", `${path}/tag`, "unknown value type tag");
    }
  }

  computationType(value: unknown, path: string, depth: number): KernelComputationType {
    const fields = this.record(value, path, depth);
    switch (fields["tag"]) {
      case "return":
        this.exact(fields, ["tag", "grade", "value"], path);
        return freeze({
          tag: "return",
          grade: this.grade(fields["grade"], `${path}/grade`, depth + 1),
          value: this.valueType(fields["value"], `${path}/value`, depth + 1),
        });
      case "function":
        this.exact(fields, ["tag", "parameter", "grade", "effects", "result"], path);
        return freeze({
          tag: "function",
          parameter: this.valueType(fields["parameter"], `${path}/parameter`, depth + 1),
          grade: this.grade(fields["grade"], `${path}/grade`, depth + 1),
          effects: this.effectRow(fields["effects"], `${path}/effects`, depth + 1),
          result: this.computationType(fields["result"], `${path}/result`, depth + 1),
        });
      default:
        return this.fail(
          "decode.expected-computation-type",
          `${path}/tag`,
          "unknown computation type tag",
        );
    }
  }

  valueTerm(value: unknown, path: string, depth: number): KernelValueTerm {
    const fields = this.record(value, path, depth);
    switch (fields["tag"]) {
      case "bound-value":
      case "resumption":
        this.exact(fields, ["tag", "distance"], path);
        return freeze({
          tag: fields["tag"] as "bound-value" | "resumption",
          distance: this.nonnegativeInteger(fields["distance"], `${path}/distance`, depth + 1),
        });
      case "unit":
        this.exact(fields, ["tag"], path);
        return freeze({ tag: "unit" });
      case "bool":
        this.exact(fields, ["tag", "value"], path);
        return freeze({
          tag: "bool",
          value: this.boolean(fields["value"], `${path}/value`, depth + 1),
        });
      case "int":
        this.exact(fields, ["tag", "value"], path);
        return freeze({
          tag: "int",
          value: this.safeInteger(fields["value"], `${path}/value`, depth + 1),
        });
      case "pair":
        this.exact(fields, ["tag", "first", "second"], path);
        return freeze({
          tag: "pair",
          first: this.valueTerm(fields["first"], `${path}/first`, depth + 1),
          second: this.valueTerm(fields["second"], `${path}/second`, depth + 1),
        });
      case "thunk":
        this.exact(fields, ["tag", "body"], path);
        return freeze({
          tag: "thunk",
          body: this.computationTerm(fields["body"], `${path}/body`, depth + 1),
        });
      default:
        return this.fail("decode.expected-value-term", `${path}/tag`, "unknown value term tag");
    }
  }

  computationTerm(value: unknown, path: string, depth: number): KernelComputationTerm {
    const fields = this.record(value, path, depth);
    switch (fields["tag"]) {
      case "return":
        this.exact(fields, ["tag", "grade", "value"], path);
        return freeze({
          tag: "return",
          grade: this.grade(fields["grade"], `${path}/grade`, depth + 1),
          value: this.valueTerm(fields["value"], `${path}/value`, depth + 1),
        });
      case "let":
        this.exact(fields, ["tag", "bound", "body"], path);
        return freeze({
          tag: "let",
          bound: this.computationTerm(fields["bound"], `${path}/bound`, depth + 1),
          body: this.computationTerm(fields["body"], `${path}/body`, depth + 1),
        });
      case "force":
        this.exact(fields, ["tag", "value"], path);
        return freeze({
          tag: "force",
          value: this.valueTerm(fields["value"], `${path}/value`, depth + 1),
        });
      case "lambda":
        this.exact(fields, ["tag", "parameter_type", "grade", "body"], path);
        return freeze({
          tag: "lambda",
          parameter_type: this.valueType(
            fields["parameter_type"],
            `${path}/parameter_type`,
            depth + 1,
          ),
          grade: this.grade(fields["grade"], `${path}/grade`, depth + 1),
          body: this.computationTerm(fields["body"], `${path}/body`, depth + 1),
        });
      case "apply":
        this.exact(fields, ["tag", "computation", "argument"], path);
        return freeze({
          tag: "apply",
          computation: this.computationTerm(
            fields["computation"],
            `${path}/computation`,
            depth + 1,
          ),
          argument: this.valueTerm(fields["argument"], `${path}/argument`, depth + 1),
        });
      case "operation":
        this.exact(fields, ["tag", "grade", "label", "operation", "argument"], path);
        return freeze({
          tag: "operation",
          grade: this.grade(fields["grade"], `${path}/grade`, depth + 1),
          label: this.kernelName(fields["label"], `${path}/label`, depth + 1),
          operation: this.kernelName(fields["operation"], `${path}/operation`, depth + 1),
          argument: this.valueTerm(fields["argument"], `${path}/argument`, depth + 1),
        });
      case "handle": {
        this.exact(
          fields,
          ["tag", "label", "computation", "return_clause", "operation_clauses"],
          path,
        );
        const label = this.kernelName(fields["label"], `${path}/label`, depth + 1);
        const computation = this.computationTerm(
          fields["computation"],
          `${path}/computation`,
          depth + 1,
        );
        const returnClause = this.returnClause(
          fields["return_clause"],
          `${path}/return_clause`,
          depth + 1,
        );
        const clauses = this.operationClauses(
          fields["operation_clauses"],
          `${path}/operation_clauses`,
          depth + 1,
        );
        return freeze({
          tag: "handle",
          label,
          computation,
          return_clause: returnClause,
          operation_clauses: clauses,
        });
      }
      case "resume":
        this.exact(fields, ["tag", "resumption_distance", "value"], path);
        return freeze({
          tag: "resume",
          resumption_distance: this.nonnegativeInteger(
            fields["resumption_distance"],
            `${path}/resumption_distance`,
            depth + 1,
          ),
          value: this.valueTerm(fields["value"], `${path}/value`, depth + 1),
        });
      default:
        return this.fail(
          "decode.expected-computation-term",
          `${path}/tag`,
          "unknown computation term tag",
        );
    }
  }

  returnClause(value: unknown, path: string, depth: number): KernelReturnClause {
    const fields = this.record(value, path, depth);
    this.exact(fields, ["body"], path);
    return freeze({ body: this.computationTerm(fields["body"], `${path}/body`, depth + 1) });
  }

  operationClauses(
    value: unknown,
    path: string,
    depth: number,
  ): ReadonlyArray<KernelOperationClause> {
    const raw = this.array(value, path, depth);
    if (raw.length > this.bounds.maximumOperationClauses) {
      this.fail("decode.clauses-exceeded", path, "maximum operation clause count exceeded");
    }
    const clauses = raw.map((entry, index) => {
      const clausePath = `${path}/${index}`;
      const fields = this.record(entry, clausePath, depth + 1);
      this.exact(fields, ["operation", "body"], clausePath);
      return freeze({
        operation: this.kernelName(fields["operation"], `${clausePath}/operation`, depth + 2),
        body: this.computationTerm(fields["body"], `${clausePath}/body`, depth + 2),
      });
    });
    for (let index = 1; index < clauses.length; index += 1) {
      if (compareCodePoints(clauses[index - 1]!.operation, clauses[index]!.operation) >= 0) {
        this.fail(
          "decode.unsorted-clauses",
          path,
          "operation clauses must be sorted by operation name with no duplicates",
        );
      }
    }
    return freeze(clauses);
  }

  signature(value: unknown, path: string, depth: number): ReadonlyArray<KernelSignatureOperation> {
    const raw = this.array(value, path, depth);
    if (raw.length > this.bounds.maximumOperations) {
      this.fail("decode.signature-exceeded", path, "maximum signature operation count exceeded");
    }
    const operations = raw.map((entry, index) => {
      const opPath = `${path}/${index}`;
      const fields = this.record(entry, opPath, depth + 1);
      this.exact(fields, ["label", "operation", "argument_type", "result_type"], opPath);
      return freeze({
        label: this.kernelName(fields["label"], `${opPath}/label`, depth + 2),
        operation: this.kernelName(fields["operation"], `${opPath}/operation`, depth + 2),
        argument_type: this.valueType(
          fields["argument_type"],
          `${opPath}/argument_type`,
          depth + 2,
        ),
        result_type: this.valueType(fields["result_type"], `${opPath}/result_type`, depth + 2),
      });
    });
    for (let index = 1; index < operations.length; index += 1) {
      const previous = operations[index - 1]!;
      const current = operations[index]!;
      const order =
        compareCodePoints(previous.label, current.label) ||
        compareCodePoints(previous.operation, current.operation);
      if (order >= 0) {
        this.fail(
          "decode.unsorted-signature",
          path,
          "signature must be sorted by (label, operation) with no duplicate pairs",
        );
      }
    }
    return freeze(operations);
  }

  document(value: unknown): KernelDocument {
    const fields = this.record(value, "$", 0);
    if (fields["format"] !== "semantic.kernel-json") {
      this.fail("decode.unknown-format", "$/format", "unknown or missing format marker");
    }
    if (fields["version"] !== 1) {
      this.fail("decode.unknown-version", "$/version", "unknown or missing version marker");
    }
    if (fields["kernel"] !== "semantic.kernel-calculus/0018/v1") {
      this.fail("decode.unknown-kernel", "$/kernel", "unknown or missing kernel marker");
    }
    this.exact(fields, ["format", "version", "kernel", "signature", "program"], "$");
    return freeze({
      format: "semantic.kernel-json",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      signature: this.signature(fields["signature"], "$/signature", 1),
      program: this.computationTerm(fields["program"], "$/program", 1),
    });
  }
}

// ---------------------------------------------------------------------------
// KernelCheckObservation grammar
// ---------------------------------------------------------------------------

const JUDGMENT_RULES: ReadonlySet<string> = new Set([
  "value.variable",
  "value.unit",
  "value.bool",
  "value.int",
  "value.pair",
  "value.thunk",
  "computation.return",
  "computation.let",
  "computation.force",
  "computation.lambda",
  "computation.apply",
  "computation.operation",
  "computation.resume",
  "handler.deep",
]);

const DIAGNOSTIC_CODES: ReadonlySet<string> = new Set([
  "checker.invalid-input",
  "handler.clauses-inexact",
  "handler.label-unknown",
  "resumption.escape",
  "scope.resumption-out-of-range",
  "scope.variable-out-of-range",
  "signature.duplicate-operation",
  "signature.empty-name",
  "signature.operation-unknown",
  "term.expected-computation",
  "type.argument-mismatch",
  "type.expected-function",
  "type.expected-return",
  "type.expected-thunk",
  "type.handler-clause-mismatch",
  "type.handler-grade-mismatch",
  "type.operation-argument-mismatch",
  "type.resumption-argument-mismatch",
  "usage.affine-duplicated",
  "usage.exceeds-grade",
  "value.integer-out-of-range",
]);

const DIAGNOSTIC_RULES: ReadonlySet<string> = new Set([
  "checker.boundary",
  "computation.apply",
  "computation.family",
  "computation.force",
  "computation.lambda",
  "computation.let",
  "computation.operation",
  "computation.resume",
  "handler.input",
  "handler.operation",
  "handler.return",
  "handler.signature",
  "signature",
  "value.int",
  "value.resumption-forbidden",
  "value.variable",
]);

const ORIGIN_KINDS: ReadonlySet<string> = new Set([
  "lambda-parameter",
  "let-result",
  "return-clause-result",
  "operation-clause-argument",
]);

class ObservationDecoder extends Decoder {
  readonly bounds: KernelCheckEnvelopeBounds;
  #labels: ReadonlyArray<string> = [];
  #types: ReadonlyArray<KernelTypeNode> = [];
  readonly #typeRefOrder: Array<number> = [];

  constructor(bounds: KernelCheckEnvelopeBounds) {
    super({
      maximumDepth: bounds.maximumObservationDepth,
      maximumNodes: bounds.maximumObservationNodes,
      maximumStringBytes: bounds.maximumObservationStringBytes,
      maximumCollectionLength: bounds.maximumObservationCollectionLength,
    });
    this.bounds = bounds;
  }

  labelIndex(value: unknown, path: string, depth: number): number {
    const index = this.nonnegativeInteger(value, path, depth);
    if (index >= this.#labels.length) {
      this.fail("decode.label-index-out-of-range", path, "label index is outside the label table");
    }
    return index;
  }

  labelIndexRow(value: unknown, path: string, depth: number): ReadonlyArray<number> {
    const raw = this.array(value, path, depth);
    const indexes = raw.map((entry, index) =>
      this.labelIndex(entry, `${path}/${index}`, depth + 1),
    );
    for (let index = 1; index < indexes.length; index += 1) {
      if (indexes[index - 1]! >= indexes[index]!) {
        this.fail("decode.unsorted-row", path, "label index row must be sorted with no duplicates");
      }
    }
    return freeze(indexes);
  }

  typeIndex(value: unknown, path: string, depth: number): number {
    const index = this.nonnegativeInteger(value, path, depth);
    if (index >= this.#types.length) {
      this.fail("decode.type-index-out-of-range", path, "type index is outside the type table");
    }
    this.#typeRefOrder.push(index);
    return index;
  }

  labelTable(value: unknown, path: string, depth: number): ReadonlyArray<string> {
    const raw = this.array(value, path, depth);
    if (raw.length > this.bounds.maximumLabels) {
      this.fail("decode.labels-exceeded", path, "maximum label table length exceeded");
    }
    const labels = raw.map((entry, index) =>
      this.string(entry, `${path}/${index}`, depth + 1, 256),
    );
    for (const label of labels) {
      if (label.length === 0) this.fail("decode.empty-name", path, "labels must be nonempty");
    }
    for (let index = 1; index < labels.length; index += 1) {
      if (compareCodePoints(labels[index - 1]!, labels[index]!) >= 0) {
        this.fail("decode.unsorted-labels", path, "label table must be sorted with no duplicates");
      }
    }
    return freeze(labels);
  }

  typeNode(value: unknown, path: string, depth: number): KernelTypeNode {
    const fields = this.record(value, path, depth);
    switch (fields["tag"]) {
      case "unit":
      case "bool":
      case "int":
        this.exact(fields, ["tag"], path);
        return freeze({ tag: fields["tag"] as "unit" | "bool" | "int" });
      case "pair":
        this.exact(fields, ["tag", "first", "second"], path);
        return freeze({
          tag: "pair",
          first: this.nonnegativeInteger(fields["first"], `${path}/first`, depth + 1),
          second: this.nonnegativeInteger(fields["second"], `${path}/second`, depth + 1),
        });
      case "thunk":
        this.exact(fields, ["tag", "effects", "computation"], path);
        return freeze({
          tag: "thunk",
          effects: this.labelIndexRowUnbounded(fields["effects"], `${path}/effects`, depth + 1),
          computation: this.nonnegativeInteger(
            fields["computation"],
            `${path}/computation`,
            depth + 1,
          ),
        });
      case "return":
        this.exact(fields, ["tag", "grade", "value"], path);
        return freeze({
          tag: "return",
          grade: this.grade(fields["grade"], `${path}/grade`, depth + 1),
          value: this.nonnegativeInteger(fields["value"], `${path}/value`, depth + 1),
        });
      case "function":
        this.exact(fields, ["tag", "parameter", "grade", "effects", "result"], path);
        return freeze({
          tag: "function",
          parameter: this.nonnegativeInteger(fields["parameter"], `${path}/parameter`, depth + 1),
          grade: this.grade(fields["grade"], `${path}/grade`, depth + 1),
          effects: this.labelIndexRowUnbounded(fields["effects"], `${path}/effects`, depth + 1),
          result: this.nonnegativeInteger(fields["result"], `${path}/result`, depth + 1),
        });
      default:
        return this.fail("decode.expected-type-node", `${path}/tag`, "unknown type node tag");
    }
  }

  // Type-node child indexes are validated for table range once the whole
  // table is assembled (typeTable below); here only shape and sort/dedup are
  // enforced so the table can be built before range checks run.
  private labelIndexRowUnbounded(
    value: unknown,
    path: string,
    depth: number,
  ): ReadonlyArray<number> {
    const raw = this.array(value, path, depth);
    const indexes = raw.map((entry, index) =>
      this.nonnegativeInteger(entry, `${path}/${index}`, depth + 1),
    );
    for (let index = 1; index < indexes.length; index += 1) {
      if (indexes[index - 1]! >= indexes[index]!) {
        this.fail("decode.unsorted-row", path, "label index row must be sorted with no duplicates");
      }
    }
    return freeze(indexes);
  }

  typeTable(value: unknown, path: string, depth: number): ReadonlyArray<KernelTypeNode> {
    const raw = this.array(value, path, depth);
    if (raw.length > this.bounds.maximumTypeNodes) {
      this.fail("decode.types-exceeded", path, "maximum type table length exceeded");
    }
    const nodes = raw.map((entry, index) => this.typeNode(entry, `${path}/${index}`, depth + 1));
    // Range + acyclicity: every child index strictly below its parent's index.
    for (let index = 0; index < nodes.length; index += 1) {
      for (const child of typeChildIndexes(nodes[index]!)) {
        if (child >= index) {
          this.fail(
            "decode.type-table-not-acyclic",
            `${path}/${index}`,
            "type node child index must be strictly below its own index",
          );
        }
      }
      for (const labelIndex of nodes[index]!.tag === "thunk" || nodes[index]!.tag === "function"
        ? (nodes[index] as { effects: ReadonlyArray<number> }).effects
        : []) {
        if (labelIndex >= this.#labels.length) {
          this.fail(
            "decode.label-index-out-of-range",
            `${path}/${index}`,
            "label index is outside the label table",
          );
        }
      }
    }
    // Maximal sharing: no two entries structurally equal.
    const keys: Array<string> = [];
    const seenKeys = new Map<string, number>();
    for (let index = 0; index < nodes.length; index += 1) {
      const key = typeStructuralKey(nodes[index]!, keys);
      keys.push(key);
      const priorIndex = seenKeys.get(key);
      if (priorIndex !== undefined) {
        this.fail(
          "decode.type-table-not-shared",
          `${path}/${index}`,
          `type node duplicates entry ${priorIndex}; maximal sharing requires one entry per distinct type`,
        );
      }
      seenKeys.set(key, index);
    }
    return freeze(nodes);
  }

  verifyTraversalOrder(path: string): void {
    const visited: Array<boolean> = Array.from({ length: this.#types.length }, () => false);
    let expected = 0;
    const visit = (index: number): void => {
      if (visited[index]) return;
      for (const child of typeChildIndexes(this.#types[index]!)) visit(child);
      if (visited[index]) return;
      visited[index] = true;
      if (index !== expected) {
        this.fail(
          "decode.type-table-order",
          path,
          "type table entries must appear in first-encounter postorder",
        );
      }
      expected += 1;
    };
    for (const reference of this.#typeRefOrder) visit(reference);
    if (expected !== this.#types.length) {
      this.fail(
        "decode.type-table-order",
        path,
        "type table contains an entry outside the traversal order",
      );
    }
  }

  usageVector(value: unknown, path: string, depth: number): ReadonlyArray<Grade> {
    const raw = this.array(value, path, depth);
    if (raw.length > this.bounds.maximumContextEntries) {
      this.fail("decode.usage-exceeded", path, "maximum usage vector length exceeded");
    }
    return freeze(raw.map((entry, index) => this.grade(entry, `${path}/${index}`, depth + 1)));
  }

  originKind(value: unknown, path: string, depth: number): BinderOriginKind {
    this.string(value, path, depth, 64);
    if (!ORIGIN_KINDS.has(value as string)) {
      this.fail("decode.expected-origin-kind", path, "unknown value binder origin kind");
    }
    return value as BinderOriginKind;
  }

  valueBinderEntry(value: unknown, path: string, depth: number): ValueBinderEntry {
    const fields = this.record(value, path, depth);
    this.exact(fields, ["binder_origin", "origin_kind", "value_type", "usage_limit"], path);
    return freeze({
      binder_origin: this.occurrencePath(
        fields["binder_origin"],
        `${path}/binder_origin`,
        depth + 1,
      ),
      origin_kind: this.originKind(fields["origin_kind"], `${path}/origin_kind`, depth + 1),
      value_type: this.typeIndex(fields["value_type"], `${path}/value_type`, depth + 1),
      usage_limit: this.grade(fields["usage_limit"], `${path}/usage_limit`, depth + 1),
    });
  }

  resumptionBinderEntry(value: unknown, path: string, depth: number): ResumptionBinderEntry {
    const fields = this.record(value, path, depth);
    this.exact(
      fields,
      [
        "binder_origin",
        "origin_kind",
        "label",
        "operation",
        "result_type",
        "continuation_type",
        "continuation_effects",
        "usage_limit",
      ],
      path,
    );
    if (fields["origin_kind"] !== "operation-clause-resumption") {
      this.fail(
        "decode.expected-origin-kind",
        `${path}/origin_kind`,
        'expected "operation-clause-resumption"',
      );
    }
    if (fields["usage_limit"] !== "1") {
      this.fail(
        "decode.expected-usage-limit",
        `${path}/usage_limit`,
        'resumption usage limit must be "1"',
      );
    }
    return freeze({
      binder_origin: this.occurrencePath(
        fields["binder_origin"],
        `${path}/binder_origin`,
        depth + 1,
      ),
      origin_kind: "operation-clause-resumption",
      label: this.kernelName(fields["label"], `${path}/label`, depth + 1),
      operation: this.kernelName(fields["operation"], `${path}/operation`, depth + 1),
      result_type: this.typeIndex(fields["result_type"], `${path}/result_type`, depth + 1),
      continuation_type: this.typeIndex(
        fields["continuation_type"],
        `${path}/continuation_type`,
        depth + 1,
      ),
      continuation_effects: this.labelIndexRow(
        fields["continuation_effects"],
        `${path}/continuation_effects`,
        depth + 1,
      ),
      usage_limit: "1",
    });
  }

  premises(value: unknown, path: string, depth: number, ownIndex: number): ReadonlyArray<number> {
    const raw = this.array(value, path, depth);
    if (raw.length > 4_096)
      this.fail("decode.premises-exceeded", path, "maximum premise count exceeded");
    const indexes = raw.map((entry, index) =>
      this.nonnegativeInteger(entry, `${path}/${index}`, depth + 1),
    );
    for (const premise of indexes) {
      if (premise <= ownIndex) {
        this.fail("decode.premise-not-increasing", path, "premise indexes must strictly increase");
      }
    }
    return freeze(indexes);
  }

  judgment(value: unknown, path: string, depth: number, ownIndex: number): Judgment {
    const fields = this.record(value, path, depth);
    const tag = fields["tag"];
    if (tag !== "value-judgment" && tag !== "computation-judgment") {
      this.fail("decode.expected-judgment-tag", `${path}/tag`, "unknown judgment tag");
    }
    const rule = this.string(fields["rule"], `${path}/rule`, depth + 1, 64);
    if (!JUDGMENT_RULES.has(rule))
      this.fail("decode.expected-rule", `${path}/rule`, "unknown judgment rule");
    const occurrencePath = this.occurrencePath(
      fields["occurrence_path"],
      `${path}/occurrence_path`,
      depth + 1,
    );
    const rawValueContext = this.array(fields["value_context"], `${path}/value_context`, depth + 1);
    if (rawValueContext.length > this.bounds.maximumContextEntries) {
      this.fail(
        "decode.context-exceeded",
        `${path}/value_context`,
        "maximum value context length exceeded",
      );
    }
    const valueContext = rawValueContext.map((entry, index) =>
      this.valueBinderEntry(entry, `${path}/value_context/${index}`, depth + 2),
    );
    const rawResumptionContext = this.array(
      fields["resumption_context"],
      `${path}/resumption_context`,
      depth + 1,
    );
    if (rawResumptionContext.length > this.bounds.maximumContextEntries) {
      this.fail(
        "decode.context-exceeded",
        `${path}/resumption_context`,
        "maximum resumption context length exceeded",
      );
    }
    const resumptionContext = rawResumptionContext.map((entry, index) =>
      this.resumptionBinderEntry(entry, `${path}/resumption_context/${index}`, depth + 2),
    );
    if (tag === "value-judgment") {
      this.exact(
        fields,
        [
          "tag",
          "occurrence_path",
          "rule",
          "value_context",
          "resumption_context",
          "value_type",
          "usage",
          "resumption_usage",
          "premises",
        ],
        path,
      );
      return freeze({
        tag: "value-judgment",
        occurrence_path: occurrencePath,
        rule,
        value_context: freeze(valueContext),
        resumption_context: freeze(resumptionContext),
        value_type: this.typeIndex(fields["value_type"], `${path}/value_type`, depth + 1),
        usage: this.usageVector(fields["usage"], `${path}/usage`, depth + 1),
        resumption_usage: this.usageVector(
          fields["resumption_usage"],
          `${path}/resumption_usage`,
          depth + 1,
        ),
        premises: this.premises(fields["premises"], `${path}/premises`, depth + 1, ownIndex),
      });
    }
    const hasSignatureOrigins = "signature_origins" in fields;
    const requiresSignatureOrigins = rule === "computation.operation" || rule === "handler.deep";
    if (hasSignatureOrigins !== requiresSignatureOrigins) {
      this.fail(
        "decode.signature-origins-presence",
        path,
        "signature_origins must be present exactly for computation.operation and handler.deep",
      );
    }
    this.exact(
      fields,
      [
        "tag",
        "occurrence_path",
        "rule",
        "value_context",
        "resumption_context",
        "computation_type",
        "effects",
        "usage",
        "resumption_usage",
        "premises",
        ...(hasSignatureOrigins ? (["signature_origins"] as const) : []),
      ],
      path,
    );
    const signatureOrigins = hasSignatureOrigins
      ? this.array(fields["signature_origins"], `${path}/signature_origins`, depth + 1).map(
          (entry, index) =>
            this.occurrencePath(entry, `${path}/signature_origins/${index}`, depth + 2),
        )
      : undefined;
    if (
      signatureOrigins !== undefined &&
      rule === "computation.operation" &&
      signatureOrigins.length !== 1
    ) {
      this.fail(
        "decode.signature-origins-arity",
        `${path}/signature_origins`,
        "computation.operation must list exactly one declaration",
      );
    }
    return freeze({
      tag: "computation-judgment",
      occurrence_path: occurrencePath,
      rule,
      value_context: freeze(valueContext),
      resumption_context: freeze(resumptionContext),
      computation_type: this.typeIndex(
        fields["computation_type"],
        `${path}/computation_type`,
        depth + 1,
      ),
      effects: this.labelIndexRow(fields["effects"], `${path}/effects`, depth + 1),
      usage: this.usageVector(fields["usage"], `${path}/usage`, depth + 1),
      resumption_usage: this.usageVector(
        fields["resumption_usage"],
        `${path}/resumption_usage`,
        depth + 1,
      ),
      premises: this.premises(fields["premises"], `${path}/premises`, depth + 1, ownIndex),
      ...(signatureOrigins === undefined ? {} : { signature_origins: freeze(signatureOrigins) }),
    });
  }

  diagnosticFact(value: unknown, path: string, depth: number): DiagnosticFact {
    this.#enterNode(path, depth);
    if (value === null) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value))
        this.fail("decode.expected-integer", path, "expected a safe integer");
      return value;
    }
    if (typeof value === "string") {
      if (!hasUnicodeScalarsOnly(value)) {
        this.fail("decode.lone-surrogate", path, "strings must contain only Unicode scalar values");
      }
      if (utf8Bytes(value) > 4_096)
        this.fail("decode.string-exceeded", path, "maximum fact string length exceeded");
      return value;
    }
    if (Array.isArray(value)) {
      const raw = this.array(value, path, depth);
      if (raw.length > 256)
        this.fail("decode.collection-exceeded", path, "maximum fact array length exceeded");
      return freeze(
        raw.map((entry, index) => this.diagnosticFact(entry, `${path}/${index}`, depth + 1)),
      );
    }
    const fields = this.record(value, path, depth);
    const keys = Object.keys(fields);
    if (keys.length > 256)
      this.fail("decode.collection-exceeded", path, "maximum fact record length exceeded");
    // The frozen fact kind rules reserve exactly two record shapes as table
    // references: {"type_index": TypeIndex} and {"label_indexes":
    // [LabelIndex...]}. They must register through the same typeIndex /
    // labelIndexRow authority as every other table reference, so range
    // custody and the frozen first-encounter traversal order hold. A record
    // carrying a reserved key next to anything else is neither the reserved
    // shape nor an open record.
    if (keys.includes("type_index") || keys.includes("label_indexes")) {
      if (keys.length !== 1) {
        this.fail(
          "decode.reserved-fact-shape",
          path,
          'a reserved "type_index" or "label_indexes" fact record holds exactly that one key',
        );
      }
      if (keys[0] === "type_index") {
        return freeze({
          type_index: this.typeIndex(fields["type_index"], `${path}/type_index`, depth + 1),
        });
      }
      return freeze({
        label_indexes: this.labelIndexRow(
          fields["label_indexes"],
          `${path}/label_indexes`,
          depth + 1,
        ),
      });
    }
    // Open-record fields are traversed and materialized in Unicode
    // code-point key order — the same compareCodePoints order the canonical
    // encoding serializes keys in — never JS insertion order. Table
    // references nested under open keys therefore register with the
    // first-encounter authority in the order the canonical bytes replay
    // them, so a value and its own canonical encoding agree.
    const output: Record<string, DiagnosticFact> = {};
    for (const key of [...keys].sort(compareCodePoints)) {
      if (utf8Bytes(key) > 4_096)
        this.fail("decode.string-exceeded", `${path}/${key}`, "fact key too long");
      output[key] = this.diagnosticFact(fields[key], `${path}/${key}`, depth + 1);
    }
    return freeze(output);
  }

  // diagnosticFact already calls record/array/string which self-enter; this
  // extra guard only covers the object/array dispatch happening before the
  // delegated call for depth/node accounting symmetry with scalar branches.
  #enterNode(_path: string, _depth: number): void {}

  checkDiagnostic(value: unknown, path: string, depth: number): CheckDiagnostic {
    const fields = this.record(value, path, depth);
    const hasExpected = "expected" in fields;
    const hasActual = "actual" in fields;
    this.exact(
      fields,
      [
        "code",
        "rule",
        "occurrence_path",
        "message",
        ...(hasExpected ? (["expected"] as const) : []),
        ...(hasActual ? (["actual"] as const) : []),
      ],
      path,
    );
    const code = this.string(fields["code"], `${path}/code`, depth + 1, 64);
    if (!DIAGNOSTIC_CODES.has(code))
      this.fail("decode.expected-code", `${path}/code`, "unknown diagnostic code");
    const rule = this.string(fields["rule"], `${path}/rule`, depth + 1, 64);
    if (!DIAGNOSTIC_RULES.has(rule))
      this.fail("decode.expected-rule", `${path}/rule`, "unknown diagnostic rule");
    return freeze({
      code,
      rule,
      occurrence_path: this.occurrencePath(
        fields["occurrence_path"],
        `${path}/occurrence_path`,
        depth + 1,
      ),
      message: this.kernelName(fields["message"], `${path}/message`, depth + 1),
      ...(hasExpected
        ? { expected: this.diagnosticFact(fields["expected"], `${path}/expected`, depth + 1) }
        : {}),
      ...(hasActual
        ? { actual: this.diagnosticFact(fields["actual"], `${path}/actual`, depth + 1) }
        : {}),
    });
  }

  observation(value: unknown): KernelCheckObservation {
    const fields = this.record(value, "$", 0);
    if (fields["format"] !== "semantic.kernel-check") {
      this.fail("decode.unknown-format", "$/format", "unknown or missing format marker");
    }
    if (fields["version"] !== 1) {
      this.fail("decode.unknown-version", "$/version", "unknown or missing version marker");
    }
    if (fields["kernel"] !== "semantic.kernel-calculus/0018/v1") {
      this.fail("decode.unknown-kernel", "$/kernel", "unknown or missing kernel marker");
    }
    this.exact(fields, ["format", "version", "kernel", "observation"], "$");
    const observationFields = this.record(fields["observation"], "$/observation", 1);
    const tag = observationFields["tag"];
    if (tag !== "accepted" && tag !== "rejected") {
      this.fail("decode.expected-observation-tag", "$/observation/tag", "unknown observation tag");
    }
    this.#labels = this.labelTable(observationFields["labels"], "$/observation/labels", 2);
    this.#types = this.typeTable(observationFields["types"], "$/observation/types", 2);
    let result: CheckAccepted | CheckRejected;
    if (tag === "accepted") {
      this.exact(
        observationFields,
        ["tag", "labels", "types", "inferred", "judgments"],
        "$/observation",
      );
      const inferredFields = this.record(
        observationFields["inferred"],
        "$/observation/inferred",
        2,
      );
      this.exact(inferredFields, ["type", "effects", "usage"], "$/observation/inferred");
      const inferred = freeze({
        type: this.typeIndex(inferredFields["type"], "$/observation/inferred/type", 3),
        effects: this.labelIndexRow(inferredFields["effects"], "$/observation/inferred/effects", 3),
        usage: this.usageVector(inferredFields["usage"], "$/observation/inferred/usage", 3),
      });
      const rawJudgments = this.array(observationFields["judgments"], "$/observation/judgments", 2);
      if (rawJudgments.length === 0) {
        this.fail(
          "decode.empty-judgments",
          "$/observation/judgments",
          "accepted observation needs judgments",
        );
      }
      if (rawJudgments.length > this.bounds.maximumJudgments) {
        this.fail(
          "decode.judgments-exceeded",
          "$/observation/judgments",
          "maximum judgment count exceeded",
        );
      }
      const judgments = rawJudgments.map((entry, index) =>
        this.judgment(entry, `$/observation/judgments/${index}`, 3, index),
      );
      for (const judgment of judgments) {
        for (const premise of judgment.premises) {
          if (premise >= judgments.length) {
            this.fail(
              "decode.premise-out-of-range",
              "$/observation/judgments",
              "premise index is outside the judgment table",
            );
          }
        }
      }
      const root = judgments[0]!;
      const rootType = root.tag === "value-judgment" ? root.value_type : root.computation_type;
      if (
        rootType !== inferred.type ||
        root.tag !== "computation-judgment" ||
        !effectsEqual(root.effects, inferred.effects) ||
        !usageEqual(root.usage, inferred.usage)
      ) {
        this.fail(
          "decode.inferred-mismatch",
          "$/observation/inferred",
          "inferred summary must agree exactly with judgment 0",
        );
      }
      result = freeze({
        tag: "accepted",
        labels: this.#labels,
        types: this.#types,
        inferred,
        judgments,
      });
    } else {
      this.exact(observationFields, ["tag", "labels", "types", "diagnostics"], "$/observation");
      const rawDiagnostics = this.array(
        observationFields["diagnostics"],
        "$/observation/diagnostics",
        2,
      );
      if (rawDiagnostics.length === 0) {
        this.fail(
          "decode.empty-diagnostics",
          "$/observation/diagnostics",
          "rejected observation needs diagnostics",
        );
      }
      if (rawDiagnostics.length > this.bounds.maximumDiagnostics) {
        this.fail(
          "decode.diagnostics-exceeded",
          "$/observation/diagnostics",
          "maximum diagnostic count exceeded",
        );
      }
      const diagnostics = rawDiagnostics.map((entry, index) =>
        this.checkDiagnostic(entry, `$/observation/diagnostics/${index}`, 3),
      );
      result = freeze({ tag: "rejected", labels: this.#labels, types: this.#types, diagnostics });
    }
    this.verifyTraversalOrder("$/observation/types");
    return freeze({
      format: "semantic.kernel-check",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      observation: result,
    });
  }
}

const effectsEqual = (left: ReadonlyArray<number>, right: ReadonlyArray<number>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const usageEqual = (left: ReadonlyArray<Grade>, right: ReadonlyArray<Grade>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

const runDecode = <Value>(run: () => Value): KernelJsonDecodeResult<Value> => {
  try {
    return freeze({ status: "decoded", value: run() });
  } catch (cause) {
    if (cause instanceof DecodeSignal) {
      return freeze({ status: "rejected", diagnostics: freeze([cause.diagnostic]) });
    }
    return freeze({
      status: "rejected",
      diagnostics: freeze([
        diagnostic(
          "decode.hostile-input",
          "$",
          cause instanceof Error ? cause.message : "input could not be inspected",
        ),
      ]),
    });
  }
};

const decodeUtf8Strict = (bytes: Uint8Array): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
};

const rejectSingle = <Value>(
  code: string,
  path: string,
  message: string,
): KernelJsonDecodeResult<Value> =>
  freeze({ status: "rejected", diagnostics: freeze([diagnostic(code, path, message)]) });

export const decodeKernelDocumentValue = (
  input: unknown,
  bounds: KernelJsonRawBounds = defaultKernelJsonRawBounds,
): KernelJsonDecodeResult<KernelDocument> =>
  runDecode(() => new RawDecoder(bounds).document(input));

export const decodeKernelDocumentBytes = (
  input: unknown,
  bounds: KernelJsonRawBounds = defaultKernelJsonRawBounds,
): KernelJsonDecodeResult<KernelDocument> => {
  const snapshot = trustedUint8ArrayCopy(input);
  if (snapshot === undefined) {
    return rejectSingle("byte.expected-uint8array", "$", "expected a genuine Uint8Array");
  }
  if (snapshot.byteLength > bounds.maximumBytes) {
    return rejectSingle("byte.bytes-exceeded", "$", "maximum input byte length exceeded");
  }
  const text = decodeUtf8Strict(snapshot);
  if (text === undefined)
    return rejectSingle("byte.invalid-utf8", "$", "input is not strict UTF-8");
  const scanIssue = scanJson(text, bounds.maximumDepth, bounds.maximumNodes);
  if (scanIssue !== undefined) return rejectSingle(scanIssue.code, "$", scanIssue.message);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return rejectSingle("byte.json-grammar", "$", "invalid JSON");
  }
  const decoded = runDecode(() => new RawDecoder(bounds).document(parsed));
  if (decoded.status === "rejected") return decoded;
  const canonical = encodeCanonicalKernelDocument(decoded.value);
  if (canonical.byteLength > bounds.maximumBytes) {
    return rejectSingle("encode.bytes-exceeded", "$", "canonical encoding exceeds the byte bound");
  }
  return decoded;
};

export const decodeKernelCheckObservationValue = (
  input: unknown,
  bounds: KernelCheckEnvelopeBounds = defaultKernelCheckEnvelopeBounds,
): KernelJsonDecodeResult<KernelCheckObservation> =>
  runDecode(() => new ObservationDecoder(bounds).observation(input));

export const decodeKernelCheckObservationBytes = (
  input: unknown,
  bounds: KernelCheckEnvelopeBounds = defaultKernelCheckEnvelopeBounds,
): KernelJsonDecodeResult<KernelCheckObservation> => {
  const snapshot = trustedUint8ArrayCopy(input);
  if (snapshot === undefined) {
    return rejectSingle("byte.expected-uint8array", "$", "expected a genuine Uint8Array");
  }
  if (snapshot.byteLength > bounds.maximumObservationBytes) {
    return rejectSingle("byte.bytes-exceeded", "$", "maximum input byte length exceeded");
  }
  const text = decodeUtf8Strict(snapshot);
  if (text === undefined)
    return rejectSingle("byte.invalid-utf8", "$", "input is not strict UTF-8");
  const scanIssue = scanJson(text, bounds.maximumObservationDepth, bounds.maximumObservationNodes);
  if (scanIssue !== undefined) return rejectSingle(scanIssue.code, "$", scanIssue.message);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return rejectSingle("byte.json-grammar", "$", "invalid JSON");
  }
  const decoded = runDecode(() => new ObservationDecoder(bounds).observation(parsed));
  if (decoded.status === "rejected") return decoded;
  const canonical = encodeCanonicalKernelCheckObservation(decoded.value);
  if (canonical.byteLength > bounds.maximumObservationBytes) {
    return rejectSingle("encode.bytes-exceeded", "$", "canonical encoding exceeds the byte bound");
  }
  return decoded;
};
