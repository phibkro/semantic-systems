#!/usr/bin/env bun
/**
 * Feature 0048 owns the acceptance-lineage correction for frozen feature 0021.
 * Importing the accepted program keeps one definition of product completion.
 */
import { runMain } from "../../scripts/lib/command.ts";
import { portfolioControlRoomAcceptance } from "../0021-pbk-portfolio-control-room/accept.ts";

runMain("accept/0048", portfolioControlRoomAcceptance);
