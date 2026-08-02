import { stringifyCanonicalJson } from "../references/canonical-json.ts";
import type { SemanticWitMappingManifestV1, WitMappingSummary } from "./schema.ts";

export const canonicalWitMappingManifestJson = (manifest: SemanticWitMappingManifestV1): string =>
  stringifyCanonicalJson(manifest);

export const encodeWitMappingManifest = (manifest: SemanticWitMappingManifestV1): Uint8Array =>
  new TextEncoder().encode(`${canonicalWitMappingManifestJson(manifest)}\n`);

export const canonicalWitMappingSummaryJson = (summary: WitMappingSummary): string =>
  stringifyCanonicalJson(summary);

export const encodeWitMappingSummary = (summary: WitMappingSummary): Uint8Array =>
  new TextEncoder().encode(`${canonicalWitMappingSummaryJson(summary)}\n`);
