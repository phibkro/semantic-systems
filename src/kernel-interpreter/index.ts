import {
  canonicalBytes,
  canonicalJson,
  type CanonicalJsonValue,
} from "../normalized-core/canonical.ts";
import { isKernelRunObservation, type KernelRunObservation } from "./schema.ts";
import { toPortableFact } from "./portable-fact.ts";

export {
  defaultKernelInterpreterBounds,
  interpretKernelJsonBytes,
  type KernelInterpreterBounds,
} from "./observe.ts";
export { toPortableFact } from "./portable-fact.ts";
export {
  isKernelRunObservation,
  KernelRunObservationSchema,
  type KernelRunObservation,
  type KernelRejectedCheckObservation,
  type KernelRunResult,
  type ObservableComputationType,
  type ObservableOperationRequest,
  type ObservableRuntimeDiagnostic,
  type ObservableRuntimeResult,
  type ObservableRuntimeValue,
  type ObservableValueType,
} from "./schema.ts";

/**
 * A whole valid `KernelRunObservation` is, by construction, entirely
 * portable/inert data: every leaf is null, a boolean, a safe integer, a
 * string, or a nested array/record of the same recognized shapes — exactly
 * what `toPortableFact` already knows how to snapshot in one single-read,
 * alias- and cycle-safe pass. Reusing it for the whole observation, not
 * only the `expected`/`actual` leaves, is what makes the two steps below
 * sound: `isKernelRunObservation`'s schema check and `canonicalBytes`'s
 * encoding must see the exact same data, or a hostile object whose
 * `getOwnPropertyDescriptor` and `get` traps disagree could validate one
 * live view and encode a different one — the same class of defect the
 * array-projection fix closed inside `toPortableFact`, one level up.
 */
const snapshotObservation = (
  observation: KernelRunObservation,
): KernelRunObservation | undefined => {
  const snapshot = toPortableFact(observation);
  return snapshot !== undefined && isKernelRunObservation(snapshot)
    ? (snapshot as unknown as KernelRunObservation)
    : undefined;
};

export const encodeCanonicalKernelRunObservation = (
  observation: KernelRunObservation,
): Uint8Array => {
  const snapshot = snapshotObservation(observation);
  if (snapshot === undefined) {
    throw new TypeError("expected a strict semantic.kernel-run observation");
  }
  return canonicalBytes(snapshot as unknown as CanonicalJsonValue);
};

export const canonicalKernelRunObservationJson = (observation: KernelRunObservation): string => {
  const snapshot = snapshotObservation(observation);
  if (snapshot === undefined) {
    throw new TypeError("expected a strict semantic.kernel-run observation");
  }
  return canonicalJson(snapshot as unknown as CanonicalJsonValue);
};
