#!/usr/bin/env bun
import {
  BunChildProcessSpawner,
  BunCrypto,
  BunFileSystem,
  BunPath,
  BunRuntime,
} from "@effect/platform-bun";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { runSemrefs } from "./cli.ts";
import { CuratorProcess, makeCuratorProcess } from "./curator.ts";
import { GitEnvironment, makeGitEnvironment } from "./git.ts";
import { layer as BunTomlParser } from "./toml-bun.ts";

const ChildProcessLayer = BunChildProcessSpawner.layer.pipe(
  Layer.provide([BunFileSystem.layer, BunPath.layer]),
);
const CuratorProcessLayer = Layer.succeed(
  CuratorProcess,
  makeCuratorProcess(process.env, process.execPath, [
    fileURLToPath(new URL("./curator-holder.ts", import.meta.url)),
  ]),
);
const GitEnvironmentLayer = Layer.succeed(GitEnvironment, makeGitEnvironment(process.env));

const program = runSemrefs(Bun.argv.slice(2)).pipe(
  Effect.provide([BunCrypto.layer, BunFileSystem.layer, BunPath.layer, BunTomlParser]),
  Effect.provide([ChildProcessLayer, CuratorProcessLayer, GitEnvironmentLayer]),
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

BunRuntime.runMain(program);
