#!/usr/bin/env bun
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Console, Data, Effect, Schema } from "effect";
import { runMain } from "../lib/command.ts";

class ExperimentFailure extends Data.TaggedError("ExperimentFailure")<{
  readonly message: string;
}> {}

const OxlintDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  filename: Schema.String,
  message: Schema.String,
  severity: Schema.String,
});

const OxlintReportSchema = Schema.Struct({
  diagnostics: Schema.Array(OxlintDiagnosticSchema),
  number_of_files: Schema.Finite,
});

const expectedRuleCounts = new Map<string, number>([
  ["semantic-effect(portable-runtime-imports)", 8],
  ["semantic-effect(ambient-console)", 1],
  ["semantic-effect(ambient-nondeterminism)", 9],
  ["semantic-effect(effect-runtime-boundary)", 1],
  ["semantic-effect(schema-json-boundary)", 1],
  ["semantic-effect(typed-failure-boundary)", 1],
]);

const violationSource = `import * as Effect from "effect/Effect";
import { readFile } from "fs/promises";

export * from "node:crypto";
export { sep } from "node:path";

void import("node:child_process");
void require("bun:sqlite");
void globalThis["require"]("node:fs");
void import.meta.require("node:fs");
console.log(globalThis["process"].env["HOME"]);
void globalThis["Date"].now();
void Date();
void globalThis["Date"]();
void globalThis["Math"].random();
void globalThis["performance"].now();
void new globalThis["Date"]();
void globalThis["crypto"].randomUUID();
globalThis["setTimeout"](() => undefined, 1);
void globalThis["fetch"]("https://example.invalid");
void JSON.parse("{}");
Effect.runSync(Effect.void);
void readFile("never");
throw new Error("never executed");
`;

const controlSource = `type LocalServices = {
  readonly process: { readonly env: Readonly<Record<string, string>> };
  readonly globalThis: {
    readonly Date: { readonly now: () => number };
    readonly require: (specifier: string) => unknown;
  };
  readonly require: (specifier: string) => unknown;
  readonly console: { readonly log: (value: unknown) => void };
};

export const useLocalServices = (services: LocalServices): unknown => {
  const { process, globalThis, require, console } = services;
  console.log(process.env["HOME"]);
  void globalThis.Date.now();
  void globalThis.require("fs");
  return require("fs");
};
`;

const root = resolve(import.meta.dirname, "../..");
const decoder = new TextDecoder();

const ensure = (condition: boolean, message: string): Effect.Effect<void, ExperimentFailure> =>
  condition ? Effect.void : Effect.fail(new ExperimentFailure({ message }));

const writeFixture = (path: string, source: string): Effect.Effect<void, ExperimentFailure> =>
  Effect.tryPromise({
    try: () => writeFile(path, source, "utf8"),
    catch: (cause) =>
      new ExperimentFailure({
        message: `cannot write ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });

const program = Effect.scoped(
  Effect.gen(function* () {
    const temporaryRoot = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => mkdtemp(join(tmpdir(), "semantic-rx3-capability-wall-")),
        catch: (cause) =>
          new ExperimentFailure({
            message: `cannot create RX3 fixture: ${cause instanceof Error ? cause.message : String(cause)}`,
          }),
      }),
      (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
    );
    const violationTarget = "src/project-model/rx3-violation.ts";
    const controlTarget = "src/project-model/rx3-local-services.ts";
    const violationPath = resolve(temporaryRoot, violationTarget);
    const controlPath = resolve(temporaryRoot, controlTarget);
    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(resolve(temporaryRoot, "scripts/oxlint"), { recursive: true });
        await mkdir(resolve(temporaryRoot, "src/project-model"), { recursive: true });
        await mkdir(resolve(temporaryRoot, "src/stm"), { recursive: true });
        await copyFile(resolve(root, ".oxlintrc.json"), resolve(temporaryRoot, ".oxlintrc.json"));
        await copyFile(
          resolve(root, "scripts/oxlint/semantic-effect-rules.ts"),
          resolve(temporaryRoot, "scripts/oxlint/semantic-effect-rules.ts"),
        );
        for (const name of ["runtime-main-bun.ts", "runtime-main-node.ts", "runtime-report.ts"]) {
          await copyFile(resolve(root, "src/stm", name), resolve(temporaryRoot, "src/stm", name));
        }
        await symlink(resolve(root, "node_modules"), resolve(temporaryRoot, "node_modules"), "dir");
      },
      catch: (cause) =>
        new ExperimentFailure({
          message: `cannot prepare RX3 fixture tree: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    });
    yield* writeFixture(violationPath, violationSource);
    yield* writeFixture(controlPath, controlSource);

    const oxlint = resolve(root, "node_modules/.bin/oxlint");
    const targets = [
      violationTarget,
      controlTarget,
      "src/stm/runtime-main-bun.ts",
      "src/stm/runtime-main-node.ts",
    ];
    const result = yield* Effect.try({
      try: () =>
        Bun.spawnSync({
          cmd: [
            oxlint,
            "--config",
            ".oxlintrc.json",
            "--format",
            "json",
            "--threads",
            "1",
            ...targets,
          ],
          cwd: temporaryRoot,
          env: process.env,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        }),
      catch: (cause) =>
        new ExperimentFailure({
          message: `cannot run configured Oxlint: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    });
    const stdout = decoder.decode(result.stdout);
    const stderr = decoder.decode(result.stderr);
    yield* ensure(
      result.exitCode === 1,
      `Oxlint exited ${result.exitCode}, expected diagnostic exit 1`,
    );
    yield* ensure(stderr === "", `Oxlint emitted stderr: ${stderr.trim()}`);

    const report = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(stdout).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(OxlintReportSchema)),
      Effect.mapError(
        (cause) =>
          new ExperimentFailure({ message: `cannot decode Oxlint JSON report: ${String(cause)}` }),
      ),
    );
    yield* ensure(
      report.number_of_files === targets.length,
      "Oxlint did not inspect all RX3 targets",
    );

    const semanticDiagnostics = report.diagnostics.filter((diagnostic) =>
      diagnostic.code.startsWith("semantic-effect("),
    );
    yield* ensure(
      semanticDiagnostics.every((diagnostic) => diagnostic.filename === violationTarget),
      "a local-service or registered-adapter control emitted a semantic-effect diagnostic",
    );
    const observedRuleCounts = new Map<string, number>();
    for (const diagnostic of semanticDiagnostics) {
      observedRuleCounts.set(diagnostic.code, (observedRuleCounts.get(diagnostic.code) ?? 0) + 1);
    }
    yield* ensure(
      observedRuleCounts.size === expectedRuleCounts.size &&
        [...expectedRuleCounts].every(([code, count]) => observedRuleCounts.get(code) === count),
      `unexpected semantic diagnostic counts: ${JSON.stringify(Object.fromEntries(observedRuleCounts))}`,
    );

    yield* Console.log(
      `rx3-capability-wall: files=${targets.length}; semantic-diagnostics=${semanticDiagnostics.length}; rules=${expectedRuleCounts.size}; result=enforced`,
    );
  }),
);

runMain("rx3-capability-wall", program);
