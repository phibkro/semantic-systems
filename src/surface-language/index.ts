import { Effect, Schema } from "effect";
import type { SurfaceDocument } from "./ast.ts";
import { compileParsedSurfaceDocument, type SurfaceCompilation } from "./elaborate.ts";
import {
  SurfaceInputError,
  type SurfaceLanguageError,
  type SurfaceLexError,
  type SurfaceParseError,
} from "./errors.ts";
import { defaultSurfaceLanguageBounds, lexSurface } from "./lexer.ts";
import { parseSurfaceTokens } from "./parser.ts";

export { elaborateSurfaceDocument } from "./elaborate.ts";
export type { SurfaceCompilation } from "./elaborate.ts";
export {
  SurfaceElaborationError,
  SurfaceInputError,
  SurfaceKernelBoundaryError,
  SurfaceLexError,
  SurfaceParseError,
} from "./errors.ts";
export type { SourceSpan, SurfaceLanguageError } from "./errors.ts";
export { defaultSurfaceLanguageBounds } from "./lexer.ts";
export type { SurfaceLanguageBounds } from "./lexer.ts";
export { surfacePrattRules } from "./parser.ts";
export type { SurfaceDocument } from "./ast.ts";

export const parseSurfaceDocument = (
  input: unknown,
): Effect.Effect<SurfaceDocument, SurfaceInputError | SurfaceLexError | SurfaceParseError> =>
  Effect.gen(function* () {
    const source = yield* Schema.decodeUnknownEffect(Schema.String)(input).pipe(
      Effect.mapError(
        () =>
          new SurfaceInputError({
            phase: "input",
            code: "surface.input.expected-string",
            message: "surface source must be a string",
            span: { start: 0, end: 0 },
          }),
      ),
    );
    const tokens = yield* lexSurface(source, defaultSurfaceLanguageBounds);
    return yield* parseSurfaceTokens(tokens, defaultSurfaceLanguageBounds);
  });

export const compileSurfaceDocument = (
  input: unknown,
): Effect.Effect<SurfaceCompilation, SurfaceLanguageError> =>
  Effect.gen(function* () {
    const surface = yield* parseSurfaceDocument(input);
    return yield* compileParsedSurfaceDocument(surface);
  });
