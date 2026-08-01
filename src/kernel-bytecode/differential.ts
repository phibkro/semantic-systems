/** Strict observation comparator; oracle execution remains outside this module. */
import { Encoding, Schema } from "effect";
import {
  encodeCanonicalKernelRunObservation,
  type KernelRunObservation,
} from "../kernel-interpreter/index.ts";
import { DifferentialComparisonSchema, type DifferentialComparison } from "./schema.ts";

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

  const referenceHex = Encoding.encodeHex(encodeCanonicalKernelRunObservation(reference));
  const compiledHex = Encoding.encodeHex(encodeCanonicalKernelRunObservation(compiled));
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
