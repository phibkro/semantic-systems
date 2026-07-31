import {
  check,
  defaultEvaluationBounds,
  evaluate,
  type ComputationType,
  type EvaluationBounds,
  type EvaluationResult,
  type RuntimeValue,
  type ValueType,
} from "../kernel-calculus/index.ts";
import {
  checkKernelDocument,
  decodeKernelDocumentBytes,
  defaultKernelJsonRawBounds,
  projectKernelProgram,
  type KernelJsonRawBounds,
} from "../kernel-json/index.ts";
import { toPortableFact } from "./portable-fact.ts";
import type {
  KernelRunObservation,
  ObservableComputationType,
  ObservableRuntimeResult,
  ObservableRuntimeValue,
  ObservableValueType,
} from "./schema.ts";

export interface KernelInterpreterBounds {
  readonly json: KernelJsonRawBounds;
  readonly evaluation: EvaluationBounds;
}

export const defaultKernelInterpreterBounds: KernelInterpreterBounds = Object.freeze({
  json: defaultKernelJsonRawBounds,
  evaluation: defaultEvaluationBounds,
});

const freeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const envelope = (observation: KernelRunObservation["observation"]): KernelRunObservation =>
  freeze({
    format: "semantic.kernel-run",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    observation,
  });

const observableValueType = (type: ValueType): ObservableValueType => {
  switch (type.kind) {
    case "unit":
    case "bool":
    case "int":
      return { kind: type.kind };
    case "pair":
      return {
        kind: "pair",
        first: observableValueType(type.first),
        second: observableValueType(type.second),
      };
    case "thunk":
      return {
        kind: "thunk",
        effects: type.effects,
        computation: observableComputationType(type.computation),
      };
  }
};

const observableComputationType = (type: ComputationType): ObservableComputationType => {
  switch (type.kind) {
    case "return":
      return {
        kind: "return",
        grade: type.grade,
        value: observableValueType(type.value),
      };
    case "function":
      return {
        kind: "function",
        parameter: observableValueType(type.parameter),
        grade: type.grade,
        effects: type.effects,
        result: observableComputationType(type.result),
      };
  }
};

const observableRuntimeValue = (value: RuntimeValue): ObservableRuntimeValue => {
  switch (value.kind) {
    case "unit":
    case "thunk":
      return { kind: value.kind };
    case "bool":
      return { kind: "bool", value: value.value };
    case "int":
      return { kind: "int", value: value.value };
    case "pair":
      return {
        kind: "pair",
        first: observableRuntimeValue(value.first),
        second: observableRuntimeValue(value.second),
      };
  }
};

/**
 * Bound narrowing is total over any supplied `unknown` shape: a malformed,
 * missing, wrong-typed, or hostile-accessor bound never raises a host error
 * and never resolves wider than its exact version 1 default. Every field is
 * read from the caller's object exactly once, into `field(...)`'s return
 * value, and every subsequent check and use operates on that one snapshot —
 * never on a second live read of the same property — so a bound backed by a
 * getter cannot answer its validity check and its use inconsistently.
 */
const isPlainRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/**
 * The single read site for every bound field, at both the outer
 * `bounds.json`/`bounds.evaluation` level and every nested numeric field:
 * a throwing getter or a hostile `Proxy` trap (including a revoked proxy)
 * must not escape as a host error, so a throw here is treated the same as
 * a missing field and resolved to `undefined`, which every caller then
 * narrows to the exact default.
 */
const boundField = (source: unknown, key: string): unknown => {
  if (!isPlainRecord(source)) return undefined;
  try {
    return source[key];
  } catch {
    return undefined;
  }
};

const narrowedInteger = (candidate: unknown, defaultValue: number, minimum: 0 | 1): number =>
  typeof candidate === "number" &&
  Number.isSafeInteger(candidate) &&
  candidate >= minimum &&
  (minimum === 0 || candidate > 0)
    ? Math.min(candidate, defaultValue)
    : defaultValue;

const narrowEvaluationBounds = (input: unknown): EvaluationBounds =>
  freeze({
    fuel: narrowedInteger(boundField(input, "fuel"), defaultEvaluationBounds.fuel, 0),
    maximumTraceEntries: narrowedInteger(
      boundField(input, "maximumTraceEntries"),
      defaultEvaluationBounds.maximumTraceEntries,
      1,
    ),
  });

const narrowJsonBounds = (input: unknown): KernelJsonRawBounds =>
  freeze({
    maximumBytes: narrowedInteger(
      boundField(input, "maximumBytes"),
      defaultKernelJsonRawBounds.maximumBytes,
      1,
    ),
    maximumDepth: narrowedInteger(
      boundField(input, "maximumDepth"),
      defaultKernelJsonRawBounds.maximumDepth,
      1,
    ),
    maximumNodes: narrowedInteger(
      boundField(input, "maximumNodes"),
      defaultKernelJsonRawBounds.maximumNodes,
      1,
    ),
    maximumStringBytes: narrowedInteger(
      boundField(input, "maximumStringBytes"),
      defaultKernelJsonRawBounds.maximumStringBytes,
      1,
    ),
    maximumCollectionLength: narrowedInteger(
      boundField(input, "maximumCollectionLength"),
      defaultKernelJsonRawBounds.maximumCollectionLength,
      1,
    ),
    maximumOperations: narrowedInteger(
      boundField(input, "maximumOperations"),
      defaultKernelJsonRawBounds.maximumOperations,
      1,
    ),
    maximumOperationClauses: narrowedInteger(
      boundField(input, "maximumOperationClauses"),
      defaultKernelJsonRawBounds.maximumOperationClauses,
      1,
    ),
    maximumEffectLabels: narrowedInteger(
      boundField(input, "maximumEffectLabels"),
      defaultKernelJsonRawBounds.maximumEffectLabels,
      1,
    ),
  });

const observableRuntimeResult = (
  value: Extract<EvaluationResult, { readonly status: "returned" }>["value"],
): ObservableRuntimeResult =>
  value.kind === "function" ? { kind: "function" } : observableRuntimeValue(value);

const projectEvaluation = (result: EvaluationResult): KernelRunObservation => {
  switch (result.status) {
    case "returned":
      return envelope({ tag: "returned", value: observableRuntimeResult(result.value) });
    case "suspended":
      return envelope({
        tag: "suspended",
        request: {
          label: result.request.label,
          operation: result.request.operation,
          argument: observableRuntimeValue(result.request.argument),
          result_type: observableValueType(result.request.resultType),
        },
      });
    case "exhausted":
      return envelope({ tag: "inconclusive", reason: result.reason });
    case "runtime-rejected": {
      const expected = toPortableFact(result.diagnostic.expected);
      const actual = toPortableFact(result.diagnostic.actual);
      return envelope({
        tag: "runtime-rejected",
        diagnostic: {
          code: result.diagnostic.code,
          occurrence_path: result.diagnostic.path,
          message: result.diagnostic.message,
          ...(expected === undefined ? {} : { expected }),
          ...(actual === undefined ? {} : { actual }),
        },
      });
    }
  }
};

/**
 * Reference, deliberately unoptimized bytes-to-observation interpreter.
 * Representation, checking, and execution stay in their owning modules.
 */
export const interpretKernelJsonBytes = (
  input: unknown,
  bounds: KernelInterpreterBounds = defaultKernelInterpreterBounds,
): KernelRunObservation => {
  const jsonBounds = narrowJsonBounds(boundField(bounds, "json"));
  const evaluationBounds = narrowEvaluationBounds(boundField(bounds, "evaluation"));
  const decoded = decodeKernelDocumentBytes(input, jsonBounds);
  if (decoded.status === "rejected") {
    return envelope({ tag: "representation-rejected", diagnostics: decoded.diagnostics });
  }

  const checkObservation = checkKernelDocument(decoded.value);
  if (checkObservation.observation.tag === "rejected") {
    return envelope({
      tag: "check-rejected",
      check: { ...checkObservation, observation: checkObservation.observation },
    });
  }

  const projected = projectKernelProgram(decoded.value);
  if (projected.status === "rejected") {
    return envelope({
      tag: "runtime-rejected",
      diagnostic: {
        code: "interpreter.check-projection-disagreement",
        occurrence_path: "/program",
        message: "accepted check observation disagreed with the kernel projection",
      },
    });
  }
  const checked = check(projected.value.signature, projected.value.term);
  if (checked.status === "rejected") {
    return envelope({
      tag: "runtime-rejected",
      diagnostic: {
        code: "interpreter.check-custody-disagreement",
        occurrence_path: "/program",
        message: "accepted check observation disagreed with checked-program custody",
      },
    });
  }
  return projectEvaluation(evaluate(checked.program, evaluationBounds));
};
