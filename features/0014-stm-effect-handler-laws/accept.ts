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

const requireArtifact = (path: string, label: string) =>
  Effect.promise(() => Bun.file(resolve(root, path)).exists()).pipe(
    Effect.flatMap((exists) =>
      exists
        ? Effect.void
        : Effect.fail(new AcceptanceFailure({ message: `missing ${label}: ${path}` })),
    ),
  );

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
        : Effect.fail(new AcceptanceFailure({ message: "STM report must be a JSON object" })),
    ),
    Effect.mapError((cause) =>
      cause instanceof AcceptanceFailure
        ? cause
        : new AcceptanceFailure({ message: `invalid STM report: ${cause.message}` }),
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
    const pending = ["src/stm/model.ts", "src/stm/report.ts"];
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
            message: `cannot inspect portable STM source ${repositoryPath}: ${String(cause)}`,
          }),
      });
      const authority = ambientAuthority(source);
      if (authority !== undefined) {
        return yield* new AcceptanceFailure({
          message: `portable STM closure reaches ${authority} in ${repositoryPath}`,
        });
      }
      for (const specifier of importsOf(source)) {
        if (specifier === "effect" || specifier.startsWith("effect/")) continue;
        if (!specifier.startsWith(".")) {
          return yield* new AcceptanceFailure({
            message: `portable STM closure reaches external import '${specifier}' from ${repositoryPath}`,
          });
        }
        const resolved = resolve(dirname(absolute), specifier);
        const relativePath = relative(root, resolved).replaceAll("\\", "/");
        if (relativePath.startsWith("../") || relativePath === "..") {
          return yield* new AcceptanceFailure({
            message: `portable STM import escapes repository: ${repositoryPath} -> ${specifier}`,
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
  yield* requireArtifact("src/stm/model.ts", "pure STM reference model");
  yield* requireArtifact("src/stm/report.ts", "bounded STM report");
  yield* requireArtifact("tests/stm-laws.test.ts", "dedicated STM law oracle");

  for (const command of [
    ["bun", "test", "tests/stm-laws.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/stm",
      "tests/stm-laws.test.ts",
      "features/0014-stm-effect-handler-laws/accept.ts",
    ],
    ["bun", "test", "tests/inventory-tracer.test.ts", "tests/actor-runtime.test.ts"],
    ["bun", "test", "tests/semantic-effect-rules.test.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }

  const closure = yield* portableClosure();
  if (
    !closure.includes("src/stm/model.ts") ||
    closure.some((path) => /main-(bun|node)/.test(path))
  ) {
    return yield* new AcceptanceFailure({
      message: `invalid portable STM closure: ${closure.join(", ")}`,
    });
  }

  const bun = yield* decodeReport(yield* capture(["bun", "src/stm/main-bun.ts"]));
  const node = yield* decodeReport(yield* capture([nodeExecutable, "src/stm/main-node.ts"]));
  if (canonicalJson(normalizeRuntime(bun)) !== canonicalJson(normalizeRuntime(node))) {
    return yield* new AcceptanceFailure({
      message: "Bun and Node STM reports differ after runtime-layer normalization",
    });
  }
  if (
    typeof bun.bounds !== "object" ||
    bun.bounds === null ||
    typeof bun.evidence !== "object" ||
    bun.evidence === null ||
    !Array.isArray(bun.unsupported_guarantees)
  ) {
    return yield* new AcceptanceFailure({
      message: "STM report hides its bounds, evidence, or unsupported guarantees",
    });
  }
});

runMain("accept/0014", program);
