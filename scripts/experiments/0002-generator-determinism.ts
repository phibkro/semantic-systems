#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Console, Data, Effect } from "effect";
import { runMain } from "../lib/command.ts";

class ExperimentFailure extends Data.TaggedError("ExperimentFailure")<{
  readonly message: string;
}> {}

type Runtime = "bun" | "node";
type FileSnapshot = {
  readonly path: string;
  readonly bytes: Uint8Array;
};
type RunSnapshot = {
  readonly runtime: Runtime;
  readonly trial: number;
  readonly validationStdout: string;
  readonly generationStdout: string;
  readonly files: ReadonlyArray<FileSnapshot>;
};

const root = resolve(import.meta.dirname, "../..");
const decode = new TextDecoder();

const ensure = (condition: boolean, message: string): Effect.Effect<void, ExperimentFailure> =>
  condition ? Effect.void : Effect.fail(new ExperimentFailure({ message }));

const capture = (
  command: ReadonlyArray<string>,
  env: Record<string, string | undefined> = process.env,
): Effect.Effect<{ readonly stdout: string; readonly stderr: string }, ExperimentFailure> =>
  Effect.try({
    try: () => {
      const result = Bun.spawnSync({
        cmd: [...command],
        cwd: root,
        env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = decode.decode(result.stdout);
      const stderr = decode.decode(result.stderr);
      if (result.exitCode !== 0) {
        throw new Error(
          `${command.join(" ")} exited ${result.exitCode}: ${stderr.trim() || stdout.trim()}`,
        );
      }
      return { stdout, stderr };
    },
    catch: (cause) =>
      new ExperimentFailure({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

const snapshotFiles = (
  directory: string,
): Effect.Effect<ReadonlyArray<FileSnapshot>, ExperimentFailure> =>
  Effect.tryPromise({
    try: async () => {
      const walk = async (current: string): Promise<ReadonlyArray<FileSnapshot>> => {
        const entries = await readdir(current, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        const files: FileSnapshot[] = [];
        for (const entry of entries) {
          const path = join(current, entry.name);
          if (entry.isDirectory()) {
            files.push(...(await walk(path)));
          } else if (entry.isFile()) {
            files.push({ path: relative(directory, path), bytes: await readFile(path) });
          } else {
            throw new Error(`generated tree contains unsupported entry ${path}`);
          }
        }
        return files;
      };
      return walk(directory);
    },
    catch: (cause) =>
      new ExperimentFailure({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

const treeMismatch = (expected: RunSnapshot, actual: RunSnapshot): string | undefined => {
  if (expected.validationStdout !== actual.validationStdout) {
    return "validation stdout differs";
  }
  if (expected.generationStdout !== actual.generationStdout) {
    return "generation stdout differs";
  }
  if (expected.files.length !== actual.files.length) {
    return `view count differs (${expected.files.length} != ${actual.files.length})`;
  }
  for (let index = 0; index < expected.files.length; index += 1) {
    const left = expected.files[index]!;
    const right = actual.files[index]!;
    if (left.path !== right.path) return `view path differs (${left.path} != ${right.path})`;
    if (!Buffer.from(left.bytes).equals(Buffer.from(right.bytes))) {
      return `view bytes differ at ${left.path}`;
    }
  }
  return undefined;
};

const treeDigest = (files: ReadonlyArray<FileSnapshot>): string => {
  const hash = createHash("sha256");
  for (const file of files) hash.update(file.path).update("\0").update(file.bytes).update("\0");
  return `sha256:${hash.digest("hex")}`;
};

const program = Effect.scoped(
  Effect.gen(function* () {
    const node = Bun.which("node");
    yield* ensure(node !== null, "RX1 requires a genuine Node executable; run inside nix develop");
    if (node === null) return;

    const nodeIdentity = yield* capture([
      node,
      "--input-type=module",
      "--eval",
      'if (process.release.name !== "node" || typeof globalThis.Bun !== "undefined") process.exit(23); process.stdout.write(process.version);',
    ]);
    yield* ensure(
      nodeIdentity.stderr === "",
      `Node identity probe emitted stderr: ${nodeIdentity.stderr}`,
    );

    const temporaryRoot = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => mkdtemp(join(tmpdir(), "semantic-rx1-")),
        catch: (cause) =>
          new ExperimentFailure({
            message: `cannot create RX1 temporary root: ${cause instanceof Error ? cause.message : String(cause)}`,
          }),
      }),
      (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
    );

    let baseline: RunSnapshot | undefined;
    for (let trial = 1; trial <= 3; trial += 1) {
      for (const runtime of ["bun", "node"] as const) {
        const output = join(temporaryRoot, `${runtime}-${trial}`);
        const executable = runtime === "bun" ? "bun" : node;
        const main = `src/project-model/main-${runtime}.ts`;
        const env = { ...process.env, SEMANTIC_RX1_TRIAL: String(trial) };
        const validation = yield* capture([executable, main, "validate"], env);
        const generation = yield* capture([executable, main, "generate", "--output", output], env);
        yield* ensure(
          validation.stderr === "" && generation.stderr === "",
          `${runtime} trial ${trial} emitted stderr: ${validation.stderr}${generation.stderr}`,
        );
        const files = yield* snapshotFiles(output);
        yield* ensure(
          files.length === 10,
          `${runtime} trial ${trial} generated ${files.length} views, expected 10`,
        );
        const snapshot: RunSnapshot = {
          runtime,
          trial,
          validationStdout: validation.stdout,
          generationStdout: generation.stdout,
          files,
        };
        if (baseline === undefined) {
          baseline = snapshot;
        } else {
          const mismatch = treeMismatch(baseline, snapshot);
          yield* ensure(
            mismatch === undefined,
            `RX1 divergence: bun trial 1 versus ${runtime} trial ${trial}: ${mismatch ?? "unknown"}`,
          );
        }
      }
    }

    if (baseline === undefined) {
      return yield* new ExperimentFailure({ message: "RX1 produced no run snapshot" });
    }
    yield* Console.log(
      `rx1-generator-determinism: node=${nodeIdentity.stdout}; trials=3; views=${baseline.files.length}; digest=${treeDigest(baseline.files)}; result=stable`,
    );
  }),
);

runMain("rx1-generator-determinism", program);
