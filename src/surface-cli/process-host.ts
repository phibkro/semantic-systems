import { open } from "node:fs/promises";
import { Data, Effect } from "effect";
import { defaultSurfaceLanguageBounds } from "../surface-language/index.ts";
import { SurfaceCliHostError, type SurfaceCliHost } from "./cli.ts";

const maximumInputBytes = defaultSurfaceLanguageBounds.maximumSourceBytes + 1;

class ProcessIoFailure extends Data.TaggedError("ProcessIoFailure")<{
  readonly operation: "read-input" | "write-stdout" | "write-stderr";
}> {}

const hostFailure = (
  operation: "read-input" | "write-stdout" | "write-stderr",
): SurfaceCliHostError => new SurfaceCliHostError({ operation });

const readFilePrefix = (path: string): Effect.Effect<Uint8Array, SurfaceCliHostError> =>
  Effect.acquireUseRelease(
    Effect.tryPromise({
      try: () => open(path, "r"),
      catch: () => new ProcessIoFailure({ operation: "read-input" }),
    }),
    (file) =>
      Effect.tryPromise({
        try: async () => {
          const bytes = new Uint8Array(maximumInputBytes);
          let offset = 0;
          while (offset < bytes.length) {
            const result = await file.read(bytes, offset, bytes.length - offset, offset);
            if (result.bytesRead === 0) break;
            offset += result.bytesRead;
          }
          return bytes.slice(0, offset);
        },
        catch: () => new ProcessIoFailure({ operation: "read-input" }),
      }),
    (file) =>
      Effect.tryPromise({
        try: () => file.close(),
        catch: () => new ProcessIoFailure({ operation: "read-input" }),
      }).pipe(Effect.ignore),
  ).pipe(Effect.mapError(() => hostFailure("read-input")));

const readStdinPrefix = (): Effect.Effect<Uint8Array, SurfaceCliHostError> =>
  Effect.tryPromise({
    try: async () => {
      const bytes = new Uint8Array(maximumInputBytes);
      let offset = 0;
      for await (const chunk of process.stdin) {
        const source = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
        const length = Math.min(source.length, bytes.length - offset);
        bytes.set(source.subarray(0, length), offset);
        offset += length;
        if (offset === bytes.length) break;
      }
      return bytes.slice(0, offset);
    },
    catch: () => hostFailure("read-input"),
  });

const write = (
  stream: NodeJS.WritableStream,
  value: Uint8Array | string,
  operation: "write-stdout" | "write-stderr",
): Effect.Effect<void, SurfaceCliHostError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error: Error | null | undefined, removeErrorListener: boolean): void => {
          if (settled) return;
          settled = true;
          if (removeErrorListener) stream.removeListener("error", onError);
          if (error === undefined || error === null) resolve();
          else reject(error);
        };
        const onError = (error: Error): void => finish(error, false);
        stream.once("error", onError);
        stream.write(value, (error?: Error | null) =>
          finish(error, error === undefined || error === null),
        );
      }),
    catch: () => hostFailure(operation),
  });

export const makeProcessSurfaceCliHost = (): SurfaceCliHost => ({
  readInput: (source) => (source === "-" ? readStdinPrefix() : readFilePrefix(source)),
  writeStdout: (bytes) => write(process.stdout, bytes, "write-stdout"),
  writeStderr: (text) => write(process.stderr, text, "write-stderr"),
});
