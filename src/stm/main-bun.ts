#!/usr/bin/env bun
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";
import { canonicalStmLawReport } from "./report.ts";

BunRuntime.runMain(Console.log(canonicalStmLawReport("bun")).pipe(Effect.asVoid));
