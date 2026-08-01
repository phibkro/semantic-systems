/** Stateless process adapter for the reference kernel interpreter. */
import { Data, Effect } from "effect";
import {
  encodeCanonicalKernelRunObservation,
  interpretKernelJsonBytes,
  type KernelRunObservation,
} from "../kernel-interpreter/index.ts";

export class KernelCliHostError extends Data.TaggedError("KernelCliHostError")<{
  readonly operation: "read-input" | "write-stdout" | "write-stderr";
}> {}

export interface KernelCliHost {
  readonly readInput: (source: string) => Effect.Effect<Uint8Array, KernelCliHostError>;
  readonly writeStdout: (bytes: Uint8Array) => Effect.Effect<void, KernelCliHostError>;
  readonly writeStderr: (text: string) => Effect.Effect<void, KernelCliHostError>;
}

const usage = "usage: semantic-kernel run FILE|-\n";

export const kernelRunExitCode = (observation: KernelRunObservation): 0 | 1 =>
  observation.observation.tag === "returned" || observation.observation.tag === "suspended" ? 0 : 1;

const reportHostFailure = (host: KernelCliHost, text: string): Effect.Effect<2, never> =>
  host.writeStderr(text).pipe(Effect.ignore, Effect.as(2 as const));

export const runKernelCli = (
  arguments_: ReadonlyArray<string>,
  host: KernelCliHost,
): Effect.Effect<number, never> => {
  if (arguments_.length !== 2 || arguments_[0] !== "run") {
    return reportHostFailure(host, usage);
  }
  const source = arguments_[1]!;
  return Effect.gen(function* () {
    const input = yield* host.readInput(source);
    const observation = interpretKernelJsonBytes(input);
    const output = encodeCanonicalKernelRunObservation(observation);
    yield* host.writeStdout(output);
    return kernelRunExitCode(observation);
  }).pipe(
    Effect.catch((error) =>
      reportHostFailure(
        host,
        error.operation === "read-input"
          ? "semantic-kernel: unable to read input\n"
          : "semantic-kernel: unable to write output\n",
      ),
    ),
  );
};
