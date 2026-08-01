import { Exit, Schema } from "effect";
import type { CanonicalJsonValue } from "../normalized-core/canonical.ts";
import { canonicalBytes } from "../normalized-core/canonical.ts";
import {
  isKernelRunObservation,
  KernelRunObservationSchema,
  toPortableFact,
  type KernelRunObservation,
} from "../kernel-interpreter/index.ts";

export interface SurfaceSourceDiagnostic {
  readonly phase: "input" | "lex" | "parse" | "elaboration" | "kernel-boundary";
  readonly code: string;
  readonly message: string;
  readonly span: { readonly start: number; readonly end: number };
  readonly kernel_diagnostics?: ReadonlyArray<{
    readonly code: string;
    readonly path: string;
    readonly message: string;
  }>;
}

export type SurfaceRunResult =
  | { readonly tag: "source-rejected"; readonly diagnostic: SurfaceSourceDiagnostic }
  | { readonly tag: "kernel-observed"; readonly kernel_run: KernelRunObservation };

export interface SurfaceRunObservation {
  readonly format: "semantic.surface-run";
  readonly version: 1;
  readonly surface: "semantic.surface-language/0026/v1";
  readonly kernel: "semantic.kernel-calculus/0018/v1";
  readonly observation: SurfaceRunResult;
}

const OffsetSchema = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);
const SourceSpanSchema = Schema.Struct({ start: OffsetSchema, end: OffsetSchema });
const KernelDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  path: Schema.String,
  message: Schema.String,
});

export const SurfaceSourceDiagnosticSchema = Schema.Struct({
  phase: Schema.Literals(["input", "lex", "parse", "elaboration", "kernel-boundary"]),
  code: Schema.String,
  message: Schema.String,
  span: SourceSpanSchema,
  kernel_diagnostics: Schema.optionalKey(Schema.Array(KernelDiagnosticSchema)),
});

export const SurfaceRunResultSchema = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("source-rejected"),
    diagnostic: SurfaceSourceDiagnosticSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("kernel-observed"),
    kernel_run: KernelRunObservationSchema,
  }),
]);

const SurfaceRunObservationShapeSchema = Schema.Struct({
  format: Schema.Literal("semantic.surface-run"),
  version: Schema.Literal(1),
  surface: Schema.Literal("semantic.surface-language/0026/v1"),
  kernel: Schema.Literal("semantic.kernel-calculus/0018/v1"),
  observation: SurfaceRunResultSchema,
});

export const isSurfaceRunObservation = (input: unknown): input is SurfaceRunObservation => {
  if (
    Exit.isFailure(
      Schema.decodeUnknownExit(SurfaceRunObservationShapeSchema, {
        onExcessProperty: "error",
      })(input),
    )
  ) {
    return false;
  }
  const candidate = input as SurfaceRunObservation;
  if (
    candidate.observation.tag === "kernel-observed" &&
    !isKernelRunObservation(candidate.observation.kernel_run)
  ) {
    return false;
  }
  try {
    canonicalBytes(input as CanonicalJsonValue);
    return true;
  } catch {
    return false;
  }
};

export const SurfaceRunObservationSchema = Schema.declare<SurfaceRunObservation>(
  isSurfaceRunObservation,
  { identifier: "SurfaceRunObservation" },
);

export const encodeCanonicalSurfaceRunObservation = (
  observation: SurfaceRunObservation,
): Uint8Array => {
  const snapshot = toPortableFact(observation);
  if (snapshot === undefined || !isSurfaceRunObservation(snapshot)) {
    throw new TypeError("expected a strict semantic.surface-run observation");
  }
  return canonicalBytes(snapshot as CanonicalJsonValue);
};
