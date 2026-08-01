/** Strict observation comparator; oracle execution remains outside this module. */
import { Schema } from "effect";
import {
  encodeCanonicalKernelRunObservation,
  type KernelRunObservation,
} from "../kernel-interpreter/index.ts";
import { DifferentialComparisonSchema, type DifferentialComparison } from "./schema.ts";

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const compareKernelRunObservations = (
  reference: KernelRunObservation,
  compiled: KernelRunObservation,
): DifferentialComparison => {
  const referenceReason =
    reference.observation.tag === "inconclusive" ? reference.observation.reason : null;
  const compiledReason =
    compiled.observation.tag === "inconclusive" ? compiled.observation.reason : null;
  if (referenceReason !== null || compiledReason !== null) {
    return Object.freeze(
      Schema.decodeUnknownSync(DifferentialComparisonSchema, {
        onExcessProperty: "error",
      })({
        tag: "inconclusive",
        reference_reason: referenceReason,
        compiled_reason: compiledReason,
      }),
    );
  }

  const referenceHex = bytesToHex(encodeCanonicalKernelRunObservation(reference));
  const compiledHex = bytesToHex(encodeCanonicalKernelRunObservation(compiled));
  return Object.freeze(
    Schema.decodeUnknownSync(DifferentialComparisonSchema, {
      onExcessProperty: "error",
    })(
      referenceHex === compiledHex
        ? { tag: "agreement", canonical_bytes_hex: referenceHex }
        : {
            tag: "mismatch",
            reference_bytes_hex: referenceHex,
            compiled_bytes_hex: compiledHex,
          },
    ),
  );
};
