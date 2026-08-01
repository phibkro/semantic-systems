#!/usr/bin/env bun
import { BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { runSurfaceCli } from "./cli.ts";
import { makeProcessSurfaceCliHost } from "./process-host.ts";

const program = runSurfaceCli(Bun.argv.slice(2), makeProcessSurfaceCliHost()).pipe(
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

BunRuntime.runMain(program);
