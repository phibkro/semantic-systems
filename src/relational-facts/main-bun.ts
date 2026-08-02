#!/usr/bin/env bun
import { BunFileSystem, BunPath, BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";
import { loadProject } from "../project-model/loader.ts";
import { exportRelationalFacts, queryEvidence, queryReachability } from "./index.ts";
import { encodeRelationalFactsReport, makeRelationalFactsReport } from "./report.ts";

const usage = "usage: relational-facts [PROJECT_ROOT]";

const run = (arguments_: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    if (arguments_.length > 1) {
      yield* Console.error(usage);
      return 2;
    }
    const project = yield* loadProject(arguments_[0] ?? ".");
    const bundle = exportRelationalFacts(project);
    if (bundle instanceof Error) {
      yield* Console.error(`${bundle.code}: ${bundle.message}`);
      return 1;
    }
    const incoming = queryReachability(bundle, {
      roots: ["work.stm-runtime"],
      direction: "incoming",
      relationKinds: ["blocks"],
      maximumDepth: 64,
      maximumRows: 10_000,
    });
    if (incoming instanceof Error) {
      yield* Console.error(`${incoming.code}: ${incoming.message}`);
      return 1;
    }
    const evidence = queryEvidence(bundle, "obligation.inventory.conformance");
    if (evidence instanceof Error) {
      yield* Console.error(`${evidence.code}: ${evidence.message}`);
      return 1;
    }
    const report = makeRelationalFactsReport(bundle, incoming, evidence);
    yield* Effect.sync(() => {
      process.stdout.write(encodeRelationalFactsReport(report));
    });
    return 0;
  }).pipe(
    Effect.catch((cause) =>
      Console.error(cause instanceof Error ? cause.message : String(cause)).pipe(Effect.as(1)),
    ),
  );

const program = run(Bun.argv.slice(2)).pipe(
  Effect.provide([BunFileSystem.layer, BunPath.layer]),
  Effect.tap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.asVoid,
);

BunRuntime.runMain(program);
