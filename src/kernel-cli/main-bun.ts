#!/usr/bin/env bun
import { BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { runKernelCli } from "./cli.ts";
import { makeProcessKernelCliHost } from "./process-host.ts";

const program = runKernelCli(Bun.argv.slice(2), makeProcessKernelCliHost()).pipe(
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

BunRuntime.runMain(program);
