import { Data, Effect } from "effect";
import { effectRow, type EffectRow } from "./effect-row.ts";
import { isGrade, type Grade } from "./grade.ts";

export type ValueType =
  | { readonly kind: "unit" }
  | { readonly kind: "bool" }
  | { readonly kind: "int" }
  | { readonly kind: "pair"; readonly first: ValueType; readonly second: ValueType }
  | { readonly kind: "sum"; readonly left: ValueType; readonly right: ValueType }
  | { readonly kind: "thunk"; readonly effects: EffectRow; readonly computation: ComputationType };

export type ComputationType =
  | { readonly kind: "return"; readonly grade: Grade; readonly value: ValueType }
  | {
      readonly kind: "function";
      readonly parameter: ValueType;
      readonly grade: Grade;
      readonly effects: EffectRow;
      readonly result: ComputationType;
    };

export type KernelType = ValueType | ComputationType;

export type ValueTerm =
  | { readonly kind: "variable"; readonly index: number }
  | { readonly kind: "unit" }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "int"; readonly value: number }
  | { readonly kind: "pair"; readonly first: ValueTerm; readonly second: ValueTerm }
  | { readonly kind: "inject-left"; readonly value: ValueTerm; readonly rightType: ValueType }
  | { readonly kind: "inject-right"; readonly leftType: ValueType; readonly value: ValueTerm }
  | { readonly kind: "thunk"; readonly body: ComputationTerm }
  | { readonly kind: "resumption"; readonly index: number };

export interface ReturnClause {
  readonly body: ComputationTerm;
}

export interface OperationClause {
  readonly operation: string;
  readonly body: ComputationTerm;
}

export type ComputationTerm =
  | { readonly kind: "return"; readonly grade: Grade; readonly value: ValueTerm }
  | { readonly kind: "let"; readonly bound: ComputationTerm; readonly body: ComputationTerm }
  | { readonly kind: "force"; readonly value: ValueTerm }
  | {
      readonly kind: "case";
      readonly value: ValueTerm;
      readonly leftBranch: ComputationTerm;
      readonly rightBranch: ComputationTerm;
    }
  | {
      readonly kind: "lambda";
      readonly parameterType: ValueType;
      readonly grade: Grade;
      readonly body: ComputationTerm;
    }
  | { readonly kind: "apply"; readonly computation: ComputationTerm; readonly argument: ValueTerm }
  | {
      readonly kind: "operation";
      readonly grade: Grade;
      readonly label: string;
      readonly operation: string;
      readonly argument: ValueTerm;
    }
  | {
      readonly kind: "handle";
      readonly label: string;
      readonly computation: ComputationTerm;
      readonly returnClause: ReturnClause;
      readonly operationClauses: ReadonlyArray<OperationClause>;
    }
  | {
      readonly kind: "resume";
      readonly resumption: number;
      readonly value: ValueTerm;
    };

export type Term = ValueTerm | ComputationTerm;

export interface OperationDeclaration {
  readonly label: string;
  readonly operation: string;
  readonly argumentType: ValueType;
  readonly resultType: ValueType;
}

export interface OperationSignature {
  readonly operations: ReadonlyArray<OperationDeclaration>;
}

export interface DecodeBounds {
  readonly maximumDepth: number;
  readonly maximumNodes: number;
  readonly maximumStringLength: number;
  readonly maximumCollectionLength: number;
}

export const defaultDecodeBounds: DecodeBounds = Object.freeze({
  maximumDepth: 64,
  maximumNodes: 4_096,
  maximumStringLength: 256,
  maximumCollectionLength: 256,
});

export interface DecodeDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type DecodeResult<Value> =
  | { readonly status: "decoded"; readonly value: Value }
  | { readonly status: "rejected"; readonly diagnostics: ReadonlyArray<DecodeDiagnostic> };

export class KernelDecodeFailure extends Data.TaggedError("KernelDecodeFailure")<{
  readonly diagnostics: ReadonlyArray<DecodeDiagnostic>;
}> {
  override get message(): string {
    return this.diagnostics
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join("; ");
  }
}

const freeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const cloneValueType = (type: ValueType): ValueType => {
  switch (type.kind) {
    case "unit":
    case "bool":
    case "int":
      return freeze({ kind: type.kind });
    case "pair":
      return freeze({
        kind: "pair",
        first: cloneValueType(type.first),
        second: cloneValueType(type.second),
      });
    case "sum":
      return freeze({
        kind: "sum",
        left: cloneValueType(type.left),
        right: cloneValueType(type.right),
      });
    case "thunk":
      return freeze({
        kind: "thunk",
        effects: effectRow(...type.effects),
        computation: cloneComputationType(type.computation),
      });
  }
};

const cloneComputationType = (type: ComputationType): ComputationType => {
  switch (type.kind) {
    case "return":
      return freeze({ kind: "return", grade: type.grade, value: cloneValueType(type.value) });
    case "function":
      return freeze({
        kind: "function",
        parameter: cloneValueType(type.parameter),
        grade: type.grade,
        effects: effectRow(...type.effects),
        result: cloneComputationType(type.result),
      });
  }
};

export const cloneType = (type: KernelType): KernelType =>
  type.kind === "return" || type.kind === "function"
    ? cloneComputationType(type)
    : cloneValueType(type);

export const cloneValueTerm = (term: ValueTerm): ValueTerm => {
  switch (term.kind) {
    case "variable":
    case "resumption":
      return freeze({ kind: term.kind, index: term.index });
    case "unit":
      return freeze({ kind: "unit" });
    case "bool":
      return freeze({ kind: "bool", value: term.value });
    case "int":
      return freeze({ kind: "int", value: term.value });
    case "pair":
      return freeze({
        kind: "pair",
        first: cloneValueTerm(term.first),
        second: cloneValueTerm(term.second),
      });
    case "inject-left":
      return freeze({
        kind: "inject-left",
        value: cloneValueTerm(term.value),
        rightType: cloneValueType(term.rightType),
      });
    case "inject-right":
      return freeze({
        kind: "inject-right",
        leftType: cloneValueType(term.leftType),
        value: cloneValueTerm(term.value),
      });
    case "thunk":
      return freeze({ kind: "thunk", body: cloneComputationTerm(term.body) });
  }
};

export const cloneComputationTerm = (term: ComputationTerm): ComputationTerm => {
  switch (term.kind) {
    case "return":
      return freeze({ kind: "return", grade: term.grade, value: cloneValueTerm(term.value) });
    case "let":
      return freeze({
        kind: "let",
        bound: cloneComputationTerm(term.bound),
        body: cloneComputationTerm(term.body),
      });
    case "force":
      return freeze({ kind: "force", value: cloneValueTerm(term.value) });
    case "case":
      return freeze({
        kind: "case",
        value: cloneValueTerm(term.value),
        leftBranch: cloneComputationTerm(term.leftBranch),
        rightBranch: cloneComputationTerm(term.rightBranch),
      });
    case "lambda":
      return freeze({
        kind: "lambda",
        parameterType: cloneValueType(term.parameterType),
        grade: term.grade,
        body: cloneComputationTerm(term.body),
      });
    case "apply":
      return freeze({
        kind: "apply",
        computation: cloneComputationTerm(term.computation),
        argument: cloneValueTerm(term.argument),
      });
    case "operation":
      return freeze({
        kind: "operation",
        grade: term.grade,
        label: term.label,
        operation: term.operation,
        argument: cloneValueTerm(term.argument),
      });
    case "handle":
      return freeze({
        kind: "handle",
        label: term.label,
        computation: cloneComputationTerm(term.computation),
        returnClause: freeze({ body: cloneComputationTerm(term.returnClause.body) }),
        operationClauses: freeze(
          term.operationClauses.map((clause) =>
            freeze({
              operation: clause.operation,
              body: cloneComputationTerm(clause.body),
            }),
          ),
        ),
      });
    case "resume":
      return freeze({
        kind: "resume",
        resumption: term.resumption,
        value: cloneValueTerm(term.value),
      });
  }
};

export const unitType = (): ValueType => freeze({ kind: "unit" });
export const boolType = (): ValueType => freeze({ kind: "bool" });
export const intType = (): ValueType => freeze({ kind: "int" });
export const pairType = (first: ValueType, second: ValueType): ValueType =>
  freeze({ kind: "pair", first: cloneValueType(first), second: cloneValueType(second) });
export const sumType = (left: ValueType, right: ValueType): ValueType =>
  freeze({ kind: "sum", left: cloneValueType(left), right: cloneValueType(right) });
export const thunkType = (effects: EffectRow, computation: ComputationType): ValueType =>
  freeze({
    kind: "thunk",
    effects: effectRow(...effects),
    computation: cloneComputationType(computation),
  });
export const returnType = (grade: Grade, value: ValueType): ComputationType =>
  freeze({ kind: "return", grade, value: cloneValueType(value) });
export const functionType = (
  parameter: ValueType,
  grade: Grade,
  effects: EffectRow,
  result: ComputationType,
): ComputationType =>
  freeze({
    kind: "function",
    parameter: cloneValueType(parameter),
    grade,
    effects: effectRow(...effects),
    result: cloneComputationType(result),
  });

export const variable = (index: number): ValueTerm => freeze({ kind: "variable", index });
export const unit = (): ValueTerm => freeze({ kind: "unit" });
export const bool = (value: boolean): ValueTerm => freeze({ kind: "bool", value });
export const int = (value: number): ValueTerm => freeze({ kind: "int", value });
export const pair = (first: ValueTerm, second: ValueTerm): ValueTerm =>
  freeze({ kind: "pair", first: cloneValueTerm(first), second: cloneValueTerm(second) });
export const injectLeft = (value: ValueTerm, rightType: ValueType): ValueTerm =>
  freeze({
    kind: "inject-left",
    value: cloneValueTerm(value),
    rightType: cloneValueType(rightType),
  });
export const injectRight = (leftType: ValueType, value: ValueTerm): ValueTerm =>
  freeze({
    kind: "inject-right",
    leftType: cloneValueType(leftType),
    value: cloneValueTerm(value),
  });
export const thunk = (body: ComputationTerm): ValueTerm =>
  freeze({ kind: "thunk", body: cloneComputationTerm(body) });
export const resumption = (index = 0): ValueTerm => freeze({ kind: "resumption", index });
export const returnTerm = (grade: Grade, value: ValueTerm): ComputationTerm =>
  freeze({ kind: "return", grade, value: cloneValueTerm(value) });
export const letTerm = (bound: ComputationTerm, body: ComputationTerm): ComputationTerm =>
  freeze({
    kind: "let",
    bound: cloneComputationTerm(bound),
    body: cloneComputationTerm(body),
  });
export const force = (value: ValueTerm): ComputationTerm =>
  freeze({ kind: "force", value: cloneValueTerm(value) });
export const caseTerm = (
  value: ValueTerm,
  leftBranch: ComputationTerm,
  rightBranch: ComputationTerm,
): ComputationTerm =>
  freeze({
    kind: "case",
    value: cloneValueTerm(value),
    leftBranch: cloneComputationTerm(leftBranch),
    rightBranch: cloneComputationTerm(rightBranch),
  });
export const lambda = (
  parameterType: ValueType,
  grade: Grade,
  body: ComputationTerm,
): ComputationTerm =>
  freeze({
    kind: "lambda",
    parameterType: cloneValueType(parameterType),
    grade,
    body: cloneComputationTerm(body),
  });
export const apply = (computation: ComputationTerm, argument: ValueTerm): ComputationTerm =>
  freeze({
    kind: "apply",
    computation: cloneComputationTerm(computation),
    argument: cloneValueTerm(argument),
  });
export const operation = (
  grade: Grade,
  label: string,
  name: string,
  argument: ValueTerm,
): ComputationTerm =>
  freeze({
    kind: "operation",
    grade,
    label,
    operation: name,
    argument: cloneValueTerm(argument),
  });
export const returnClause = (body: ComputationTerm): ReturnClause =>
  freeze({ body: cloneComputationTerm(body) });
export const operationClause = (name: string, body: ComputationTerm): OperationClause =>
  freeze({ operation: name, body: cloneComputationTerm(body) });
export const handle = (
  label: string,
  computation: ComputationTerm,
  onReturn: ReturnClause,
  clauses: ReadonlyArray<OperationClause>,
): ComputationTerm =>
  freeze({
    kind: "handle",
    label,
    computation: cloneComputationTerm(computation),
    returnClause: freeze({ body: cloneComputationTerm(onReturn.body) }),
    operationClauses: freeze(
      clauses.map((clause) =>
        freeze({ operation: clause.operation, body: cloneComputationTerm(clause.body) }),
      ),
    ),
  });
export const resumeTerm = (resumptionBinder: number, value: ValueTerm): ComputationTerm =>
  freeze({ kind: "resume", resumption: resumptionBinder, value: cloneValueTerm(value) });

export const operationSignature = (
  declarations: ReadonlyArray<OperationDeclaration>,
): OperationSignature =>
  freeze({
    operations: freeze(
      declarations.map((declaration) =>
        freeze({
          label: declaration.label,
          operation: declaration.operation,
          argumentType: cloneValueType(declaration.argumentType),
          resultType: cloneValueType(declaration.resultType),
        }),
      ),
    ),
  });

const diagnostic = (code: string, path: string, message: string): DecodeDiagnostic =>
  freeze({ code, path, message });

class Decoder {
  readonly #bounds: DecodeBounds;
  #nodes = 0;

  constructor(bounds: DecodeBounds) {
    this.#bounds = bounds;
  }

  fail(code: string, path: string, message: string): never {
    throw new KernelDecodeFailure({ diagnostics: freeze([diagnostic(code, path, message)]) });
  }

  node(value: unknown, path: string, depth: number): Readonly<Record<string, unknown>> {
    if (depth > this.#bounds.maximumDepth) {
      return this.fail("decode.depth-exceeded", path, "maximum decode depth exceeded");
    }
    this.#nodes += 1;
    if (this.#nodes > this.#bounds.maximumNodes) {
      return this.fail("decode.nodes-exceeded", path, "maximum decoded node count exceeded");
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return this.fail("decode.expected-record", path, "expected a record");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return this.fail("decode.non-data", path, "expected a plain data record");
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol") {
        return this.fail("decode.non-data", path, "symbol-keyed properties are not semantic data");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return this.fail(
          "decode.non-data",
          `${path}.${key}`,
          "accessors and non-enumerable properties are not semantic data",
        );
      }
    }
    return value as Readonly<Record<string, unknown>>;
  }

  string(value: unknown, path: string): string {
    if (typeof value !== "string" || value.length === 0) {
      return this.fail("decode.expected-nonempty-string", path, "expected a nonempty string");
    }
    if (value.length > this.#bounds.maximumStringLength) {
      return this.fail("decode.string-exceeded", path, "maximum string length exceeded");
    }
    return value;
  }

  grade(value: unknown, path: string): Grade {
    if (!isGrade(value)) return this.fail("decode.expected-grade", path, "expected 0, 1, or omega");
    return value;
  }

  index(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      return this.fail("decode.expected-index", path, "expected a nonnegative safe integer");
    }
    return value as number;
  }

  array(value: unknown, path: string): ReadonlyArray<unknown> {
    if (!Array.isArray(value)) return this.fail("decode.expected-array", path, "expected an array");
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return this.fail("decode.non-data", path, "expected a plain data array");
    }
    if (value.length > this.#bounds.maximumCollectionLength) {
      return this.fail("decode.collection-exceeded", path, "maximum collection length exceeded");
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key === "symbol") {
        return this.fail("decode.non-data", path, "symbol-keyed properties are not semantic data");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return this.fail(
          "decode.non-data",
          `${path}[${key}]`,
          "accessors and non-enumerable properties are not semantic data",
        );
      }
    }
    return value;
  }

  exact(
    fields: Readonly<Record<string, unknown>>,
    allowed: ReadonlyArray<string>,
    path: string,
  ): void {
    const unexpected = Object.keys(fields).find((key) => !allowed.includes(key));
    if (unexpected !== undefined) {
      this.fail("decode.excess-property", `${path}.${unexpected}`, "unexpected property");
    }
  }

  valueType(value: unknown, path: string, depth: number): ValueType {
    const fields = this.node(value, path, depth);
    const kind = fields["kind"];
    switch (kind) {
      case "unit":
      case "bool":
      case "int":
        this.exact(fields, ["kind"], path);
        return freeze({ kind });
      case "pair":
        this.exact(fields, ["kind", "first", "second"], path);
        return pairType(
          this.valueType(fields["first"], `${path}.first`, depth + 1),
          this.valueType(fields["second"], `${path}.second`, depth + 1),
        );
      case "sum":
        this.exact(fields, ["kind", "left", "right"], path);
        return sumType(
          this.valueType(fields["left"], `${path}.left`, depth + 1),
          this.valueType(fields["right"], `${path}.right`, depth + 1),
        );
      case "thunk":
        this.exact(fields, ["kind", "effects", "computation"], path);
        return thunkType(
          this.row(fields["effects"], `${path}.effects`),
          this.computationType(fields["computation"], `${path}.computation`, depth + 1),
        );
      default:
        return this.fail("decode.expected-value-type", `${path}.kind`, "unknown value type");
    }
  }

  computationType(value: unknown, path: string, depth: number): ComputationType {
    const fields = this.node(value, path, depth);
    switch (fields["kind"]) {
      case "return":
        this.exact(fields, ["kind", "grade", "value"], path);
        return returnType(
          this.grade(fields["grade"], `${path}.grade`),
          this.valueType(fields["value"], `${path}.value`, depth + 1),
        );
      case "function":
        this.exact(fields, ["kind", "parameter", "grade", "effects", "result"], path);
        return functionType(
          this.valueType(fields["parameter"], `${path}.parameter`, depth + 1),
          this.grade(fields["grade"], `${path}.grade`),
          this.row(fields["effects"], `${path}.effects`),
          this.computationType(fields["result"], `${path}.result`, depth + 1),
        );
      default:
        return this.fail(
          "decode.expected-computation-type",
          `${path}.kind`,
          "unknown computation type",
        );
    }
  }

  row(value: unknown, path: string): EffectRow {
    return effectRow(
      ...this.array(value, path).map((entry, index) => this.string(entry, `${path}[${index}]`)),
    );
  }

  valueTerm(value: unknown, path: string, depth: number): ValueTerm {
    const fields = this.node(value, path, depth);
    switch (fields["kind"]) {
      case "variable":
      case "resumption":
        this.exact(fields, ["kind", "index"], path);
        return freeze({
          kind: fields["kind"],
          index: this.index(fields["index"], `${path}.index`),
        });
      case "unit":
        this.exact(fields, ["kind"], path);
        return unit();
      case "bool":
        this.exact(fields, ["kind", "value"], path);
        if (typeof fields["value"] !== "boolean") {
          return this.fail("decode.expected-bool", `${path}.value`, "expected a boolean");
        }
        return bool(fields["value"]);
      case "int":
        this.exact(fields, ["kind", "value"], path);
        if (!Number.isSafeInteger(fields["value"])) {
          return this.fail("decode.expected-int", `${path}.value`, "expected a safe integer");
        }
        return int(fields["value"] as number);
      case "pair":
        this.exact(fields, ["kind", "first", "second"], path);
        return pair(
          this.valueTerm(fields["first"], `${path}.first`, depth + 1),
          this.valueTerm(fields["second"], `${path}.second`, depth + 1),
        );
      case "inject-left":
        this.exact(fields, ["kind", "value", "rightType"], path);
        return injectLeft(
          this.valueTerm(fields["value"], `${path}.value`, depth + 1),
          this.valueType(fields["rightType"], `${path}.rightType`, depth + 1),
        );
      case "inject-right":
        this.exact(fields, ["kind", "leftType", "value"], path);
        return injectRight(
          this.valueType(fields["leftType"], `${path}.leftType`, depth + 1),
          this.valueTerm(fields["value"], `${path}.value`, depth + 1),
        );
      case "thunk":
        this.exact(fields, ["kind", "body"], path);
        return thunk(this.computationTerm(fields["body"], `${path}.body`, depth + 1));
      default:
        return this.fail("decode.expected-value", `${path}.kind`, "expected a value term");
    }
  }

  computationTerm(value: unknown, path: string, depth: number): ComputationTerm {
    const fields = this.node(value, path, depth);
    switch (fields["kind"]) {
      case "return":
        this.exact(fields, ["kind", "grade", "value"], path);
        return returnTerm(
          this.grade(fields["grade"], `${path}.grade`),
          this.valueTerm(fields["value"], `${path}.value`, depth + 1),
        );
      case "let":
        this.exact(fields, ["kind", "bound", "body"], path);
        return letTerm(
          this.computationTerm(fields["bound"], `${path}.bound`, depth + 1),
          this.computationTerm(fields["body"], `${path}.body`, depth + 1),
        );
      case "force":
        this.exact(fields, ["kind", "value"], path);
        return force(this.valueTerm(fields["value"], `${path}.value`, depth + 1));
      case "case":
        this.exact(fields, ["kind", "value", "leftBranch", "rightBranch"], path);
        return caseTerm(
          this.valueTerm(fields["value"], `${path}.value`, depth + 1),
          this.computationTerm(fields["leftBranch"], `${path}.leftBranch`, depth + 1),
          this.computationTerm(fields["rightBranch"], `${path}.rightBranch`, depth + 1),
        );
      case "lambda":
        this.exact(fields, ["kind", "parameterType", "grade", "body"], path);
        return lambda(
          this.valueType(fields["parameterType"], `${path}.parameterType`, depth + 1),
          this.grade(fields["grade"], `${path}.grade`),
          this.computationTerm(fields["body"], `${path}.body`, depth + 1),
        );
      case "apply":
        this.exact(fields, ["kind", "computation", "argument"], path);
        return apply(
          this.computationTerm(fields["computation"], `${path}.computation`, depth + 1),
          this.valueTerm(fields["argument"], `${path}.argument`, depth + 1),
        );
      case "operation":
        this.exact(fields, ["kind", "grade", "label", "operation", "argument"], path);
        return operation(
          this.grade(fields["grade"], `${path}.grade`),
          this.string(fields["label"], `${path}.label`),
          this.string(fields["operation"], `${path}.operation`),
          this.valueTerm(fields["argument"], `${path}.argument`, depth + 1),
        );
      case "handle": {
        this.exact(
          fields,
          ["kind", "label", "computation", "returnClause", "operationClauses"],
          path,
        );
        const returnFields = this.node(fields["returnClause"], `${path}.returnClause`, depth + 1);
        this.exact(returnFields, ["body"], `${path}.returnClause`);
        const clauses = this.array(fields["operationClauses"], `${path}.operationClauses`);
        return handle(
          this.string(fields["label"], `${path}.label`),
          this.computationTerm(fields["computation"], `${path}.computation`, depth + 1),
          returnClause(
            this.computationTerm(returnFields["body"], `${path}.returnClause.body`, depth + 2),
          ),
          clauses.map((clause, index) => {
            const clausePath = `${path}.operationClauses[${index}]`;
            const clauseFields = this.node(clause, clausePath, depth + 1);
            this.exact(clauseFields, ["operation", "body"], clausePath);
            return operationClause(
              this.string(clauseFields["operation"], `${clausePath}.operation`),
              this.computationTerm(clauseFields["body"], `${clausePath}.body`, depth + 2),
            );
          }),
        );
      }
      case "resume":
        this.exact(fields, ["kind", "resumption", "value"], path);
        return resumeTerm(
          this.index(fields["resumption"], `${path}.resumption`),
          this.valueTerm(fields["value"], `${path}.value`, depth + 1),
        );
      default:
        return this.fail(
          "decode.expected-computation",
          `${path}.kind`,
          "expected a computation term",
        );
    }
  }
}

const validateBounds = (bounds: DecodeBounds): DecodeDiagnostic | undefined => {
  for (const [field, value] of Object.entries(bounds)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      return diagnostic(
        "decode.invalid-bound",
        `bounds.${field}`,
        "expected a positive safe integer",
      );
    }
  }
  return undefined;
};

const decodeWith = <Value>(
  bounds: DecodeBounds,
  run: (decoder: Decoder) => Value,
): DecodeResult<Value> => {
  const invalid = validateBounds(bounds);
  if (invalid !== undefined) return freeze({ status: "rejected", diagnostics: freeze([invalid]) });
  try {
    return freeze({ status: "decoded", value: run(new Decoder(bounds)) });
  } catch (cause) {
    if (cause instanceof KernelDecodeFailure) {
      return freeze({ status: "rejected", diagnostics: cause.diagnostics });
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

export const decodeValueTerm = (
  input: unknown,
  bounds: DecodeBounds = defaultDecodeBounds,
): DecodeResult<ValueTerm> => decodeWith(bounds, (decoder) => decoder.valueTerm(input, "$", 0));

export const decodeComputationTerm = (
  input: unknown,
  bounds: DecodeBounds = defaultDecodeBounds,
): DecodeResult<ComputationTerm> =>
  decodeWith(bounds, (decoder) => decoder.computationTerm(input, "$", 0));

export const decodeTerm = (
  input: unknown,
  family: "value" | "computation",
  bounds: DecodeBounds = defaultDecodeBounds,
): DecodeResult<Term> =>
  family === "value" ? decodeValueTerm(input, bounds) : decodeComputationTerm(input, bounds);

export const decodeComputationTermEffect = (
  input: unknown,
  bounds: DecodeBounds = defaultDecodeBounds,
): Effect.Effect<ComputationTerm, KernelDecodeFailure> => {
  const result = decodeComputationTerm(input, bounds);
  return result.status === "decoded"
    ? Effect.succeed(result.value)
    : Effect.fail(new KernelDecodeFailure({ diagnostics: result.diagnostics }));
};

export const decodeOperationSignature = (
  input: unknown,
  bounds: DecodeBounds = defaultDecodeBounds,
): DecodeResult<OperationSignature> =>
  decodeWith(bounds, (decoder) => {
    const fields = decoder.node(input, "$", 0);
    decoder.exact(fields, ["operations"], "$");
    const declarations = decoder.array(fields["operations"], "$.operations");
    return operationSignature(
      declarations.map((entry, index) => {
        const path = `$.operations[${index}]`;
        const declaration = decoder.node(entry, path, 1);
        decoder.exact(declaration, ["label", "operation", "argumentType", "resultType"], path);
        return {
          label: decoder.string(declaration["label"], `${path}.label`),
          operation: decoder.string(declaration["operation"], `${path}.operation`),
          argumentType: decoder.valueType(declaration["argumentType"], `${path}.argumentType`, 2),
          resultType: decoder.valueType(declaration["resultType"], `${path}.resultType`, 2),
        };
      }),
    );
  });
