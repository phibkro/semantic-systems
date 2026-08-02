import {
  cloneComputationTerm,
  operationSignature,
  type ComputationTerm,
  type ComputationType,
  type KernelType,
  type OperationDeclaration,
  type OperationSignature,
  type ValueTerm,
  type ValueType,
} from "./ast.ts";
import {
  effectRow,
  effectRowIsSubset,
  effectRowsEqual,
  removeEffectLabel,
  unionEffectRows,
  type EffectRow,
} from "./effect-row.ts";
import {
  addUsage,
  atLeastOnce,
  basisUsage,
  gradeLessThanOrEqual,
  joinGrades,
  joinUsage,
  multiplyGrades,
  scaleUsage,
  zeroUsage,
  type Grade,
  type Usage,
} from "./grade.ts";

/**
 * Bounded inert structured fact recorded alongside a rendered diagnostic
 * fact. This is the additive judgment-recording seam's own representation;
 * `src/kernel-json` translates it into the frozen `DiagnosticFact` JSON
 * grammar (type references become shared-table indexes) without
 * re-deriving any judgment.
 */
export type StructuredFact =
  | { readonly kind: "type"; readonly type: KernelType }
  | { readonly kind: "row"; readonly labels: EffectRow }
  | { readonly kind: "name"; readonly value: string }
  | { readonly kind: "grade"; readonly value: Grade }
  | { readonly kind: "count"; readonly value: number }
  | { readonly kind: "integer"; readonly value: number }
  | { readonly kind: "malformed-number"; readonly rendered: string }
  | { readonly kind: "shape"; readonly value: "F[q] A" | "U(effects, C)" | "A ->[q] (effects, C)" }
  | { readonly kind: "list"; readonly items: ReadonlyArray<StructuredFact> }
  | { readonly kind: "record"; readonly fields: Readonly<Record<string, StructuredFact>> };

const typeFact = (type: KernelType): StructuredFact => ({ kind: "type", type });
const nameFact = (value: string): StructuredFact => ({ kind: "name", value });
const gradeFact = (value: Grade): StructuredFact => ({ kind: "grade", value });
const countFact = (value: number): StructuredFact => ({ kind: "count", value });
const shapeFact = (value: "F[q] A" | "U(effects, C)" | "A ->[q] (effects, C)"): StructuredFact => ({
  kind: "shape",
  value,
});
const listFact = (items: ReadonlyArray<StructuredFact>): StructuredFact => ({
  kind: "list",
  items,
});
const recordFact = (fields: Readonly<Record<string, StructuredFact>>): StructuredFact => ({
  kind: "record",
  fields,
});
const numberFact = (value: number): StructuredFact =>
  Number.isSafeInteger(value)
    ? { kind: "integer", value }
    : { kind: "malformed-number", rendered: renderMalformedNumber(value) };

const renderMalformedNumber = (value: number): string => {
  const rendered = Number.isFinite(value) ? value.toString() : String(value);
  return rendered.length > 32 ? rendered.slice(0, 32) : rendered;
};

export interface KernelDiagnostic {
  readonly code: string;
  readonly rule: string;
  readonly path: string;
  readonly message: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly structuredExpected?: StructuredFact;
  readonly structuredActual?: StructuredFact;
}

export interface Derivation {
  readonly rule: string;
  readonly path: string;
  readonly conclusion: string;
  readonly premises: ReadonlyArray<Derivation>;
}

export type ValueBinderOriginKind =
  | "lambda-parameter"
  | "let-result"
  | "return-clause-result"
  | "operation-clause-argument"
  | "case-left-payload"
  | "case-right-payload";

class UsageLimitCell {
  value: Grade | undefined = undefined;
}

export interface ResolvedValueContextEntry {
  readonly binderOrigin: string;
  readonly originKind: ValueBinderOriginKind;
  readonly type: ValueType;
  readonly usageLimit: Grade;
}

export interface ResolvedResumptionContextEntry {
  readonly binderOrigin: string;
  readonly originKind: "operation-clause-resumption";
  readonly label: string;
  readonly operation: string;
  readonly resultType: ValueType;
  readonly continuationType: ComputationType;
  readonly continuationEffects: EffectRow;
  readonly usageLimit: "1";
}

export interface RecordedValueJudgment {
  readonly tag: "value-judgment";
  readonly path: string;
  readonly rule: string;
  readonly valueContext: ReadonlyArray<ResolvedValueContextEntry>;
  readonly resumptionContext: ReadonlyArray<ResolvedResumptionContextEntry>;
  readonly valueType: ValueType;
  readonly usage: Usage;
  readonly resumptionUsage: Usage;
  readonly premises: ReadonlyArray<number>;
}

export interface RecordedComputationJudgment {
  readonly tag: "computation-judgment";
  readonly path: string;
  readonly rule: string;
  readonly valueContext: ReadonlyArray<ResolvedValueContextEntry>;
  readonly resumptionContext: ReadonlyArray<ResolvedResumptionContextEntry>;
  readonly computationType: ComputationType;
  readonly effects: EffectRow;
  readonly usage: Usage;
  readonly resumptionUsage: Usage;
  readonly premises: ReadonlyArray<number>;
  readonly signatureOrigins?: ReadonlyArray<number>;
}

export type RecordedJudgment = RecordedValueJudgment | RecordedComputationJudgment;

/**
 * Draft table entries keep the live `ContextEntry`/`ResumptionExpectation`
 * references (including any unresolved `let`-result `UsageLimitCell`)
 * unfrozen until the whole program has been checked: a `let`-result usage
 * limit depends on its body's own inferred grade, which is only known once
 * the body — and every judgment recorded while checking it — has already
 * been reserved. `check` resolves and freezes the draft table once, after
 * the single authoritative check pass completes.
 */
interface DraftValueJudgment {
  readonly tag: "value-judgment";
  readonly path: string;
  readonly rule: string;
  readonly valueContext: ReadonlyArray<ContextEntry>;
  readonly resumptionContext: ReadonlyArray<ResumptionExpectation>;
  readonly valueType: ValueType;
  readonly usage: Usage;
  readonly resumptionUsage: Usage;
  readonly premises: ReadonlyArray<number>;
}

interface DraftComputationJudgment {
  readonly tag: "computation-judgment";
  readonly path: string;
  readonly rule: string;
  readonly valueContext: ReadonlyArray<ContextEntry>;
  readonly resumptionContext: ReadonlyArray<ResumptionExpectation>;
  readonly computationType: ComputationType;
  readonly effects: EffectRow;
  readonly usage: Usage;
  readonly resumptionUsage: Usage;
  readonly premises: ReadonlyArray<number>;
  readonly signatureOrigins?: ReadonlyArray<number>;
}

type DraftJudgment = DraftValueJudgment | DraftComputationJudgment;

export interface CheckedProgram {
  readonly type: ComputationType;
  readonly effects: EffectRow;
}

export interface CheckAccepted {
  readonly status: "accepted";
  readonly type: ComputationType;
  readonly effects: EffectRow;
  readonly usage: Usage;
  readonly derivation: Derivation;
  readonly program: CheckedProgram;
  /**
   * Additive judgment-recording seam output: one record per successfully
   * judged term occurrence, in the derivation's preorder. Frozen 0018-owned
   * data; `src/kernel-json` translates it into the agent-facing observation
   * without re-deriving any fact.
   */
  readonly judgments: ReadonlyArray<RecordedJudgment>;
}

export interface CheckRejected {
  readonly status: "rejected";
  readonly diagnostics: ReadonlyArray<KernelDiagnostic>;
}

export type CheckResult = CheckAccepted | CheckRejected;

export type EffectAssertionResult =
  | { readonly status: "accepted"; readonly effects: EffectRow }
  | CheckRejected;

const checkResultCustody = new WeakSet<object>();

interface CheckedProgramInternals {
  readonly signature: OperationSignature;
  readonly term: ComputationTerm;
  readonly valueTypes: ReadonlyMap<object, ValueType>;
}

const checkedCustody = new WeakSet<object>();
const checkedInternals = new WeakMap<object, CheckedProgramInternals>();

class CheckedProgramImpl implements CheckedProgram {
  readonly type: ComputationType;
  readonly effects: EffectRow;

  constructor(
    type: ComputationType,
    effects: EffectRow,
    signature: OperationSignature,
    term: ComputationTerm,
    valueTypes: ReadonlyMap<object, ValueType>,
  ) {
    this.type = type;
    this.effects = effects;
    checkedCustody.add(this);
    checkedInternals.set(this, { signature, term, valueTypes });
    Object.freeze(this);
  }
}

export const requireCheckedProgram = (
  program: CheckedProgram,
): CheckedProgramInternals | undefined =>
  typeof program === "object" && program !== null && checkedCustody.has(program)
    ? checkedInternals.get(program)
    : undefined;

export const isCheckedProgram = (program: unknown): program is CheckedProgram =>
  typeof program === "object" && program !== null && checkedCustody.has(program);

const frozen = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) frozen(child);
  return Object.freeze(value);
};

const observedCheckResult = <Result extends CheckResult>(result: Result): Result => {
  const observation = frozen(result);
  checkResultCustody.add(observation);
  return observation;
};

export const isCheckResult = (result: unknown): result is CheckResult =>
  typeof result === "object" && result !== null && checkResultCustody.has(result);

interface DiagnosticFacts {
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly structuredExpected?: StructuredFact;
  readonly structuredActual?: StructuredFact;
}

const diagnostic = (
  code: string,
  rule: string,
  path: string,
  message: string,
  facts: DiagnosticFacts = {},
): KernelDiagnostic =>
  frozen({
    code,
    rule,
    path,
    message,
    ...(facts.expected === undefined ? {} : { expected: facts.expected }),
    ...(facts.actual === undefined ? {} : { actual: facts.actual }),
    ...(facts.structuredExpected === undefined
      ? {}
      : { structuredExpected: facts.structuredExpected }),
    ...(facts.structuredActual === undefined ? {} : { structuredActual: facts.structuredActual }),
  });

class CheckFailure {
  readonly diagnostic: KernelDiagnostic;

  constructor(value: KernelDiagnostic) {
    this.diagnostic = value;
  }
}

const fail = (
  code: string,
  rule: string,
  path: string,
  message: string,
  facts?: DiagnosticFacts,
): never => {
  throw new CheckFailure(diagnostic(code, rule, path, message, facts));
};

const derive = (
  rule: string,
  path: string,
  conclusion: string,
  premises: ReadonlyArray<Derivation> = [],
): Derivation => frozen({ rule, path, conclusion, premises: frozen([...premises]) });

export const valueTypesEqual = (left: ValueType, right: ValueType): boolean => {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "unit":
    case "bool":
    case "int":
      return true;
    case "pair":
      return (
        right.kind === "pair" &&
        valueTypesEqual(left.first, right.first) &&
        valueTypesEqual(left.second, right.second)
      );
    case "sum":
      return (
        right.kind === "sum" &&
        valueTypesEqual(left.left, right.left) &&
        valueTypesEqual(left.right, right.right)
      );
    case "thunk":
      return (
        right.kind === "thunk" &&
        effectRowsEqual(left.effects, right.effects) &&
        computationTypesEqual(left.computation, right.computation)
      );
  }
};

export const computationTypesEqual = (left: ComputationType, right: ComputationType): boolean => {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "return":
      return (
        right.kind === "return" &&
        left.grade === right.grade &&
        valueTypesEqual(left.value, right.value)
      );
    case "function":
      return (
        right.kind === "function" &&
        valueTypesEqual(left.parameter, right.parameter) &&
        left.grade === right.grade &&
        effectRowsEqual(left.effects, right.effects) &&
        computationTypesEqual(left.result, right.result)
      );
  }
};

const showValueType = (type: ValueType): string => {
  switch (type.kind) {
    case "unit":
      return "Unit";
    case "bool":
      return "Bool";
    case "int":
      return "Int";
    case "pair":
      return `(${showValueType(type.first)} * ${showValueType(type.second)})`;
    case "sum":
      return `(${showValueType(type.left)} + ${showValueType(type.right)})`;
    case "thunk":
      return `U({${type.effects.join(",")}}, ${showComputationType(type.computation)})`;
  }
};

const showComputationType = (type: ComputationType): string => {
  switch (type.kind) {
    case "return":
      return `F[${type.grade}] ${showValueType(type.value)}`;
    case "function":
      return `${showValueType(type.parameter)} ->[${type.grade}] ({${type.effects.join(",")}}, ${showComputationType(type.result)})`;
  }
};

interface ResumptionExpectation {
  readonly input: ValueType;
  readonly output: ComputationType;
  readonly effects: EffectRow;
  readonly binderOrigin: string;
  readonly label: string;
  readonly operation: string;
}

interface ContextEntry {
  readonly type: ValueType;
  readonly binderOrigin: string;
  readonly originKind: ValueBinderOriginKind;
  readonly usageLimit: Grade | UsageLimitCell;
}

interface CheckedValue {
  readonly type: ValueType;
  readonly usage: Usage;
  readonly resumptionUsage: Usage;
  readonly derivation: Derivation;
  readonly judgmentIndex: number;
}

interface CheckedComputation {
  readonly type: ComputationType;
  readonly effects: EffectRow;
  readonly usage: Usage;
  readonly resumptionUsage: Usage;
  readonly derivation: Derivation;
  readonly judgmentIndex: number;
  readonly signatureOrigins?: ReadonlyArray<number>;
}

interface UncheckedValue extends Omit<CheckedValue, "judgmentIndex"> {
  readonly premiseIndexes: ReadonlyArray<number>;
}

interface UncheckedComputation extends Omit<CheckedComputation, "judgmentIndex"> {
  readonly premiseIndexes: ReadonlyArray<number>;
}

const mergeResumptionUsage = (left: Usage, right: Usage): Usage => addUsage(left, right);

const operationKey = (label: string, operation: string): string =>
  JSON.stringify([label, operation]);

const resolveContextEntry = (entry: ContextEntry): ResolvedValueContextEntry => ({
  binderOrigin: entry.binderOrigin,
  originKind: entry.originKind,
  type: entry.type,
  usageLimit:
    entry.usageLimit instanceof UsageLimitCell ? entry.usageLimit.value! : entry.usageLimit,
});

const resolveResumption = (entry: ResumptionExpectation): ResolvedResumptionContextEntry => ({
  binderOrigin: entry.binderOrigin,
  originKind: "operation-clause-resumption",
  label: entry.label,
  operation: entry.operation,
  resultType: entry.input,
  continuationType: entry.output,
  continuationEffects: entry.effects,
  usageLimit: "1",
});

const resolveDraftJudgment = (draft: DraftJudgment): RecordedJudgment =>
  draft.tag === "value-judgment"
    ? {
        tag: "value-judgment",
        path: draft.path,
        rule: draft.rule,
        valueContext: draft.valueContext.map(resolveContextEntry),
        resumptionContext: draft.resumptionContext.map(resolveResumption),
        valueType: draft.valueType,
        usage: draft.usage,
        resumptionUsage: draft.resumptionUsage,
        premises: draft.premises,
      }
    : {
        tag: "computation-judgment",
        path: draft.path,
        rule: draft.rule,
        valueContext: draft.valueContext.map(resolveContextEntry),
        resumptionContext: draft.resumptionContext.map(resolveResumption),
        computationType: draft.computationType,
        effects: draft.effects,
        usage: draft.usage,
        resumptionUsage: draft.resumptionUsage,
        premises: draft.premises,
        ...(draft.signatureOrigins === undefined
          ? {}
          : { signatureOrigins: draft.signatureOrigins }),
      };

class AlgorithmicChecker {
  readonly #signature: OperationSignature;
  readonly #operations: ReadonlyMap<string, OperationDeclaration>;
  readonly #operationIndexes: ReadonlyMap<string, number>;
  readonly valueTypes = new Map<object, ValueType>();
  readonly #table: Array<DraftJudgment> = [];
  #nextIndex = 0;

  constructor(signature: OperationSignature) {
    this.#signature = signature;
    this.#operations = new Map(
      signature.operations.map((declaration) => [
        operationKey(declaration.label, declaration.operation),
        declaration,
      ]),
    );
    this.#operationIndexes = new Map(
      signature.operations.map((declaration, index) => [
        operationKey(declaration.label, declaration.operation),
        index,
      ]),
    );
  }

  get table(): ReadonlyArray<DraftJudgment> {
    return this.#table;
  }

  value(
    term: ValueTerm,
    context: ReadonlyArray<ContextEntry>,
    resumptions: ReadonlyArray<ResumptionExpectation>,
    path: string,
  ): CheckedValue {
    const index = this.#nextIndex;
    this.#nextIndex += 1;
    const checked = this.valueUnchecked(term, context, resumptions, path);
    this.valueTypes.set(term, checked.type);
    this.#table[index] = {
      tag: "value-judgment",
      path,
      rule: checked.derivation.rule,
      valueContext: context,
      resumptionContext: resumptions,
      valueType: checked.type,
      usage: checked.usage,
      resumptionUsage: checked.resumptionUsage,
      premises: checked.premiseIndexes,
    };
    return { ...checked, judgmentIndex: index };
  }

  private valueUnchecked(
    term: ValueTerm,
    context: ReadonlyArray<ContextEntry>,
    resumptions: ReadonlyArray<ResumptionExpectation>,
    path: string,
  ): UncheckedValue {
    switch (term.kind) {
      case "variable": {
        const entry = context[term.index];
        if (entry === undefined) {
          return fail(
            "scope.variable-out-of-range",
            "value.variable",
            path,
            "variable index is outside the value context",
            {
              expected: { contextLength: context.length },
              actual: term.index,
              structuredExpected: recordFact({ contextLength: countFact(context.length) }),
              structuredActual: countFact(term.index),
            },
          );
        }
        return {
          type: entry.type,
          usage: basisUsage(context.length, term.index),
          resumptionUsage: zeroUsage(resumptions.length),
          derivation: derive("value.variable", path, showValueType(entry.type)),
          premiseIndexes: [],
        };
      }
      case "unit":
        return {
          type: frozen({ kind: "unit" }),
          usage: zeroUsage(context.length),
          resumptionUsage: zeroUsage(resumptions.length),
          derivation: derive("value.unit", path, "Unit"),
          premiseIndexes: [],
        };
      case "bool":
        return {
          type: frozen({ kind: "bool" }),
          usage: zeroUsage(context.length),
          resumptionUsage: zeroUsage(resumptions.length),
          derivation: derive("value.bool", path, "Bool"),
          premiseIndexes: [],
        };
      case "int":
        if (!Number.isSafeInteger(term.value)) {
          return fail(
            "value.integer-out-of-range",
            "value.int",
            path,
            "integer literals must be safe integers",
            { actual: term.value, structuredActual: numberFact(term.value) },
          );
        }
        return {
          type: frozen({ kind: "int" }),
          usage: zeroUsage(context.length),
          resumptionUsage: zeroUsage(resumptions.length),
          derivation: derive("value.int", path, "Int"),
          premiseIndexes: [],
        };
      case "pair": {
        const first = this.value(term.first, context, resumptions, `${path}.first`);
        const second = this.value(term.second, context, resumptions, `${path}.second`);
        const type: ValueType = frozen({
          kind: "pair",
          first: first.type,
          second: second.type,
        });
        return {
          type,
          usage: addUsage(first.usage, second.usage),
          resumptionUsage: mergeResumptionUsage(first.resumptionUsage, second.resumptionUsage),
          derivation: derive("value.pair", path, showValueType(type), [
            first.derivation,
            second.derivation,
          ]),
          premiseIndexes: [first.judgmentIndex, second.judgmentIndex],
        };
      }
      case "inject-left": {
        const value = this.value(term.value, context, resumptions, `${path}.value`);
        const type: ValueType = frozen({
          kind: "sum",
          left: value.type,
          right: term.rightType,
        });
        return {
          type,
          usage: value.usage,
          resumptionUsage: value.resumptionUsage,
          derivation: derive("value.inject-left", path, showValueType(type), [value.derivation]),
          premiseIndexes: [value.judgmentIndex],
        };
      }
      case "inject-right": {
        const value = this.value(term.value, context, resumptions, `${path}.value`);
        const type: ValueType = frozen({
          kind: "sum",
          left: term.leftType,
          right: value.type,
        });
        return {
          type,
          usage: value.usage,
          resumptionUsage: value.resumptionUsage,
          derivation: derive("value.inject-right", path, showValueType(type), [value.derivation]),
          premiseIndexes: [value.judgmentIndex],
        };
      }
      case "thunk": {
        const body = this.computation(term.body, context, resumptions, `${path}.body`);
        const type: ValueType = frozen({
          kind: "thunk",
          effects: body.effects,
          computation: body.type,
        });
        return {
          type,
          usage: body.usage,
          resumptionUsage: body.resumptionUsage,
          derivation: derive("value.thunk", path, showValueType(type), [body.derivation]),
          premiseIndexes: [body.judgmentIndex],
        };
      }
      case "resumption":
        return fail(
          "resumption.escape",
          "value.resumption-forbidden",
          path,
          "a resumption binder can occur only as the first operand of resume",
          { actual: term.index, structuredActual: numberFact(term.index) },
        );
    }
  }

  computation(
    term: ComputationTerm,
    context: ReadonlyArray<ContextEntry>,
    resumptions: ReadonlyArray<ResumptionExpectation>,
    path: string,
  ): CheckedComputation {
    const index = this.#nextIndex;
    this.#nextIndex += 1;
    const checked = this.computationUnchecked(term, context, resumptions, path);
    this.#table[index] = {
      tag: "computation-judgment",
      path,
      rule: checked.derivation.rule,
      valueContext: context,
      resumptionContext: resumptions,
      computationType: checked.type,
      effects: checked.effects,
      usage: checked.usage,
      resumptionUsage: checked.resumptionUsage,
      premises: checked.premiseIndexes,
      ...(checked.signatureOrigins === undefined
        ? {}
        : { signatureOrigins: checked.signatureOrigins }),
    };
    return { ...checked, judgmentIndex: index };
  }
  private computationUnchecked(
    term: ComputationTerm,
    context: ReadonlyArray<ContextEntry>,
    resumptions: ReadonlyArray<ResumptionExpectation>,
    path: string,
  ): UncheckedComputation {
    if (
      typeof term !== "object" ||
      term === null ||
      ![
        "return",
        "let",
        "force",
        "case",
        "lambda",
        "apply",
        "operation",
        "handle",
        "resume",
      ].includes((term as { readonly kind?: unknown }).kind as string)
    ) {
      return fail(
        "term.expected-computation",
        "computation.family",
        path,
        "a computation term is required",
      );
    }
    switch (term.kind) {
      case "return": {
        const value = this.value(term.value, context, resumptions, `${path}.value`);
        const type: ComputationType = frozen({
          kind: "return",
          grade: term.grade,
          value: value.type,
        });
        return {
          type,
          effects: effectRow(),
          usage: scaleUsage(term.grade, value.usage),
          resumptionUsage: scaleUsage(term.grade, value.resumptionUsage),
          derivation: derive("computation.return", path, `${showComputationType(type)} ; {}`, [
            value.derivation,
          ]),
          premiseIndexes: [value.judgmentIndex],
        };
      }
      case "let": {
        const bound = this.computation(term.bound, context, resumptions, `${path}.bound`);
        if (bound.type.kind !== "return") {
          return fail(
            "type.expected-return",
            "computation.let",
            `${path}.bound`,
            "let requires a returned value computation",
            {
              expected: "F[q] A",
              actual: showComputationType(bound.type),
              structuredExpected: shapeFact("F[q] A"),
              structuredActual: typeFact(bound.type),
            },
          );
        }
        const usageLimit = new UsageLimitCell();
        const body = this.computation(
          term.body,
          [
            {
              type: bound.type.value,
              binderOrigin: path,
              originKind: "let-result",
              usageLimit,
            },
            ...context,
          ],
          resumptions,
          `${path}.body`,
        );
        if (body.type.kind !== "return") {
          return fail(
            "type.expected-return",
            "computation.let",
            `${path}.body`,
            "let body must return a value",
            {
              expected: "F[q] B",
              actual: showComputationType(body.type),
              structuredExpected: shapeFact("F[q] A"),
              structuredActual: typeFact(body.type),
            },
          );
        }
        const limit = multiplyGrades(bound.type.grade, atLeastOnce(body.type.grade));
        usageLimit.value = limit;
        const actual = body.usage[0]!;
        if (!gradeLessThanOrEqual(actual, limit)) {
          return fail(
            limit === "1" && actual === "omega" ? "usage.affine-duplicated" : "usage.exceeds-grade",
            "computation.let",
            `${path}.body`,
            "bound result usage exceeds its quantitative limit",
            {
              expected: limit,
              actual,
              structuredExpected: gradeFact(limit),
              structuredActual: gradeFact(actual),
            },
          );
        }
        return {
          type: body.type,
          effects: unionEffectRows(bound.effects, body.effects),
          usage: addUsage(
            scaleUsage(atLeastOnce(body.type.grade), bound.usage),
            body.usage.slice(1),
          ),
          resumptionUsage: addUsage(
            scaleUsage(atLeastOnce(body.type.grade), bound.resumptionUsage),
            body.resumptionUsage,
          ),
          derivation: derive(
            "computation.let",
            path,
            `${showComputationType(body.type)} ; {${unionEffectRows(bound.effects, body.effects).join(",")}}`,
            [bound.derivation, body.derivation],
          ),
          premiseIndexes: [bound.judgmentIndex, body.judgmentIndex],
        };
      }
      case "force": {
        const value = this.value(term.value, context, resumptions, `${path}.value`);
        if (value.type.kind !== "thunk") {
          return fail(
            "type.expected-thunk",
            "computation.force",
            `${path}.value`,
            "force requires a thunk value",
            {
              expected: "U(effects, C)",
              actual: showValueType(value.type),
              structuredExpected: shapeFact("U(effects, C)"),
              structuredActual: typeFact(value.type),
            },
          );
        }
        return {
          type: value.type.computation,
          effects: value.type.effects,
          usage: value.usage,
          resumptionUsage: value.resumptionUsage,
          derivation: derive(
            "computation.force",
            path,
            `${showComputationType(value.type.computation)} ; {${value.type.effects.join(",")}}`,
            [value.derivation],
          ),
          premiseIndexes: [value.judgmentIndex],
        };
      }
      case "case": {
        const value = this.value(term.value, context, resumptions, `${path}.value`);
        if (value.type.kind !== "sum") {
          return fail(
            "type.expected-sum",
            "computation.case",
            `${path}.value`,
            "case requires a sum scrutinee",
            {
              expected: "A + B",
              actual: showValueType(value.type),
              structuredActual: typeFact(value.type),
            },
          );
        }
        const leftLimit = new UsageLimitCell();
        const rightLimit = new UsageLimitCell();
        const left = this.computation(
          term.leftBranch,
          [
            {
              type: value.type.left,
              binderOrigin: `${path}.leftBranch`,
              originKind: "case-left-payload",
              usageLimit: leftLimit,
            },
            ...context,
          ],
          resumptions,
          `${path}.leftBranch`,
        );
        const right = this.computation(
          term.rightBranch,
          [
            {
              type: value.type.right,
              binderOrigin: `${path}.rightBranch`,
              originKind: "case-right-payload",
              usageLimit: rightLimit,
            },
            ...context,
          ],
          resumptions,
          `${path}.rightBranch`,
        );
        if (!computationTypesEqual(left.type, right.type)) {
          return fail(
            "type.case-branch-mismatch",
            "computation.case",
            `${path}.rightBranch`,
            "case branches must have exactly equal computation types",
            {
              expected: showComputationType(left.type),
              actual: showComputationType(right.type),
              structuredExpected: typeFact(left.type),
              structuredActual: typeFact(right.type),
            },
          );
        }
        const payloadUse = joinGrades(left.usage[0]!, right.usage[0]!);
        leftLimit.value = payloadUse;
        rightLimit.value = payloadUse;
        const effects = unionEffectRows(left.effects, right.effects);
        return {
          type: left.type,
          effects,
          usage: addUsage(
            scaleUsage(payloadUse, value.usage),
            joinUsage(left.usage.slice(1), right.usage.slice(1)),
          ),
          resumptionUsage: addUsage(
            scaleUsage(payloadUse, value.resumptionUsage),
            joinUsage(left.resumptionUsage, right.resumptionUsage),
          ),
          derivation: derive(
            "computation.case",
            path,
            `${showComputationType(left.type)} ; {${effects.join(",")}}`,
            [value.derivation, left.derivation, right.derivation],
          ),
          premiseIndexes: [value.judgmentIndex, left.judgmentIndex, right.judgmentIndex],
        };
      }
      case "lambda": {
        const body = this.computation(
          term.body,
          [
            {
              type: term.parameterType,
              binderOrigin: path,
              originKind: "lambda-parameter",
              usageLimit: term.grade,
            },
            ...context,
          ],
          resumptions,
          `${path}.body`,
        );
        const actual = body.usage[0]!;
        if (!gradeLessThanOrEqual(actual, term.grade)) {
          return fail(
            term.grade === "1" && actual === "omega"
              ? "usage.affine-duplicated"
              : "usage.exceeds-grade",
            "computation.lambda",
            `${path}.body`,
            "function argument usage exceeds its declared grade",
            {
              expected: term.grade,
              actual,
              structuredExpected: gradeFact(term.grade),
              structuredActual: gradeFact(actual),
            },
          );
        }
        const type: ComputationType = frozen({
          kind: "function",
          parameter: term.parameterType,
          grade: term.grade,
          effects: body.effects,
          result: body.type,
        });
        return {
          type,
          effects: effectRow(),
          usage: body.usage.slice(1),
          resumptionUsage: body.resumptionUsage,
          derivation: derive("computation.lambda", path, `${showComputationType(type)} ; {}`, [
            body.derivation,
          ]),
          premiseIndexes: [body.judgmentIndex],
        };
      }
      case "apply": {
        const computation = this.computation(
          term.computation,
          context,
          resumptions,
          `${path}.computation`,
        );
        if (computation.type.kind !== "function") {
          return fail(
            "type.expected-function",
            "computation.apply",
            `${path}.computation`,
            "apply requires a computation-level function",
            {
              expected: "A ->[q] (effects, C)",
              actual: showComputationType(computation.type),
              structuredExpected: shapeFact("A ->[q] (effects, C)"),
              structuredActual: typeFact(computation.type),
            },
          );
        }
        const argument = this.value(term.argument, context, resumptions, `${path}.argument`);
        if (!valueTypesEqual(argument.type, computation.type.parameter)) {
          return fail(
            "type.argument-mismatch",
            "computation.apply",
            `${path}.argument`,
            "function argument type does not match",
            {
              expected: showValueType(computation.type.parameter),
              actual: showValueType(argument.type),
              structuredExpected: typeFact(computation.type.parameter),
              structuredActual: typeFact(argument.type),
            },
          );
        }
        return {
          type: computation.type.result,
          effects: unionEffectRows(computation.effects, computation.type.effects),
          usage: addUsage(computation.usage, scaleUsage(computation.type.grade, argument.usage)),
          resumptionUsage: addUsage(
            computation.resumptionUsage,
            scaleUsage(computation.type.grade, argument.resumptionUsage),
          ),
          derivation: derive(
            "computation.apply",
            path,
            `${showComputationType(computation.type.result)} ; {${unionEffectRows(computation.effects, computation.type.effects).join(",")}}`,
            [computation.derivation, argument.derivation],
          ),
          premiseIndexes: [computation.judgmentIndex, argument.judgmentIndex],
        };
      }
      case "operation": {
        const declaration = this.#operations.get(operationKey(term.label, term.operation));
        if (declaration === undefined) {
          return fail(
            "signature.operation-unknown",
            "computation.operation",
            path,
            "operation is not present in the declared signature",
            {
              actual: { label: term.label, operation: term.operation },
              structuredActual: recordFact({
                label: nameFact(term.label),
                operation: nameFact(term.operation),
              }),
            },
          );
        }
        const argument = this.value(term.argument, context, resumptions, `${path}.argument`);
        if (!valueTypesEqual(argument.type, declaration.argumentType)) {
          return fail(
            "type.operation-argument-mismatch",
            "computation.operation",
            `${path}.argument`,
            "operation argument type does not match its signature",
            {
              expected: showValueType(declaration.argumentType),
              actual: showValueType(argument.type),
              structuredExpected: typeFact(declaration.argumentType),
              structuredActual: typeFact(argument.type),
            },
          );
        }
        const type: ComputationType = frozen({
          kind: "return",
          grade: term.grade,
          value: declaration.resultType,
        });
        const declarationIndex = this.#operationIndexes.get(
          operationKey(term.label, term.operation),
        )!;
        return {
          type,
          effects: effectRow(term.label),
          usage: argument.usage,
          resumptionUsage: argument.resumptionUsage,
          derivation: derive(
            "computation.operation",
            path,
            `${showComputationType(type)} ; {${term.label}}`,
            [argument.derivation],
          ),
          premiseIndexes: [argument.judgmentIndex],
          signatureOrigins: [declarationIndex],
        };
      }
      case "handle":
        return this.handler(term, context, resumptions, path);
      case "resume": {
        const expectation = resumptions[term.resumption];
        if (expectation === undefined) {
          return fail(
            "scope.resumption-out-of-range",
            "computation.resume",
            path,
            "resumption index is outside the resumption context",
            {
              expected: { contextLength: resumptions.length },
              actual: term.resumption,
              structuredExpected: recordFact({ contextLength: countFact(resumptions.length) }),
              structuredActual: countFact(term.resumption),
            },
          );
        }
        const value = this.value(term.value, context, resumptions, `${path}.value`);
        if (!valueTypesEqual(value.type, expectation.input)) {
          return fail(
            "type.resumption-argument-mismatch",
            "computation.resume",
            `${path}.value`,
            "resumption argument type does not match the operation result type",
            {
              expected: showValueType(expectation.input),
              actual: showValueType(value.type),
              structuredExpected: typeFact(expectation.input),
              structuredActual: typeFact(value.type),
            },
          );
        }
        return {
          type: expectation.output,
          effects: expectation.effects,
          usage: value.usage,
          resumptionUsage: addUsage(
            value.resumptionUsage,
            basisUsage(resumptions.length, term.resumption),
          ),
          derivation: derive(
            "computation.resume",
            path,
            `${showComputationType(expectation.output)} ; {${expectation.effects.join(",")}}`,
            [value.derivation],
          ),
          premiseIndexes: [value.judgmentIndex],
        };
      }
    }
  }

  handler(
    term: Extract<ComputationTerm, { readonly kind: "handle" }>,
    context: ReadonlyArray<ContextEntry>,
    resumptions: ReadonlyArray<ResumptionExpectation>,
    path: string,
  ): UncheckedComputation {
    const handled = this.computation(term.computation, context, resumptions, `${path}.computation`);
    if (handled.type.kind !== "return") {
      return fail(
        "type.expected-return",
        "handler.input",
        `${path}.computation`,
        "handler input must return a value",
        {
          expected: "F[q] A",
          actual: showComputationType(handled.type),
          structuredExpected: shapeFact("F[q] A"),
          structuredActual: typeFact(handled.type),
        },
      );
    }
    const expectedOperations = this.#signature.operations
      .filter((declaration) => declaration.label === term.label)
      .map((declaration) => declaration.operation)
      .sort();
    if (expectedOperations.length === 0) {
      return fail(
        "handler.label-unknown",
        "handler.signature",
        path,
        "handled label has no operations in the signature",
        { actual: term.label, structuredActual: nameFact(term.label) },
      );
    }
    const actualOperations = term.operationClauses.map((clause) => clause.operation).sort();
    if (
      actualOperations.length !== expectedOperations.length ||
      actualOperations.some((operation, index) => operation !== expectedOperations[index])
    ) {
      return fail(
        "handler.clauses-inexact",
        "handler.signature",
        `${path}.operationClauses`,
        "handler requires exactly one clause for every operation under its label",
        {
          expected: expectedOperations,
          actual: actualOperations,
          structuredExpected: listFact(expectedOperations.map(nameFact)),
          structuredActual: listFact(actualOperations.map(nameFact)),
        },
      );
    }
    const returned = this.computation(
      term.returnClause.body,
      [
        {
          type: handled.type.value,
          binderOrigin: path,
          originKind: "return-clause-result",
          usageLimit: handled.type.grade,
        },
        ...context,
      ],
      resumptions,
      `${path}.returnClause.body`,
    );
    if (returned.type.kind !== "return") {
      return fail(
        "type.expected-return",
        "handler.return",
        `${path}.returnClause.body`,
        "handler return clause must return a value",
        {
          expected: "F[q] B",
          actual: showComputationType(returned.type),
          structuredExpected: shapeFact("F[q] A"),
          structuredActual: typeFact(returned.type),
        },
      );
    }
    if (returned.type.grade !== handled.type.grade) {
      return fail(
        "type.handler-grade-mismatch",
        "handler.return",
        `${path}.returnClause.body`,
        "handler return grade must equal the handled computation grade",
        {
          expected: handled.type.grade,
          actual: returned.type.grade,
          structuredExpected: gradeFact(handled.type.grade),
          structuredActual: gradeFact(returned.type.grade),
        },
      );
    }
    const returnBinderUse = returned.usage[0]!;
    if (!gradeLessThanOrEqual(returnBinderUse, handled.type.grade)) {
      return fail(
        handled.type.grade === "1" && returnBinderUse === "omega"
          ? "usage.affine-duplicated"
          : "usage.exceeds-grade",
        "handler.return",
        `${path}.returnClause.body`,
        "return-clause binder usage exceeds the handled result grade",
        {
          expected: handled.type.grade,
          actual: returnBinderUse,
          structuredExpected: gradeFact(handled.type.grade),
          structuredActual: gradeFact(returnBinderUse),
        },
      );
    }

    const residual = removeEffectLabel(handled.effects, term.label);
    let assumedEffects = unionEffectRows(residual, returned.effects);
    let clauses: ReadonlyArray<CheckedComputation> = [];
    const preLoopIndex = this.#nextIndex;
    for (let iteration = 0; iteration <= this.#signature.operations.length; iteration += 1) {
      this.#nextIndex = preLoopIndex;
      this.#table.length = preLoopIndex;
      clauses = term.operationClauses.map((clause, index) => {
        const declaration = this.#operations.get(operationKey(term.label, clause.operation))!;
        const checked = this.computation(
          clause.body,
          [
            {
              type: declaration.argumentType,
              binderOrigin: path,
              originKind: "operation-clause-argument",
              usageLimit: "omega",
            },
            ...context,
          ],
          [
            {
              input: declaration.resultType,
              output: returned.type,
              effects: assumedEffects,
              binderOrigin: path,
              label: term.label,
              operation: clause.operation,
            },
            ...resumptions,
          ],
          `${path}.operationClauses[${index}].body`,
        );
        if (!computationTypesEqual(checked.type, returned.type)) {
          return fail(
            "type.handler-clause-mismatch",
            "handler.operation",
            `${path}.operationClauses[${index}].body`,
            "operation clause result type must equal the return-clause result type",
            {
              expected: showComputationType(returned.type),
              actual: showComputationType(checked.type),
              structuredExpected: typeFact(returned.type),
              structuredActual: typeFact(checked.type),
            },
          );
        }
        const resumptionUse = checked.resumptionUsage[0]!;
        if (!gradeLessThanOrEqual(resumptionUse, "1")) {
          return fail(
            "usage.affine-duplicated",
            "handler.operation",
            `${path}.operationClauses[${index}].body`,
            "one-shot resumption binder is used more than once",
            {
              expected: "1",
              actual: resumptionUse,
              structuredExpected: gradeFact("1"),
              structuredActual: gradeFact(resumptionUse),
            },
          );
        }
        return checked;
      });
      const next = unionEffectRows(
        residual,
        returned.effects,
        ...clauses.map((clause) => clause.effects),
      );
      if (effectRowsEqual(next, assumedEffects)) break;
      assumedEffects = next;
    }

    let usage = addUsage(handled.usage, returned.usage.slice(1));
    let resumptionUsage = addUsage(handled.resumptionUsage, returned.resumptionUsage);
    for (const clause of clauses) {
      usage = addUsage(usage, clause.usage.slice(1));
      resumptionUsage = addUsage(resumptionUsage, clause.resumptionUsage.slice(1));
    }
    return {
      type: returned.type,
      effects: assumedEffects,
      usage,
      resumptionUsage,
      derivation: derive(
        "handler.deep",
        path,
        `${showComputationType(returned.type)} ; {${assumedEffects.join(",")}}`,
        [handled.derivation, returned.derivation, ...clauses.map((clause) => clause.derivation)],
      ),
      premiseIndexes: [
        handled.judgmentIndex,
        returned.judgmentIndex,
        ...clauses.map((clause) => clause.judgmentIndex),
      ],
      signatureOrigins: this.#signature.operations
        .map((declaration, index) => (declaration.label === term.label ? index : undefined))
        .filter((index): index is number => index !== undefined),
    };
  }
}

const validateSignature = (signature: OperationSignature): KernelDiagnostic | undefined => {
  const seen = new Set<string>();
  for (let index = 0; index < signature.operations.length; index += 1) {
    const declaration = signature.operations[index]!;
    if (declaration.label.trim().length === 0 || declaration.operation.trim().length === 0) {
      return diagnostic(
        "signature.empty-name",
        "signature",
        `$.signature.operations[${index}]`,
        "operation labels and names must be nonempty",
      );
    }
    const key = operationKey(declaration.label, declaration.operation);
    if (seen.has(key)) {
      return diagnostic(
        "signature.duplicate-operation",
        "signature",
        `$.signature.operations[${index}]`,
        "operation signature contains a duplicate label and operation pair",
        {
          actual: { label: declaration.label, operation: declaration.operation },
          structuredActual: recordFact({
            label: nameFact(declaration.label),
            operation: nameFact(declaration.operation),
          }),
        },
      );
    }
    seen.add(key);
  }
  return undefined;
};

export const check = (
  signatureInput: OperationSignature,
  termInput: ComputationTerm,
): CheckResult => {
  try {
    const signature = operationSignature(signatureInput.operations);
    const invalidSignature = validateSignature(signature);
    if (invalidSignature !== undefined) {
      return observedCheckResult({
        status: "rejected",
        diagnostics: frozen([invalidSignature]),
      });
    }
    const term = cloneComputationTerm(termInput);
    const checker = new AlgorithmicChecker(signature);
    const checked = checker.computation(term, [], [], "$");
    const program = new CheckedProgramImpl(
      checked.type,
      checked.effects,
      signature,
      term,
      checker.valueTypes,
    );
    return observedCheckResult({
      status: "accepted",
      type: checked.type,
      effects: checked.effects,
      usage: checked.usage,
      derivation: checked.derivation,
      program,
      judgments: frozen(checker.table.map(resolveDraftJudgment)),
    });
  } catch (cause) {
    if (cause instanceof CheckFailure) {
      return observedCheckResult({
        status: "rejected",
        diagnostics: frozen([cause.diagnostic]),
      });
    }
    return observedCheckResult({
      status: "rejected",
      diagnostics: frozen([
        diagnostic(
          "checker.invalid-input",
          "checker.boundary",
          "$",
          cause instanceof Error ? cause.message : "checker input could not be inspected",
        ),
      ]),
    });
  }
};

export const checkEffectAssertion = (
  program: CheckedProgram,
  claimedEffects: EffectRow,
): EffectAssertionResult => {
  if (!isCheckedProgram(program)) {
    return frozen({
      status: "rejected",
      diagnostics: frozen([
        diagnostic(
          "checked-program.required",
          "checker.effect-assertion",
          "$.program",
          "effect assertion requires a checked program in private custody",
        ),
      ]),
    });
  }
  const claimed = effectRow(...claimedEffects);
  if (!effectRowIsSubset(program.effects, claimed)) {
    return frozen({
      status: "rejected",
      diagnostics: frozen([
        diagnostic(
          "effect.foreign-tunneling",
          "handler.output-row",
          "$.claimedEffects",
          "claimed output row cannot hide an inferred effect label",
          { expected: program.effects, actual: claimed },
        ),
      ]),
    });
  }
  if (!effectRowsEqual(program.effects, claimed)) {
    return frozen({
      status: "rejected",
      diagnostics: frozen([
        diagnostic(
          "effect.row-mismatch",
          "checker.effect-assertion",
          "$.claimedEffects",
          "claimed output row does not equal the authoritative inferred row",
          { expected: program.effects, actual: claimed },
        ),
      ]),
    });
  }
  return frozen({ status: "accepted", effects: program.effects });
};
