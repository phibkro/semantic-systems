import { Effect, type Crypto } from "effect";
import { canonicalWitMappingSummaryJson, encodeWitMappingManifest } from "./canonical.ts";
import { decodePortableBoundary } from "./decode.ts";
import { generateWitMapping } from "./generate.ts";
import { WitMappingError, type WitMappingSummary } from "./schema.ts";

export const generateWitMappingSummary = (
  input: unknown,
): Effect.Effect<string, WitMappingError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const decoded = decodePortableBoundary(input);
    if (decoded.status === "rejected") {
      return yield* new WitMappingError({
        code: "input.rejected",
        path: decoded.diagnostics[0]?.path ?? "/",
        message: decoded.diagnostics
          .map((entry) => `${entry.code} at ${entry.path}: ${entry.message}`)
          .join("; "),
      });
    }
    const artifact = yield* generateWitMapping(decoded.value);
    const manifestBytes = encodeWitMappingManifest(artifact.manifest);
    const summary: WitMappingSummary = Object.freeze({
      format: artifact.manifest.format,
      wit: artifact.wit,
      manifest: artifact.manifest,
      wit_identity: artifact.wit_identity,
      manifest_identity: artifact.manifest_identity,
      wit_bytes: new TextEncoder().encode(artifact.wit).byteLength,
      manifest_bytes: manifestBytes.byteLength,
    });
    return canonicalWitMappingSummaryJson(summary);
  });

export const mapJsonFixture = (
  source: string,
): Effect.Effect<string, WitMappingError, Crypto.Crypto> =>
  Effect.try({
    try: () => JSON.parse(source) as unknown,
    catch: (cause) =>
      new WitMappingError({
        code: "input.invalid-json",
        path: "/",
        message: "fixture is not valid JSON",
        cause,
      }),
  }).pipe(Effect.flatMap(generateWitMappingSummary));
