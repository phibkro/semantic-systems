import { describe, expect, test } from "bun:test";
import { BunCrypto } from "@effect/platform-bun";
import { Effect, Schema, type Crypto } from "effect";
import {
  apply,
  bool,
  boolType,
  check,
  effectRow,
  force,
  handle,
  int,
  intType,
  lambda,
  letTerm,
  operation,
  operationClause,
  operationSignature,
  pair,
  resumeTerm,
  returnClause,
  returnTerm,
  returnType,
  thunk,
  thunkType,
  unit,
  unitType,
  variable,
} from "../src/kernel-calculus/index.ts";
import {
  decodeEmissionMetadata,
  decodeNormalizedCore,
  decodeNormalizedCoreBytes,
  defaultNormalizedCoreBounds,
  emitNormalizedCore,
  validateNormalizedCore,
  validateNormalizedCoreBytes,
  type EmissionMetadataInput,
  type NormalizedCoreArtifact,
} from "../src/normalized-core/index.ts";
import { deriveIdentity, identityDomains } from "../src/normalized-core/identity.ts";

const run = <Value, Error>(effect: Effect.Effect<Value, Error, Crypto.Crypto>): Promise<Value> =>
  Effect.runPromise(effect.pipe(Effect.provide(BunCrypto.layer)));

const contentIdentity = `sha256:${"1".repeat(64)}` as const;

const emptyMetadataForBounds = () => ({
  assumptions: [],
  source: { units: [], correspondence: [] },
});

const handled = () => {
  const signature = operationSignature([
    {
      label: "fresh",
      operation: "allocate",
      argumentType: unitType(),
      resultType: intType(),
    },
  ]);
  const term = handle(
    "fresh",
    operation("1", "fresh", "allocate", unit()),
    returnClause(returnTerm("1", variable(0))),
    [operationClause("allocate", resumeTerm(0, int(7)))],
  );
  const checked = check(signature, term);
  if (checked.status !== "accepted") throw new Error("handled fixture must check");
  return checked.program;
};

const metadata = (
  sourceKey = "main",
  endByte = 32,
  statement = "SHA-256 is collision resistant",
): {
  assumptions: Array<{ kind: "declared"; statement: string }>;
  source: {
    units: Array<{
      source_key: string;
      uri: string;
      content_identity: typeof contentIdentity;
      byte_length: number;
    }>;
    correspondence: Array<{
      node_path: string;
      source_key: string;
      role: "expression" | "definition";
      start_byte: number;
      end_byte: number;
    }>;
  };
} => ({
  assumptions: [{ kind: "declared", statement }],
  source: {
    units: [
      {
        source_key: sourceKey,
        uri: "memory:handled",
        content_identity: contentIdentity,
        byte_length: 64,
      },
    ],
    correspondence: [
      {
        node_path: "/term",
        source_key: sourceKey,
        role: "expression",
        start_byte: 0,
        end_byte: endByte,
      },
      {
        node_path: "/signature/0",
        source_key: sourceKey,
        role: "definition",
        start_byte: 33,
        end_byte: 64,
      },
    ],
  },
});

const emitted = async (program = handled(), input: EmissionMetadataInput = metadata()) => {
  const result = await run(emitNormalizedCore(program, input));
  expect(result.status).toBe("emitted");
  if (result.status !== "emitted") throw new Error(result.diagnostics[0].message);
  return result;
};

const expectedHandledBytes = async (): Promise<Uint8Array> => {
  const encoded = await Bun.file(
    new URL("../examples/normalized-core/handled-program.expected.bytes.json", import.meta.url),
  ).json();
  if (typeof encoded !== "string") throw new Error("expected base64 fixture string");
  return Uint8Array.from(Buffer.from(encoded, "base64"));
};

const cloneArtifact = (artifact: NormalizedCoreArtifact): NormalizedCoreArtifact =>
  structuredClone(artifact);

const refreshRootIdentities = async (
  artifact: NormalizedCoreArtifact,
  refreshSemantic = true,
): Promise<NormalizedCoreArtifact> => {
  const mutable = cloneArtifact(artifact) as unknown as Record<string, unknown>;
  if (refreshSemantic) {
    const {
      artifact_identity: _artifactIdentity,
      semantic_identity: _semanticIdentity,
      source: _source,
      ...semantic
    } = mutable;
    mutable["semantic_identity"] = await run(
      deriveIdentity(identityDomains.semantic, semantic as never),
    );
  }
  const { artifact_identity: _artifactIdentity, ...artifactPayload } = mutable;
  mutable["artifact_identity"] = await run(
    deriveIdentity(identityDomains.artifact, artifactPayload as never),
  );
  return mutable as unknown as NormalizedCoreArtifact;
};

const acceptedProgram = (
  signature: Parameters<typeof check>[0],
  term: Parameters<typeof check>[1],
) => {
  const result = check(signature, term);
  if (result.status !== "accepted") throw new Error(result.diagnostics[0]?.message);
  return result.program;
};

describe("semantic.normalized-core version 1", () => {
  test("emits the frozen handled-program bytes and independently rechecks them", async () => {
    const result = await emitted();
    const expected = await Bun.file(
      new URL("../examples/normalized-core/handled-program.expected.json", import.meta.url),
    ).text();
    expect(result.artifact).toEqual(
      Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(expected) as NormalizedCoreArtifact,
    );
    expect(result.bytes).toEqual(await expectedHandledBytes());
    expect(result.artifact.semantic_identity).toBe(
      "sha256:154ff23841b0efd87075d176b3d807c67e9d2449880e5bce1c4d69421de99b78",
    );
    expect(result.artifact.artifact_identity).toBe(
      "sha256:86a6357e12434de54ed7f917ebd091f606f2074bfd8da3130668e251fd5e1eb1",
    );
    expect(await run(validateNormalizedCoreBytes(result.bytes))).toMatchObject({
      status: "accepted",
      checkSummary: { effects: [], usage: [] },
    });
  });

  test("round-trips signed integers and preserves negative zero", async () => {
    const negative = check(operationSignature([]), returnTerm("1", int(-4)));
    const negativeZero = check(operationSignature([]), returnTerm("1", int(-0)));
    const positiveZero = check(operationSignature([]), returnTerm("1", int(0)));
    if (
      negative.status !== "accepted" ||
      negativeZero.status !== "accepted" ||
      positiveZero.status !== "accepted"
    ) {
      throw new Error("integer fixtures must check");
    }
    const empty = { assumptions: [], source: { units: [], correspondence: [] } } as const;
    const [negativeArtifact, negativeZeroArtifact, positiveZeroArtifact] = await Promise.all([
      emitted(negative.program, empty),
      emitted(negativeZero.program, empty),
      emitted(positiveZero.program, empty),
    ]);
    expect(new TextDecoder().decode(negativeArtifact.bytes)).toContain('"value":-4');
    expect(new TextDecoder().decode(negativeZeroArtifact.bytes)).toContain('"value":-0');
    expect(negativeZeroArtifact.artifact.semantic_identity).not.toBe(
      positiveZeroArtifact.artifact.semantic_identity,
    );
    const decoded = await run(decodeNormalizedCoreBytes(negativeZeroArtifact.bytes));
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    expect(decoded.value.term).toMatchObject({
      tag: "return",
      value: { tag: "int", value: -0 },
    });
    if (decoded.value.term.tag === "return" && decoded.value.term.value.tag === "int") {
      expect(Object.is(decoded.value.term.value.value, -0)).toBeTrue();
    }
  });

  test("source-only changes preserve semantic identity; semantic changes do not", async () => {
    const [original, changedRange, changedAssumption] = await Promise.all([
      emitted(),
      emitted(handled(), metadata("main", 31)),
      emitted(handled(), metadata("main", 32, "One imported assertion")),
    ]);
    expect(changedRange.artifact.semantic_identity).toBe(original.artifact.semantic_identity);
    expect(changedRange.artifact.artifact_identity).not.toBe(original.artifact.artifact_identity);
    expect(changedAssumption.artifact.semantic_identity).not.toBe(
      original.artifact.semantic_identity,
    );
  });

  test("source-key renaming and metadata order are erased deterministically", async () => {
    const original = await emitted();
    const renamed = metadata("renamed");
    renamed.source.correspondence.reverse();
    const changed = await emitted(handled(), renamed);
    expect(changed.bytes).toEqual(original.bytes);
    expect(new TextDecoder().decode(changed.bytes)).not.toContain("renamed");
    expect(new TextDecoder().decode(changed.bytes)).not.toContain("source_key");
  });

  test("strict byte decoding rejects canonical, UTF-8, duplicate-key, and identity attacks", async () => {
    const original = await emitted();
    const text = new TextDecoder().decode(original.bytes);
    const whitespace = new TextEncoder().encode(` ${text}`);
    expect(await run(decodeNormalizedCoreBytes(whitespace))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "byte.canonical" }],
    });
    const duplicate = new TextEncoder().encode(
      text.replace('{"artifact_identity":', '{"format":"forged","artifact_identity":'),
    );
    expect(await run(decodeNormalizedCoreBytes(duplicate))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "byte.duplicate-key" }],
    });
    expect(await run(decodeNormalizedCoreBytes(Uint8Array.of(0xff)))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "byte.utf8" }],
    });
    const forged = {
      ...original.artifact,
      semantic_identity: `sha256:${"0".repeat(64)}`,
    } as NormalizedCoreArtifact;
    expect(await run(decodeNormalizedCore(forged))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "identity.semantic" }],
    });
    expect(
      await run(
        decodeNormalizedCoreBytes(new TextEncoder().encode(`${text.trimEnd()} trailing\n`)),
      ),
    ).toMatchObject({ status: "rejected" });
  });

  test("all entity/root forgeries and summary drift fail at their owning boundary", async () => {
    const original = await emitted();
    const zero = `sha256:${"0".repeat(64)}` as const;
    const mutations: ReadonlyArray<readonly [string, (artifact: NormalizedCoreArtifact) => void]> =
      [
        [
          "identity.operation",
          (artifact) => Object.assign(artifact.signature[0]!, { operation_identity: zero }),
        ],
        [
          "identity.assumption",
          (artifact) => Object.assign(artifact.assumptions[0]!, { assumption_identity: zero }),
        ],
        [
          "identity.source-unit",
          (artifact) => {
            Object.assign(artifact.source.units[0]!, { source_identity: zero });
            for (const correspondence of artifact.source.correspondence) {
              Object.assign(correspondence, { source_identity: zero });
            }
          },
        ],
        ["identity.artifact", (artifact) => Object.assign(artifact, { artifact_identity: zero })],
      ];
    for (const [code, mutate] of mutations) {
      const forged = cloneArtifact(original.artifact);
      mutate(forged);
      expect(await run(decodeNormalizedCore(forged))).toMatchObject({
        status: "rejected",
        diagnostics: [{ code }],
      });
    }

    const semanticForgery = cloneArtifact(original.artifact);
    Object.assign(semanticForgery, { semantic_identity: zero });
    const refreshedArtifact = await refreshRootIdentities(semanticForgery, false);
    expect(await run(decodeNormalizedCore(refreshedArtifact))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "identity.semantic" }],
    });

    for (const [field, value, code] of [
      ["type", { tag: "return", grade: "1", value: { tag: "bool" } }, "validation.summary-type"],
      ["effects", ["forged"], "validation.summary-effects"],
      ["usage", ["1"], "validation.summary-usage"],
    ] as const) {
      const summaryForgery = cloneArtifact(original.artifact);
      Object.assign(summaryForgery.summary, { [field]: value });
      const refreshedSummary = await refreshRootIdentities(summaryForgery);
      expect(await run(validateNormalizedCore(refreshedSummary))).toMatchObject({
        status: "rejected",
        diagnostics: [{ code }],
      });
    }
  });

  test("schema families reject missing/excess fields, duplicates, and unknown versions", async () => {
    const original = (await emitted()).artifact;
    const records = [
      (artifact: NormalizedCoreArtifact) => artifact as unknown as Record<string, unknown>,
      (artifact: NormalizedCoreArtifact) =>
        artifact.signature[0]! as unknown as Record<string, unknown>,
      (artifact: NormalizedCoreArtifact) =>
        artifact.signature[0]!.argument_type as unknown as Record<string, unknown>,
      (artifact: NormalizedCoreArtifact) => artifact.term as unknown as Record<string, unknown>,
      (artifact: NormalizedCoreArtifact) =>
        artifact.term.tag === "handle"
          ? (artifact.term.computation as unknown as Record<string, unknown>)
          : (artifact as unknown as Record<string, unknown>),
      (artifact: NormalizedCoreArtifact) =>
        artifact.term.tag === "handle"
          ? (artifact.term.return_clause as unknown as Record<string, unknown>)
          : (artifact as unknown as Record<string, unknown>),
      (artifact: NormalizedCoreArtifact) =>
        artifact.term.tag === "handle"
          ? (artifact.term.operation_clauses[0]! as unknown as Record<string, unknown>)
          : (artifact as unknown as Record<string, unknown>),
      (artifact: NormalizedCoreArtifact) =>
        artifact.assumptions[0]! as unknown as Record<string, unknown>,
      (artifact: NormalizedCoreArtifact) =>
        artifact.source.units[0]! as unknown as Record<string, unknown>,
      (artifact: NormalizedCoreArtifact) =>
        artifact.source.correspondence[0]! as unknown as Record<string, unknown>,
      (artifact: NormalizedCoreArtifact) => artifact.summary as unknown as Record<string, unknown>,
      (artifact: NormalizedCoreArtifact) => artifact.source as unknown as Record<string, unknown>,
    ] as const;
    for (const select of records) {
      const excess = cloneArtifact(original);
      select(excess)["authority"] = "ambient";
      expect(await run(decodeNormalizedCore(excess))).toMatchObject({
        status: "rejected",
        diagnostics: [{ code: "schema.excess-property" }],
      });
      const missing = cloneArtifact(original);
      const selected = select(missing);
      delete selected[Object.keys(selected)[0]!];
      expect(await run(decodeNormalizedCore(missing))).toMatchObject({
        status: "rejected",
      });
    }
    for (const field of ["format", "version"] as const) {
      const unknown = cloneArtifact(original) as unknown as Record<string, unknown>;
      unknown[field] = field === "format" ? "unknown" : 2;
      expect(await run(decodeNormalizedCore(unknown))).toMatchObject({ status: "rejected" });
    }
    for (const field of ["signature", "assumptions"] as const) {
      const duplicate = cloneArtifact(original);
      (duplicate[field] as unknown as Array<unknown>).push(structuredClone(duplicate[field][0]!));
      expect(await run(decodeNormalizedCore(duplicate))).toMatchObject({ status: "rejected" });
    }
    const duplicateSource = cloneArtifact(original);
    (duplicateSource.source.units as unknown as Array<unknown>).push(
      structuredClone(duplicateSource.source.units[0]!),
    );
    expect(await run(decodeNormalizedCore(duplicateSource))).toMatchObject({
      status: "rejected",
    });
  });

  test("source references, ranges, and exact duplicates reject", async () => {
    const unknownSource = metadata();
    unknownSource.source.correspondence[0]!.source_key = "missing";
    expect(await run(emitNormalizedCore(handled(), unknownSource))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "source.unknown-key" }],
    });
    const badRange = metadata();
    badRange.source.correspondence[0]!.end_byte = 65;
    expect(await run(emitNormalizedCore(handled(), badRange))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "source.range" }],
    });
    const duplicate = metadata();
    duplicate.source.correspondence.push(structuredClone(duplicate.source.correspondence[0]!));
    expect(await run(emitNormalizedCore(handled(), duplicate))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "source.duplicate-correspondence" }],
    });
  });

  test("every public resource bound has an executable rejection edge", async () => {
    const narrow = (field: keyof typeof defaultNormalizedCoreBounds, value: number) => ({
      ...defaultNormalizedCoreBounds,
      [field]: value,
    });
    expect(
      await run(
        decodeNormalizedCoreBytes(await expectedHandledBytes(), narrow("maximumBytes", 100)),
      ),
    ).toMatchObject({ status: "rejected", diagnostics: [{ code: "byte.bytes-exceeded" }] });
    for (const field of ["maximumDepth", "maximumNodes"] as const) {
      expect(decodeEmissionMetadata(emptyMetadataForBounds(), narrow(field, 1))).toMatchObject({
        status: "rejected",
      });
    }
    expect(
      decodeEmissionMetadata(
        {
          assumptions: [{ kind: "declared", statement: "xx" }],
          source: { units: [], correspondence: [] },
        },
        narrow("maximumStringBytes", 1),
      ),
    ).toMatchObject({ status: "rejected" });
    expect(
      decodeEmissionMetadata(
        {
          assumptions: [
            { kind: "declared", statement: "a" },
            { kind: "declared", statement: "b" },
          ],
          source: { units: [], correspondence: [] },
        },
        narrow("maximumCollectionLength", 1),
      ),
    ).toMatchObject({ status: "rejected" });
    expect(
      decodeEmissionMetadata(
        {
          assumptions: [
            { kind: "declared", statement: "a" },
            { kind: "declared", statement: "b" },
          ],
          source: { units: [], correspondence: [] },
        },
        narrow("maximumAssumptions", 1),
      ),
    ).toMatchObject({ status: "rejected" });
    const twoUnits = metadata();
    twoUnits.source.units.push({
      ...twoUnits.source.units[0]!,
      source_key: "two",
      uri: "memory:two",
    });
    expect(decodeEmissionMetadata(twoUnits, narrow("maximumSourceUnits", 1))).toMatchObject({
      status: "rejected",
    });
    expect(decodeEmissionMetadata(metadata(), narrow("maximumCorrespondences", 1))).toMatchObject({
      status: "rejected",
    });
    const twoOperations = operationSignature([
      { label: "a", operation: "x", argumentType: unitType(), resultType: unitType() },
      { label: "b", operation: "y", argumentType: unitType(), resultType: unitType() },
    ]);
    expect(
      await run(
        emitNormalizedCore(
          acceptedProgram(twoOperations, returnTerm("1", unit())),
          emptyMetadataForBounds(),
          narrow("maximumOperations", 1),
        ),
      ),
    ).toMatchObject({ status: "rejected", diagnostics: [{ code: "decode.operations-exceeded" }] });
  });

  test("full 0018 grammar, unhandled effects, canonical set order, and semantic sensitivity", async () => {
    const emptySignature = operationSignature([]);
    const grammarPrograms = [
      acceptedProgram(
        emptySignature,
        letTerm(returnTerm("1", int(1)), returnTerm("1", variable(0))),
      ),
      acceptedProgram(emptySignature, force(thunk(returnTerm("1", bool(true))))),
      acceptedProgram(
        emptySignature,
        apply(lambda(intType(), "1", returnTerm("1", variable(0))), int(2)),
      ),
      acceptedProgram(emptySignature, returnTerm("1", pair(bool(false), unit()))),
      acceptedProgram(
        emptySignature,
        lambda(
          thunkType(effectRow("z", "a"), returnType("1", intType())),
          "0",
          returnTerm("1", unit()),
        ),
      ),
      handled(),
    ];
    for (const program of grammarPrograms) {
      const artifact = await emitted(program, emptyMetadataForBounds());
      expect(await run(validateNormalizedCoreBytes(artifact.bytes))).toMatchObject({
        status: "accepted",
      });
    }
    const rowProgram = (labels: ReadonlyArray<string>) =>
      acceptedProgram(
        emptySignature,
        lambda(
          thunkType(effectRow(...labels), returnType("1", intType())),
          "0",
          returnTerm("1", unit()),
        ),
      );
    expect((await emitted(rowProgram(["z", "a"]), emptyMetadataForBounds())).bytes).toEqual(
      (await emitted(rowProgram(["a", "z"]), emptyMetadataForBounds())).bytes,
    );

    const unhandledSignature = operationSignature([
      { label: "visible", operation: "ask", argumentType: unitType(), resultType: intType() },
    ]);
    const unhandled = await emitted(
      acceptedProgram(unhandledSignature, operation("1", "visible", "ask", unit())),
      emptyMetadataForBounds(),
    );
    expect(unhandled.artifact.summary.effects).toEqual(["visible"]);

    const declarations = [
      { label: "h", operation: "a", argumentType: unitType(), resultType: intType() },
      { label: "h", operation: "b", argumentType: unitType(), resultType: intType() },
    ] as const;
    const handlerTerm = (reverse: boolean) =>
      handle(
        "h",
        operation("1", "h", "a", unit()),
        returnClause(returnTerm("1", variable(0))),
        reverse
          ? [
              operationClause("b", resumeTerm(0, int(2))),
              operationClause("a", resumeTerm(0, int(1))),
            ]
          : [
              operationClause("a", resumeTerm(0, int(1))),
              operationClause("b", resumeTerm(0, int(2))),
            ],
      );
    const ordered = await emitted(
      acceptedProgram(operationSignature(declarations), handlerTerm(false)),
      metadata(),
    );
    const reordered = await emitted(
      acceptedProgram(operationSignature([...declarations].reverse()), handlerTerm(true)),
      metadata(),
    );
    expect(reordered.bytes).toEqual(ordered.bytes);

    const semanticPrograms = [
      acceptedProgram(emptySignature, returnTerm("1", int(1))),
      acceptedProgram(emptySignature, returnTerm("1", int(2))),
      acceptedProgram(emptySignature, returnTerm("0", int(1))),
      acceptedProgram(
        operationSignature([
          { label: "x", operation: "op", argumentType: unitType(), resultType: intType() },
        ]),
        operation("1", "x", "op", unit()),
      ),
      acceptedProgram(
        operationSignature([
          { label: "x", operation: "op", argumentType: unitType(), resultType: boolType() },
        ]),
        operation("1", "x", "op", unit()),
      ),
      acceptedProgram(
        operationSignature([
          {
            label: "different-effect",
            operation: "op",
            argumentType: unitType(),
            resultType: intType(),
          },
        ]),
        operation("1", "different-effect", "op", unit()),
      ),
    ];
    const identities = await Promise.all(
      semanticPrograms.map(
        async (program) =>
          (await emitted(program, emptyMetadataForBounds())).artifact.semantic_identity,
      ),
    );
    expect(new Set(identities).size).toBe(identities.length);
  });

  test("source pointers resolve only normalized object coordinates", async () => {
    const badInputs = [
      "/source",
      "/signature",
      "/signature/00",
      "/signature/1",
      "/summary/effects",
      "/term/tag",
      "/term/~2",
    ];
    for (const nodePath of badInputs) {
      const input = metadata();
      input.source.correspondence[0] = {
        ...input.source.correspondence[0]!,
        node_path: nodePath,
      };
      expect(await run(emitNormalizedCore(handled(), input))).toMatchObject({
        status: "rejected",
      });
    }
  });
});
