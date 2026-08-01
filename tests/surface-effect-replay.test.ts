import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as fc from "fast-check";
import { Effect } from "effect";
import { replaySurfaceDocumentEffects } from "../src/surface-execution/index.ts";
import {
  encodeCanonicalKernelEffectRunObservation,
  type KernelEffectRunObservation,
} from "../src/kernel-interpreter/index.ts";

const example = readFileSync("examples/surface-language/unhandled-two-step.semantic", "utf8");

const script = (...observations: ReadonlyArray<unknown>) => ({
  format: "semantic.kernel-observation-script",
  version: 1,
  observations,
});

const replay = (source: unknown, observations: unknown) =>
  Effect.runSync(replaySurfaceDocumentEffects(source, observations));

const canonical = (observation: KernelEffectRunObservation): Uint8Array =>
  encodeCanonicalKernelEffectRunObservation(observation);

const expectBackendAgreement = (source: unknown, observations: unknown) => {
  const result = replay(source, observations);
  expect(canonical(result.compiled)).toEqual(canonical(result.reference));
  return result;
};

const allObjectsFrozen = (value: unknown, seen = new Set<object>()): boolean => {
  if (typeof value !== "object" || value === null || seen.has(value)) return true;
  seen.add(value);
  return (
    Object.isFrozen(value) && Object.values(value).every((child) => allObjectsFrozen(child, seen))
  );
};

describe("surface effect replay", () => {
  test("drives one readable program through two external requests", () => {
    const result = expectBackendAgreement(
      example,
      script({ kind: "int", value: 42 }, { kind: "bool", value: true }),
    );

    expect(result.compilation.check.observation.tag).toBe("accepted");
    expect(result.reference.observation).toEqual({
      tag: "executed",
      provided_observations: 2,
      applied_observations: 2,
      requests: [
        {
          label: "fresh",
          operation: "allocate",
          argument: { kind: "unit" },
          result_type: { kind: "int" },
        },
        {
          label: "confirm",
          operation: "accept",
          argument: { kind: "int", value: 42 },
          result_type: { kind: "bool" },
        },
      ],
      result: { tag: "returned", value: { kind: "bool", value: true } },
    });
    expect(allObjectsFrozen(result)).toBeTrue();
    expect("equal" in result).toBeFalse();
    expect("verified" in result).toBeFalse();
  });

  test("preserves prefix suspension and wrong-type non-consumption", () => {
    const prefix = expectBackendAgreement(example, script({ kind: "int", value: 7 }));
    expect(prefix.reference.observation).toMatchObject({
      tag: "executed",
      provided_observations: 1,
      applied_observations: 1,
      requests: [{ label: "fresh" }, { label: "confirm" }],
      result: {
        tag: "suspended",
        request: { label: "confirm", argument: { kind: "int", value: 7 } },
      },
    });

    const wrongType = expectBackendAgreement(example, script({ kind: "bool", value: true }));
    expect(wrongType.reference.observation).toMatchObject({
      tag: "executed",
      provided_observations: 1,
      applied_observations: 0,
      requests: [{ label: "fresh" }],
      result: {
        tag: "runtime-rejected",
        diagnostic: { code: "external-observation.result-type-mismatch" },
      },
    });
  });

  test("captures a non-inert script once without invoking its accessor", () => {
    let reads = 0;
    const hostile: Record<string, unknown> = {
      format: "semantic.kernel-observation-script",
      version: 1,
    };
    Object.defineProperty(hostile, "observations", {
      enumerable: true,
      get: () => {
        reads += 1;
        return [{ kind: "int", value: 42 }];
      },
    });

    const result = replay(example, hostile);
    expect(reads).toBe(0);
    expect(result.reference).toBe(result.compiled);
    expect(result.reference.observation).toEqual({
      tag: "script-rejected",
      diagnostics: [
        {
          code: "external-observation-script.non-inert",
          path: "$",
          message: "observation script must be finite inert JSON without aliases or accessors",
        },
      ],
    });
  });

  test("gives source failure precedence without inspecting the script", () => {
    let reads = 0;
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "observations", {
      enumerable: true,
      get: () => {
        reads += 1;
        return [];
      },
    });

    const failure = Effect.runSync(
      replaySurfaceDocumentEffects("not Semantic source", hostile).pipe(Effect.flip),
    );
    expect(failure.phase).toBe("parse");
    expect(reads).toBe(0);
  });

  test("retains script and checker rejections as backend observations", () => {
    const malformed = replay(example, {
      format: "semantic.kernel-observation-script",
      version: 1,
      observations: [],
      extra: true,
    });
    expect(malformed.reference.observation).toMatchObject({
      tag: "script-rejected",
      diagnostics: [{ code: "external-observation-script.invalid" }],
    });
    expect(malformed.compiled).toBe(malformed.reference);

    const rejectedSource = `kernel "semantic.kernel-calculus/0018/v1";
      run (fun (value : Int) [1] => return[1] value)(true)`;
    const checked = expectBackendAgreement(rejectedSource, script());
    expect(checked.compilation.check.observation).toMatchObject({
      tag: "rejected",
      diagnostics: [{ code: "type.argument-mismatch" }],
    });
    expect(checked.reference.observation).toMatchObject({
      tag: "executed",
      provided_observations: 0,
      applied_observations: 0,
      requests: [],
      result: { tag: "check-rejected" },
    });
  });

  test("erases source presentation and alpha-renaming before replay", () => {
    const renamed = `kernel "semantic.kernel-calculus/0018/v1";
      // Names and comments do not survive elaboration.
      effect confirm.accept : Int -> Bool;
      effect fresh.allocate : Unit -> Int;
      run let generated = perform[1] fresh.allocate(()) in
        let decision = perform[1] confirm.accept(generated) in
          return[1] decision`;
    const observations = script({ kind: "int", value: -9 }, { kind: "bool", value: false });
    const baseline = expectBackendAgreement(example, observations);
    const alpha = expectBackendAgreement(renamed, observations);
    expect(canonical(alpha.reference)).toEqual(canonical(baseline.reference));
    expect(canonical(alpha.compiled)).toEqual(canonical(baseline.compiled));
  });

  test("generated scripts remain conclusive and backend-neutral", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.boolean(),
        fc.constantFrom("allocated", "resource", "freshValue"),
        (integer, boolean, binder) => {
          const generatedSource = `kernel "semantic.kernel-calculus/0018/v1";
            effect fresh.allocate : Unit -> Int;
            effect confirm.accept : Int -> Bool;
            run let ${binder} = perform[1] fresh.allocate(()) in
              let accepted = perform[1] confirm.accept(${binder}) in return[1] accepted`;
          const result = expectBackendAgreement(
            generatedSource,
            script({ kind: "int", value: integer }, { kind: "bool", value: boolean }),
          );
          expect(result.reference.observation).toMatchObject({
            tag: "executed",
            applied_observations: 2,
            result: { tag: "returned", value: { kind: "bool", value: boolean } },
          });
        },
      ),
      { seed: 2_026_0801, numRuns: 128 },
    );
  });

  test("keeps execution authority out of the portable surface-language closure", () => {
    const portableFiles = [
      "ast.ts",
      "elaborate.ts",
      "errors.ts",
      "index.ts",
      "lexer.ts",
      "parser.ts",
    ];
    for (const file of portableFiles) {
      const text = readFileSync(`src/surface-language/${file}`, "utf8");
      expect(text).not.toContain("surface-execution");
      expect(text).not.toContain("kernel-bytecode");
      expect(text).not.toContain("kernel-interpreter");
    }

    const composition = readFileSync("src/surface-execution/index.ts", "utf8");
    expect(composition).not.toMatch(/from\s+["'](?:node:|@effect\/platform)/);
    expect(composition).not.toMatch(
      /\b(?:Bun|process|fetch|setTimeout|setInterval|Math\.random)\b/,
    );
    expect(composition).not.toContain("Effect.runSync");

    for (const file of ["index.ts", "compiler.ts", "custody.ts", "vm.ts"]) {
      expect(readFileSync(`src/kernel-bytecode/${file}`, "utf8")).not.toMatch(
        /from\s+["']\.\.\/kernel-interpreter\/(?:observe|index)\.ts["']/,
      );
    }
  });
});
