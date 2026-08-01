#!/usr/bin/env bun
/**
 * Feature 0043 is the final owner of the frozen feature-0010 migration gate.
 * Importing the accepted program keeps one definition of completion.
 */
import { runMain } from "../lib/command.ts";
import { pythonRemovalAcceptance } from "./0010-typescript-effect-v4-runtime.ts";

runMain("accept/0043", pythonRemovalAcceptance);
