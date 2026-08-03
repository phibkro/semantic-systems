#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { canonicalStmRuntimeReport } from "./runtime-report.ts";

NodeRuntime.runMain(
  canonicalStmRuntimeReport("node").pipe(
    Effect.flatMap((report) => Console.log(report)),
    Effect.asVoid,
  ),
);
