#!/usr/bin/env node
import {
  NodeChildProcessSpawner,
  NodeCrypto,
  NodeFileSystem,
  NodePath,
  NodeRuntime,
} from "@effect/platform-node";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { runSemrefs } from "./cli.ts";
import { CuratorProcess, makeCuratorProcess } from "./curator.ts";
import { GitEnvironment, makeGitEnvironment } from "./git.ts";
import { layer as NodeTomlParser } from "./toml-node.ts";

const ChildProcessLayer = NodeChildProcessSpawner.layer.pipe(
  Layer.provide([NodeFileSystem.layer, NodePath.layer]),
);
const CuratorProcessLayer = Layer.succeed(
  CuratorProcess,
  makeCuratorProcess(process.env, process.execPath, [
    fileURLToPath(new URL("./curator-holder.ts", import.meta.url)),
  ]),
);
const GitEnvironmentLayer = Layer.succeed(GitEnvironment, makeGitEnvironment(process.env));

const program = runSemrefs(process.argv.slice(2)).pipe(
  Effect.provide([NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer, NodeTomlParser]),
  Effect.provide([ChildProcessLayer, CuratorProcessLayer, GitEnvironmentLayer]),
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

NodeRuntime.runMain(program);
