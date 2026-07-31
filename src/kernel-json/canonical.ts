import {
  canonicalBytes,
  canonicalJson,
  type CanonicalJsonValue,
} from "../normalized-core/canonical.ts";
import type { KernelCheckObservation, KernelDocument } from "./types.ts";

/**
 * Canonical encoding follows the exact 0019 canonical JSON grammar: no
 * insignificant whitespace, object keys in Unicode code-point order, arrays
 * in contract-defined order, shortest UTF-8 string encoding, `-0` and `0` as
 * distinct integer tokens, and one final line feed.
 */
export const encodeCanonicalKernelDocument = (document: KernelDocument): Uint8Array =>
  canonicalBytes(document as unknown as CanonicalJsonValue);

export const encodeCanonicalKernelCheckObservation = (
  observation: KernelCheckObservation,
): Uint8Array => canonicalBytes(observation as unknown as CanonicalJsonValue);

export const canonicalKernelDocumentJson = (document: KernelDocument): string =>
  canonicalJson(document as unknown as CanonicalJsonValue);

export const canonicalKernelCheckObservationJson = (observation: KernelCheckObservation): string =>
  canonicalJson(observation as unknown as CanonicalJsonValue);
