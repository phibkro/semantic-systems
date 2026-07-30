#!/usr/bin/env bun
import { dirname, relative, resolve } from "node:path";
import { Data, Effect, Schema } from "effect";
import { canonicalJson } from "../../src/tracer/canonical.ts";
import type { JsonObject } from "../../src/tracer/json.ts";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const scenario = "examples/inventory/scenarios/demo.json";
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";

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

const importsOf = (source: string): ReadonlyArray<string> => {
  const imports: string[] = [];
  const pattern =
    /(?:\b(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\sfrom\s*)?|\bimport\s*\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1] !== undefined) imports.push(match[1]);
  }
  return imports;
};

const actorPortableClosure = (): Effect.Effect<ReadonlyArray<string>, AcceptanceFailure> =>
  Effect.gen(function* () {
    const pending = [
      "src/actor/runtime.ts",
      "src/actor/inventory.ts",
      "src/actor/journey.ts",
      "src/actor/cli.ts",
    ];
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
            message: `cannot inspect actor portable import ${repositoryPath}: ${String(cause)}`,
          }),
      });
      if (/\b(?:Bun|process)\s*\./.test(source)) {
        return yield* new AcceptanceFailure({
          message: `portable actor closure reaches an ambient runtime global in ${repositoryPath}`,
        });
      }
      for (const specifier of importsOf(source)) {
        if (specifier === "effect" || specifier.startsWith("effect/")) continue;
        if (!specifier.startsWith(".")) {
          return yield* new AcceptanceFailure({
            message: `portable actor closure reaches external import '${specifier}' from ${repositoryPath}`,
          });
        }
        const resolved = resolve(dirname(absolute), specifier);
        const relativePath = relative(root, resolved).replaceAll("\\", "/");
        if (relativePath.startsWith("../") || relativePath === "..") {
          return yield* new AcceptanceFailure({
            message: `portable actor import escapes repository: ${repositoryPath} -> ${specifier}`,
          });
        }
        pending.push(relativePath);
      }
    }
    return [...visited].sort();
  });

const decodeObservation = (text: string) =>
  Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
    Effect.flatMap((value) =>
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? Effect.succeed(value as JsonObject)
        : Effect.fail(
            new AcceptanceFailure({ message: "actor observation must be a JSON object" }),
          ),
    ),
    Effect.mapError((cause) =>
      cause instanceof AcceptanceFailure
        ? cause
        : new AcceptanceFailure({ message: `invalid actor observation: ${cause.message}` }),
    ),
  );

const normalizeRuntime = (observation: JsonObject): JsonObject => ({
  ...observation,
  runtime_layer: "normalized",
});

const program = Effect.gen(function* () {
  for (const command of [
    ["bun", "test", "tests/actor-runtime.test.ts"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "lint"],
    [
      "bunx",
      "oxfmt",
      "--check",
      "src/actor",
      "tests/actor-runtime.test.ts",
      "scripts/accept/0012-minimal-actor-runtime.ts",
    ],
    ["bun", "test", "tests/inventory-tracer.test.ts"],
    ["bun", "test", "tests/semantic-effect-rules.test.ts"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }

  const closure = yield* actorPortableClosure();
  if (
    !closure.includes("src/actor/runtime.ts") ||
    closure.some((path) => /main-(bun|node)/.test(path))
  ) {
    return yield* new AcceptanceFailure({
      message: `invalid portable actor closure: ${closure.join(", ")}`,
    });
  }

  const bun = yield* decodeObservation(yield* capture(["bun", "src/actor/main-bun.ts", scenario]));
  const node = yield* decodeObservation(
    yield* capture([nodeExecutable, "src/actor/main-node.ts", scenario]),
  );
  if (canonicalJson(normalizeRuntime(bun)) !== canonicalJson(normalizeRuntime(node))) {
    return yield* new AcceptanceFailure({
      message: "Bun and Node actor observations differ after runtime-layer normalization",
    });
  }
  if (bun.events_equal !== true || bun.final_state_equal !== true) {
    return yield* new AcceptanceFailure({
      message: "actor observation does not match the pure inventory oracle",
    });
  }
  const unsupported = bun.unsupported_guarantees;
  if (
    !Array.isArray(unsupported) ||
    !unsupported.includes("durable delivery") ||
    !unsupported.includes("formal ownership proof")
  ) {
    return yield* new AcceptanceFailure({
      message: "actor observation hides required unsupported guarantees",
    });
  }
});

runMain("accept/0012", program);
