#!/usr/bin/env bun
// oxlint-disable-next-line semantic-effect/portable-runtime-imports -- this executable is the Bun platform composition boundary.
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";
import { canonicalStmRuntimeReport } from "./runtime-report.ts";

BunRuntime.runMain(
  canonicalStmRuntimeReport("bun").pipe(
    Effect.flatMap((report) => Console.log(report)),
    Effect.asVoid,
  ),
);
