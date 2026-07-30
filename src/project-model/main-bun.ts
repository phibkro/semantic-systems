#!/usr/bin/env bun
import { BunFileSystem, BunPath, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { runSemproj } from "./cli.ts";

const program = runSemproj(Bun.argv.slice(2)).pipe(
  Effect.provide([BunFileSystem.layer, BunPath.layer]),
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

BunRuntime.runMain(program);
