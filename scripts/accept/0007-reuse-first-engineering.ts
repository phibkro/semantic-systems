#!/usr/bin/env bun
import { resolve } from "node:path";
import { Console, Data, Effect } from "effect";
import { runMain } from "../lib/command.ts";

class ClauseMissing extends Data.TaggedError("ClauseMissing")<{
  readonly clause: string;
}> {
  override get message(): string {
    return `accept/0007: required delegation clause is missing: ${this.clause}`;
  }
}

class AgentMapReadError extends Data.TaggedError("AgentMapReadError")<{
  readonly path: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `accept/0007: cannot read ${this.path}: ${String(this.cause)}`;
  }
}

const root = resolve(import.meta.dirname, "../..");
const agentMap = resolve(root, process.env.REUSE_FIRST_AGENT_MAP ?? "AGENTS.md");
const clauses = [
  "Work like a lazy senior engineer",
  "Reuse or adapt license-compatible upstream code and techniques",
  "Automate deterministic, bounded, repeatable work",
  "Stop automating when it becomes an unbounded side quest",
  "Report which scaffold, command, dependency, or prior art was evaluated",
] as const;

const program = Effect.gen(function* () {
  const contents = yield* Effect.tryPromise({
    try: () => Bun.file(agentMap).text(),
    catch: (cause) => new AgentMapReadError({ path: agentMap, cause }),
  });
  for (const clause of clauses) {
    if (!contents.includes(clause)) return yield* new ClauseMissing({ clause });
  }
  yield* Console.log("accept/0007: all reuse-first delegation clauses are present");
});

runMain("accept/0007", program);
