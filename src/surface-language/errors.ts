import { Data } from "effect";

export interface SourceSpan {
  readonly start: number;
  readonly end: number;
}

export class SurfaceInputError extends Data.TaggedError("SurfaceInputError")<{
  readonly phase: "input";
  readonly code: "surface.input.expected-string";
  readonly message: string;
  readonly span: SourceSpan;
}> {}

export class SurfaceLexError extends Data.TaggedError("SurfaceLexError")<{
  readonly phase: "lex";
  readonly code:
    | "surface.lex.source-too-large"
    | "surface.lex.too-many-tokens"
    | "surface.lex.identifier-too-large"
    | "surface.lex.invalid-character"
    | "surface.lex.invalid-unicode"
    | "surface.lex.unterminated-string"
    | "surface.lex.unterminated-comment";
  readonly message: string;
  readonly span: SourceSpan;
}> {}

export class SurfaceParseError extends Data.TaggedError("SurfaceParseError")<{
  readonly phase: "parse";
  readonly code:
    | "surface.parse.expected"
    | "surface.parse.reserved-name"
    | "surface.parse.unsafe-integer"
    | "surface.parse.depth"
    | "surface.parse.trailing-input";
  readonly message: string;
  readonly span: SourceSpan;
}> {}

export class SurfaceElaborationError extends Data.TaggedError("SurfaceElaborationError")<{
  readonly phase: "elaboration";
  readonly code:
    | "surface.elaboration.uncustodied-ast"
    | "surface.elaboration.unbound-value"
    | "surface.elaboration.unbound-resumption"
    | "surface.elaboration.wrong-binder-kind"
    | "surface.elaboration.ambiguous-binder"
    | "surface.elaboration.duplicate-signature-operation"
    | "surface.elaboration.duplicate-handler-clause"
    | "surface.elaboration.duplicate-effect-label";
  readonly message: string;
  readonly span: SourceSpan;
}> {}

export class SurfaceKernelBoundaryError extends Data.TaggedError("SurfaceKernelBoundaryError")<{
  readonly phase: "kernel-boundary";
  readonly code: "surface.kernel-boundary.rejected";
  readonly message: string;
  readonly span: SourceSpan;
  readonly diagnostics: ReadonlyArray<{
    readonly code: string;
    readonly path: string;
    readonly message: string;
  }>;
}> {}

export type SurfaceLanguageError =
  | SurfaceInputError
  | SurfaceLexError
  | SurfaceParseError
  | SurfaceElaborationError
  | SurfaceKernelBoundaryError;
