import { Schema } from "effect";
import { canonicalJson } from "../tracer/canonical.ts";
import type { JsonObject, JsonValue } from "../tracer/json.ts";
import type { CheckResult, Derivation, KernelDiagnostic } from "./checker.ts";
import type { EvaluationResult, MachineTraceEntry, RuntimeValue } from "./machine.ts";
import type { ComputationType, ValueType } from "./ast.ts";

export const KernelDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  rule: Schema.String,
  path: Schema.String,
  message: Schema.String,
  expected: Schema.optionalKey(Schema.Unknown),
  actual: Schema.optionalKey(Schema.Unknown),
});

export const DecodeDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  path: Schema.String,
  message: Schema.String,
});

export const CheckResultSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("accepted"),
    type: Schema.Unknown,
    effects: Schema.Array(Schema.String),
    usage: Schema.Array(Schema.Literals(["0", "1", "omega"])),
    derivation: Schema.Unknown,
    program: Schema.Unknown,
  }),
  Schema.Struct({
    status: Schema.Literal("rejected"),
    diagnostics: Schema.Array(KernelDiagnosticSchema),
  }),
]);

export const EvaluationResultSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("returned"),
    value: Schema.Unknown,
    trace: Schema.Array(Schema.Unknown),
  }),
  Schema.Struct({
    status: Schema.Literal("suspended"),
    request: Schema.Unknown,
    oneShotToken: Schema.Unknown,
    trace: Schema.Array(Schema.Unknown),
  }),
  Schema.Struct({
    status: Schema.Literal("exhausted"),
    reason: Schema.Literals(["fuel", "trace"]),
    machineSnapshot: Schema.Unknown,
    trace: Schema.Array(Schema.Unknown),
  }),
  Schema.Struct({
    status: Schema.Literal("runtime-rejected"),
    diagnostic: KernelDiagnosticSchema,
    trace: Schema.Array(Schema.Unknown),
  }),
]);

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
          control: result.machineSnapshot.control,
          path: result.machineSnapshot.path,
          frames: result.machineSnapshot.frames,
          nextResumptionIdentity: result.machineSnapshot.nextResumptionIdentity,
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
