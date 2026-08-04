#!/usr/bin/env bun
import { dirname, relative, resolve } from "node:path";
import { Data, Effect, Schema } from "effect";
import { canonicalJson } from "../../src/tracer/canonical.ts";
import type { JsonObject } from "../../src/tracer/json.ts";
import { runCommand, runMain } from "../../scripts/lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

const requiredFiles = [
  "src/stm/runtime.ts",
  "src/stm/runtime-report.ts",
  "src/stm/runtime-main-bun.ts",
  "src/stm/runtime-main-node.ts",
  "tests/stm-runtime.test.ts",
] as const;

const requireRuntimeArtifacts = Effect.gen(function* () {
  for (const artifactPath of requiredFiles) {
    if (!(yield* Effect.promise(() => Bun.file(resolve(root, artifactPath)).exists()))) {
      return yield* new AcceptanceFailure({
        message: `missing bounded STM runtime artifact: ${artifactPath}`,
      });
    }
  }
});

const capture = (command: ReadonlyArray<string>): Effect.Effect<string, AcceptanceFailure> =>
  Effect.gen(function* () {
    const child = yield* Effect.sync(() =>
      Bun.spawn([...command], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      }),
    );
    const stdout = yield* Effect.promise(() => new Response(child.stdout).text());
    const stderr = yield* Effect.promise(() => new Response(child.stderr).text());
    const exitCode = yield* Effect.promise(() => child.exited);
    if (exitCode !== 0) {
      return yield* new AcceptanceFailure({
        message: `${command.join(" ")} exited ${exitCode}\n${stderr}`,
      });
    }
    return stdout.trim();
  });

const decodeReport = (text: string) =>
  Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
    Effect.flatMap((value) =>
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? Effect.succeed(value as JsonObject)
        : Effect.fail(
            new AcceptanceFailure({ message: "bounded STM runtime report must be an object" }),
          ),
    ),
    Effect.mapError((cause) =>
      cause instanceof AcceptanceFailure
        ? cause
        : new AcceptanceFailure({
            message: `invalid bounded STM runtime report: ${cause.message}`,
          }),
    ),
  );

const importsOf = (source: string): ReadonlyArray<string> => {
  const imports: string[] = [];
  const pattern =
    /(?:\b(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\sfrom\s*)?|\bimport\s*\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1] !== undefined) imports.push(match[1]);
  }
  return imports;
};

const ambientAuthority = (source: string): string | undefined => {
  const forbidden = [
    ["timer or polling authority", /\b(?:setTimeout|setInterval)\s*\(/],
    ["Bun runtime global", /\bBun\s*\./],
    ["process runtime global", /\bprocess\s*\./],
    ["ambient clock", /\bDate\s*\.\s*now\s*\(|\bnew\s+Date\s*\(\s*\)/],
    ["ambient random", /\bMath\s*\.\s*random\s*\(/],
    [
      "ambient crypto",
      /\bcrypto\s*\.\s*(?:randomUUID|getRandomValues)\s*\(|\bglobalThis\s*\.\s*crypto\b/,
    ],
    ["ambient fetch", /\b(?:globalThis\s*\.\s*)?fetch\s*\(/],
    ["ambient console", /\b(?:globalThis\s*\.\s*)?console\s*\./],
    ["native Promise", /\b(?:new\s+)?Promise\s*[.(]/],
  ] as const;
  return forbidden.find(([, pattern]) => pattern.test(source))?.[0];
};

const portableClosure = (): Effect.Effect<ReadonlyArray<string>, AcceptanceFailure> =>
  Effect.gen(function* () {
    const pending = ["src/stm/runtime.ts", "src/stm/runtime-report.ts"];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const repositoryPath = pending.pop()!;
      if (visited.has(repositoryPath)) continue;
      visited.add(repositoryPath);
      const absolute = resolve(root, repositoryPath);
      const source = yield* Effect.tryPromise({
        try: () => Bun.file(absolute).text(),
        catch: (cause) =>
          new AcceptanceFailure({
            message: `cannot inspect portable STM runtime source ${repositoryPath}: ${String(cause)}`,
          }),
      });
      if (
        (repositoryPath === "src/stm/runtime.ts" ||
          repositoryPath === "src/stm/runtime-report.ts") &&
        /\bEffect\s*\.\s*(?:tx|txRetry)\b|\bTxRef\b/.test(source)
      ) {
        return yield* new AcceptanceFailure({
          message: `portable STM runtime source uses an unapproved transaction primitive: ${repositoryPath}`,
        });
      }
      const authority = ambientAuthority(source);
      if (authority !== undefined) {
        return yield* new AcceptanceFailure({
          message: `portable STM runtime closure reaches ${authority} in ${repositoryPath}`,
        });
      }
      for (const specifier of importsOf(source)) {
        if (specifier === "effect" || specifier.startsWith("effect/")) continue;
        if (!specifier.startsWith(".")) {
          return yield* new AcceptanceFailure({
            message: `portable STM runtime closure reaches external import '${specifier}' from ${repositoryPath}`,
          });
        }
        const resolved = resolve(dirname(absolute), specifier);
        const relativePath = relative(root, resolved).replaceAll("\\", "/");
        if (relativePath.startsWith("../") || relativePath === "..") {
          return yield* new AcceptanceFailure({
            message: `portable STM runtime import escapes repository: ${repositoryPath} -> ${specifier}`,
          });
        }
        pending.push(relativePath);
      }
    }
    return [...visited].sort();
  });

const normalizeRuntime = (report: JsonObject): JsonObject => ({
  ...report,
  runtime_layer: "normalized",
});

const program = Effect.gen(function* () {
  yield* requireRuntimeArtifacts;
  for (const command of [
    ["bun", "test", "tests/stm-runtime.test.ts", "tests/stm-laws.test.ts"],

    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/stm/runtime.ts",
      "src/stm/runtime-report.ts",
      "src/stm/runtime-main-bun.ts",
      "src/stm/runtime-main-node.ts",
      "tests/stm-runtime.test.ts",
      "features/0050-bounded-stm-runtime/accept.ts",
      "generated/project-model/work-features.json",
      "features/0050-bounded-stm-runtime/spec.md",
      "features/0050-bounded-stm-runtime/plan.md",
    ],
    ["bun", "features/0014-stm-effect-handler-laws/accept.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }
  const closure = yield* portableClosure();
  if (
    !closure.includes("src/stm/runtime.ts") ||
    !closure.includes("src/stm/runtime-report.ts") ||
    !closure.includes("src/stm/model.ts") ||
    closure.some((path) => /runtime-main-(bun|node)\.ts$/.test(path))
  ) {
    return yield* new AcceptanceFailure({
      message: `invalid portable STM runtime closure: ${closure.join(", ")}`,
    });
  }

  const bun = yield* decodeReport(yield* capture(["bun", "src/stm/runtime-main-bun.ts"]));
  const node = yield* decodeReport(
    yield* capture([nodeExecutable, "src/stm/runtime-main-node.ts"]),
  );
  if (bun.runtime_layer !== "bun" || node.runtime_layer !== "node") {
    return yield* new AcceptanceFailure({
      message: "bounded STM runtime reports hide their authored runtime layer",
    });
  }
  if (canonicalJson(normalizeRuntime(bun)) !== canonicalJson(normalizeRuntime(node))) {
    return yield* new AcceptanceFailure({
      message: "Bun and Node bounded STM reports differ after runtime-layer normalization",
    });
  }
  const observations = bun.observations;
  if (
    !Array.isArray(observations) ||
    observations.length === 0 ||
    !observations.every(
      (observation) =>
        typeof observation === "object" &&
        observation !== null &&
        !Array.isArray(observation) &&
        observation.catches_counterexample === true,
    )
  ) {
    return yield* new AcceptanceFailure({
      message: "bounded STM runtime report contains an absent or failed counterexample oracle",
    });
  }
});

runMain("accept/0050", program);
