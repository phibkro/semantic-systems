/** Readable-source composition root for independent affine effect replay. */
import { Effect } from "effect";
import { runCompiledKernelJsonBytesWithObservationScript } from "../kernel-bytecode/index.ts";
import {
  decodeExternalObservationScript,
  type KernelEffectRunObservation,
} from "../kernel-execution/external-observations.ts";
import { interpretKernelJsonBytesWithObservationScript } from "../kernel-interpreter/index.ts";
import { encodeCanonicalKernelDocument } from "../kernel-json/index.ts";
import {
  compileSurfaceDocument,
  type SurfaceCompilation,
  type SurfaceLanguageError,
} from "../surface-language/index.ts";

export interface SurfaceEffectReplay {
  readonly compilation: SurfaceCompilation;
  readonly reference: KernelEffectRunObservation;
  readonly compiled: KernelEffectRunObservation;
}

/**
 * Compiles the caller's source and captures its observation script once before
 * either backend sees an input. Backend observations remain distinct evidence;
 * this boundary deliberately makes no equivalence claim.
 */
export const replaySurfaceDocumentEffects = (
  source: unknown,
  observationScript: unknown,
): Effect.Effect<SurfaceEffectReplay, SurfaceLanguageError> =>
  Effect.gen(function* () {
    const compilation = yield* compileSurfaceDocument(source);
    const kernelBytes = encodeCanonicalKernelDocument(compilation.kernel);
    const capturedScript = decodeExternalObservationScript(observationScript);

    if (capturedScript.status === "rejected") {
      return Object.freeze({
        compilation,
        reference: capturedScript.observation,
        compiled: capturedScript.observation,
      });
    }

    return Object.freeze({
      compilation,
      reference: interpretKernelJsonBytesWithObservationScript(
        kernelBytes.slice(),
        capturedScript.value,
      ),
      compiled: runCompiledKernelJsonBytesWithObservationScript(
        kernelBytes.slice(),
        capturedScript.value,
      ),
    });
  });
