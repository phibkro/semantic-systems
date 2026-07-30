import { describe, expect, test } from "bun:test";
import * as Testing from "effect-oxlint/testing";
import {
  ambientConsole,
  ambientNondeterminism,
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

const runAmbientConsole = (
  events: ReadonlyArray<readonly [visitor: string, node: unknown]>,
  referenceKind: "global" | "unresolved" | "shadowed" = "global",
) => {
  const { context, diagnostics } = Testing.createMockContext();
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
      Testing.runRule(
        ambientNondeterminism,
        "CallExpression",
        Testing.callOfMember("crypto", "randomUUID"),
        portableReferences,
      ),
      [
        {
          message: "Use Effect Clock, Random, or Crypto services instead of ambient nondeterminism",
        },
      ],
    );
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
    const diagnostics = Testing.runRuleMulti(
      ambientNondeterminism,
      [
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
      ],
      portable,
    );
    expect(diagnostics).toHaveLength(6);
    Testing.expectNoDiagnostics(
      Testing.runRule(
        ambientNondeterminism,
        "NewExpression",
        { ...Testing.newExpr("Date"), arguments: [Testing.numLiteral(0)] },
        portableReferences,
      ),
    );
  });
});
