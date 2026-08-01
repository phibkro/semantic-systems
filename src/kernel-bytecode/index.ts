/** Bytes-only composition root for the process-local baseline bytecode backend. */
import { Effect } from "effect";
import {
  decodeExternalObservationScript,
  driveExternalObservations,
  type ExternalEffectStep,
  type KernelEffectRunObservation,
} from "../kernel-execution/external-observations.ts";
import { defaultKernelJsonRawBounds, type KernelJsonRawBounds } from "../kernel-json/bounds.ts";
import {
  kernelRunEnvelope,
  prepareKernelJsonBytes,
  readBoundField,
} from "../kernel-execution/prepare.ts";
import type { KernelRunObservation } from "../kernel-interpreter/schema.ts";
import type { BytecodeCompilationFailure } from "./compiler.ts";
import { compileAndExecuteCheckedProgram, resumeCompiledExternalSuspension } from "./custody.ts";
import {
  defaultKernelBytecodeBounds,
  narrowKernelBytecodeBounds,
  type KernelBytecodeBounds,
} from "./schema.ts";
import {
  BytecodeVmInconclusive,
  type BytecodeExternalSuspension,
  type BytecodeVmFailure,
  type BytecodeVmOutcome,
} from "./vm.ts";

export interface KernelBytecodeBackendBounds {
  readonly json: KernelJsonRawBounds;
  readonly bytecode: KernelBytecodeBounds;
}

export const defaultKernelBytecodeBackendBounds: KernelBytecodeBackendBounds = Object.freeze({
  json: defaultKernelJsonRawBounds,
  bytecode: defaultKernelBytecodeBounds,
});

const runtimeRejected = (code: string, message: string): KernelRunObservation =>
  kernelRunEnvelope({
    tag: "runtime-rejected",
    diagnostic: { code, occurrence_path: "/program", message },
  });

type BackendFailure =
  | { readonly observation: KernelRunObservation }
  | BytecodeCompilationFailure
  | BytecodeVmFailure
  | BytecodeVmInconclusive;

const projectFailure = (failure: BackendFailure): KernelRunObservation => {
  if ("observation" in failure) return failure.observation;
  if (failure instanceof BytecodeVmInconclusive) {
    return kernelRunEnvelope({ tag: "inconclusive", reason: failure.reason });
  }
  return runtimeRejected(failure.code, failure.message);
};

const externalStep = (
  outcome: BytecodeVmOutcome,
): ExternalEffectStep<BytecodeExternalSuspension> =>
  outcome.status === "returned"
    ? { status: "returned", result: { tag: "returned", value: outcome.value } }
    : {
        status: "suspended",
        request: outcome.request,
        token: outcome.oneShotToken,
      };

const failureStep = (failure: BackendFailure): ExternalEffectStep<never> => ({
  status: "terminal",
  result: projectFailure(failure).observation,
});

export const runCompiledKernelJsonBytes = (
  input: unknown,
  bounds: KernelBytecodeBackendBounds = defaultKernelBytecodeBackendBounds,
): KernelRunObservation => {
  const jsonBounds = readBoundField(bounds, "json");
  const bytecodeBounds = narrowKernelBytecodeBounds(readBoundField(bounds, "bytecode"));
  const program = Effect.flatMap(prepareKernelJsonBytes(input, jsonBounds), (checked) =>
    Effect.map(compileAndExecuteCheckedProgram(checked.program, bytecodeBounds), (returned) =>
      returned.status === "returned"
        ? kernelRunEnvelope({ tag: "returned", value: returned.value })
        : kernelRunEnvelope({ tag: "suspended", request: returned.request }),
    ),
  );
  return Effect.runSync(
    Effect.match(program, {
      onFailure: projectFailure,
      onSuccess: (observation) => observation,
    }),
  );
};

/** Drives a strict bounded observation script through the independent VM. */
export const runCompiledKernelJsonBytesWithObservationScript = (
  input: unknown,
  scriptInput: unknown,
  bounds: KernelBytecodeBackendBounds = defaultKernelBytecodeBackendBounds,
): KernelEffectRunObservation => {
  const decodedScript = decodeExternalObservationScript(scriptInput);
  if (decodedScript.status === "rejected") return decodedScript.observation;
  const jsonBounds = readBoundField(bounds, "json");
  const bytecodeBounds = narrowKernelBytecodeBounds(readBoundField(bounds, "bytecode"));
  const program = Effect.matchEffect(prepareKernelJsonBytes(input, jsonBounds), {
    onFailure: (failure) =>
      driveExternalObservations(failureStep(failure), decodedScript.value, () =>
        Effect.die("preparation rejection has no suspension"),
      ),
    onSuccess: (checked) =>
      Effect.matchEffect(compileAndExecuteCheckedProgram(checked.program, bytecodeBounds), {
        onFailure: (failure) =>
          driveExternalObservations(failureStep(failure), decodedScript.value, () =>
            Effect.die("backend rejection has no suspension"),
          ),
        onSuccess: (initial) =>
          driveExternalObservations(externalStep(initial), decodedScript.value, (token, value) =>
            Effect.match(resumeCompiledExternalSuspension(token, value, bytecodeBounds), {
              onFailure: (failure) => ({
                applied: failure.applied,
                step: failureStep(failure.error),
              }),
              onSuccess: (outcome) => ({ applied: true, step: externalStep(outcome) }),
            }),
          ),
      }),
  });
  return Effect.runSync(program);
};

export type { CompiledProgramProjection } from "./custody.ts";
export type {
  ExternalObservationScript,
  ExternalObservationValue,
  KernelEffectRunObservation,
} from "../kernel-execution/external-observations.ts";
export type { KernelBytecodeBounds } from "./schema.ts";
