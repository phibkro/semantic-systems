import {
  defaultEvaluationBounds,
  evaluate,
  type ComputationType,
  type EvaluationBounds,
  type EvaluationResult,
  type RuntimeValue,
  type ValueType,
} from "../kernel-calculus/index.ts";
import { defaultKernelJsonRawBounds, type KernelJsonRawBounds } from "../kernel-json/index.ts";
import {
  kernelRunEnvelope,
  narrowBoundedInteger,
  prepareKernelJsonBytes,
  readBoundField,
} from "../kernel-execution/prepare.ts";
import { Effect } from "effect";
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

const envelope = kernelRunEnvelope;

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
const narrowEvaluationBounds = (input: unknown): EvaluationBounds =>
  freeze({
    fuel: narrowBoundedInteger(readBoundField(input, "fuel"), defaultEvaluationBounds.fuel, 0),
    maximumTraceEntries: narrowBoundedInteger(
      readBoundField(input, "maximumTraceEntries"),
      defaultEvaluationBounds.maximumTraceEntries,
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
  const jsonBounds = readBoundField(bounds, "json");
  const evaluationBounds = narrowEvaluationBounds(readBoundField(bounds, "evaluation"));
  return Effect.runSync(
    Effect.match(prepareKernelJsonBytes(input, jsonBounds), {
      onFailure: (failure) => failure.observation,
      onSuccess: (checked) => projectEvaluation(evaluate(checked.program, evaluationBounds)),
    }),
  );
};
