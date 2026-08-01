/** Shared strict source-byte admission for surface process commands. */
import { Effect, Match } from "effect";
import {
  compileSurfaceDocument,
  defaultSurfaceLanguageBounds,
  type SurfaceCompilation,
  type SurfaceLanguageError,
} from "../surface-language/index.ts";
import type { SurfaceSourceDiagnostic } from "./schema.ts";

export type SurfaceSourceCompilation =
  | { readonly status: "compiled"; readonly compilation: SurfaceCompilation }
  | { readonly status: "rejected"; readonly diagnostic: SurfaceSourceDiagnostic };

const decoder = new TextDecoder("utf-8", { fatal: true });

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

const decodeSource = (bytes: Uint8Array): SurfaceSourceCompilation | string => {
  if (bytes.byteLength > defaultSurfaceLanguageBounds.maximumSourceBytes) {
    return {
      status: "rejected",
      diagnostic: {
        phase: "lex",
        code: "surface.lex.source-too-large",
        message: `source exceeds the ${defaultSurfaceLanguageBounds.maximumSourceBytes} byte limit`,
        span: { start: 0, end: 0 },
      },
    };
  }
  try {
    return decoder.decode(bytes);
  } catch {
    return {
      status: "rejected",
      diagnostic: {
        phase: "input",
        code: "surface.input.invalid-utf8",
        message: "surface source must be valid UTF-8",
        span: { start: 0, end: 0 },
      },
    };
  }
};

export const compileSurfaceSourceBytes = (
  bytes: Uint8Array,
): Effect.Effect<SurfaceSourceCompilation, never> => {
  const decoded = decodeSource(bytes);
  if (typeof decoded !== "string") return Effect.succeed(decoded);
  return Effect.match(compileSurfaceDocument(decoded), {
    onFailure: (error) => ({ status: "rejected", diagnostic: compilerDiagnostic(error) }) as const,
    onSuccess: (compilation) => ({ status: "compiled", compilation }) as const,
  });
};
