#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NodeCrypto, NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { mapJsonFixture } from "./report.ts";
import { WitMappingError } from "./schema.ts";

const fixture = resolve(import.meta.dirname, "../../examples/wit-mapping/inventory.input.json");
const program = Effect.tryPromise({
  try: () => readFile(fixture, "utf8"),
  catch: (cause) =>
    new WitMappingError({
      code: "input.read-failed",
      path: fixture,
      message: `cannot read WIT mapping fixture: ${String(cause)}`,
      cause,
    }),
}).pipe(
  Effect.flatMap((source) => mapJsonFixture(source)),
  Effect.flatMap((summary) => Console.log(summary)),
  Effect.provide(NodeCrypto.layer),
);

NodeRuntime.runMain(program);
