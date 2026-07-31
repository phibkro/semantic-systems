import { Effect, type Crypto } from "effect";
import { contentIdentity } from "./canonical.ts";
import {
  DocumentError,
  requireKey,
  requireObject,
  requireString,
  requireStringList,
  type JsonObject,
  type JsonValue,
} from "./json.ts";
import type { Theory } from "./theory.ts";

const IDENTITY_FIELDS = [
  "representation",
  "operations",
  "handled_effects",
  "platform_requirements",
  "assumptions",
] as const;

export interface Realization {
  readonly document: JsonObject;
  readonly identity: string;
  readonly targetsTheory: boolean;
}

export const realizationId = (realization: Realization): string =>
  requireString(requireKey(realization.document, "id", "realization"), "realization.id");

export const realizationAssumptions = (realization: Realization): ReadonlyArray<string> =>
  requireStringList(realization.document.assumptions ?? [], "realization.assumptions");

export const normalizeRealization = (
  document: JsonObject,
  theory: Theory,
  theoryId: string,
): Effect.Effect<Realization, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const { declaredTheory, payload } = yield* Effect.try({
      try: () => {
        const declaredTheoryValue = requireString(
          requireKey(document, "theory", "realization"),
          "realization.theory",
        );
        const identityPayload: Record<string, JsonValue> = { theory_identity: theory.identity };
        for (const field of IDENTITY_FIELDS) {
          identityPayload[field] = requireKey(document, field, "realization");
        }
        return { declaredTheory: declaredTheoryValue, payload: identityPayload };
      },
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot normalize realization", cause }),
    });
    return {
      document,
      identity: yield* contentIdentity(payload),
      targetsTheory: declaredTheory === theoryId,
    };
  });

export const operationBinding = (document: JsonObject, name: string): string => {
  const operations = requireObject(
    requireKey(document, "operations", "realization"),
    "realization.operations",
  );
  return requireString(
    requireKey(operations, name, "realization.operations"),
    `realization.operations.${name}`,
  );
};
