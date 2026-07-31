#!/usr/bin/env node
import { NodeCrypto, NodeFileSystem, NodePath, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { runActorCli } from "./cli.ts";

const program = runActorCli(process.argv.slice(2), "node").pipe(
  Effect.provide([NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer]),
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

NodeRuntime.runMain(program);
