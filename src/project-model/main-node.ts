#!/usr/bin/env node
import { NodeCrypto, NodeFileSystem, NodePath, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { runSemproj } from "./cli.ts";

const program = runSemproj(process.argv.slice(2)).pipe(
  Effect.provide([NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer]),
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

NodeRuntime.runMain(program);
