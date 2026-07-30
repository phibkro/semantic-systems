import { AST, Diagnostic, Plugin, Rule, RuleContext, Visitor } from "effect-oxlint";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const portableSemanticProgram = (filename: string): boolean => {
  const normalized = filename.replaceAll("\\", "/");
  const inPortableProgram = [
    "/src/project-model/",
    "/src/tracer/",
    "/src/references/",
    "src/project-model/",
    "src/tracer/",
    "src/references/",
  ].some((fragment) => normalized.includes(fragment) || normalized.startsWith(fragment));
  const runtimeAdapter = [
    "/main-bun.ts",
    "/main-node.ts",
    "/references/toml-bun.ts",
    "/references/toml-node.ts",
    "/references/curator-holder.ts",
  ].some((suffix) => normalized.endsWith(suffix));
  return inPortableProgram && !runtimeAdapter;
};

// Project-model has completed the total-function slice. Tracer still contains
// explicitly tracked pure-core throws that must be migrated before this
// stricter rule can be widened without a blanket suppression.
const totalPortableSemanticProgram = (filename: string): boolean => {
  const normalized = filename.replaceAll("\\", "/");
  return (
    portableSemanticProgram(filename) &&
    (normalized.includes("/src/project-model/") || normalized.startsWith("src/project-model/"))
  );
};

const report = (
  ctx: typeof RuleContext.Service,
  node: Parameters<typeof Diagnostic.make>[0]["node"],
  message: string,
) => ctx.report(Diagnostic.make({ node, message }));

export const portableRuntimeImports = Rule.define({
  name: "portable-runtime-imports",
  meta: Rule.meta({
    type: "problem",
    description: "Keep runtime-specific capabilities outside the portable semantic program",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return yield* Visitor.filter(
      portableSemanticProgram,
      Visitor.merge(
        Visitor.on("ImportDeclaration", (node) =>
          Option.isSome(
            AST.matchImport(
              node,
              (source) =>
                source.startsWith("node:") ||
                source === "bun" ||
                source.startsWith("@effect/platform-bun") ||
                source.startsWith("@effect/platform-node"),
            ),
          )
            ? report(
                ctx,
                node,
                "Portable semantic code must request Effect services; provide Bun or Node layers only in main entrypoints",
              )
            : Effect.void,
        ),
        Visitor.on("MemberExpression", (node) => {
          const runtimeGlobal = AST.matchMember(node, "Bun", [
            "argv",
            "env",
            "file",
            "Glob",
            "spawn",
            "spawnSync",
            "write",
          ]).pipe(
            Option.orElse(() =>
              AST.matchMember(node, "process", ["argv", "cwd", "env", "exit", "exitCode"]),
            ),
            Option.orElse(() =>
              AST.matchMember(node, "console", ["debug", "error", "info", "log", "warn"]),
            ),
          );
          return Option.isSome(runtimeGlobal)
            ? report(ctx, node, "Portable semantic code must not use runtime globals directly")
            : Effect.void;
        }),
      ),
    );
  },
});

export const effectRuntimeBoundary = Rule.define({
  name: "effect-runtime-boundary",
  meta: Rule.meta({
    type: "problem",
    description: "Execute Effect programs only at runtime composition entrypoints",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return yield* Visitor.filter(
      portableSemanticProgram,
      Visitor.on("CallExpression", (node) =>
        Option.isSome(
          AST.matchCallOf(node, "Effect", [
            "provide",
            "provideService",
            "provideServiceEffect",
            "runCallback",
            "runFork",
            "runPromise",
            "runPromiseExit",
            "runSync",
            "runSyncExit",
          ]),
        )
          ? report(
              ctx,
              node,
              "Keep Effect programs composable; execute them only in main-bun.ts or main-node.ts",
            )
          : Effect.void,
      ),
    );
  },
});

export const schemaJsonBoundary = Rule.define({
  name: "schema-json-boundary",
  meta: Rule.meta({
    type: "problem",
    description: "Decode external JSON through Effect Schema",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return yield* Visitor.filter(
      portableSemanticProgram,
      Visitor.on("CallExpression", (node) =>
        Option.isSome(AST.matchCallOf(node, "JSON", "parse"))
          ? report(
              ctx,
              node,
              "Use Schema.fromJsonString or Schema.UnknownFromJsonString at external JSON boundaries",
            )
          : Effect.void,
      ),
    );
  },
});

export const typedFailureBoundary = Rule.define({
  name: "typed-failure-boundary",
  meta: Rule.meta({
    type: "problem",
    description: "Keep portable semantic programs total or expose typed Effect failures",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return yield* Visitor.filter(
      totalPortableSemanticProgram,
      Visitor.on("ThrowStatement", (node) =>
        report(
          ctx,
          node,
          "Portable semantic code must return total data or expose a typed Effect failure; do not throw",
        ),
      ),
    );
  },
});

export const ambientNondeterminism = Rule.define({
  name: "ambient-nondeterminism",
  meta: Rule.meta({
    type: "problem",
    description: "Use Effect services for clock, random, and network capabilities",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return yield* Visitor.filter(
      portableSemanticProgram,
      Visitor.merge(
        Visitor.on("CallExpression", (node) => {
          const ambient = AST.matchCallOf(node, "Date", "now").pipe(
            Option.orElse(() => AST.matchCallOf(node, "Math", "random")),
            Option.orElse(() => AST.matchCallOf(node, "crypto", "randomUUID")),
          );
          if (Option.isSome(ambient)) {
            return report(
              ctx,
              node,
              "Use Effect Clock, Random, or Crypto services instead of ambient nondeterminism",
            );
          }
          if (
            node.callee.type === "MemberExpression" &&
            AST.memberPath(node.callee).pipe(
              Option.match({
                onNone: () => false,
                onSome: (path) => path.join(".") === "globalThis.crypto.randomUUID",
              }),
            )
          ) {
            return report(
              ctx,
              node,
              "Use Effect Crypto instead of the ambient Web Crypto capability",
            );
          }
          if (node.callee.type === "Identifier" && node.callee.name === "fetch") {
            return report(
              ctx,
              node,
              "Use Effect HttpClient instead of the ambient fetch capability",
            );
          }
          return Effect.void;
        }),
        Visitor.on("NewExpression", (node) =>
          node.callee.type === "Identifier" &&
          node.callee.name === "Date" &&
          node.arguments.length === 0
            ? report(ctx, node, "Use Effect Clock instead of constructing the ambient current time")
            : Effect.void,
        ),
      ),
    );
  },
});

export default Plugin.define({
  name: "semantic-effect",
  rules: {
    "ambient-nondeterminism": ambientNondeterminism,
    "effect-runtime-boundary": effectRuntimeBoundary,
    "portable-runtime-imports": portableRuntimeImports,
    "schema-json-boundary": schemaJsonBoundary,
    "typed-failure-boundary": typedFailureBoundary,
  },
});
