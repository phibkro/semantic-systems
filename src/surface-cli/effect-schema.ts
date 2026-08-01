import { Exit, Schema } from "effect";
import type { CanonicalJsonValue } from "../normalized-core/canonical.ts";
import { canonicalBytes } from "../normalized-core/canonical.ts";
import {
  isKernelEffectRunObservation,
  KernelEffectRunObservationSchema,
  toPortableFact,
  type KernelEffectRunObservation,
} from "../kernel-interpreter/index.ts";
import { SurfaceSourceDiagnosticSchema, type SurfaceSourceDiagnostic } from "./schema.ts";

export type SurfaceEffectRunResult =
  | { readonly tag: "source-rejected"; readonly diagnostic: SurfaceSourceDiagnostic }
  | { readonly tag: "effect-observed"; readonly effect_run: KernelEffectRunObservation };

export interface SurfaceEffectRunObservation {
  readonly format: "semantic.surface-effect-run";
  readonly version: 1;
  readonly surface: "semantic.surface-language/0026/v1";
  readonly kernel: "semantic.kernel-calculus/0018/v1";
  readonly observation: SurfaceEffectRunResult;
}

export const SurfaceEffectRunResultSchema = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("source-rejected"),
    diagnostic: SurfaceSourceDiagnosticSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("effect-observed"),
    effect_run: KernelEffectRunObservationSchema,
  }),
]);

const SurfaceEffectRunObservationShapeSchema = Schema.Struct({
  format: Schema.Literal("semantic.surface-effect-run"),
  version: Schema.Literal(1),
  surface: Schema.Literal("semantic.surface-language/0026/v1"),
  kernel: Schema.Literal("semantic.kernel-calculus/0018/v1"),
  observation: SurfaceEffectRunResultSchema,
});

export const isSurfaceEffectRunObservation = (
  input: unknown,
): input is SurfaceEffectRunObservation => {
  if (
    Exit.isFailure(
      Schema.decodeUnknownExit(SurfaceEffectRunObservationShapeSchema, {
        onExcessProperty: "error",
      })(input),
    )
  ) {
    return false;
  }
  const candidate = input as SurfaceEffectRunObservation;
  if (
    candidate.observation.tag === "effect-observed" &&
    !isKernelEffectRunObservation(candidate.observation.effect_run)
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

export const SurfaceEffectRunObservationSchema = Schema.declare<SurfaceEffectRunObservation>(
  isSurfaceEffectRunObservation,
  { identifier: "SurfaceEffectRunObservation" },
);

const freeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

export const makeSurfaceEffectRunObservation = (
  observation: SurfaceEffectRunResult,
): SurfaceEffectRunObservation =>
  freeze({
    format: "semantic.surface-effect-run",
    version: 1,
    surface: "semantic.surface-language/0026/v1",
    kernel: "semantic.kernel-calculus/0018/v1",
    observation,
  });

export const encodeCanonicalSurfaceEffectRunObservation = (
  observation: SurfaceEffectRunObservation,
): Uint8Array => {
  const snapshot = toPortableFact(observation);
  if (snapshot === undefined || !isSurfaceEffectRunObservation(snapshot)) {
    throw new TypeError("expected a strict semantic.surface-effect-run observation");
  }
  return canonicalBytes(snapshot as CanonicalJsonValue);
};
