/** Bytes-only composition root for the process-local baseline bytecode backend. */
import { Effect } from "effect";
import { defaultKernelJsonRawBounds, type KernelJsonRawBounds } from "../kernel-json/bounds.ts";
import {
  kernelRunEnvelope,
  prepareKernelJsonBytes,
  readBoundField,
} from "../kernel-execution/prepare.ts";
import type { KernelRunObservation } from "../kernel-interpreter/schema.ts";
import { compileCheckedProgram, type BytecodeCompilationFailure } from "./compiler.ts";
import { projectCompiledProgram, type CompiledProgramProjection } from "./custody.ts";
import {
  defaultKernelBytecodeBounds,
  narrowKernelBytecodeBounds,
  type KernelBytecodeBounds,
} from "./schema.ts";
import { BytecodeVmInconclusive, executeCompiledProgram, type BytecodeVmFailure } from "./vm.ts";

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

export const runCompiledKernelJsonBytes = (
  input: unknown,
  bounds: KernelBytecodeBackendBounds = defaultKernelBytecodeBackendBounds,
): KernelRunObservation => {
  const jsonBounds = readBoundField(bounds, "json");
  const bytecodeBounds = narrowKernelBytecodeBounds(readBoundField(bounds, "bytecode"));
  const program = Effect.flatMap(prepareKernelJsonBytes(input, jsonBounds), (checked) =>
    Effect.flatMap(compileCheckedProgram(checked.program, bytecodeBounds), (compiled) =>
      Effect.map(executeCompiledProgram(compiled, bytecodeBounds), (returned) =>
        kernelRunEnvelope({ tag: "returned", value: returned.value }),
      ),
    ),
  );
  return Effect.runSync(
    Effect.match(program, {
      onFailure: projectFailure,
      onSuccess: (observation) => observation,
    }),
  );
};

export type { CompiledProgramProjection };
export { projectCompiledProgram };
export type { KernelBytecodeBounds } from "./schema.ts";
