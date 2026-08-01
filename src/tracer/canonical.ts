import { Crypto, Effect, Encoding } from "effect";
import { DocumentError, type JsonObject, type JsonValue } from "./json.ts";

const canonicalize = (value: JsonValue): JsonValue => {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("canonical JSON rejects non-finite numbers");
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    ) as JsonObject;
  }
  return value;
};

export const canonicalJson = (value: JsonValue): string => JSON.stringify(canonicalize(value));

export const contentIdentity = (
  value: JsonValue,
): Effect.Effect<string, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const canonical = yield* Effect.try({
      try: () => canonicalJson(value),
      catch: (cause) =>
        new DocumentError({ message: "cannot canonicalize content identity input", cause }),
    });
    const digest = yield* crypto
      .digest("SHA-256", new TextEncoder().encode(canonical))
      .pipe(
        Effect.mapError(
          (cause) =>
            new DocumentError({ message: "cannot compute SHA-256 content identity", cause }),
        ),
      );
    return `sha256:${Encoding.encodeHex(digest)}`;
  });

export const jsonEqual = (left: JsonValue, right: JsonValue): boolean =>
  canonicalJson(left) === canonicalJson(right);
