import { Exit, Schema } from "effect";
import { canonicalJson } from "../tracer/canonical.ts";
import type { JsonObject, JsonValue } from "../tracer/json.ts";
import {
  isCheckResult,
  type CheckResult,
  type Derivation,
  type KernelDiagnostic,
} from "./checker.ts";
import {
  isEvaluationResult,
  isMachineSnapshot,
  isRuntimeResult,
  isRuntimeValue,
  type EvaluationResult,
  type MachineSnapshot,
  type MachineTraceEntry,
  type RuntimeValue,
} from "./machine.ts";
import type { ComputationType, ValueType } from "./ast.ts";

const GradeSchema = Schema.Literals(["0", "1", "omega"]);
const EffectRowSchema = Schema.Array(Schema.String);

export const ValueTypeSchema: Schema.Codec<ValueType> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({ kind: Schema.Literal("unit") }),
    Schema.Struct({ kind: Schema.Literal("bool") }),
    Schema.Struct({ kind: Schema.Literal("int") }),
    Schema.Struct({
      kind: Schema.Literal("pair"),
      first: ValueTypeSchema,
      second: ValueTypeSchema,
    }),
    Schema.Struct({
      kind: Schema.Literal("thunk"),
      effects: EffectRowSchema,
      computation: ComputationTypeSchema,
    }),
  ]),
);

export const ComputationTypeSchema: Schema.Codec<ComputationType> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("return"),
      grade: GradeSchema,
      value: ValueTypeSchema,
    }),
    Schema.Struct({
      kind: Schema.Literal("function"),
      parameter: ValueTypeSchema,
      grade: GradeSchema,
      effects: EffectRowSchema,
      result: ComputationTypeSchema,
    }),
  ]),
);

const isDiagnosticFact = (input: unknown): boolean => {
  const seen = new WeakSet<object>();
  let nodes = 0;
  const visit = (value: unknown, depth: number): boolean => {
    nodes += 1;
    if (nodes > 4_096 || depth > 64) return false;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      return true;
    }
    if (typeof value !== "object") return false;
    if (isRuntimeResult(value)) return true;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.every((entry) => visit(entry, depth + 1));
    if (Object.getPrototypeOf(value) !== Object.prototype) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return (
      Object.getOwnPropertySymbols(value).length === 0 &&
      Object.values(descriptors).every(
        (descriptor) =>
          "value" in descriptor &&
          descriptor.enumerable === true &&
          visit(descriptor.value, depth + 1),
      )
    );
  };
  try {
    return visit(input, 0);
  } catch {
    return false;
  }
};

const DiagnosticFactSchema = Schema.declare<unknown>(
  (input): input is unknown => isDiagnosticFact(input),
  { identifier: "KernelDiagnosticFact" },
);

export const KernelDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  rule: Schema.String,
  path: Schema.String,
  message: Schema.String,
  expected: Schema.optionalKey(DiagnosticFactSchema),
  actual: Schema.optionalKey(DiagnosticFactSchema),
});

export const DecodeDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  path: Schema.String,
  message: Schema.String,
});

export const DerivationSchema: Schema.Codec<Derivation> = Schema.suspend(() =>
  Schema.Struct({
    rule: Schema.String,
    path: Schema.String,
    conclusion: Schema.String,
    premises: Schema.Array(DerivationSchema),
  }),
);

const NormalizedCheckResultShapeSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("accepted"),
    type: ComputationTypeSchema,
    effects: EffectRowSchema,
    usage: Schema.Array(GradeSchema),
    derivation: DerivationSchema,
  }),
  Schema.Struct({
    status: Schema.Literal("rejected"),
    diagnostics: Schema.Array(KernelDiagnosticSchema),
  }),
]);

export const CheckResultSchema = Schema.declare<CheckResult>(isCheckResult, {
  identifier: "CustodiedCoherentCheckResult",
});

export const RuntimeValueSchema = Schema.declare<RuntimeValue>(isRuntimeValue, {
  identifier: "RuntimeValue",
});

export const MachineTraceEntrySchema: Schema.Codec<MachineTraceEntry> = Schema.Struct({
  step: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  rule: Schema.String,
  path: Schema.String,
  operation: Schema.optionalKey(
    Schema.Struct({
      label: Schema.String,
      name: Schema.String,
    }),
  ),
  resumption: Schema.optionalKey(Schema.String),
});

export const OperationRequestSchema = Schema.Struct({
  label: Schema.String,
  operation: Schema.String,
  argument: RuntimeValueSchema,
  resultType: ValueTypeSchema,
});

export const MachineSnapshotSchema = Schema.declare<MachineSnapshot>(isMachineSnapshot, {
  identifier: "ExactMachineSnapshot",
});

export const EvaluationResultSchema = Schema.declare<EvaluationResult>(isEvaluationResult, {
  identifier: "CustodiedCoherentEvaluationResult",
});

type NormalizedRuntimeValue =
  | { readonly kind: "unit" | "thunk" }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "int"; readonly value: number }
  | {
      readonly kind: "pair";
      readonly first: NormalizedRuntimeValue;
      readonly second: NormalizedRuntimeValue;
    };

const NormalizedRuntimeValueShapeSchema: Schema.Codec<NormalizedRuntimeValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({ kind: Schema.Literals(["unit", "thunk"]) }),
    Schema.Struct({ kind: Schema.Literal("bool"), value: Schema.Boolean }),
    Schema.Struct({
      kind: Schema.Literal("int"),
      value: Schema.Finite.pipe(Schema.check(Schema.isInt())),
    }),
    Schema.Struct({
      kind: Schema.Literal("pair"),
      first: NormalizedRuntimeValueShapeSchema,
      second: NormalizedRuntimeValueShapeSchema,
    }),
  ]),
);

const NormalizedRuntimeResultShapeSchema = Schema.Union([
  NormalizedRuntimeValueShapeSchema,
  Schema.Struct({ kind: Schema.Literal("function") }),
]);

const NormalizedMachineSnapshotShapeSchema = Schema.Struct({
  format: Schema.Literal("kernel-machine-v1"),
  state: Schema.String,
});

const NormalizedEvaluationResultShapeSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("returned"),
    value: NormalizedRuntimeResultShapeSchema,
    trace: Schema.Array(MachineTraceEntrySchema),
  }),
  Schema.Struct({
    status: Schema.Literal("suspended"),
    request: Schema.Struct({
      label: Schema.String,
      operation: Schema.String,
      argument: NormalizedRuntimeValueShapeSchema,
      resultType: ValueTypeSchema,
    }),
    resumption: Schema.String,
    trace: Schema.Array(MachineTraceEntrySchema),
  }),
  Schema.Struct({
    status: Schema.Literal("exhausted"),
    reason: Schema.Literals(["fuel", "trace"]),
    machineSnapshot: NormalizedMachineSnapshotShapeSchema,
    trace: Schema.Array(MachineTraceEntrySchema),
  }),
  Schema.Struct({
    status: Schema.Literal("runtime-rejected"),
    diagnostic: KernelDiagnosticSchema,
    trace: Schema.Array(MachineTraceEntrySchema),
  }),
]);

const isExactNormalizedCheckResult = (input: unknown): input is JsonObject =>
  Exit.isSuccess(
    Schema.decodeUnknownExit(NormalizedCheckResultShapeSchema, {
      onExcessProperty: "error",
    })(input),
  );

const isExactNormalizedEvaluationResult = (input: unknown): input is JsonObject =>
  Exit.isSuccess(
    Schema.decodeUnknownExit(NormalizedEvaluationResultShapeSchema, {
      onExcessProperty: "error",
    })(input),
  );

export const NormalizedCheckResultSchema = Schema.declare<JsonObject>(
  isExactNormalizedCheckResult,
  { identifier: "ExactNormalizedCheckResult" },
);

export const NormalizedEvaluationResultSchema = Schema.declare<JsonObject>(
  isExactNormalizedEvaluationResult,
  { identifier: "ExactNormalizedEvaluationResult" },
);

const normalizeValueType = (type: ValueType): JsonObject => {
  switch (type.kind) {
    case "unit":
    case "bool":
    case "int":
      return { kind: type.kind };
    case "pair":
      return {
        kind: "pair",
        first: normalizeValueType(type.first),
        second: normalizeValueType(type.second),
      };
    case "thunk":
      return {
        kind: "thunk",
        effects: type.effects,
        computation: normalizeComputationType(type.computation),
      };
  }
};

const normalizeComputationType = (type: ComputationType): JsonObject => {
  switch (type.kind) {
    case "return":
      return {
        kind: "return",
        grade: type.grade,
        value: normalizeValueType(type.value),
      };
    case "function":
      return {
        kind: "function",
        parameter: normalizeValueType(type.parameter),
        grade: type.grade,
        effects: type.effects,
        result: normalizeComputationType(type.result),
      };
  }
};

const normalizeDiagnostic = (diagnostic: KernelDiagnostic): JsonObject => ({
  code: diagnostic.code,
  rule: diagnostic.rule,
  path: diagnostic.path,
  message: diagnostic.message,
  ...(diagnostic.expected === undefined ? {} : { expected: diagnostic.expected as JsonValue }),
  ...(diagnostic.actual === undefined ? {} : { actual: diagnostic.actual as JsonValue }),
});

const normalizeDerivation = (derivation: Derivation): JsonObject => ({
  rule: derivation.rule,
  path: derivation.path,
  conclusion: derivation.conclusion,
  premises: derivation.premises.map(normalizeDerivation),
});

const normalizeRuntimeValue = (value: RuntimeValue | { readonly kind: "function" }): JsonObject => {
  switch (value.kind) {
    case "unit":
    case "thunk":
    case "function":
      return { kind: value.kind };
    case "bool":
    case "int":
      return { kind: value.kind, value: value.value };
    case "pair":
      return {
        kind: "pair",
        first: normalizeRuntimeValue(value.first),
        second: normalizeRuntimeValue(value.second),
      };
  }
};

const normalizeTrace = (trace: ReadonlyArray<MachineTraceEntry>): ReadonlyArray<JsonObject> =>
  trace.map((entry) => ({
    step: entry.step,
    rule: entry.rule,
    path: entry.path,
    ...(entry.operation === undefined ? {} : { operation: entry.operation }),
    ...(entry.resumption === undefined ? {} : { resumption: entry.resumption }),
  }));

export const normalizeCheckResult = (result: CheckResult): JsonObject =>
  result.status === "accepted"
    ? {
        status: "accepted",
        type: normalizeComputationType(result.type),
        effects: result.effects,
        usage: result.usage,
        derivation: normalizeDerivation(result.derivation),
      }
    : {
        status: "rejected",
        diagnostics: result.diagnostics.map(normalizeDiagnostic),
      };

export const normalizeEvaluationResult = (result: EvaluationResult): JsonObject => {
  switch (result.status) {
    case "returned":
      return {
        status: "returned",
        value: normalizeRuntimeValue(result.value),
        trace: normalizeTrace(result.trace),
      };
    case "suspended":
      return {
        status: "suspended",
        request: {
          label: result.request.label,
          operation: result.request.operation,
          argument: normalizeRuntimeValue(result.request.argument),
          resultType: normalizeValueType(result.request.resultType),
        },
        resumption: result.oneShotToken.id,
        trace: normalizeTrace(result.trace),
      };
    case "exhausted":
      return {
        status: "exhausted",
        reason: result.reason,
        machineSnapshot: {
          format: result.machineSnapshot.format,
          state: result.machineSnapshot.state,
        },
        trace: normalizeTrace(result.trace),
      };
    case "runtime-rejected":
      return {
        status: "runtime-rejected",
        diagnostic: normalizeDiagnostic(result.diagnostic),
        trace: normalizeTrace(result.trace),
      };
  }
};

export const canonicalCheckReport = (result: CheckResult): string =>
  canonicalJson(normalizeCheckResult(result));

export const canonicalEvaluationReport = (result: EvaluationResult): string =>
  canonicalJson(normalizeEvaluationResult(result));
