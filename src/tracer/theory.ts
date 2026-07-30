import { Effect, type Crypto } from "effect";
import { contentIdentity } from "./canonical.ts";
import {
  DocumentError,
  requireKey,
  requireObject,
  requireObjectList,
  requireString,
  type JsonObject,
  type JsonValue,
} from "./json.ts";

export const NORMALIZATION_VERSION = "theory-norm-v0";
const DECLARATION_COLLECTIONS = [
  "types",
  "operations",
  "effects",
  "laws",
  "invariants",
  "observations",
  "obligations",
] as const;
const NON_SEMANTIC_FIELDS = new Set(["documentation", "display_name", "name", "source_path"]);

export interface Theory {
  readonly identity: string;
  readonly payload: JsonObject;
}

export const requiredObligationId = (theory: Theory): string | null => {
  const raw = theory.payload.obligations;
  if (!Array.isArray(raw) || raw.length !== 1) return null;
  const first = raw[0];
  if (first === null || typeof first !== "object" || Array.isArray(first)) return null;
  return typeof first.id === "string" ? first.id : null;
};

const semanticDeclaration = (declaration: JsonObject): JsonObject =>
  Object.fromEntries(Object.entries(declaration).filter(([key]) => !NON_SEMANTIC_FIELDS.has(key)));

const sortedById = (document: JsonObject, key: string): ReadonlyArray<JsonValue> => {
  const declarations = requireObjectList(requireKey(document, key, "theory"), `theory.${key}`);
  const keyed = declarations
    .map(
      (declaration) =>
        [
          requireString(requireKey(declaration, "id", `theory.${key} entry`), `theory.${key}.id`),
          semanticDeclaration(declaration),
        ] as const,
    )
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const ids = keyed.map(([id]) => id);
  if (new Set(ids).size !== ids.length) {
    throw new DocumentError({ message: `theory.${key} contains duplicate declaration IDs` });
  }
  return keyed.map(([, declaration]) => declaration);
};

export const normalizeTheory = (
  document: JsonObject,
): Effect.Effect<Theory, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const payload = yield* Effect.try({
      try: () => {
        requireObject(document, "theory");
        const normalization = requireString(
          requireKey(document, "normalization", "theory"),
          "theory.normalization",
        );
        if (normalization !== NORMALIZATION_VERSION) {
          throw new DocumentError({
            message: `unsupported theory normalization '${normalization}', expected '${NORMALIZATION_VERSION}'`,
          });
        }
        const normalized: Record<string, JsonValue> = { normalization };
        for (const collection of DECLARATION_COLLECTIONS) {
          normalized[collection] = sortedById(document, collection);
        }
        return normalized;
      },
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot normalize theory", cause }),
    });
    return { identity: yield* contentIdentity(payload), payload };
  });
