#!/usr/bin/env bun
import { BunCrypto, BunFileSystem, BunPath, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { runSemrefs } from "./cli.ts";
import { layer as BunTomlParser } from "./toml-bun.ts";

const program = runSemrefs(Bun.argv.slice(2)).pipe(
  Effect.provide([BunCrypto.layer, BunFileSystem.layer, BunPath.layer, BunTomlParser]),
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

BunRuntime.runMain(program);
