const compareUnicodeCodePoints = (left: string, right: string): number => {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
};

const escapeJsonString = (value: string): string => {
  let out = '"';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    const codeUnit = value.charCodeAt(index);
    switch (character) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      case "\b":
        out += "\\b";
        break;
      case "\f":
        out += "\\f";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default:
        out +=
          codeUnit < 0x20 || codeUnit > 0x7e
            ? `\\u${codeUnit.toString(16).padStart(4, "0")}`
            : character;
    }
  }
  return out + '"';
};

const render = (value: unknown, indentation: number | null, depth: number): string => {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON rejects non-finite numbers");
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return escapeJsonString(value);

  const separator = indentation === null ? "," : `,\n${" ".repeat(indentation * (depth + 1))}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const rendered = value.map((item) => render(item, indentation, depth + 1));
    if (indentation === null) return `[${rendered.join(separator)}]`;
    return `[\n${" ".repeat(indentation * (depth + 1))}${rendered.join(separator)}\n${" ".repeat(indentation * depth)}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      compareUnicodeCodePoints(left, right),
    );
    if (entries.length === 0) return "{}";
    const rendered = entries.map(
      ([key, item]) =>
        `${escapeJsonString(key)}:${indentation === null ? "" : " "}${render(item, indentation, depth + 1)}`,
    );
    if (indentation === null) return `{${rendered.join(separator)}}`;
    return `{\n${" ".repeat(indentation * (depth + 1))}${rendered.join(separator)}\n${" ".repeat(indentation * depth)}}`;
  }
  throw new Error(`canonical JSON cannot encode a value of type ${typeof value}`);
};

/**
 * Accepted canonical encoding for the JSON-shaped values admitted by the
 * reference custody schemas: sorted keys with ASCII-only escapes.
 */
export const stringifyCanonicalJson = (value: unknown, indentation: number | null = null): string =>
  render(value, indentation, 0);
