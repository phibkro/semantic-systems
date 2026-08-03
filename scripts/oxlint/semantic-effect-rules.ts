import { isAbsolute, relative, resolve, sep } from "node:path";
import { AST, Diagnostic, Plugin, Rule, RuleContext, Visitor } from "effect-oxlint";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

const repositoryRoot = resolve(import.meta.dirname, "../..");
export const semanticSourceExtensions = Object.freeze([".ts", ".tsx", ".mts", ".cts"] as const);

const isTypeScriptSourcePath = (path: string): boolean =>
  semanticSourceExtensions.some((extension) => path.endsWith(extension));

export type AdapterException = Readonly<{
  readonly pathPattern: string;
  readonly capabilityOwner: string;
  readonly reason: string;
}>;

const adapterException = (
  pathPattern: string,
  capabilityOwner: string,
  reason: string,
): AdapterException => Object.freeze({ pathPattern, capabilityOwner, reason });

/**
 * Runtime authority is admitted only at these explicitly named composition
 * boundaries. Every other current TypeScript source under src/ is portable.
 */
export const adapterExceptionRegister = Object.freeze([
  adapterException(
    "src/project-model/main-bun.ts",
    "Bun project-model runtime",
    "Composes Bun FileSystem and Path layers and owns the Bun process exit boundary.",
  ),
  adapterException(
    "src/project-model/main-node.ts",
    "Node project-model runtime",
    "Composes Node FileSystem and Path layers and owns the Node process exit boundary.",
  ),
  adapterException(
    "src/wit-mapping/main-bun.ts",
    "Bun WIT-mapping fixture runner",
    "Reads the fixture through Node-compatible file access and executes the Bun runtime.",
  ),
  adapterException(
    "src/wit-mapping/main-node.ts",
    "Node WIT-mapping fixture runner",
    "Reads the fixture through Node file access and executes the Node runtime.",
  ),
  adapterException(
    "src/relational-facts/main-bun.ts",
    "Bun relational-facts runtime",
    "Composes Bun FileSystem and Path layers and writes the report at the process boundary.",
  ),
  adapterException(
    "src/relational-facts/main-node.ts",
    "Node relational-facts runtime",
    "Composes Node FileSystem and Path layers and writes the report at the process boundary.",
  ),
  adapterException(
    "src/stm-explorer/main-bun.ts",
    "Bun STM explorer runtime",
    "Writes the generated exploration report through the Bun process output boundary.",
  ),
  adapterException(
    "src/stm-explorer/main-node.ts",
    "Node STM explorer runtime",
    "Writes the generated exploration report through the Node process output boundary.",
  ),
  adapterException(
    "src/stm/main-bun.ts",
    "Bun STM law runtime",
    "Selects the Bun runtime and executes the STM law report at the composition boundary.",
  ),
  adapterException(
    "src/stm/main-node.ts",
    "Node STM law runtime",
    "Selects the Node runtime and executes the STM law report at the composition boundary.",
  ),
  adapterException(
    "src/stm/runtime-main-bun.ts",
    "Bun STM runtime report",
    "Selects the Bun platform layer and executes the live STM runtime report.",
  ),
  adapterException(
    "src/stm/runtime-main-node.ts",
    "Node STM runtime report",
    "Selects the Node platform layer and executes the live STM runtime report.",
  ),
  adapterException(
    "src/actor/main-bun.ts",
    "Bun actor runtime",
    "Composes Bun actor platform layers and owns the Bun process exit boundary.",
  ),
  adapterException(
    "src/actor/main-node.ts",
    "Node actor runtime",
    "Composes Node actor platform layers and owns the Node process exit boundary.",
  ),
  adapterException(
    "src/references/main-bun.ts",
    "Bun reference-custody runtime",
    "Composes Bun filesystem, process, TOML, and Git environment capabilities.",
  ),
  adapterException(
    "src/references/main-node.ts",
    "Node reference-custody runtime",
    "Composes Node filesystem, process, TOML, and Git environment capabilities.",
  ),
  adapterException(
    "src/references/curator-holder.ts",
    "Reference curator child process",
    "Is the platform-specific flock child process that owns signals, argv, and its readiness file.",
  ),
  adapterException(
    "src/references/toml-bun.ts",
    "Bun TOML parser layer",
    "Provides Bun.TOML as the live TOML capability selected by the Bun entrypoint.",
  ),
  adapterException(
    "src/references/toml-node.ts",
    "Node TOML parser layer",
    "Provides the Node-only TOML package as the live parser selected by the Node entrypoint.",
  ),
  adapterException(
    "src/tracer/main-bun.ts",
    "Bun tracer runtime",
    "Composes Bun tracer platform layers and owns the Bun process exit boundary.",
  ),
  adapterException(
    "src/tracer/main-node.ts",
    "Node tracer runtime",
    "Composes Node tracer platform layers and owns the Node process exit boundary.",
  ),
] as const);

const sourcePath = (filename: string): string => {
  const normalized = filename.replaceAll("\\", "/");
  const absolute = isAbsolute(filename) ? resolve(filename) : resolve(repositoryRoot, filename);
  const repositoryPath = relative(repositoryRoot, absolute);
  if (
    repositoryPath === ".." ||
    repositoryPath.startsWith(`..${sep}`) ||
    isAbsolute(repositoryPath)
  ) {
    return normalized;
  }
  return repositoryPath.replaceAll("\\", "/");
};

const adapterExceptionForPath = (path: string): AdapterException | undefined =>
  adapterExceptionRegister.find((exception) => exception.pathPattern === path);

export const adapterExceptionFor = (filename: string): AdapterException | undefined =>
  adapterExceptionForPath(sourcePath(filename));

export type SemanticSourceClassification = "portable" | "adapter" | "outside-src";

export const classifySourcePath = (filename: string): SemanticSourceClassification => {
  const normalized = sourcePath(filename);
  if (!normalized.startsWith("src/") || !isTypeScriptSourcePath(normalized)) {
    return "outside-src";
  }
  return adapterExceptionForPath(normalized) === undefined ? "portable" : "adapter";
};

const normalizedCoreProgram = (filename: string): boolean =>
  sourcePath(filename).startsWith("src/normalized-core/");

const portableSemanticProgram = (filename: string): boolean =>
  classifySourcePath(filename) === "portable";

const schemaBoundaryRoots = [
  "src/project-model/",
  "src/tracer/",
  "src/references/",
  "src/actor/",
  "src/stm/",
  "src/stm-explorer/",
  "src/relational-facts/",
  "src/semantic-system/",
  "src/kernel-calculus/",
  "src/normalized-core/",
] as const;

const schemaBoundaryProgram = (filename: string): boolean => {
  const normalized = sourcePath(filename);
  return (
    schemaBoundaryRoots.some((root) => normalized.startsWith(root)) &&
    adapterExceptionFor(filename) === undefined
  );
};

// Project-model has completed the total-function slice. Tracer still contains
// explicitly tracked pure-core throws that must be migrated before this
// stricter rule can be widened without a blanket suppression.
const totalPortableSemanticProgram = (filename: string): boolean => {
  const normalized = sourcePath(filename);
  return portableSemanticProgram(filename) && normalized.startsWith("src/project-model/");
};

const report = (
  ctx: typeof RuleContext.Service,
  node: Parameters<typeof Diagnostic.make>[0]["node"],
  message: string,
) => ctx.report(Diagnostic.make({ node, message }));

type ReferenceIdentifier = Parameters<
  (typeof RuleContext.Service)["sourceCode"]["isGlobalReference"]
>[0] & {
  readonly name: string;
};

const isAmbientReference = (
  ctx: typeof RuleContext.Service,
  node: ReferenceIdentifier,
): boolean => {
  if (ctx.sourceCode.isGlobalReference(node)) return true;
  for (
    let scope: ReturnType<(typeof RuleContext.Service)["sourceCode"]["getScope"]> | null =
      ctx.sourceCode.getScope(node);
    scope !== null;
    scope = scope.upper
  ) {
    const reference = scope.references.find((item) => item.identifier === node);
    if (reference !== undefined) return reference.resolved === null;
    if (scope.through.some((item) => item.identifier === node)) return true;
    if (scope.set.has(node.name)) return false;
  }
  return false;
};

type StaticMemberExpression = Parameters<typeof AST.memberPath>[0];

const staticPropertyName = (node: StaticMemberExpression): string | undefined => {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return undefined;
};

const staticMemberPath = (node: StaticMemberExpression): ReadonlyArray<string> | undefined => {
  const property = staticPropertyName(node);
  if (property === undefined) return undefined;
  if (node.object.type === "Identifier") return [node.object.name, property];
  if (node.object.type !== "MemberExpression") return undefined;
  const parent = staticMemberPath(node.object);
  return parent === undefined ? undefined : [...parent, property];
};

const memberRootIdentifier = (node: StaticMemberExpression): ReferenceIdentifier | undefined => {
  let root = node.object;
  while (root.type === "MemberExpression") root = root.object;
  return root.type === "Identifier" ? root : undefined;
};

const ambientTimerNames = ["setTimeout", "setInterval", "setImmediate", "queueMicrotask"] as const;

const isAmbientTimerName = (name: string): boolean =>
  ambientTimerNames.some((timerName) => timerName === name);

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
                normalizedCoreProgram(ctx.filename)
                  ? "Normalized core has no runtime-adapter exemption; request portable Effect services only"
                  : "Portable semantic code must request Effect services; provide Bun or Node layers only in main entrypoints",
              )
            : Effect.void,
        ),
        Visitor.on("MemberExpression", (node) => {
          const ambientRuntimeMember =
            node.object.type === "Identifier" &&
            (node.object.name === "Bun" || node.object.name === "process") &&
            isAmbientReference(ctx, node.object);
          const path = staticMemberPath(node);
          const extendedByParent =
            node.parent?.type === "MemberExpression" && node.parent.object === node;
          const memberRoot = memberRootIdentifier(node);
          const globalRuntime =
            memberRoot !== undefined &&
            isAmbientReference(ctx, memberRoot) &&
            path !== undefined &&
            path[0] === "globalThis" &&
            (path[1] === "Bun" || path[1] === "process") &&
            (path.length === 3 || (path.length === 2 && !extendedByParent));
          return ambientRuntimeMember || globalRuntime
            ? report(ctx, node, "Portable semantic code must not use runtime globals directly")
            : Effect.void;
        }),
      ),
    );
  },
});

export const ambientConsole = Rule.define({
  name: "ambient-console",
  meta: Rule.meta({
    type: "problem",
    description: "Route console output through Effect logging or the Effect Console service",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const importsEffect = yield* Ref.make(false);
    const ambientReferences = yield* Ref.make<
      ReadonlyArray<Parameters<typeof Diagnostic.make>[0]["node"]>
    >([]);
    const remember = (node: Parameters<typeof Diagnostic.make>[0]["node"]) =>
      Ref.update(ambientReferences, (nodes) => [...nodes, node]);

    return Visitor.merge(
      Visitor.on("ImportDeclaration", (node) =>
        Option.isSome(
          AST.matchImport(
            node,
            (source) =>
              source === "effect" || source.startsWith("effect/") || source.startsWith("@effect/"),
          ),
        )
          ? Ref.set(importsEffect, true)
          : Effect.void,
      ),
      Visitor.on("Identifier", (node) =>
        node.name === "console" && isAmbientReference(ctx, node) ? remember(node) : Effect.void,
      ),
      Visitor.on("MemberExpression", (node) => {
        if (
          node.object.type !== "Identifier" ||
          node.object.name !== "globalThis" ||
          !isAmbientReference(ctx, node.object)
        ) {
          return Effect.void;
        }
        return staticPropertyName(node) === "console" ? remember(node) : Effect.void;
      }),
      Visitor.on("Program:exit", () =>
        Effect.gen(function* () {
          if (!(yield* Ref.get(importsEffect)) && !portableSemanticProgram(ctx.filename)) return;
          for (const node of yield* Ref.get(ambientReferences)) {
            yield* report(
              ctx,
              node,
              "Effect-bearing code must use Effect.log*, Console.*, or an injected service instead of the ambient console; developer-only output may use a targeted oxlint suppression with a 'dev only:' reason",
            );
          }
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
              normalizedCoreProgram(ctx.filename)
                ? "Normalized core has no runtime entrypoint; keep Effect programs composable"
                : "Keep Effect programs composable; execute them only in main-bun.ts or main-node.ts",
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
      schemaBoundaryProgram,
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
          const memberRoot =
            node.callee.type === "MemberExpression" ? memberRootIdentifier(node.callee) : undefined;
          const ambientMemberRoot = memberRoot !== undefined && isAmbientReference(ctx, memberRoot);
          const memberPath =
            node.callee.type === "MemberExpression" ? staticMemberPath(node.callee) : undefined;
          const directAmbientNondeterminism =
            ambientMemberRoot &&
            memberPath?.length === 2 &&
            ((memberPath[0] === "Date" && memberPath[1] === "now") ||
              (memberPath[0] === "Math" && memberPath[1] === "random") ||
              (memberPath[0] === "crypto" &&
                (memberPath[1] === "randomUUID" || memberPath[1] === "getRandomValues")) ||
              (memberPath[0] === "performance" && memberPath[1] === "now"));
          if (directAmbientNondeterminism) {
            return report(
              ctx,
              node,
              "Use Effect Clock, Random, or Crypto services instead of ambient nondeterminism",
            );
          }
          if (
            ambientMemberRoot &&
            memberPath?.length === 3 &&
            memberPath[0] === "globalThis" &&
            memberPath[1] === "crypto" &&
            (memberPath[2] === "randomUUID" || memberPath[2] === "getRandomValues")
          ) {
            return report(
              ctx,
              node,
              "Use Effect Crypto instead of the ambient Web Crypto capability",
            );
          }
          const ambientTimer =
            (node.callee.type === "Identifier" &&
              isAmbientTimerName(node.callee.name) &&
              isAmbientReference(ctx, node.callee)) ||
            (ambientMemberRoot &&
              memberPath?.length === 2 &&
              memberPath[0] === "globalThis" &&
              isAmbientTimerName(memberPath[1] ?? ""));
          if (ambientTimer) {
            return report(ctx, node, "Use Effect Clock instead of ambient timer scheduling");
          }
          const ambientFetch =
            (node.callee.type === "Identifier" &&
              node.callee.name === "fetch" &&
              isAmbientReference(ctx, node.callee)) ||
            (ambientMemberRoot &&
              memberPath?.length === 2 &&
              memberPath[0] === "globalThis" &&
              memberPath[1] === "fetch");
          if (ambientFetch) {
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
          node.arguments.length === 0 &&
          isAmbientReference(ctx, node.callee)
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
    "ambient-console": ambientConsole,
    "ambient-nondeterminism": ambientNondeterminism,
    "effect-runtime-boundary": effectRuntimeBoundary,
    "portable-runtime-imports": portableRuntimeImports,
    "schema-json-boundary": schemaJsonBoundary,
    "typed-failure-boundary": typedFailureBoundary,
  },
});
