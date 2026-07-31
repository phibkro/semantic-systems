import { Effect } from "effect";
import { hasUnicodeScalarsOnly } from "../normalized-core/canonical.ts";
import { SurfaceLexError, type SourceSpan } from "./errors.ts";

export interface SurfaceLanguageBounds {
  readonly maximumSourceBytes: number;
  readonly maximumTokens: number;
  readonly maximumDepth: number;
  readonly maximumIdentifierBytes: number;
  readonly maximumSignatureOperations: number;
  readonly maximumOperationClauses: number;
}

export const defaultSurfaceLanguageBounds: SurfaceLanguageBounds = Object.freeze({
  maximumSourceBytes: 1_048_576,
  maximumTokens: 65_536,
  maximumDepth: 128,
  maximumIdentifierBytes: 4_096,
  maximumSignatureOperations: 4_096,
  maximumOperationClauses: 4_096,
});

export type TokenKind = "identifier" | "integer" | "string" | "symbol" | "eof";

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly span: SourceSpan;
}

const encoder = new TextEncoder();
const identifierStart = (character: string): boolean => /[A-Za-z_]/.test(character);
const identifierContinue = (character: string): boolean => /[A-Za-z0-9_-]/.test(character);
const digit = (character: string): boolean => character >= "0" && character <= "9";

const failure = (
  code: SurfaceLexError["code"],
  message: string,
  start: number,
  end: number,
): SurfaceLexError => new SurfaceLexError({ phase: "lex", code, message, span: { start, end } });

export const lexSurface = (
  source: string,
  bounds: SurfaceLanguageBounds = defaultSurfaceLanguageBounds,
): Effect.Effect<ReadonlyArray<Token>, SurfaceLexError> => {
  const sourceBytes = encoder.encode(source).byteLength;
  if (sourceBytes > bounds.maximumSourceBytes) {
    return Effect.fail(
      failure(
        "surface.lex.source-too-large",
        `source is ${sourceBytes} bytes; maximum is ${bounds.maximumSourceBytes}`,
        0,
        source.length,
      ),
    );
  }
  if (!hasUnicodeScalarsOnly(source)) {
    let invalidOffset = 0;
    while (invalidOffset < source.length) {
      const code = source.charCodeAt(invalidOffset);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = source.charCodeAt(invalidOffset + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) break;
        invalidOffset += 2;
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) break;
      invalidOffset += 1;
    }
    return Effect.fail(
      failure(
        "surface.lex.invalid-unicode",
        "source contains a lone UTF-16 surrogate",
        invalidOffset,
        invalidOffset + 1,
      ),
    );
  }

  const tokens: Array<Token> = [];
  let offset = 0;
  const add = (
    kind: TokenKind,
    text: string,
    start: number,
    end: number,
  ): SurfaceLexError | undefined => {
    if (tokens.length >= bounds.maximumTokens) {
      return failure(
        "surface.lex.too-many-tokens",
        `source exceeds the ${bounds.maximumTokens} token limit`,
        start,
        end,
      );
    }
    tokens.push(Object.freeze({ kind, text, span: Object.freeze({ start, end }) }));
    return undefined;
  };

  while (offset < source.length) {
    const start = offset;
    const character = source[offset]!;

    if (/\s/.test(character)) {
      offset += 1;
      continue;
    }
    if (source.startsWith("//", offset)) {
      offset += 2;
      while (offset < source.length && source[offset] !== "\n") offset += 1;
      continue;
    }
    if (source.startsWith("/*", offset)) {
      const close = source.indexOf("*/", offset + 2);
      if (close < 0) {
        return Effect.fail(
          failure(
            "surface.lex.unterminated-comment",
            "block comment is not terminated",
            start,
            source.length,
          ),
        );
      }
      offset = close + 2;
      continue;
    }

    if (source.startsWith("->", offset) || source.startsWith("=>", offset)) {
      offset += 2;
      const issue = add("symbol", source.slice(start, offset), start, offset);
      if (issue !== undefined) return Effect.fail(issue);
      continue;
    }

    if (character === '"') {
      offset += 1;
      const valueStart = offset;
      while (offset < source.length && source[offset] !== '"') {
        if (source[offset] === "\\" || source[offset] === "\n" || source[offset] === "\r") {
          return Effect.fail(
            failure(
              "surface.lex.unterminated-string",
              "kernel marker strings cannot contain escapes or line breaks",
              start,
              offset + 1,
            ),
          );
        }
        offset += 1;
      }
      if (offset >= source.length) {
        return Effect.fail(
          failure(
            "surface.lex.unterminated-string",
            "string is not terminated",
            start,
            source.length,
          ),
        );
      }
      const text = source.slice(valueStart, offset);
      offset += 1;
      const issue = add("string", text, start, offset);
      if (issue !== undefined) return Effect.fail(issue);
      continue;
    }

    if (identifierStart(character)) {
      offset += 1;
      while (offset < source.length && identifierContinue(source[offset]!)) offset += 1;
      const text = source.slice(start, offset);
      if (encoder.encode(text).byteLength > bounds.maximumIdentifierBytes) {
        return Effect.fail(
          failure(
            "surface.lex.identifier-too-large",
            `identifier exceeds the ${bounds.maximumIdentifierBytes} byte limit`,
            start,
            offset,
          ),
        );
      }
      const issue = add("identifier", text, start, offset);
      if (issue !== undefined) return Effect.fail(issue);
      continue;
    }

    if (digit(character) || (character === "-" && digit(source[offset + 1] ?? ""))) {
      if (character === "-") offset += 1;
      while (offset < source.length && digit(source[offset]!)) offset += 1;
      const issue = add("integer", source.slice(start, offset), start, offset);
      if (issue !== undefined) return Effect.fail(issue);
      continue;
    }

    if (";:.,(){}[]=*[]".includes(character)) {
      offset += 1;
      const issue = add("symbol", character, start, offset);
      if (issue !== undefined) return Effect.fail(issue);
      continue;
    }

    return Effect.fail(
      failure(
        "surface.lex.invalid-character",
        `character ${JSON.stringify(character)} is not part of the surface grammar`,
        start,
        start + 1,
      ),
    );
  }

  tokens.push(
    Object.freeze({ kind: "eof", text: "", span: Object.freeze({ start: offset, end: offset }) }),
  );
  return Effect.succeed(Object.freeze(tokens));
};
