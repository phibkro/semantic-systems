import { compareCodePoints } from "../normalized-core/canonical.ts";

/**
 * Raw-input decoding bounds for `semantic.kernel-json` documents. Limits what
 * a caller may hand the strict decoder before any candidate is inspected.
 */
export interface KernelJsonRawBounds {
  readonly maximumBytes: number;
  readonly maximumDepth: number;
  readonly maximumNodes: number;
  readonly maximumStringBytes: number;
  readonly maximumCollectionLength: number;
  readonly maximumOperations: number;
  readonly maximumOperationClauses: number;
  readonly maximumEffectLabels: number;
}

export const defaultKernelJsonRawBounds: KernelJsonRawBounds = Object.freeze({
  maximumBytes: 1_048_576,
  maximumDepth: 128,
  maximumNodes: 524_288,
  maximumStringBytes: 4_096,
  maximumCollectionLength: 4_096,
  maximumOperations: 256,
  maximumOperationClauses: 256,
  maximumEffectLabels: 256,
});

/**
 * Observation-envelope bounds for `semantic.kernel-check` observations.
 * Derived from the raw bounds so every default-bound rejection stays
 * representable; see design spec 0020 "Limits" for the arithmetic proofs.
 */
export interface KernelCheckEnvelopeBounds {
  readonly maximumObservationBytes: number;
  readonly maximumObservationNodes: number;
  readonly maximumObservationCollectionLength: number;
  readonly maximumObservationDepth: number;
  readonly maximumObservationStringBytes: number;
  readonly maximumLabels: number;
  readonly maximumTypeNodes: number;
  readonly maximumJudgments: number;
  readonly maximumContextEntries: number;
  readonly maximumDiagnostics: number;
}

export const defaultKernelCheckEnvelopeBounds: KernelCheckEnvelopeBounds = Object.freeze({
  maximumObservationBytes: 33_554_432,
  maximumObservationNodes: 4_194_304,
  maximumObservationCollectionLength: 1_048_576,
  maximumObservationDepth: 128,
  maximumObservationStringBytes: 4_096,
  maximumLabels: 1_048_576,
  maximumTypeNodes: 16_384,
  maximumJudgments: 16_384,
  maximumContextEntries: 256,
  maximumDiagnostics: 1_024,
});

export interface KernelJsonBounds {
  readonly raw: KernelJsonRawBounds;
  readonly envelope: KernelCheckEnvelopeBounds;
}

export const defaultKernelJsonBounds: KernelJsonBounds = Object.freeze({
  raw: defaultKernelJsonRawBounds,
  envelope: defaultKernelCheckEnvelopeBounds,
});

export interface BoundsDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

const boundsDiagnostic = (code: string, path: string, message: string): BoundsDiagnostic =>
  Object.freeze({ code, path, message });

const rawBoundNames = Object.keys(defaultKernelJsonRawBounds).sort(compareCodePoints);
const envelopeBoundNames = Object.keys(defaultKernelCheckEnvelopeBounds).sort(compareCodePoints);

const validateExactBounds = <Bounds extends Record<string, number>>(
  input: unknown,
  defaults: Bounds,
  boundNames: ReadonlyArray<string>,
  path: string,
): BoundsDiagnostic | Bounds => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return boundsDiagnostic("bounds.expected-record", path, "expected an exact bounds record");
  }
  if (Object.getPrototypeOf(input) !== Object.prototype) {
    return boundsDiagnostic("bounds.non-data", path, "expected a plain data record");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(input);
  if (
    keys.some((key) => typeof key === "symbol") ||
    keys.some((key) => {
      const descriptor = descriptors[key as string];
      return descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable;
    })
  ) {
    return boundsDiagnostic("bounds.non-data", path, "bounds must contain plain enumerable data");
  }
  const actual = Object.keys(input).sort(compareCodePoints);
  if (
    actual.length !== boundNames.length ||
    actual.some((key, index) => key !== boundNames[index])
  ) {
    return boundsDiagnostic(
      "bounds.exact-record",
      path,
      "bounds must contain every version 1 field and no others",
    );
  }
  const values: Record<string, number> = {};
  for (const name of boundNames) {
    const value = (input as Record<string, unknown>)[name];
    const maximum = defaults[name]!;
    if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
      return boundsDiagnostic(
        "bounds.invalid",
        `${path}.${name}`,
        `expected a positive safe integer no greater than ${maximum}`,
      );
    }
    values[name] = value as number;
  }
  return Object.freeze(values) as Bounds;
};

export const validateRawBounds = (input: unknown): BoundsDiagnostic | KernelJsonRawBounds => {
  const result = validateExactBounds(
    input,
    defaultKernelJsonRawBounds as unknown as Record<string, number>,
    rawBoundNames,
    "$.bounds.raw",
  );
  return result as BoundsDiagnostic | KernelJsonRawBounds;
};

export const validateEnvelopeBounds = (
  input: unknown,
): BoundsDiagnostic | KernelCheckEnvelopeBounds => {
  const result = validateExactBounds(
    input,
    defaultKernelCheckEnvelopeBounds as unknown as Record<string, number>,
    envelopeBoundNames,
    "$.bounds.envelope",
  );
  return result as BoundsDiagnostic | KernelCheckEnvelopeBounds;
};
