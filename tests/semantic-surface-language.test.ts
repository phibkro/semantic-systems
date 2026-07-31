import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Effect } from "effect";
import * as fc from "fast-check";
import {
  compileSurfaceDocument,
  elaborateSurfaceDocument,
  parseSurfaceDocument,
  surfacePrattRules,
  type SurfaceLanguageError,
} from "../src/surface-language/index.ts";
import {
  canonicalKernelDocumentJson,
  encodeCanonicalKernelDocument,
  type KernelComputationTerm,
} from "../src/kernel-json/index.ts";
import { interpretKernelJsonBytes } from "../src/kernel-interpreter/index.ts";

const marker = 'kernel "semantic.kernel-calculus/0018/v1";\n';
const source = (program: string, declarations = ""): string =>
  `${marker}${declarations}run ${program}`;
const compile = (input: unknown) => Effect.runSync(compileSurfaceDocument(input));
const reject = (input: unknown): SurfaceLanguageError =>
  Effect.runSync(compileSurfaceDocument(input).pipe(Effect.flip));

describe("Semantic surface language", () => {
  test("compiles the handled tracer through the authoritative checker", () => {
    const text = readFileSync("examples/surface-language/handled-fresh.semantic", "utf8");
    const result = compile(text);

    expect(result.kernel).toEqual({
      format: "semantic.kernel-json",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      signature: [
        {
          label: "fresh",
          operation: "allocate",
          argument_type: { tag: "unit" },
          result_type: { tag: "int" },
        },
      ],
      program: {
        tag: "handle",
        label: "fresh",
        computation: {
          tag: "operation",
          grade: "1",
          label: "fresh",
          operation: "allocate",
          argument: { tag: "unit" },
        },
        return_clause: {
          body: { tag: "return", grade: "1", value: { tag: "bound-value", distance: 0 } },
        },
        operation_clauses: [
          {
            operation: "allocate",
            body: {
              tag: "resume",
              resumption_distance: 0,
              value: { tag: "int", value: 7 },
            },
          },
        ],
      },
    });
    expect(result.check.observation.tag).toBe("accepted");
    expect(Object.isFrozen(result.surface)).toBeTrue();
    expect(Object.isFrozen(result.kernel)).toBeTrue();
  });

  test("covers pure values, let, thunk/force, lambda, and application", () => {
    const result = compile(
      source(
        "let stored = return[1] thunk { return[1] (true, -1) } in " +
          "(fun (cell : U[{}] F[1] (Bool * Int)) [1] => force cell)(stored)",
      ),
    );
    expect(result.check.observation.tag).toBe("accepted");
    const run = interpretKernelJsonBytes(encodeCanonicalKernelDocument(result.kernel));
    expect(run.observation).toEqual({
      tag: "returned",
      value: {
        kind: "pair",
        first: { kind: "bool", value: true },
        second: { kind: "int", value: -1 },
      },
    });
  });

  test("reified Pratt rules make product right-associative and application left-associative", () => {
    expect(surfacePrattRules.valueTypeProduct).toEqual({
      token: "*",
      leftBindingPower: 30,
      rightBindingPower: 29,
    });
    const result = compile(source("(fun (f : U[{}] Int ->[1; {}] F[1] Int) [1] => force f(1)(2))"));
    const program = result.kernel.program;
    expect(program.tag).toBe("lambda");
    if (program.tag !== "lambda") return;
    expect(program.parameter_type).toEqual({
      tag: "thunk",
      effects: [],
      computation: {
        tag: "function",
        parameter: { tag: "int" },
        grade: "1",
        effects: [],
        result: { tag: "return", grade: "1", value: { tag: "int" } },
      },
    });
    expect(program.body).toEqual({
      tag: "apply",
      computation: {
        tag: "apply",
        computation: { tag: "force", value: { tag: "bound-value", distance: 0 } },
        argument: { tag: "int", value: 1 },
      },
      argument: { tag: "int", value: 2 },
    });

    const product = compile(source("fun (x : Int * Bool * Unit) [0] => return[0] ()"));
    const productProgram = product.kernel.program;
    expect(productProgram.tag).toBe("lambda");
    if (productProgram.tag === "lambda") {
      expect(productProgram.parameter_type).toEqual({
        tag: "pair",
        first: { tag: "int" },
        second: { tag: "pair", first: { tag: "bool" }, second: { tag: "unit" } },
      });
    }
  });

  test("sorts explicit rows and signatures while rejecting duplicate semantic entries", () => {
    const result = compile(
      source(
        "return[1] ()",
        "effect z.last : U[{z, a}] F[1] Unit -> Unit;\neffect a.first : Unit -> Bool;\n",
      ),
    );
    expect(result.kernel.signature.map(({ label, operation }) => [label, operation])).toEqual([
      ["a", "first"],
      ["z", "last"],
    ]);
    expect(result.kernel.signature[1]?.argument_type).toEqual({
      tag: "thunk",
      effects: ["a", "z"],
      computation: { tag: "return", grade: "1", value: { tag: "unit" } },
    });

    expect(
      reject(source("return[1] ()", "effect a.x : Unit -> Unit; effect a.x : Unit -> Unit;")).code,
    ).toBe("surface.elaboration.duplicate-signature-operation");
    expect(reject(source("return[1] ()", "effect a.x : U[{a, a}] F[1] Unit -> Unit;")).code).toBe(
      "surface.elaboration.duplicate-effect-label",
    );
  });

  test("resolves nested ordinary binders to innermost-first kernel distances", () => {
    const result = compile(
      source("let outer = return[1] 1 in let inner = return[1] 2 in return[1] (inner, outer)"),
    );
    const outer = result.kernel.program;
    expect(outer.tag).toBe("let");
    if (outer.tag !== "let" || outer.body.tag !== "let") return;
    expect(outer.body.body).toEqual({
      tag: "return",
      grade: "1",
      value: {
        tag: "pair",
        first: { tag: "bound-value", distance: 0 },
        second: { tag: "bound-value", distance: 1 },
      },
    });
  });

  test("keeps value and resumption contexts distinct across nested handlers", () => {
    const declarations = "effect outer.go : Unit -> Int;\neffect inner.go : Unit -> Int;\n";
    const program = `handle outer (perform[1] outer.go(())) with {
      return outerResult => return[1] outerResult;
      operation go(outerArgument, outerContinuation) =>
        handle inner (perform[1] inner.go(())) with {
          return innerResult => return[1] innerResult;
          operation go(innerArgument, innerContinuation) => resume outerContinuation(3);
        };
    }`;
    const result = compile(source(program, declarations));
    const outer = result.kernel.program;
    expect(outer.tag).toBe("handle");
    if (outer.tag !== "handle") return;
    const inner = outer.operation_clauses[0]?.body;
    expect(inner?.tag).toBe("handle");
    if (inner?.tag !== "handle") return;
    expect(inner.operation_clauses[0]?.body).toEqual({
      tag: "resume",
      resumption_distance: 1,
      value: { tag: "int", value: 3 },
    });
  });

  test("rejects unbound, wrong-kind, and ambiguous source names before the kernel boundary", () => {
    expect(reject(source("return[1] missing")).code).toBe("surface.elaboration.unbound-value");
    expect(reject(source("resume missing(())")).code).toBe(
      "surface.elaboration.unbound-resumption",
    );
    expect(reject(source("let value = return[1] () in resume value(())")).code).toBe(
      "surface.elaboration.wrong-binder-kind",
    );

    const wrongResumptionKind = source(
      `handle a (perform[1] a.go(())) with {
        return result => return[1] result;
        operation go(argument, continuation) => return[1] continuation;
      }`,
      "effect a.go : Unit -> Unit;\n",
    );
    expect(reject(wrongResumptionKind).code).toBe("surface.elaboration.wrong-binder-kind");
    expect(
      reject(source("let value = return[1] () in let value = return[1] () in return[1] value"))
        .code,
    ).toBe("surface.elaboration.ambiguous-binder");
  });

  test("exposes the raw resumption value constructor but leaves escape rejection to the kernel", () => {
    const escaped = compile(
      source(
        `handle a (perform[1] a.go(())) with {
          return result => return[1] result;
          operation go(argument, continuation) => return[0] resumption continuation;
        }`,
        "effect a.go : Unit -> Unit;\n",
      ),
    );
    expect(escaped.check.observation.tag).toBe("rejected");
    if (escaped.check.observation.tag === "rejected") {
      expect(escaped.check.observation.diagnostics[0]?.code).toBe("resumption.escape");
    }
  });

  test("keeps type mistakes in the authoritative kernel-check phase", () => {
    const mismatched = compile(source("(fun (value : Int) [1] => return[1] value)(true)"));
    expect(mismatched.check.observation.tag).toBe("rejected");
    if (mismatched.check.observation.tag === "rejected") {
      expect(mismatched.check.observation.diagnostics[0]?.code).toBe("type.argument-mismatch");
    }
  });

  test("rejects duplicate handler clauses and cross-context binder collisions", () => {
    const duplicateClause = source(
      `handle a (perform[1] a.go(())) with {
        return result => return[1] result;
        operation go(argument, firstContinuation) => resume firstContinuation(());
        operation go(otherArgument, secondContinuation) => resume secondContinuation(());
      }`,
      "effect a.go : Unit -> Unit;\n",
    );
    expect(reject(duplicateClause).code).toBe("surface.elaboration.duplicate-handler-clause");

    const collision = source(
      `handle a (perform[1] a.go(())) with {
        return result => return[1] result;
        operation go(same, same) => return[1] ();
      }`,
      "effect a.go : Unit -> Unit;\n",
    );
    expect(reject(collision).code).toBe("surface.elaboration.ambiguous-binder");
  });

  test("returns phase-specific diagnostics for malformed external source", () => {
    expect(reject(42).phase).toBe("input");
    expect(reject('kernel "semantic.kernel-calculus/0018/v1"; run return[1] @').phase).toBe("lex");
    expect(reject('kernel "semantic.kernel-calculus/0018/v1"; /*').code).toBe(
      "surface.lex.unterminated-comment",
    );
    expect(reject(`${marker}run return[1] 9007199254740992`).code).toBe(
      "surface.parse.unsafe-integer",
    );
    expect(reject(`${marker}run return[1] (); return[1] ()`).code).toBe(
      "surface.parse.trailing-input",
    );
    expect(reject('kernel "other"; run return[1] ()').phase).toBe("parse");
  });

  test("enforces source, token, identifier, Unicode, and nesting bounds", () => {
    expect(reject(" ".repeat(1_048_577)).code).toBe("surface.lex.source-too-large");
    expect(reject(`${marker}${";".repeat(65_536)}`).code).toBe("surface.lex.too-many-tokens");
    expect(
      reject(`${marker}run let ${"a".repeat(4_097)} = return[1] () in return[1] ()`).code,
    ).toBe("surface.lex.identifier-too-large");
    expect(reject(`${marker}// invalid \ud800\nrun return[1] ()`).code).toBe(
      "surface.lex.invalid-unicode",
    );
    expect(reject('kernel "semantic.kernel-calculus/0018/v1;').code).toBe(
      "surface.lex.unterminated-string",
    );

    let nested = "return[1] ()";
    for (let depth = 0; depth < 140; depth += 1) nested = `return[1] thunk { ${nested} }`;
    expect(reject(source(nested)).code).toBe("surface.parse.depth");
  });

  test("rejects a forged structural AST at the public elaboration seam", () => {
    const parsed = Effect.runSync(parseSurfaceDocument(source("return[1] ()")));
    const forged = { ...parsed };
    const failure = Effect.runSync(elaborateSurfaceDocument(forged).pipe(Effect.flip));
    expect(failure.code).toBe("surface.elaboration.uncustodied-ast");
  });

  test("the portable surface-language closure owns no ambient runtime authority", () => {
    const files = ["ast.ts", "elaborate.ts", "errors.ts", "index.ts", "lexer.ts", "parser.ts"];
    for (const file of files) {
      const text = readFileSync(`src/surface-language/${file}`, "utf8");
      expect(text).not.toMatch(/from\s+["'](?:node:|@effect\/platform)/);
      expect(text).not.toMatch(/\b(?:Bun|process|fetch|setTimeout|setInterval|Math\.random)\b/);
      expect(text).not.toMatch(/Effect\.run(?:Sync|Promise|Fork)/);
      expect(text).not.toContain("JSON.parse");
    }
  });

  test("agrees with direct canonical kernel JSON and the reference interpreter", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000, max: 10_000 }), (value) => {
        const result = compile(source(`return[1] ${value}`));
        const canonical = canonicalKernelDocumentJson(result.kernel);
        expect(canonical.startsWith('{"format":"semantic.kernel-json"')).toBeTrue();
        expect(
          interpretKernelJsonBytes(encodeCanonicalKernelDocument(result.kernel)).observation,
        ).toEqual({
          tag: "returned",
          value: { kind: "int", value },
        });
      }),
      { seed: 2_026_0731, numRuns: 64 },
    );
  });

  test("every kernel computation constructor appears in the elaborated corpus", () => {
    const programs = [
      source("return[1] ()"),
      source("let x = return[1] () in return[1] x"),
      source("force thunk { return[1] () }"),
      source("fun (x : Unit) [1] => return[1] x"),
      source("(fun (x : Unit) [1] => return[1] x)(())"),
      source("perform[1] a.go(())", "effect a.go : Unit -> Unit;\n"),
      readFileSync("examples/surface-language/handled-fresh.semantic", "utf8"),
    ];
    const tags = new Set<string>();
    const walk = (term: KernelComputationTerm): void => {
      tags.add(term.tag);
      switch (term.tag) {
        case "return":
        case "force":
        case "operation":
        case "resume":
          return;
        case "let":
          walk(term.bound);
          walk(term.body);
          return;
        case "lambda":
          walk(term.body);
          return;
        case "apply":
          walk(term.computation);
          return;
        case "handle":
          walk(term.computation);
          walk(term.return_clause.body);
          for (const clause of term.operation_clauses) walk(clause.body);
      }
    };
    for (const program of programs) walk(compile(program).kernel.program);
    expect([...tags].sort()).toEqual([
      "apply",
      "force",
      "handle",
      "lambda",
      "let",
      "operation",
      "resume",
      "return",
    ]);
  });
});
