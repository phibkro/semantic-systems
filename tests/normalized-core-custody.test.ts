import { describe, expect, test } from "bun:test";
import { BunCrypto } from "@effect/platform-bun";
import { Crypto, Effect, Exit, Layer } from "effect";
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
  decodeNormalizedCoreBytes,
  emitNormalizedCore,
  validateNormalizedCoreBytes,
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
    const frozenShared = Object.freeze<Array<unknown>>([]);
    expect(
      decodeEmissionMetadata({
        assumptions: frozenShared,
        source: { units: frozenShared, correspondence: [] },
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

    const symbolInput = emptyMetadata();
    Object.defineProperty(symbolInput, Symbol("authority"), {
      value: true,
      enumerable: true,
    });
    expect(decodeEmissionMetadata(symbolInput)).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.symbol-key" }],
    });
    const sparse = emptyMetadata();
    sparse.assumptions.length = 1;
    expect(decodeEmissionMetadata(sparse)).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.sparse-array" }],
    });

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
    expect(
      decodeEmissionMetadata({
        ...emptyMetadata(),
        closure: () => "authority",
      }),
    ).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.non-json" }],
    });

    const exactFamilies = {
      assumptions: [{ kind: "declared", statement: "a" }],
      source: {
        units: [
          {
            source_key: "s",
            uri: "memory:s",
            content_identity: `sha256:${"1".repeat(64)}`,
            byte_length: 1,
          },
        ],
        correspondence: [
          {
            node_path: "/term",
            source_key: "s",
            role: "expression",
            start_byte: 0,
            end_byte: 1,
          },
        ],
      },
    };
    for (const selected of [
      exactFamilies.assumptions[0]!,
      exactFamilies.source,
      exactFamilies.source.units[0]!,
      exactFamilies.source.correspondence[0]!,
    ]) {
      const candidate = structuredClone(exactFamilies);
      const path =
        "kind" in selected
          ? candidate.assumptions[0]!
          : "units" in selected
            ? candidate.source
            : "source_key" in selected && "uri" in selected
              ? candidate.source.units[0]!
              : candidate.source.correspondence[0]!;
      (path as Record<string, unknown>)["authority"] = "ambient";
      expect(decodeEmissionMetadata(candidate)).toMatchObject({
        status: "rejected",
        diagnostics: [{ code: "schema.excess-property" }],
      });
    }
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

  test("lone surrogates reject during emission and decoded-byte traversal", async () => {
    for (const invalid of ["\ud800", "\udc00"]) {
      const checked = check(
        operationSignature([
          {
            label: invalid,
            operation: "op",
            argumentType: { kind: "unit" },
            resultType: { kind: "unit" },
          },
        ]),
        returnTerm("1", int(1)),
      );
      if (checked.status !== "accepted") throw new Error("0018 permits this counterexample");
      expect(await run(emitNormalizedCore(checked.program, emptyMetadata()))).toMatchObject({
        status: "rejected",
        diagnostics: [{ code: "decode.lone-surrogate" }],
      });

      const valid = check(operationSignature([]), returnTerm("1", int(1)));
      if (valid.status !== "accepted") throw new Error("fixture must check");
      const emitted = await run(emitNormalizedCore(valid.program, emptyMetadata()));
      if (emitted.status !== "emitted") throw new Error("fixture must emit");
      const escape = invalid === "\ud800" ? "\\ud800" : "\\udc00";
      const forged = new TextEncoder().encode(
        new TextDecoder()
          .decode(emitted.bytes)
          .replace('"semantic.normalized-core"', `"${escape}"`),
      );
      expect(await run(decodeNormalizedCoreBytes(forged))).toMatchObject({
        status: "rejected",
        diagnostics: [{ code: "decode.lone-surrogate" }],
      });
    }
  });

  test("below-byte-limit pathological nesting returns a typed depth rejection", async () => {
    const depth = 400_000;
    const bytes = new TextEncoder().encode(`${"[".repeat(depth)}0${"]".repeat(depth)}\n`);
    expect(bytes.byteLength).toBeLessThan(1_048_576);
    expect(await run(decodeNormalizedCoreBytes(bytes))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "decode.depth-exceeded" }],
    });
  });

  test("byte ingress snapshots once and returned byte observations remain stable", async () => {
    const checked = check(operationSignature([]), returnTerm("1", int(8)));
    if (checked.status !== "accepted") throw new Error("fixture must check");
    const emitted = await run(emitNormalizedCore(checked.program, emptyMetadata()));
    if (emitted.status !== "emitted") throw new Error("fixture must emit");

    expect(await run(decodeNormalizedCoreBytes(new Proxy(emitted.bytes, {})))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "byte.hostile-input" }],
    });

    let capturedSpecies: Uint8Array | undefined;
    const captureSpecies = (value: Uint8Array): void => {
      capturedSpecies = value;
    };
    class SpeciesInput extends Uint8Array {}
    Object.defineProperty(SpeciesInput, Symbol.species, {
      value: class extends Uint8Array {
        constructor(length: number) {
          super(length);
          captureSpecies(this);
        }
      },
    });
    const callerBytes = new SpeciesInput(emitted.bytes.byteLength);
    callerBytes.set(emitted.bytes);
    let mutated = false;
    const mutatingCrypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: (_algorithm, data) => {
          if (!mutated) {
            mutated = true;
            callerBytes[0] = "[".charCodeAt(0);
            if (capturedSpecies !== undefined) {
              capturedSpecies[0] = "[".charCodeAt(0);
            }
          }
          return Effect.succeed(new Bun.CryptoHasher("sha256").update(data).digest());
        },
      }),
    );
    const validated = await Effect.runPromise(
      validateNormalizedCoreBytes(callerBytes).pipe(Effect.provide(mutatingCrypto)),
    );
    expect(validated.status).toBe("accepted");
    expect(callerBytes[0]).toBe("[".charCodeAt(0));
    expect(capturedSpecies).toBeUndefined();
    if (validated.status !== "accepted") return;
    expect(validated.bytes[0]).toBe("{".charCodeAt(0));
    const validationExposure = validated.bytes;
    validationExposure[0] = "[".charCodeAt(0);
    expect(validated.bytes[0]).toBe("{".charCodeAt(0));

    const emissionExposure = emitted.bytes;
    emissionExposure[0] = "[".charCodeAt(0);
    expect(emitted.bytes[0]).toBe("{".charCodeAt(0));
  });

  test("malformed SHA-256 observations fail through the typed digest channel", async () => {
    const checked = check(operationSignature([]), returnTerm("1", int(9)));
    if (checked.status !== "accepted") throw new Error("fixture must check");
    const malformedCrypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: () => Effect.succeed(Uint8Array.of(0)),
      }),
    );
    const exit = await Effect.runPromiseExit(
      emitNormalizedCore(checked.program, emptyMetadata()).pipe(Effect.provide(malformedCrypto)),
    );
    expect(Exit.isFailure(exit)).toBeTrue();
    if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("invalid SHA-256 digest length");

    class HostileDigest extends Uint8Array {
      override [Symbol.iterator](): ArrayIterator<number> {
        return [0][Symbol.iterator]();
      }
    }
    const hostileCrypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: () => Effect.succeed(new HostileDigest(32)),
      }),
    );
    const hostileResult = await Effect.runPromise(
      emitNormalizedCore(checked.program, emptyMetadata()).pipe(Effect.provide(hostileCrypto)),
    );
    expect(hostileResult).toMatchObject({
      status: "emitted",
      artifact: {
        semantic_identity: `sha256:${"0".repeat(64)}`,
        artifact_identity: `sha256:${"0".repeat(64)}`,
      },
    });

    for (const hostile of [new Proxy(new Uint8Array(32), {}), { byteLength: 32 }]) {
      const invalidCrypto = Layer.succeed(
        Crypto.Crypto,
        Crypto.make({
          randomBytes: (size) => new Uint8Array(size),
          digest: () => Effect.succeed(hostile as Uint8Array),
        }),
      );
      expect(
        Exit.isFailure(
          await Effect.runPromiseExit(
            emitNormalizedCore(checked.program, emptyMetadata()).pipe(
              Effect.provide(invalidCrypto),
            ),
          ),
        ),
      ).toBeTrue();
    }
  });
});
