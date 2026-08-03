#!/usr/bin/env bun
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";
import { canonicalStmRuntimeReport } from "./runtime-report.ts";

BunRuntime.runMain(
  canonicalStmRuntimeReport("bun").pipe(
    Effect.flatMap((report) => Console.log(report)),
    Effect.asVoid,
  ),
);
