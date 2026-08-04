#!/usr/bin/env bun
import { Data, Effect } from "effect";
import { runMain } from "./lib/command.ts";
import { runWorkflow } from "./workflow-adapter.ts";
class WorkflowCommandError extends Data.TaggedError("WorkflowCommandError")<{
  readonly message: string;
}> {}

const requested = Bun.argv[2] ?? "check";
const featureId = Bun.argv[3] === "" ? undefined : Bun.argv[3];
const program =
  requested === "setup" || requested === "check" || requested === "verify" || requested === "start"
    ? runWorkflow(
        requested,
        requested === "start" || requested === "verify" ? featureId : undefined,
      )
    : Effect.fail(new WorkflowCommandError({ message: `unknown workflow command ${requested}` }));

runMain(`workflow:${requested}`, program);
