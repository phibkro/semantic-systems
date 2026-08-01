/** Interpreter-first composition of readable source and affine observations. */
import { Effect, Match } from "effect";
import {
  interpretKernelJsonBytesWithObservationScript,
  type KernelEffectRunObservation,
} from "../kernel-interpreter/index.ts";
import { encodeCanonicalKernelDocument } from "../kernel-json/index.ts";
import type { SurfaceCompilation } from "../surface-language/index.ts";
import {
  makeSurfaceEffectRunObservation,
  type SurfaceEffectRunObservation,
} from "./effect-schema.ts";
import { decodeObservationScriptBytes } from "./observation-script-bytes.ts";
import { compileSurfaceSourceBytes } from "./source.ts";

export const driveSurfaceCompilation = (
  compilation: SurfaceCompilation,
  observationBytes: Uint8Array,
): SurfaceEffectRunObservation => {
  const script = decodeObservationScriptBytes(observationBytes);
  const effectRun =
    script.status === "rejected"
      ? script.observation
      : interpretKernelJsonBytesWithObservationScript(
          encodeCanonicalKernelDocument(compilation.kernel),
          script.value,
        );
  return makeSurfaceEffectRunObservation({ tag: "effect-observed", effect_run: effectRun });
};

export const driveSurfaceSourceBytes = (
  sourceBytes: Uint8Array,
  observationBytes: Uint8Array,
): Effect.Effect<SurfaceEffectRunObservation, never> =>
  Effect.map(compileSurfaceSourceBytes(sourceBytes), (source) =>
    source.status === "rejected"
      ? makeSurfaceEffectRunObservation({
          tag: "source-rejected",
          diagnostic: source.diagnostic,
        })
      : driveSurfaceCompilation(source.compilation, observationBytes),
  );

const executedExitCode = (
  observation: Extract<KernelEffectRunObservation["observation"], { readonly tag: "executed" }>,
): 0 | 1 =>
  Match.value(observation.result).pipe(
    Match.discriminatorsExhaustive("tag")({
      returned: () => 0 as const,
      suspended: () => 0 as const,
      "representation-rejected": () => 1 as const,
      "check-rejected": () => 1 as const,
      "runtime-rejected": () => 1 as const,
      inconclusive: () => 1 as const,
    }),
  );

export const surfaceEffectRunExitCode = (observation: SurfaceEffectRunObservation): 0 | 1 =>
  Match.value(observation.observation).pipe(
    Match.discriminatorsExhaustive("tag")({
      "source-rejected": () => 1 as const,
      "effect-observed": ({ effect_run }) =>
        Match.value(effect_run.observation).pipe(
          Match.discriminatorsExhaustive("tag")({
            "script-rejected": () => 1 as const,
            executed: executedExitCode,
          }),
        ),
    }),
  );
