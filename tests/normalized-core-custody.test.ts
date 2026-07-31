import { describe, expect, test } from "bun:test";
import { BunCrypto } from "@effect/platform-bun";
import { Effect, type Crypto } from "effect";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  check,
  int,
  operationSignature,
  returnTerm,
  type CheckedProgram,
} from "../src/kernel-calculus/index.ts";
import {
  decodeEmissionMetadata,
  decodeNormalizedCore,
  emitNormalizedCore,
} from "../src/normalized-core/index.ts";

const run = <Value, Error>(effect: Effect.Effect<Value, Error, Crypto.Crypto>): Promise<Value> =>
  Effect.runPromise(effect.pipe(Effect.provide(BunCrypto.layer)));

const emptyMetadata = () => ({
  assumptions: [],
  source: { units: [], correspondence: [] },
});

describe("normalized-core custody and hostile boundaries", () => {
  test("a checked-program lookalike has no emission authority", async () => {
    const lookalike = {
      type: { kind: "return", grade: "1", value: { kind: "int" } },
      effects: [],
    } as unknown as CheckedProgram;
    expect(await run(emitNormalizedCore(lookalike, emptyMetadata()))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "custody.checked-program-required" }],
    });
  });

  test("metadata aliases, cycles, accessors, exotic values, and excess fields fail closed", () => {
    const shared: Array<unknown> = [];
    expect(
      decodeEmissionMetadata({
        assumptions: shared,
        source: { units: shared, correspondence: [] },
      }),
    ).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.repeated-reference" }],
    });

    const cyclic: Record<string, unknown> = {};
    cyclic["assumptions"] = [];
    cyclic["source"] = cyclic;
    expect(decodeEmissionMetadata(cyclic)).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.repeated-reference" }],
    });

    let reads = 0;
    const accessor = { assumptions: [] };
    Object.defineProperty(accessor, "source", {
      enumerable: true,
      get() {
        reads += 1;
        return { units: [], correspondence: [] };
      },
    });
    expect(decodeEmissionMetadata(accessor)).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.non-data" }],
    });
    expect(reads).toBe(0);

    const checked = check(operationSignature([]), returnTerm("1", int(1)));
    if (checked.status !== "accepted") throw new Error("fixture must check");
    expect(
      decodeEmissionMetadata({
        assumptions: [],
        source: { units: [], correspondence: [] },
        program: checked.program,
      }),
    ).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.exotic-object" }],
    });
    expect(
      decodeEmissionMetadata({
        assumptions: [],
        source: { units: [], correspondence: [] },
        authority: "ambient",
      }),
    ).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "schema.excess-property" }],
    });
  });

  test("emission snapshots caller input and returns a deeply immutable artifact", async () => {
    const checked = check(operationSignature([]), returnTerm("1", int(5)));
    if (checked.status !== "accepted") throw new Error("fixture must check");
    const metadata = {
      assumptions: [{ kind: "declared", statement: "Initial assertion" }],
      source: { units: [], correspondence: [] },
    };
    const result = await run(emitNormalizedCore(checked.program, metadata));
    expect(result.status).toBe("emitted");
    if (result.status !== "emitted") return;
    const before = result.bytes.slice();
    metadata.assumptions[0]!.statement = "Mutated later";
    expect(result.bytes).toEqual(before);
    expect(result.artifact.assumptions[0]?.statement).toBe("Initial assertion");
    expect(Object.isFrozen(result.artifact)).toBeTrue();
    expect(Object.isFrozen(result.artifact.assumptions)).toBeTrue();
    expect(() => {
      (result.artifact.assumptions as Array<unknown>).push({});
    }).toThrow();
  });

  test("unknown artifact bounds and repeated references reject before schema trust", async () => {
    const alias: Array<unknown> = [];
    expect(
      await run(
        decodeNormalizedCore({
          format: "semantic.normalized-core",
          assumptions: alias,
          signature: alias,
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.repeated-reference" }],
    });
    expect(
      decodeEmissionMetadata(emptyMetadata(), {
        maximumBytes: 1,
        maximumDepth: 1,
        maximumNodes: 1,
        maximumStringBytes: 1,
        maximumCollectionLength: 1,
        maximumOperations: 1,
        maximumAssumptions: 1,
        maximumSourceUnits: 1,
        maximumCorrespondences: 1,
      }),
    ).toMatchObject({ status: "rejected" });
  });

  test("the public entry point's relative-import closure reaches no runtime authority", () => {
    const entrypoint = resolve(import.meta.dirname, "../src/normalized-core/index.ts");
    const scanner = new Bun.Transpiler({ loader: "ts" });
    const visited = new Set<string>();
    const bareImports = new Set<string>();
    const visit = (path: string): void => {
      if (visited.has(path)) return;
      visited.add(path);
      for (const imported of scanner.scanImports(readFileSync(path, "utf8"))) {
        if (!imported.path.startsWith(".")) {
          bareImports.add(imported.path);
          continue;
        }
        const candidate = resolve(dirname(path), imported.path);
        const resolved = existsSync(candidate)
          ? candidate
          : existsSync(`${candidate}.ts`)
            ? `${candidate}.ts`
            : resolve(candidate, "index.ts");
        expect(existsSync(resolved)).toBeTrue();
        visit(resolved);
      }
    };

    visit(entrypoint);

    expect(
      [...bareImports].filter(
        (specifier) =>
          specifier === "bun" ||
          specifier.startsWith("node:") ||
          specifier.startsWith("@effect/platform-bun") ||
          specifier.startsWith("@effect/platform-node"),
      ),
    ).toEqual([]);
    expect(
      [...visited].filter((path) =>
        /(?:main-(?:bun|node)|toml-(?:bun|node)|curator-holder)\.ts$/.test(path),
      ),
    ).toEqual([]);
    expect([...visited].filter((path) => /(?:rust|lean|mlir|wasm)/i.test(path))).toEqual([]);
  });
});
