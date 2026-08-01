/** Stateless process adapter for readable Semantic source. */
import { Data, Effect, Match } from "effect";
import {
  interpretKernelJsonBytes,
  type KernelRunObservation,
} from "../kernel-interpreter/index.ts";
import { encodeCanonicalKernelDocument } from "../kernel-json/index.ts";
import { driveSurfaceCompilation, surfaceEffectRunExitCode } from "./drive.ts";
import {
  encodeCanonicalSurfaceEffectRunObservation,
  makeSurfaceEffectRunObservation,
} from "./effect-schema.ts";
import {
  encodeCanonicalSurfaceRunObservation,
  type SurfaceRunObservation,
  type SurfaceSourceDiagnostic,
} from "./schema.ts";
import { compileSurfaceSourceBytes } from "./source.ts";

export class SurfaceCliHostError extends Data.TaggedError("SurfaceCliHostError")<{
  readonly operation: "read-input" | "write-stdout" | "write-stderr";
}> {}

export interface SurfaceCliHost {
  readonly readInput: (source: string) => Effect.Effect<Uint8Array, SurfaceCliHostError>;
  readonly writeStdout: (bytes: Uint8Array) => Effect.Effect<void, SurfaceCliHostError>;
  readonly writeStderr: (text: string) => Effect.Effect<void, SurfaceCliHostError>;
}

const runUsage = "usage: semantic run FILE|-\n";
const driveUsage = "usage: semantic drive SOURCE_FILE|- OBSERVATIONS_FILE|-\n";
const usage = `${runUsage.trimEnd()}\n       semantic drive SOURCE_FILE|- OBSERVATIONS_FILE|-\n`;

const envelope = (observation: SurfaceRunObservation["observation"]): SurfaceRunObservation =>
  Object.freeze({
    format: "semantic.surface-run",
    version: 1,
    surface: "semantic.surface-language/0026/v1",
    kernel: "semantic.kernel-calculus/0018/v1",
    observation,
  });

const sourceRejected = (diagnostic: SurfaceSourceDiagnostic): SurfaceRunObservation =>
  envelope({ tag: "source-rejected", diagnostic });

export const observeSurfaceSourceBytes = (
  bytes: Uint8Array,
): Effect.Effect<SurfaceRunObservation, never> =>
  Effect.map(compileSurfaceSourceBytes(bytes), (source) =>
    source.status === "rejected"
      ? sourceRejected(source.diagnostic)
      : envelope({
          tag: "kernel-observed",
          kernel_run: interpretKernelJsonBytes(
            encodeCanonicalKernelDocument(source.compilation.kernel),
          ),
        }),
  );

const kernelExitCode = (observation: KernelRunObservation): 0 | 1 =>
  Match.value(observation.observation).pipe(
    Match.discriminatorsExhaustive("tag")({
      returned: () => 0 as const,
      suspended: () => 0 as const,
      "representation-rejected": () => 1 as const,
      "check-rejected": () => 1 as const,
      "runtime-rejected": () => 1 as const,
      inconclusive: () => 1 as const,
    }),
  );

export const surfaceRunExitCode = (observation: SurfaceRunObservation): 0 | 1 =>
  observation.observation.tag === "source-rejected"
    ? 1
    : kernelExitCode(observation.observation.kernel_run);

const reportHostFailure = (host: SurfaceCliHost, text: string): Effect.Effect<2, never> =>
  host.writeStderr(text).pipe(Effect.ignore, Effect.as(2 as const));

export const runSurfaceCli = (
  arguments_: ReadonlyArray<string>,
  host: SurfaceCliHost,
): Effect.Effect<number, never> => {
  const program: Effect.Effect<number, SurfaceCliHostError> = (() => {
    if (arguments_[0] === "run") {
      if (arguments_.length !== 2) return reportHostFailure(host, runUsage);
      const source = arguments_[1]!;
      return Effect.gen(function* () {
        const input = yield* host.readInput(source);
        const observation = yield* observeSurfaceSourceBytes(input);
        yield* host.writeStdout(encodeCanonicalSurfaceRunObservation(observation));
        return surfaceRunExitCode(observation);
      });
    }
    if (arguments_[0] === "drive") {
      if (arguments_.length !== 3 || (arguments_[1] === "-" && arguments_[2] === "-")) {
        return reportHostFailure(host, driveUsage);
      }
      const sourcePath = arguments_[1]!;
      const scriptPath = arguments_[2]!;
      return Effect.gen(function* () {
        const sourceBytes = yield* host.readInput(sourcePath);
        const source = yield* compileSurfaceSourceBytes(sourceBytes);
        const observation =
          source.status === "rejected"
            ? makeSurfaceEffectRunObservation({
                tag: "source-rejected",
                diagnostic: source.diagnostic,
              })
            : driveSurfaceCompilation(source.compilation, yield* host.readInput(scriptPath));
        yield* host.writeStdout(encodeCanonicalSurfaceEffectRunObservation(observation));
        return surfaceEffectRunExitCode(observation);
      });
    }
    return reportHostFailure(host, usage);
  })();

  return program.pipe(
    Effect.catch((error) =>
      reportHostFailure(
        host,
        error.operation === "read-input"
          ? "semantic: unable to read input\n"
          : "semantic: unable to write output\n",
      ),
    ),
  );
};
