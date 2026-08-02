import { stringifyCanonicalJson } from "../references/canonical-json.ts";
import type { RelationalFactBundle } from "./types.ts";

/**
 * Canonical compact JSON used by the relational-facts wire seam.
 * Object keys are ordered by the shared repository canonical JSON helper.
 */
export const canonicalRelationalFactsJson = (bundle: RelationalFactBundle): string =>
  stringifyCanonicalJson(bundle);

/**
 * Encode one immutable fact bundle as canonical UTF-8 JSON bytes.
 * A final line feed follows the repository's canonical artifact convention.
 */
export const encodeRelationalFacts = (bundle: RelationalFactBundle): Uint8Array =>
  new TextEncoder().encode(`${canonicalRelationalFactsJson(bundle)}\n`);
