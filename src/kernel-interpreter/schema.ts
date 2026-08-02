import { Exit, Schema } from "effect";
import type { CanonicalJsonValue } from "../normalized-core/canonical.ts";
import { canonicalBytes } from "../normalized-core/canonical.ts";
import {
  decodeKernelCheckObservationValue,
  type CheckRejected,
  type KernelCheckObservation,
  type KernelJsonDiagnostic,
} from "../kernel-json/index.ts";
import { toPortableFact, toPortableKernelRunObservation } from "./portable-fact.ts";

export type ObservableValueType =
  | { readonly kind: "unit" | "bool" | "int" }
  | {
      readonly kind: "pair";
      readonly first: ObservableValueType;
      readonly second: ObservableValueType;
    }
  | {
      readonly kind: "sum";
      readonly left: ObservableValueType;
      readonly right: ObservableValueType;
    }
  | {
      readonly kind: "thunk";
      readonly effects: ReadonlyArray<string>;
      readonly computation: ObservableComputationType;
    };

export type ObservableComputationType =
  | {
      readonly kind: "return";
      readonly grade: "0" | "1" | "omega";
      readonly value: ObservableValueType;
    }
  | {
      readonly kind: "function";
      readonly parameter: ObservableValueType;
      readonly grade: "0" | "1" | "omega";
      readonly effects: ReadonlyArray<string>;
      readonly result: ObservableComputationType;
    };

export type ObservableRuntimeValue =
  | { readonly kind: "unit" | "thunk" }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "int"; readonly value: number }
  | {
      readonly kind: "pair";
      readonly first: ObservableRuntimeValue;
      readonly second: ObservableRuntimeValue;
    }
  | { readonly kind: "inject-left"; readonly value: ObservableRuntimeValue }
  | { readonly kind: "inject-right"; readonly value: ObservableRuntimeValue };

export type ObservableRuntimeResult = ObservableRuntimeValue | { readonly kind: "function" };

export interface ObservableOperationRequest {
  readonly label: string;
  readonly operation: string;
  readonly argument: ObservableRuntimeValue;
  readonly result_type: ObservableValueType;
}

export interface ObservableRuntimeDiagnostic {
  readonly code: string;
  readonly occurrence_path: string;
  readonly message: string;
  readonly expected?: CanonicalJsonValue;
  readonly actual?: CanonicalJsonValue;
}

export type KernelRejectedCheckObservation = Omit<KernelCheckObservation, "observation"> & {
  readonly observation: CheckRejected;
};

export type KernelRunResult =
  | {
      readonly tag: "representation-rejected";
      readonly diagnostics: ReadonlyArray<KernelJsonDiagnostic>;
    }
  | { readonly tag: "check-rejected"; readonly check: KernelRejectedCheckObservation }
  | { readonly tag: "returned"; readonly value: ObservableRuntimeResult }
  | { readonly tag: "suspended"; readonly request: ObservableOperationRequest }
  | { readonly tag: "runtime-rejected"; readonly diagnostic: ObservableRuntimeDiagnostic }
  | { readonly tag: "inconclusive"; readonly reason: "fuel" | "trace" };

export interface KernelRunObservation {
  readonly format: "semantic.kernel-run";
  readonly version: 2;
  readonly kernel: "semantic.kernel-calculus/0018/v2";
  readonly observation: KernelRunResult;
}

const GradeSchema = Schema.Literals(["0", "1", "omega"]);
const IntegerSchema = Schema.Finite.pipe(Schema.check(Schema.isInt()));

const ObservableValueTypeSchema: Schema.Codec<ObservableValueType> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({ kind: Schema.Literals(["unit", "bool", "int"]) }),
    Schema.Struct({
      kind: Schema.Literal("pair"),
      first: ObservableValueTypeSchema,
      second: ObservableValueTypeSchema,
    }),
    Schema.Struct({
      kind: Schema.Literal("sum"),
      left: ObservableValueTypeSchema,
      right: ObservableValueTypeSchema,
    }),
    Schema.Struct({
      kind: Schema.Literal("thunk"),
      effects: Schema.Array(Schema.String),
      computation: ObservableComputationTypeSchema,
    }),
  ]),
);

const ObservableComputationTypeSchema: Schema.Codec<ObservableComputationType> = Schema.suspend(
  () =>
    Schema.Union([
      Schema.Struct({
        kind: Schema.Literal("return"),
        grade: GradeSchema,
        value: ObservableValueTypeSchema,
      }),
      Schema.Struct({
        kind: Schema.Literal("function"),
        parameter: ObservableValueTypeSchema,
        grade: GradeSchema,
        effects: Schema.Array(Schema.String),
        result: ObservableComputationTypeSchema,
      }),
    ]),
);

const ObservableRuntimeValueSchema: Schema.Codec<ObservableRuntimeValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({ kind: Schema.Literals(["unit", "thunk"]) }),
    Schema.Struct({
      kind: Schema.Literal("inject-left"),
      value: ObservableRuntimeValueSchema,
    }),
    Schema.Struct({
      kind: Schema.Literal("inject-right"),
      value: ObservableRuntimeValueSchema,
    }),
    Schema.Struct({ kind: Schema.Literal("bool"), value: Schema.Boolean }),
    Schema.Struct({ kind: Schema.Literal("int"), value: IntegerSchema }),
    Schema.Struct({
      kind: Schema.Literal("pair"),
      first: ObservableRuntimeValueSchema,
      second: ObservableRuntimeValueSchema,
    }),
  ]),
);

const KernelRejectedCheckObservationSchema = Schema.declare<KernelRejectedCheckObservation>(
  (input): input is KernelRejectedCheckObservation => {
    const decoded = decodeKernelCheckObservationValue(input);
    return decoded.status === "decoded" && decoded.value.observation.tag === "rejected";
  },
  { identifier: "KernelRejectedCheckObservation" },
);

const RepresentationDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  path: Schema.String,
  message: Schema.String,
});

// `Schema.Unknown` would accept a Date, Map, or any other host value that
// `toPortableFact` rejects; `canonicalBytes` would then render it as `{}`,
// colliding with a genuine empty-record fact. Declaring the field against
// `toPortableFact` itself keeps the public schema boundary exactly as
// strict as the construction path: a present value must be exactly what
// `toPortableFact` would produce, and `Schema.optionalKey` keeps absence
// (the key is not present) distinct from an invalid present value (the key
// is present but fails this predicate, which fails the whole struct).
const PortableDiagnosticFactSchema = Schema.declare<CanonicalJsonValue>(
  (input): input is CanonicalJsonValue => toPortableFact(input) !== undefined,
  { identifier: "PortableDiagnosticFact" },
);

const RuntimeDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  occurrence_path: Schema.String,
  message: Schema.String,
  expected: Schema.optionalKey(PortableDiagnosticFactSchema),
  actual: Schema.optionalKey(PortableDiagnosticFactSchema),
});

const KernelRunObservationShapeSchema = Schema.Struct({
  format: Schema.Literal("semantic.kernel-run"),
  version: Schema.Literal(2),
  kernel: Schema.Literal("semantic.kernel-calculus/0018/v2"),
  observation: Schema.Union([
    Schema.Struct({
      tag: Schema.Literal("representation-rejected"),
      diagnostics: Schema.Array(RepresentationDiagnosticSchema),
    }),
    Schema.Struct({
      tag: Schema.Literal("check-rejected"),
      check: KernelRejectedCheckObservationSchema,
    }),
    Schema.Struct({
      tag: Schema.Literal("returned"),
      value: Schema.Union([
        ObservableRuntimeValueSchema,
        Schema.Struct({ kind: Schema.Literal("function") }),
      ]),
    }),
    Schema.Struct({
      tag: Schema.Literal("suspended"),
      request: Schema.Struct({
        label: Schema.String,
        operation: Schema.String,
        argument: ObservableRuntimeValueSchema,
        result_type: ObservableValueTypeSchema,
      }),
    }),
    Schema.Struct({
      tag: Schema.Literal("runtime-rejected"),
      diagnostic: RuntimeDiagnosticSchema,
    }),
    Schema.Struct({
      tag: Schema.Literal("inconclusive"),
      reason: Schema.Literals(["fuel", "trace"]),
    }),
  ]),
});

export const snapshotKernelRunObservation = (input: unknown): KernelRunObservation | undefined => {
  const snapshot = toPortableKernelRunObservation(input);
  if (
    snapshot === undefined ||
    Exit.isFailure(
      Schema.decodeUnknownExit(KernelRunObservationShapeSchema, {
        onExcessProperty: "error",
      })(snapshot),
    )
  ) {
    return undefined;
  }
  try {
    canonicalBytes(snapshot);
    return snapshot as unknown as KernelRunObservation;
  } catch {
    return undefined;
  }
};

export const isKernelRunObservation = (input: unknown): input is KernelRunObservation =>
  snapshotKernelRunObservation(input) !== undefined;

export const KernelRunObservationSchema = Schema.declare<KernelRunObservation>(
  isKernelRunObservation,
  { identifier: "KernelRunObservation" },
);
