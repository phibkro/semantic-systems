#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { runSurfaceCli } from "./cli.ts";
import { makeProcessSurfaceCliHost } from "./process-host.ts";

const program = runSurfaceCli(process.argv.slice(2), makeProcessSurfaceCliHost()).pipe(
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

NodeRuntime.runMain(program);
