import {
  canonicalBytes,
  canonicalJson,
  type CanonicalJsonValue,
} from "../normalized-core/canonical.ts";
import { snapshotKernelRunObservation, type KernelRunObservation } from "./schema.ts";

export {
  defaultKernelInterpreterBounds,
  interpretKernelJsonBytes,
  type KernelInterpreterBounds,
} from "./observe.ts";
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

export const encodeCanonicalKernelRunObservation = (
  observation: KernelRunObservation,
): Uint8Array => {
  const snapshot = snapshotKernelRunObservation(observation);
  if (snapshot === undefined) {
    throw new TypeError("expected a strict semantic.kernel-run observation");
  }
  return canonicalBytes(snapshot as unknown as CanonicalJsonValue);
};

export const canonicalKernelRunObservationJson = (observation: KernelRunObservation): string => {
  const snapshot = snapshotKernelRunObservation(observation);
  if (snapshot === undefined) {
    throw new TypeError("expected a strict semantic.kernel-run observation");
  }
  return canonicalJson(snapshot as unknown as CanonicalJsonValue);
};
