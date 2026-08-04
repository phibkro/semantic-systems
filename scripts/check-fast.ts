#!/usr/bin/env bun
import { runMain } from "./lib/command.ts";
import { runHookObservation } from "./workflow-adapter.ts";

runMain("workflow:hook-observe", runHookObservation);
