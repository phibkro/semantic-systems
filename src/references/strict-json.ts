import { Data, Effect } from "effect";

export class JsonSyntaxError extends Data.TaggedError("JsonSyntaxError")<{
  readonly message: string;
}> {}

/**
 * `JSON.parse` silently keeps the last value on a duplicate key, which would
 * let a hand-edited `sources.lock.json` smuggle a second, unreadable
 * observation past every later check. This walks the grammar itself so every
 * object level can reject a repeated key at the point it appears.
 */

interface Parsed<T> {
  readonly value: T;
  readonly next: number;
}

const isWhitespace = (ch: string): boolean =>
  ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

const fail = (message: string, index: number): never => {
  throw new Error(`${message} at position ${index}`);
};

const skipWhitespace = (text: string, index: number): number => {
  let i = index;
  while (i < text.length && isWhitespace(text[i]!)) i += 1;
  return i;
};

const parseValue = (text: string, index: number): Parsed<unknown> => {
  const i = skipWhitespace(text, index);
  if (i >= text.length) fail("unexpected end of input", i);
  const ch = text[i]!;
  if (ch === "{") return parseObject(text, i);
  if (ch === "[") return parseArray(text, i);
  if (ch === '"') return parseString(text, i);
  if (ch === "-" || (ch >= "0" && ch <= "9")) return parseNumber(text, i);
  if (text.startsWith("true", i)) return { value: true, next: i + 4 };
  if (text.startsWith("false", i)) return { value: false, next: i + 5 };
  if (text.startsWith("null", i)) return { value: null, next: i + 4 };
  return fail(`unexpected character ${JSON.stringify(ch)}`, i);
};

const parseObject = (text: string, index: number): Parsed<Record<string, unknown>> => {
  let i = skipWhitespace(text, index + 1);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  if (text[i] === "}") return { value: result, next: i + 1 };
  for (;;) {
    i = skipWhitespace(text, i);
    if (text[i] !== '"') fail("expected a string key", i);
    const key = parseString(text, i);
    i = skipWhitespace(text, key.next);
    if (text[i] !== ":") fail("expected ':' after object key", i);
    const value = parseValue(text, i + 1);
    if (Object.hasOwn(result, key.value))
      fail(`duplicate JSON key ${JSON.stringify(key.value)}`, i);
    result[key.value] = value.value;
    i = skipWhitespace(text, value.next);
    if (text[i] === ",") {
      i += 1;
      continue;
    }
    if (text[i] === "}") return { value: result, next: i + 1 };
    fail("expected ',' or '}' in object", i);
  }
};

const parseArray = (text: string, index: number): Parsed<Array<unknown>> => {
  let i = skipWhitespace(text, index + 1);
  const result: Array<unknown> = [];
  if (text[i] === "]") return { value: result, next: i + 1 };
  for (;;) {
    const value = parseValue(text, i);
    result.push(value.value);
    i = skipWhitespace(text, value.next);
    if (text[i] === ",") {
      i += 1;
      continue;
    }
    if (text[i] === "]") return { value: result, next: i + 1 };
    fail("expected ',' or ']' in array", i);
  }
};

const parseString = (text: string, index: number): Parsed<string> => {
  let i = index + 1;
  let out = "";
  for (;;) {
    if (i >= text.length) fail("unterminated string", i);
    const ch = text[i]!;
    if (ch === '"') return { value: out, next: i + 1 };
    if (ch === "\\") {
      const esc = text[i + 1];
      switch (esc) {
        case '"':
          out += '"';
          i += 2;
          break;
        case "\\":
          out += "\\";
          i += 2;
          break;
        case "/":
          out += "/";
          i += 2;
          break;
        case "b":
          out += "\b";
          i += 2;
          break;
        case "f":
          out += "\f";
          i += 2;
          break;
        case "n":
          out += "\n";
          i += 2;
          break;
        case "r":
          out += "\r";
          i += 2;
          break;
        case "t":
          out += "\t";
          i += 2;
          break;
        case "u": {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid \\u escape", i);
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 6;
          break;
        }
        default:
          fail(`invalid escape sequence '\\${esc ?? ""}'`, i);
      }
      continue;
    }
    if (ch.codePointAt(0)! < 0x20) fail("control character in string", i);
    out += ch;
    i += 1;
  }
};

const NUMBER_PATTERN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

const parseNumber = (text: string, index: number): Parsed<number | bigint> => {
  NUMBER_PATTERN.lastIndex = index;
  const match = NUMBER_PATTERN.exec(text);
  if (match === null || match.index !== index) return fail("invalid number", index);
  const token = match[0];
  return {
    value:
      token.includes(".") || token.includes("e") || token.includes("E")
        ? Number(token)
        : BigInt(token),
    next: index + token.length,
  };
};

export const parseStrictJsonSync = (text: string): unknown => {
  const result = parseValue(text, 0);
  const end = skipWhitespace(text, result.next);
  if (end !== text.length) fail("unexpected trailing content", end);
  return result.value;
};

export const parseStrictJson = (text: string): Effect.Effect<unknown, JsonSyntaxError> =>
  Effect.try({
    try: () => parseStrictJsonSync(text),
    catch: (cause) =>
      new JsonSyntaxError({ message: cause instanceof Error ? cause.message : String(cause) }),
  });
