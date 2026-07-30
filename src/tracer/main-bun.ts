#!/usr/bin/env bun
import { BunCrypto, BunFileSystem, BunPath, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { runTracerCli } from "./cli.ts";

const program = runTracerCli(Bun.argv.slice(2)).pipe(
  Effect.provide([BunCrypto.layer, BunFileSystem.layer, BunPath.layer]),
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

BunRuntime.runMain(program);
