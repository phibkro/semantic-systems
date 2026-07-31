import type { CanonicalJsonValue } from "../normalized-core/canonical.ts";
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

const narrowEvaluationBounds = (bounds: EvaluationBounds): EvaluationBounds =>
  freeze({
    fuel:
      Number.isSafeInteger(bounds.fuel) && bounds.fuel >= 0
        ? Math.min(bounds.fuel, defaultEvaluationBounds.fuel)
        : 0,
    maximumTraceEntries:
      Number.isSafeInteger(bounds.maximumTraceEntries) && bounds.maximumTraceEntries > 0
        ? Math.min(bounds.maximumTraceEntries, defaultEvaluationBounds.maximumTraceEntries)
        : 1,
  });

const narrowPositiveBound = (candidate: number, maximum: number): number =>
  Number.isSafeInteger(candidate) && candidate > 0 ? Math.min(candidate, maximum) : 1;

const narrowJsonBounds = (bounds: KernelJsonRawBounds): KernelJsonRawBounds =>
  freeze({
    maximumBytes: narrowPositiveBound(bounds.maximumBytes, defaultKernelJsonRawBounds.maximumBytes),
    maximumDepth: narrowPositiveBound(bounds.maximumDepth, defaultKernelJsonRawBounds.maximumDepth),
    maximumNodes: narrowPositiveBound(bounds.maximumNodes, defaultKernelJsonRawBounds.maximumNodes),
    maximumStringBytes: narrowPositiveBound(
      bounds.maximumStringBytes,
      defaultKernelJsonRawBounds.maximumStringBytes,
    ),
    maximumCollectionLength: narrowPositiveBound(
      bounds.maximumCollectionLength,
      defaultKernelJsonRawBounds.maximumCollectionLength,
    ),
    maximumOperations: narrowPositiveBound(
      bounds.maximumOperations,
      defaultKernelJsonRawBounds.maximumOperations,
    ),
    maximumOperationClauses: narrowPositiveBound(
      bounds.maximumOperationClauses,
      defaultKernelJsonRawBounds.maximumOperationClauses,
    ),
    maximumEffectLabels: narrowPositiveBound(
      bounds.maximumEffectLabels,
      defaultKernelJsonRawBounds.maximumEffectLabels,
    ),
  });

const observableRuntimeResult = (
  value: Extract<EvaluationResult, { readonly status: "returned" }>["value"],
): ObservableRuntimeResult =>
  value.kind === "function" ? { kind: "function" } : observableRuntimeValue(value);

interface PortableInspection {
  readonly active: WeakSet<object>;
  nodes: number;
}

const portableFact = (
  input: unknown,
  inspection: PortableInspection = { active: new WeakSet(), nodes: 0 },
): CanonicalJsonValue | undefined => {
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "boolean" ||
    (typeof input === "number" && Number.isSafeInteger(input))
  ) {
    return input as CanonicalJsonValue;
  }
  if (typeof input !== "object" || inspection.active.has(input) || inspection.nodes >= 10_000) {
    return undefined;
  }
  inspection.nodes += 1;
  inspection.active.add(input);
  try {
    if (Array.isArray(input)) {
      const result: Array<CanonicalJsonValue> = [];
      for (const item of input) {
        const projected = portableFact(item, inspection);
        if (projected === undefined) return undefined;
        result.push(projected);
      }
      return result;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Object.getOwnPropertySymbols(input).length !== 0) return undefined;
    const result: Record<string, CanonicalJsonValue> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor)) return undefined;
      const projected = portableFact(descriptor.value, inspection);
      if (projected === undefined) return undefined;
      result[key] = projected;
    }
    return result;
  } catch {
    return undefined;
  } finally {
    inspection.active.delete(input);
  }
};

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
      const expected = portableFact(result.diagnostic.expected);
      const actual = portableFact(result.diagnostic.actual);
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
  const decoded = decodeKernelDocumentBytes(input, narrowJsonBounds(bounds.json));
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
  return projectEvaluation(evaluate(checked.program, narrowEvaluationBounds(bounds.evaluation)));
};
