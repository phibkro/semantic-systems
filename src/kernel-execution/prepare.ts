/** Shared strict representation-and-check boundary for kernel execution backends. */
import { Data, Effect } from "effect";
import type { CheckedProgram } from "../kernel-calculus/checker.ts";
import { defaultKernelJsonRawBounds, type KernelJsonRawBounds } from "../kernel-json/bounds.ts";
import { decodeKernelDocumentBytes } from "../kernel-json/decode.ts";
import { checkKernelDocumentWithCustody } from "../kernel-json/observe.ts";
import type { KernelRunObservation } from "../kernel-interpreter/schema.ts";

const freeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

export const kernelRunEnvelope = (
  observation: KernelRunObservation["observation"],
): KernelRunObservation =>
  freeze({
    format: "semantic.kernel-run",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    observation,
  });

export class KernelRepresentationRejected extends Data.TaggedError("KernelRepresentationRejected")<{
  readonly observation: KernelRunObservation;
}> {}

export class KernelCheckRejected extends Data.TaggedError("KernelCheckRejected")<{
  readonly observation: KernelRunObservation;
}> {}

export type KernelPreparationFailure = KernelRepresentationRejected | KernelCheckRejected;

export interface PreparedKernelProgram {
  readonly program: CheckedProgram;
}

export const readBoundField = (source: unknown, key: string): unknown => {
  if (typeof source !== "object" || source === null) return undefined;
  try {
    return (source as Readonly<Record<string, unknown>>)[key];
  } catch {
    return undefined;
  }
};

export const narrowBoundedInteger = (
  candidate: unknown,
  defaultValue: number,
  minimum: 0 | 1,
): number =>
  typeof candidate === "number" &&
  Number.isSafeInteger(candidate) &&
  candidate >= minimum &&
  (minimum === 0 || candidate > 0)
    ? Math.min(candidate, defaultValue)
    : defaultValue;

export const narrowKernelJsonRawBounds = (input: unknown): KernelJsonRawBounds =>
  freeze({
    maximumBytes: narrowBoundedInteger(
      readBoundField(input, "maximumBytes"),
      defaultKernelJsonRawBounds.maximumBytes,
      1,
    ),
    maximumDepth: narrowBoundedInteger(
      readBoundField(input, "maximumDepth"),
      defaultKernelJsonRawBounds.maximumDepth,
      1,
    ),
    maximumNodes: narrowBoundedInteger(
      readBoundField(input, "maximumNodes"),
      defaultKernelJsonRawBounds.maximumNodes,
      1,
    ),
    maximumStringBytes: narrowBoundedInteger(
      readBoundField(input, "maximumStringBytes"),
      defaultKernelJsonRawBounds.maximumStringBytes,
      1,
    ),
    maximumCollectionLength: narrowBoundedInteger(
      readBoundField(input, "maximumCollectionLength"),
      defaultKernelJsonRawBounds.maximumCollectionLength,
      1,
    ),
    maximumOperations: narrowBoundedInteger(
      readBoundField(input, "maximumOperations"),
      defaultKernelJsonRawBounds.maximumOperations,
      1,
    ),
    maximumOperationClauses: narrowBoundedInteger(
      readBoundField(input, "maximumOperationClauses"),
      defaultKernelJsonRawBounds.maximumOperationClauses,
      1,
    ),
    maximumEffectLabels: narrowBoundedInteger(
      readBoundField(input, "maximumEffectLabels"),
      defaultKernelJsonRawBounds.maximumEffectLabels,
      1,
    ),
  });

export const prepareKernelJsonBytes = (
  input: unknown,
  rawBounds: unknown = defaultKernelJsonRawBounds,
): Effect.Effect<PreparedKernelProgram, KernelPreparationFailure> =>
  Effect.gen(function* () {
    const decoded = decodeKernelDocumentBytes(input, narrowKernelJsonRawBounds(rawBounds));
    if (decoded.status === "rejected") {
      return yield* new KernelRepresentationRejected({
        observation: kernelRunEnvelope({
          tag: "representation-rejected",
          diagnostics: decoded.diagnostics,
        }),
      });
    }

    const checked = checkKernelDocumentWithCustody(decoded.value);
    if (checked.status === "rejected") {
      return yield* new KernelCheckRejected({
        observation: kernelRunEnvelope({
          tag: "check-rejected",
          check: {
            ...checked.observation,
            observation: checked.observation.observation,
          },
        }),
      });
    }

    return freeze({ program: checked.program });
  });
