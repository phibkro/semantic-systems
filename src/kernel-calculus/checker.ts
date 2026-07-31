import {
  cloneComputationTerm,
  operationSignature,
  type ComputationTerm,
  type ComputationType,
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
  multiplyGrades,
  scaleUsage,
  zeroUsage,
  type Usage,
} from "./grade.ts";

export interface KernelDiagnostic {
  readonly code: string;
  readonly rule: string;
  readonly path: string;
  readonly message: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export interface Derivation {
  readonly rule: string;
  readonly path: string;
  readonly conclusion: string;
  readonly premises: ReadonlyArray<Derivation>;
}

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
}

export interface CheckRejected {
  readonly status: "rejected";
  readonly diagnostics: ReadonlyArray<KernelDiagnostic>;
}

export type CheckResult = CheckAccepted | CheckRejected;

interface CheckedProgramInternals {
  readonly signature: OperationSignature;
  readonly term: ComputationTerm;
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
  ) {
    this.type = type;
    this.effects = effects;
    checkedCustody.add(this);
    checkedInternals.set(this, { signature, term });
    Object.freeze(this);
  }
}

export const requireCheckedProgram = (
  program: CheckedProgram,
): CheckedProgramInternals | undefined =>
  typeof program === "object" && program !== null && checkedCustody.has(program)
    ? checkedInternals.get(program)
    : undefined;

const frozen = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) frozen(child);
  return Object.freeze(value);
};

const diagnostic = (
  code: string,
  rule: string,
  path: string,
  message: string,
  facts: { readonly expected?: unknown; readonly actual?: unknown } = {},
): KernelDiagnostic =>
  frozen({
    code,
    rule,
    path,
    message,
    ...(facts.expected === undefined ? {} : { expected: facts.expected }),
    ...(facts.actual === undefined ? {} : { actual: facts.actual }),
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
  facts?: { readonly expected?: unknown; readonly actual?: unknown },
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
}

interface CheckedValue {
  readonly type: ValueType;
  readonly usage: Usage;
  readonly resumptionUsage: Usage;
  readonly derivation: Derivation;
}

interface CheckedComputation {
  readonly type: ComputationType;
  readonly effects: EffectRow;
  readonly usage: Usage;
  readonly resumptionUsage: Usage;
  readonly derivation: Derivation;
}

const mergeResumptionUsage = (left: Usage, right: Usage): Usage => addUsage(left, right);

class AlgorithmicChecker {
  readonly #signature: OperationSignature;
  readonly #operations: ReadonlyMap<string, OperationDeclaration>;

  constructor(signature: OperationSignature) {
    this.#signature = signature;
    this.#operations = new Map(
      signature.operations.map((declaration) => [
        `${declaration.label}\u0000${declaration.operation}`,
        declaration,
      ]),
    );
  }

  value(
    term: ValueTerm,
    context: ReadonlyArray<ValueType>,
    resumptions: ReadonlyArray<ResumptionExpectation>,
    path: string,
  ): CheckedValue {
    switch (term.kind) {
      case "variable": {
        const type = context[term.index];
        if (type === undefined) {
          return fail(
            "scope.variable-out-of-range",
            "value.variable",
            path,
            "variable index is outside the value context",
            { expected: { contextLength: context.length }, actual: term.index },
          );
        }
        return {
          type,
          usage: basisUsage(context.length, term.index),
          resumptionUsage: zeroUsage(resumptions.length),
          derivation: derive("value.variable", path, showValueType(type)),
        };
      }
      case "unit":
        return {
          type: frozen({ kind: "unit" }),
          usage: zeroUsage(context.length),
          resumptionUsage: zeroUsage(resumptions.length),
          derivation: derive("value.unit", path, "Unit"),
        };
      case "bool":
        return {
          type: frozen({ kind: "bool" }),
          usage: zeroUsage(context.length),
          resumptionUsage: zeroUsage(resumptions.length),
          derivation: derive("value.bool", path, "Bool"),
        };
      case "int":
        if (!Number.isSafeInteger(term.value)) {
          return fail(
            "value.integer-out-of-range",
            "value.int",
            path,
            "integer literals must be safe integers",
            { actual: term.value },
          );
        }
        return {
          type: frozen({ kind: "int" }),
          usage: zeroUsage(context.length),
          resumptionUsage: zeroUsage(resumptions.length),
          derivation: derive("value.int", path, "Int"),
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
        };
      }
      case "resumption":
        return fail(
          "resumption.escape",
          "value.resumption-forbidden",
          path,
          "a resumption binder can occur only as the first operand of resume",
          { actual: term.index },
        );
    }
  }

  computation(
    term: ComputationTerm,
    context: ReadonlyArray<ValueType>,
    resumptions: ReadonlyArray<ResumptionExpectation>,
    path: string,
  ): CheckedComputation {
    if (
      typeof term !== "object" ||
      term === null ||
      !["return", "let", "force", "lambda", "apply", "operation", "handle", "resume"].includes(
        (term as { readonly kind?: unknown }).kind as string,
      )
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
            { expected: "F[q] A", actual: showComputationType(bound.type) },
          );
        }
        const body = this.computation(
          term.body,
          [bound.type.value, ...context],
          resumptions,
          `${path}.body`,
        );
        if (body.type.kind !== "return") {
          return fail(
            "type.expected-return",
            "computation.let",
            `${path}.body`,
            "let body must return a value",
            { expected: "F[q] B", actual: showComputationType(body.type) },
          );
        }
        const limit = multiplyGrades(bound.type.grade, atLeastOnce(body.type.grade));
        const actual = body.usage[0]!;
        if (!gradeLessThanOrEqual(actual, limit)) {
          return fail(
            limit === "1" && actual === "omega" ? "usage.affine-duplicated" : "usage.exceeds-grade",
            "computation.let",
            `${path}.body`,
            "bound result usage exceeds its quantitative limit",
            { expected: limit, actual },
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
            { expected: "U(effects, C)", actual: showValueType(value.type) },
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
        };
      }
      case "lambda": {
        const body = this.computation(
          term.body,
          [term.parameterType, ...context],
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
            { expected: term.grade, actual },
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
            { expected: "A ->[q] (effects, C)", actual: showComputationType(computation.type) },
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
        };
      }
      case "operation": {
        const declaration = this.#operations.get(`${term.label}\u0000${term.operation}`);
        if (declaration === undefined) {
          return fail(
            "signature.operation-unknown",
            "computation.operation",
            path,
            "operation is not present in the declared signature",
            { actual: { label: term.label, operation: term.operation } },
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
            },
          );
        }
        const type: ComputationType = frozen({
          kind: "return",
          grade: term.grade,
          value: declaration.resultType,
        });
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
            { expected: { contextLength: resumptions.length }, actual: term.resumption },
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
        };
      }
    }
  }

  handler(
    term: Extract<ComputationTerm, { readonly kind: "handle" }>,
    context: ReadonlyArray<ValueType>,
    resumptions: ReadonlyArray<ResumptionExpectation>,
    path: string,
  ): CheckedComputation {
    const handled = this.computation(term.computation, context, resumptions, `${path}.computation`);
    if (handled.type.kind !== "return") {
      return fail(
        "type.expected-return",
        "handler.input",
        `${path}.computation`,
        "handler input must return a value",
        { expected: "F[q] A", actual: showComputationType(handled.type) },
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
        { actual: term.label },
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
        { expected: expectedOperations, actual: actualOperations },
      );
    }
    const returned = this.computation(
      term.returnClause.body,
      [handled.type.value, ...context],
      resumptions,
      `${path}.returnClause.body`,
    );
    if (returned.type.kind !== "return") {
      return fail(
        "type.expected-return",
        "handler.return",
        `${path}.returnClause.body`,
        "handler return clause must return a value",
        { expected: "F[q] B", actual: showComputationType(returned.type) },
      );
    }
    if (returned.type.grade !== handled.type.grade) {
      return fail(
        "type.handler-grade-mismatch",
        "handler.return",
        `${path}.returnClause.body`,
        "handler return grade must equal the handled computation grade",
        { expected: handled.type.grade, actual: returned.type.grade },
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
        { expected: handled.type.grade, actual: returnBinderUse },
      );
    }

    const residual = removeEffectLabel(handled.effects, term.label);
    let assumedEffects = unionEffectRows(residual, returned.effects);
    let clauses: ReadonlyArray<CheckedComputation> = [];
    for (let iteration = 0; iteration <= this.#signature.operations.length; iteration += 1) {
      clauses = term.operationClauses.map((clause, index) => {
        const declaration = this.#operations.get(`${term.label}\u0000${clause.operation}`)!;
        const checked = this.computation(
          clause.body,
          [declaration.argumentType, ...context],
          [
            {
              input: declaration.resultType,
              output: returned.type,
              effects: assumedEffects,
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
            { expected: "1", actual: resumptionUse },
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

    if (term.claimedEffects !== undefined && !effectRowIsSubset(residual, term.claimedEffects)) {
      return fail(
        "effect.foreign-tunneling",
        "handler.output-row",
        `${path}.claimedEffects`,
        "handler output row cannot hide a foreign residual label",
        { expected: residual, actual: term.claimedEffects },
      );
    }
    if (
      term.claimedEffects !== undefined &&
      !effectRowsEqual(term.claimedEffects, assumedEffects)
    ) {
      return fail(
        "effect.row-mismatch",
        "handler.output-row",
        `${path}.claimedEffects`,
        "claimed handler output row does not equal the inferred row",
        { expected: assumedEffects, actual: term.claimedEffects },
      );
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
    const key = `${declaration.label}\u0000${declaration.operation}`;
    if (seen.has(key)) {
      return diagnostic(
        "signature.duplicate-operation",
        "signature",
        `$.signature.operations[${index}]`,
        "operation signature contains a duplicate label and operation pair",
        { actual: { label: declaration.label, operation: declaration.operation } },
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
      return frozen({ status: "rejected", diagnostics: frozen([invalidSignature]) });
    }
    const term = cloneComputationTerm(termInput);
    const checked = new AlgorithmicChecker(signature).computation(term, [], [], "$");
    const program = new CheckedProgramImpl(checked.type, checked.effects, signature, term);
    return frozen({
      status: "accepted",
      type: checked.type,
      effects: checked.effects,
      usage: checked.usage,
      derivation: checked.derivation,
      program,
    });
  } catch (cause) {
    if (cause instanceof CheckFailure) {
      return frozen({ status: "rejected", diagnostics: frozen([cause.diagnostic]) });
    }
    return frozen({
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
