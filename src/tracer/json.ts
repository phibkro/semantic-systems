import { Data } from "effect";

export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | ReadonlyArray<JsonValue> | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export class DocumentError extends Data.TaggedError("DocumentError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const requireObject = (value: JsonValue, context: string): JsonObject => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DocumentError({ message: `${context} must be an object` });
  }
  return value as JsonObject;
};

export const requireList = (value: JsonValue, context: string): ReadonlyArray<JsonValue> => {
  if (!Array.isArray(value)) throw new DocumentError({ message: `${context} must be a list` });
  return value;
};

export const requireString = (value: JsonValue, context: string): string => {
  if (typeof value !== "string")
    throw new DocumentError({ message: `${context} must be a string` });
  return value;
};

export const requireInteger = (value: JsonValue, context: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new DocumentError({ message: `${context} must be a safe integer` });
  }
  return value;
};

export const requireKey = (document: JsonObject, key: string, context: string): JsonValue => {
  if (!(key in document)) {
    throw new DocumentError({ message: `${context} is missing required key '${key}'` });
  }
  return document[key]!;
};

export const requireObjectList = (value: JsonValue, context: string): ReadonlyArray<JsonObject> =>
  requireList(value, context).map((item, index) => requireObject(item, `${context}[${index}]`));

export const requireStringList = (value: JsonValue, context: string): ReadonlyArray<string> =>
  requireList(value, context).map((item, index) => requireString(item, `${context}[${index}]`));
