#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { canonicalStmLawReport } from "./report.ts";

NodeRuntime.runMain(Console.log(canonicalStmLawReport("node")).pipe(Effect.asVoid));
