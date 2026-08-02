#!/usr/bin/env bun
import { encodeExplorationReport, exploreScenario } from "./index.ts";
import { contentionScenario } from "../../examples/stm-schedule-explorer/scenario.ts";

const bytes = encodeExplorationReport(exploreScenario(contentionScenario()));
process.stdout.write(new TextDecoder().decode(bytes));
