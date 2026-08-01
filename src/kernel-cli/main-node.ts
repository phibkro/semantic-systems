#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { runKernelCli } from "./cli.ts";
import { makeProcessKernelCliHost } from "./process-host.ts";

const program = runKernelCli(process.argv.slice(2), makeProcessKernelCliHost()).pipe(
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

NodeRuntime.runMain(program);
