/** Stateless process adapter for readable Semantic source. */
import { Data, Effect, Match } from "effect";
import {
  interpretKernelJsonBytes,
  type KernelRunObservation,
} from "../kernel-interpreter/index.ts";
import { encodeCanonicalKernelDocument } from "../kernel-json/index.ts";
import {
  compileSurfaceDocument,
  defaultSurfaceLanguageBounds,
  type SurfaceLanguageError,
} from "../surface-language/index.ts";
import {
  encodeCanonicalSurfaceRunObservation,
  type SurfaceRunObservation,
  type SurfaceSourceDiagnostic,
} from "./schema.ts";

export class SurfaceCliHostError extends Data.TaggedError("SurfaceCliHostError")<{
  readonly operation: "read-input" | "write-stdout" | "write-stderr";
}> {}

export interface SurfaceCliHost {
  readonly readInput: (source: string) => Effect.Effect<Uint8Array, SurfaceCliHostError>;
  readonly writeStdout: (bytes: Uint8Array) => Effect.Effect<void, SurfaceCliHostError>;
  readonly writeStderr: (text: string) => Effect.Effect<void, SurfaceCliHostError>;
}

const usage = "usage: semantic run FILE|-\n";
const decoder = new TextDecoder("utf-8", { fatal: true });

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

const compilerDiagnostic = (error: SurfaceLanguageError): SurfaceSourceDiagnostic => ({
  phase: error.phase,
  code: error.code,
  message: error.message,
  span: error.span,
  ...Match.value(error).pipe(
    Match.tagsExhaustive({
      SurfaceInputError: () => ({}),
      SurfaceLexError: () => ({}),
      SurfaceParseError: () => ({}),
      SurfaceElaborationError: () => ({}),
      SurfaceKernelBoundaryError: (boundary) => ({
        kernel_diagnostics: boundary.diagnostics,
      }),
    }),
  ),
});

const decodeSource = (bytes: Uint8Array): SurfaceRunObservation | string => {
  if (bytes.byteLength > defaultSurfaceLanguageBounds.maximumSourceBytes) {
    return sourceRejected({
      phase: "lex",
      code: "surface.lex.source-too-large",
      message: `source exceeds the ${defaultSurfaceLanguageBounds.maximumSourceBytes} byte limit`,
      span: { start: 0, end: 0 },
    });
  }
  try {
    return decoder.decode(bytes);
  } catch {
    return sourceRejected({
      phase: "input",
      code: "surface.input.invalid-utf8",
      message: "surface source must be valid UTF-8",
      span: { start: 0, end: 0 },
    });
  }
};

export const observeSurfaceSourceBytes = (
  bytes: Uint8Array,
): Effect.Effect<SurfaceRunObservation, never> => {
  const decoded = decodeSource(bytes);
  if (typeof decoded !== "string") return Effect.succeed(decoded);
  return Effect.match(compileSurfaceDocument(decoded), {
    onFailure: (error) => sourceRejected(compilerDiagnostic(error)),
    onSuccess: (compilation) =>
      envelope({
        tag: "kernel-observed",
        kernel_run: interpretKernelJsonBytes(encodeCanonicalKernelDocument(compilation.kernel)),
      }),
  });
};

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
  if (arguments_.length !== 2 || arguments_[0] !== "run") {
    return reportHostFailure(host, usage);
  }
  const source = arguments_[1]!;
  return Effect.gen(function* () {
    const input = yield* host.readInput(source);
    const observation = yield* observeSurfaceSourceBytes(input);
    yield* host.writeStdout(encodeCanonicalSurfaceRunObservation(observation));
    return surfaceRunExitCode(observation);
  }).pipe(
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
