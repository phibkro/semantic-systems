#!/usr/bin/env bun
/**
 * Idempotently attach Effect's TypeScript-Go diagnostics to the exact native
 * TypeScript 7 compiler. The upstream patch command is intentionally not
 * idempotent, so compare the packaged and installed binaries before invoking
 * it. `--check` is read-only and fails when setup has not been performed.
 */
import { BunRuntime } from "@effect/platform-bun";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Console, Data, Effect } from "effect";

class EffectTsgoSetupError extends Data.TaggedError("EffectTsgoSetupError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const require = createRequire(import.meta.url);
const executableName = process.platform === "win32" ? "tsc.exe" : "tsc";
const platform = `${process.platform}-${process.arch}`;

const resolvePackageDirectory = (name: string) =>
  Effect.try({
    try: () => dirname(require.resolve(`${name}/package.json`)),
    catch: (cause) =>
      new EffectTsgoSetupError({
        message: `effect-tsgo setup: cannot resolve ${name}`,
        cause,
      }),
  });

const digest = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
      return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    },
    catch: (cause) =>
      new EffectTsgoSetupError({
        message: `effect-tsgo setup: cannot hash ${path}`,
        cause,
      }),
  });

const runPatch = (cli: string) =>
  Effect.gen(function* () {
    const child = Bun.spawn({
      cmd: [process.execPath, cli, "patch", "--typescript-package", "typescript"],
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = yield* Effect.tryPromise({
      try: () => child.exited,
      catch: (cause) =>
        new EffectTsgoSetupError({
          message: "effect-tsgo setup: patch process failed",
          cause,
        }),
    });
    if (exitCode !== 0) {
      return yield* new EffectTsgoSetupError({
        message: `effect-tsgo setup: patch exited with status ${exitCode}`,
      });
    }
  });

const setup = (checkOnly: boolean) =>
  Effect.gen(function* () {
    const effectPlatform = yield* resolvePackageDirectory(`@effect/tsgo-${platform}`);
    const typescriptPlatform = yield* resolvePackageDirectory(`@typescript/typescript-${platform}`);
    const effectTsgo = yield* resolvePackageDirectory("@effect/tsgo");
    const source = join(effectPlatform, "lib", executableName);
    const target = join(typescriptPlatform, "lib", executableName);

    if ((yield* digest(source)) === (yield* digest(target))) {
      yield* Console.log("effect-tsgo setup: TypeScript 7 already uses Effect diagnostics");
      return;
    }
    if (checkOnly) {
      return yield* new EffectTsgoSetupError({
        message:
          "effect-tsgo setup: TypeScript 7 is unpatched; run 'bun run effect:setup' after installation",
      });
    }

    yield* runPatch(join(effectTsgo, "dist", "effect-tsgo.js"));
    if ((yield* digest(source)) !== (yield* digest(target))) {
      return yield* new EffectTsgoSetupError({
        message: "effect-tsgo setup: patched compiler does not match the packaged Effect binary",
      });
    }
    yield* Console.log("effect-tsgo setup: TypeScript 7 diagnostics verified");
  });

const program = setup(Bun.argv.slice(2).includes("--check")).pipe(
  Effect.catch((error) =>
    Console.error(error.message).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
);

BunRuntime.runMain(program);
