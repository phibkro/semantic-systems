#!/usr/bin/env node
import { NodeCrypto, NodeFileSystem, NodePath, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { runSemrefs } from "./cli.ts";
import { layer as NodeTomlParser } from "./toml-node.ts";

const program = runSemrefs(process.argv.slice(2)).pipe(
  Effect.provide([NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer, NodeTomlParser]),
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

NodeRuntime.runMain(program);
