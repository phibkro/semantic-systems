import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as Testing from "effect-oxlint/testing";
import {
  adapterExceptionFor,
  adapterExceptionRegister,
  ambientConsole,
  ambientNondeterminism,
  classifySourcePath,
  effectRuntimeBoundary,
  portableRuntimeImports,
  schemaJsonBoundary,
  typedFailureBoundary,
} from "../scripts/oxlint/semantic-effect-rules.ts";

const portable = { filename: "/repo/src/project-model/loader.ts" };
const bunMain = { filename: "/repo/src/project-model/main-bun.ts" };
const portableTracer = { filename: "/repo/src/tracer/loader.ts" };
const tracerBunMain = { filename: "/repo/src/tracer/main-bun.ts" };
const portableReferences = { filename: "/repo/src/references/verify.ts" };
const referencesBunMain = { filename: "/repo/src/references/main-bun.ts" };
const referencesBunToml = { filename: "/repo/src/references/toml-bun.ts" };
const referencesCuratorHolder = { filename: "/repo/src/references/curator-holder.ts" };
const portableStm = { filename: "/repo/src/stm/model.ts" };
const stmBunMain = { filename: "/repo/src/stm/main-bun.ts" };
const portableSemanticSystem = { filename: "/repo/src/semantic-system/kernel.ts" };
const portableKernelCalculus = { filename: "/repo/src/kernel-calculus/machine.ts" };
const portableNormalizedCore = { filename: "/repo/src/normalized-core/normalize.ts" };
const normalizedCoreBunMain = { filename: "/repo/src/normalized-core/main-bun.ts" };
const normalizedCoreNodeMain = { filename: "/repo/src/normalized-core/main-node.ts" };

const runAmbientConsole = (
  events: ReadonlyArray<readonly [visitor: string, node: unknown]>,
  referenceKind: "global" | "unresolved" | "shadowed" = "global",
  filename = "/repo/unrelated.ts",
) => {
  const { context, diagnostics } = Testing.createMockContext({ filename });
  Object.defineProperty(context.sourceCode, "isGlobalReference", {
    value: () => referenceKind === "global",
  });
  if (referenceKind === "shadowed") {
    Object.defineProperty(context.sourceCode, "getScope", {
      value: () => Testing.scope({ variables: [Testing.variable("console")] }),
    });
  } else if (referenceKind === "unresolved") {
    Object.defineProperty(context.sourceCode, "getScope", {
      value: (node: unknown) => ({
        ...Testing.scope(),
        through: [{ identifier: node }],
      }),
    });
  }
  const visitors = ambientConsole.create(context);
  for (const [visitor, node] of events) visitors[visitor]?.(node as never);
  return diagnostics;
};

const runPortableRuntimeMember = (node: unknown, localProcess = false) => {
  const { context, diagnostics } = Testing.createMockContext({
    filename: portableReferences.filename,
  });
  Object.defineProperty(context.sourceCode, "isGlobalReference", {
    value: () => !localProcess,
  });
  if (localProcess) {
    Object.defineProperty(context.sourceCode, "getScope", {
      value: () => Testing.scope({ variables: [Testing.variable("process")] }),
    });
  }
  const visitors = portableRuntimeImports.create(context);
  visitors.MemberExpression?.(node as never);
  return diagnostics;
};

const runAmbientNondeterminism = (
  events: ReadonlyArray<readonly [visitor: string, node: unknown]>,
  referenceKind: "global" | "shadowed" = "global",
  filename = portable.filename,
) => {
  const { context, diagnostics } = Testing.createMockContext({ filename });
  Object.defineProperty(context.sourceCode, "isGlobalReference", {
    value: () => referenceKind === "global",
  });
  if (referenceKind === "shadowed") {
    Object.defineProperty(context.sourceCode, "getScope", {
      value: () =>
        Testing.scope({
          variables: [
            Testing.variable("Date"),
            Testing.variable("Math"),
            Testing.variable("crypto"),
            Testing.variable("fetch"),
            Testing.variable("performance"),
            Testing.variable("setTimeout"),
            Testing.variable("setInterval"),
          ],
        }),
    });
  }
  const visitors = ambientNondeterminism.create(context);
  for (const [visitor, node] of events) visitors[visitor]?.(node as never);
  return diagnostics;
};

describe("Semantic Systems Effect Oxlint rules", () => {
  test("ambient Console is severe in Effect-bearing code but ignores unrelated modules and shadows", () => {
    const effectConsole = runAmbientConsole([
      ["ImportDeclaration", Testing.importDecl("effect")],
      ["Identifier", Testing.id("console")],
      ["Program:exit", { type: "Program", body: [] }],
    ]);
    Testing.expectDiagnostics(effectConsole, [
      {
        message:
          "Effect-bearing code must use Effect.log*, Console.*, or an injected service instead of the ambient console; developer-only output may use a targeted oxlint suppression with a 'dev only:' reason",
      },
    ]);

    const globalThisConsole = runAmbientConsole([
      ["ImportDeclaration", Testing.importDecl("effect/Effect")],
      ["MemberExpression", Testing.memberExpr("globalThis", "console")],
      ["Program:exit", { type: "Program", body: [] }],
    ]);
    expect(globalThisConsole).toHaveLength(1);

    const unresolvedConsole = runAmbientConsole(
      [
        ["ImportDeclaration", Testing.importDecl("effect")],
        ["Identifier", Testing.id("console")],
        ["Program:exit", { type: "Program", body: [] }],
      ],
      "unresolved",
    );
    expect(unresolvedConsole).toHaveLength(1);

    const unrelated = runAmbientConsole([
      ["Identifier", Testing.id("console")],
      ["Program:exit", { type: "Program", body: [] }],
    ]);
    Testing.expectNoDiagnostics(unrelated);

    const shadowed = runAmbientConsole(
      [
        ["ImportDeclaration", Testing.importDecl("effect")],
        ["Identifier", Testing.id("console")],
        ["Program:exit", { type: "Program", body: [] }],
      ],
      "shadowed",
    );
    Testing.expectNoDiagnostics(shadowed);
  });

  test("runtime imports are forbidden in portable semantic programs", () => {
    Testing.expectDiagnostics(
      Testing.runRule(
        portableRuntimeImports,
        "ImportDeclaration",
        Testing.importDecl("node:fs/promises"),
        portable,
      ),
      [
        {
          message:
            "Portable semantic code must request Effect services; provide Bun or Node layers only in main entrypoints",
        },
      ],
    );
    Testing.expectNoDiagnostics(
      Testing.runRule(
        portableRuntimeImports,
        "ImportDeclaration",
        Testing.importDecl("@effect/platform-bun"),
        bunMain,
      ),
    );
    Testing.expectDiagnostics(
      Testing.runRule(
        portableRuntimeImports,
        "ImportDeclaration",
        Testing.importDecl("node:fs/promises"),
        portableTracer,
      ),
      [
        {
          message:
            "Portable semantic code must request Effect services; provide Bun or Node layers only in main entrypoints",
        },
      ],
    );
    Testing.expectNoDiagnostics(
      Testing.runRule(
        portableRuntimeImports,
        "ImportDeclaration",
        Testing.importDecl("@effect/platform-bun"),
        tracerBunMain,
      ),
    );
  });

  test("portable modules reject ambient process and Bun capabilities without banning service fields", () => {
    for (const node of [
      Testing.memberExpr("process", "env"),
      Testing.memberExpr("process", "argv"),
      Testing.memberExpr("Bun", "env"),
      Testing.memberExpr("Bun", "file"),
      Testing.chainedMemberExpr("globalThis", "process", "env"),
    ]) {
      Testing.expectDiagnostics(runPortableRuntimeMember(node), [
        { message: "Portable semantic code must not use runtime globals directly" },
      ]);
    }

    Testing.expectNoDiagnostics(
      runPortableRuntimeMember(Testing.memberExpr("process", "flockExecutable"), true),
    );
  });

  test("STM implementation is a portable Effect lint domain with only explicit mains exempted", () => {
    Testing.expectDiagnostics(
      Testing.runRule(
        portableRuntimeImports,
        "ImportDeclaration",
        Testing.importDecl("node:fs/promises"),
        portableStm,
      ),
      [
        {
          message:
            "Portable semantic code must request Effect services; provide Bun or Node layers only in main entrypoints",
        },
      ],
    );
    Testing.expectNoDiagnostics(
      Testing.runRule(
        portableRuntimeImports,
        "ImportDeclaration",
        Testing.importDecl("@effect/platform-bun"),
        stmBunMain,
      ),
    );
    Testing.expectDiagnostics(
      runAmbientNondeterminism(
        [["CallExpression", Testing.callOfMember("Math", "random")]],
        "global",
        portableStm.filename,
      ),
      [
        {
          message: "Use Effect Clock, Random, or Crypto services instead of ambient nondeterminism",
        },
      ],
    );
    Testing.expectDiagnostics(
      Testing.runRule(
        effectRuntimeBoundary,
        "CallExpression",
        Testing.callOfMember("Effect", "runSync"),
        portableStm,
      ),
      [
        {
          message:
            "Keep Effect programs composable; execute them only in main-bun.ts or main-node.ts",
        },
      ],
    );
    expect(
      runAmbientConsole(
        [
          ["Identifier", Testing.id("console")],
          ["Program:exit", { type: "Program", body: [] }],
        ],
        "global",
        portableStm.filename,
      ),
    ).toHaveLength(1);
  });

  test("reference custody is portable except for explicit runtime adapters", () => {
    Testing.expectDiagnostics(
      Testing.runRule(
        portableRuntimeImports,
        "ImportDeclaration",
        Testing.importDecl("node:fs/promises"),
        portableReferences,
      ),
      [
        {
          message:
            "Portable semantic code must request Effect services; provide Bun or Node layers only in main entrypoints",
        },
      ],
    );
    for (const runtimeFile of [referencesBunMain, referencesBunToml, referencesCuratorHolder]) {
      Testing.expectNoDiagnostics(
        Testing.runRule(
          portableRuntimeImports,
          "ImportDeclaration",
          Testing.importDecl("node:fs/promises"),
          runtimeFile,
        ),
      );
    }
    Testing.expectDiagnostics(
      Testing.runRule(
        effectRuntimeBoundary,
        "CallExpression",
        Testing.callOfMember("Effect", "runPromise"),
        portableReferences,
      ),
      [
        {
          message:
            "Keep Effect programs composable; execute them only in main-bun.ts or main-node.ts",
        },
      ],
    );
    Testing.expectDiagnostics(
      Testing.runRule(
        schemaJsonBoundary,
        "CallExpression",
        Testing.callOfMember("JSON", "parse"),
        portableReferences,
      ),
      [
        {
          message:
            "Use Schema.fromJsonString or Schema.UnknownFromJsonString at external JSON boundaries",
        },
      ],
    );
    Testing.expectDiagnostics(
      runAmbientNondeterminism(
        [["CallExpression", Testing.callOfMember("crypto", "randomUUID")]],
        "global",
        portableReferences.filename,
      ),
      [
        {
          message: "Use Effect Clock, Random, or Crypto services instead of ambient nondeterminism",
        },
      ],
    );
  });

  test("the executable semantic-system closure rejects runtime authority", () => {
    Testing.expectDiagnostics(
      Testing.runRule(
        portableRuntimeImports,
        "ImportDeclaration",
        Testing.importDecl("node:crypto"),
        portableSemanticSystem,
      ),
      [
        {
          message:
            "Portable semantic code must request Effect services; provide Bun or Node layers only in main entrypoints",
        },
      ],
    );
    Testing.expectDiagnostics(
      runAmbientNondeterminism(
        [["CallExpression", Testing.callOfMember("Math", "random")]],
        "global",
        portableSemanticSystem.filename,
      ),
      [
        {
          message: "Use Effect Clock, Random, or Crypto services instead of ambient nondeterminism",
        },
      ],
    );
    Testing.expectDiagnostics(
      Testing.runRule(
        effectRuntimeBoundary,
        "CallExpression",
        Testing.callOfMember("Effect", "runPromise"),
        portableSemanticSystem,
      ),
      [
        {
          message:
            "Keep Effect programs composable; execute them only in main-bun.ts or main-node.ts",
        },
      ],
    );
  });

  test("the kernel calculus closure rejects ambient runtime authority", () => {
    Testing.expectDiagnostics(
      Testing.runRule(
        portableRuntimeImports,
        "ImportDeclaration",
        Testing.importDecl("node:crypto"),
        portableKernelCalculus,
      ),
      [
        {
          message:
            "Portable semantic code must request Effect services; provide Bun or Node layers only in main entrypoints",
        },
      ],
    );
    Testing.expectDiagnostics(
      runAmbientNondeterminism(
        [["CallExpression", Testing.callOfMember("Math", "random")]],
        "global",
        portableKernelCalculus.filename,
      ),
      [
        {
          message: "Use Effect Clock, Random, or Crypto services instead of ambient nondeterminism",
        },
      ],
    );
  });

  test("the normalized core lint domain rejects ambient runtime authority", () => {
    Testing.expectDiagnostics(
      Testing.runRule(
        portableRuntimeImports,
        "ImportDeclaration",
        Testing.importDecl("node:crypto"),
        portableNormalizedCore,
      ),
      [
        {
          message:
            "Normalized core has no runtime-adapter exemption; request portable Effect services only",
        },
      ],
    );
    Testing.expectDiagnostics(
      runAmbientNondeterminism(
        [["CallExpression", Testing.callOfMember("crypto", "randomUUID")]],
        "global",
        portableNormalizedCore.filename,
      ),
      [
        {
          message: "Use Effect Clock, Random, or Crypto services instead of ambient nondeterminism",
        },
      ],
    );
    Testing.expectDiagnostics(
      Testing.runRule(
        effectRuntimeBoundary,
        "CallExpression",
        Testing.callOfMember("Effect", "runPromise"),
        portableNormalizedCore,
      ),
      [
        {
          message: "Normalized core has no runtime entrypoint; keep Effect programs composable",
        },
      ],
    );
    for (const forbiddenMain of [normalizedCoreBunMain, normalizedCoreNodeMain]) {
      Testing.expectDiagnostics(
        Testing.runRule(
          portableRuntimeImports,
          "ImportDeclaration",
          Testing.importDecl("node:crypto"),
          forbiddenMain,
        ),
        [
          {
            message:
              "Normalized core has no runtime-adapter exemption; request portable Effect services only",
          },
        ],
      );
      Testing.expectDiagnostics(
        Testing.runRule(
          effectRuntimeBoundary,
          "CallExpression",
          Testing.callOfMember("Effect", "runPromise"),
          forbiddenMain,
        ),
        [
          {
            message: "Normalized core has no runtime entrypoint; keep Effect programs composable",
          },
        ],
      );
    }
  });

  test("Effect execution is confined to composition entrypoints while internal composition remains open", () => {
    Testing.expectDiagnostics(
      Testing.runRule(
        effectRuntimeBoundary,
        "CallExpression",
        Testing.callOfMember("Effect", "runPromise"),
        portable,
      ),
      [
        {
          message:
            "Keep Effect programs composable; execute them only in main-bun.ts or main-node.ts",
        },
      ],
    );
    Testing.expectNoDiagnostics(
      Testing.runRule(
        effectRuntimeBoundary,
        "CallExpression",
        Testing.callOfMember("Effect", "provide"),
        portable,
      ),
    );
  });

  test("raw JSON parsing is rejected at portable boundaries", () => {
    Testing.expectDiagnostics(
      Testing.runRule(
        schemaJsonBoundary,
        "CallExpression",
        Testing.callOfMember("JSON", "parse"),
        portable,
      ),
      [
        {
          message:
            "Use Schema.fromJsonString or Schema.UnknownFromJsonString at external JSON boundaries",
        },
      ],
    );
  });

  test("portable semantic code cannot throw across its boundary", () => {
    Testing.expectDiagnostics(
      Testing.runRule(typedFailureBoundary, "ThrowStatement", Testing.throwStmt(), portable),
      [
        {
          message:
            "Portable semantic code must return total data or expose a typed Effect failure; do not throw",
        },
      ],
    );
  });

  test("ambient clock, random, crypto, and fetch capabilities are rejected", () => {
    const diagnostics = runAmbientNondeterminism([
      ["CallExpression", Testing.callOfMember("Date", "now")],
      ["CallExpression", Testing.callOfMember("Math", "random")],
      ["CallExpression", Testing.callOfMember("crypto", "randomUUID")],
      [
        "CallExpression",
        {
          ...Testing.callExpr("unused"),
          callee: Testing.chainedMemberExpr("globalThis", "crypto", "randomUUID"),
        },
      ],
      ["CallExpression", Testing.callExpr("fetch")],
      ["NewExpression", Testing.newExpr("Date")],
    ]);
    expect(diagnostics).toHaveLength(6);
    Testing.expectNoDiagnostics(
      runAmbientNondeterminism(
        [["NewExpression", { ...Testing.newExpr("Date"), arguments: [Testing.numLiteral(0)] }]],
        "global",
        portableReferences.filename,
      ),
    );
  });

  test("the ambient wall covers performance time, Web Crypto entropy, and global fetch forms", () => {
    const diagnostics = runAmbientNondeterminism([
      ["CallExpression", Testing.callOfMember("performance", "now")],
      ["CallExpression", Testing.callOfMember("crypto", "getRandomValues")],
      [
        "CallExpression",
        {
          ...Testing.callExpr("unused"),
          callee: Testing.memberExpr("globalThis", "fetch"),
        },
      ],
      ["CallExpression", Testing.callOfMember("Bun", "fetch")],
    ]);
    expect(diagnostics).toHaveLength(4);
  });

  test("portable modules reject ambient timer scheduling", () => {
    const diagnostics = runAmbientNondeterminism([
      ["CallExpression", Testing.callExpr("setTimeout")],
      ["CallExpression", Testing.callExpr("setInterval")],
      [
        "CallExpression",
        {
          ...Testing.callExpr("unused"),
          callee: Testing.memberExpr("globalThis", "setTimeout"),
        },
      ],
    ]);
    expect(diagnostics).toHaveLength(3);
  });

  test("local capability services do not match ambient global rules", () => {
    Testing.expectNoDiagnostics(
      runAmbientNondeterminism(
        [
          ["CallExpression", Testing.callOfMember("crypto", "randomUUID")],
          ["CallExpression", Testing.callOfMember("performance", "now")],
          ["CallExpression", Testing.callExpr("fetch")],
          ["CallExpression", Testing.callExpr("setTimeout")],
          ["NewExpression", Testing.newExpr("Date")],
        ],
        "shadowed",
      ),
    );
  });

  test("the portable boundary excludes nested package source trees", () => {
    expect(classifySourcePath("/repo/src/project-model/loader.ts")).toBe("portable");
    expect(
      classifySourcePath(resolve(import.meta.dirname, "../apps/control-room/src/snapshot.ts")),
    ).toBe("outside-src");
  });

  test("filesystem inventory classifies every current TypeScript source exactly once", () => {
    const root = resolve(import.meta.dirname, "..");
    const sourceRoot = resolve(root, "src");
    const sourcePaths: Array<string> = [];
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          visit(path);
        } else if (entry.isFile() && path.endsWith(".ts")) {
          sourcePaths.push(path.slice(root.length + 1).replaceAll("\\", "/"));
        }
      }
    };
    visit(sourceRoot);
    sourcePaths.sort();

    expect(sourcePaths.length).toBeGreaterThan(0);
    expect(new Set(sourcePaths).size).toBe(sourcePaths.length);

    const sourceSet = new Set(sourcePaths);
    for (const exception of adapterExceptionRegister) {
      expect(sourceSet.has(exception.pathPattern)).toBeTrue();
      expect(exception.capabilityOwner.trim().length).toBeGreaterThan(0);
      expect(exception.reason.trim().length).toBeGreaterThan(0);
      expect(
        adapterExceptionRegister.filter(({ pathPattern }) => pathPattern === exception.pathPattern),
      ).toHaveLength(1);
    }

    for (const path of sourcePaths) {
      const matches = adapterExceptionRegister.filter(({ pathPattern }) => pathPattern === path);
      const classification = classifySourcePath(path);
      expect(["portable", "adapter"]).toContain(classification);
      expect(matches).toHaveLength(classification === "adapter" ? 1 : 0);
      expect(adapterExceptionFor(path)).toEqual(matches[0]);
    }

    expect(sourcePaths.filter((path) => classifySourcePath(path) === "adapter")).toHaveLength(
      adapterExceptionRegister.length,
    );
  });
});
