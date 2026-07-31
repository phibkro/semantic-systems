export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<CanonicalJsonValue>
  | { readonly [key: string]: CanonicalJsonValue };

export const compareCodePoints = (left: string, right: string): number => {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0)!);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const order = leftPoints[index]! - rightPoints[index]!;
    if (order !== 0) return order;
  }
  return leftPoints.length - rightPoints.length;
};

export const hasUnicodeScalarsOnly = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
};

const escapeString = (value: string): string => {
  if (!hasUnicodeScalarsOnly(value)) throw new TypeError("canonical JSON rejects lone surrogates");
  let output = '"';
  for (const scalar of value) {
    const code = scalar.codePointAt(0)!;
    switch (code) {
      case 0x08:
        output += "\\b";
        break;
      case 0x09:
        output += "\\t";
        break;
      case 0x0a:
        output += "\\n";
        break;
      case 0x0c:
        output += "\\f";
        break;
      case 0x0d:
        output += "\\r";
        break;
      case 0x22:
        output += '\\"';
        break;
      case 0x5c:
        output += "\\\\";
        break;
      default:
        output += code < 0x20 ? `\\u${code.toString(16).padStart(4, "0")}` : scalar;
    }
  }
  return `${output}"`;
};

export const canonicalJson = (value: CanonicalJsonValue): string => {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new TypeError("canonical JSON accepts safe integers only");
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (typeof value === "string") return escapeString(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as { readonly [key: string]: CanonicalJsonValue };
  const fields = Object.keys(object).sort(compareCodePoints);
  return `{${fields.map((key) => `${escapeString(key)}:${canonicalJson(object[key]!)}`).join(",")}}`;
};

export const canonicalBytes = (value: CanonicalJsonValue, finalLineFeed = true): Uint8Array =>
  new TextEncoder().encode(`${canonicalJson(value)}${finalLineFeed ? "\n" : ""}`);

export interface JsonParseIssue {
  readonly code: string;
  readonly message: string;
}

class JsonScanner {
  #index = 0;
  #nodes = 0;
  readonly text: string;
  readonly maximumDepth: number;
  readonly maximumNodes: number;

  constructor(text: string, maximumDepth: number, maximumNodes: number) {
    this.text = text;
    this.maximumDepth = maximumDepth;
    this.maximumNodes = maximumNodes;
  }

  scan(): JsonParseIssue | undefined {
    this.#space();
    const issue = this.#value(0);
    if (issue !== undefined) return issue;
    this.#space();
    return this.#index === this.text.length
      ? undefined
      : { code: "byte.trailing-data", message: "JSON contains trailing data" };
  }

  #space(): void {
    while (true) {
      const code = this.text.charCodeAt(this.#index);
      if (code !== 0x09 && code !== 0x0a && code !== 0x0d && code !== 0x20) return;
      this.#index += 1;
    }
  }

  #value(depth: number): JsonParseIssue | undefined {
    if (depth > this.maximumDepth) {
      return { code: "decode.depth-exceeded", message: "maximum decode depth exceeded" };
    }
    this.#nodes += 1;
    if (this.#nodes > this.maximumNodes) {
      return { code: "decode.nodes-exceeded", message: "maximum decoded node count exceeded" };
    }
    this.#space();
    const token = this.text[this.#index];
    if (token === "{") return this.#object(depth);
    if (token === "[") return this.#array(depth);
    if (token === '"') return this.#string().issue;
    if (token === "-" || (token !== undefined && /[0-9]/.test(token))) return this.#number();
    for (const literal of ["true", "false", "null"]) {
      if (this.text.startsWith(literal, this.#index)) {
        this.#index += literal.length;
        return undefined;
      }
    }
    return { code: "byte.json-grammar", message: "invalid JSON value" };
  }

  #string(): { readonly value?: string; readonly issue?: JsonParseIssue } {
    const start = this.#index;
    this.#index += 1;
    while (this.#index < this.text.length) {
      const code = this.text.charCodeAt(this.#index);
      if (code === 0x22) {
        this.#index += 1;
        try {
          const value = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(
            this.text.slice(start, this.#index),
          );
          return typeof value === "string"
            ? { value }
            : { issue: { code: "byte.json-grammar", message: "invalid JSON string" } };
        } catch {
          return { issue: { code: "byte.json-grammar", message: "invalid JSON string" } };
        }
      }
      if (code < 0x20) {
        return { issue: { code: "byte.json-grammar", message: "unescaped control character" } };
      }
      if (code === 0x5c) {
        this.#index += 1;
        const escape = this.text[this.#index];
        if (escape === "u") {
          const hex = this.text.slice(this.#index + 1, this.#index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            return { issue: { code: "byte.json-grammar", message: "invalid Unicode escape" } };
          }
          this.#index += 5;
          continue;
        }
        if (escape === undefined || !'"\\/bfnrt'.includes(escape)) {
          return { issue: { code: "byte.json-grammar", message: "invalid JSON escape" } };
        }
      }
      this.#index += 1;
    }
    return { issue: { code: "byte.json-grammar", message: "unterminated JSON string" } };
  }

  #number(): JsonParseIssue | undefined {
    const rest = this.text.slice(this.#index);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(rest);
    if (match === null) return { code: "byte.json-grammar", message: "invalid JSON number" };
    this.#index += match[0].length;
    return undefined;
  }

  #array(depth: number): JsonParseIssue | undefined {
    this.#index += 1;
    this.#space();
    if (this.text[this.#index] === "]") {
      this.#index += 1;
      return undefined;
    }
    while (true) {
      const issue = this.#value(depth + 1);
      if (issue !== undefined) return issue;
      this.#space();
      const token = this.text[this.#index];
      if (token === "]") {
        this.#index += 1;
        return undefined;
      }
      if (token !== ",") return { code: "byte.json-grammar", message: "invalid JSON array" };
      this.#index += 1;
    }
  }

  #object(depth: number): JsonParseIssue | undefined {
    this.#index += 1;
    this.#space();
    if (this.text[this.#index] === "}") {
      this.#index += 1;
      return undefined;
    }
    const keys = new Set<string>();
    while (true) {
      if (this.text[this.#index] !== '"') {
        return { code: "byte.json-grammar", message: "object key must be a string" };
      }
      const parsed = this.#string();
      if (parsed.issue !== undefined) return parsed.issue;
      const key = parsed.value!;
      if (keys.has(key))
        return { code: "byte.duplicate-key", message: `duplicate JSON key '${key}'` };
      keys.add(key);
      this.#space();
      if (this.text[this.#index] !== ":") {
        return { code: "byte.json-grammar", message: "object key must be followed by ':'" };
      }
      this.#index += 1;
      const issue = this.#value(depth + 1);
      if (issue !== undefined) return issue;
      this.#space();
      const token = this.text[this.#index];
      if (token === "}") {
        this.#index += 1;
        return undefined;
      }
      if (token !== ",") return { code: "byte.json-grammar", message: "invalid JSON object" };
      this.#index += 1;
      this.#space();
    }
  }
}

export const scanJson = (
  text: string,
  maximumDepth: number,
  maximumNodes: number,
): JsonParseIssue | undefined => new JsonScanner(text, maximumDepth, maximumNodes).scan();
import { Schema } from "effect";
