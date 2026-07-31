import { describe, expect, test } from "bun:test";
import { BunCrypto } from "@effect/platform-bun";
import { Effect, Schema, type Crypto } from "effect";
import {
  check,
  handle,
  int,
  intType,
  operation,
  operationClause,
  operationSignature,
  resumeTerm,
  returnClause,
  returnTerm,
  unit,
  unitType,
  variable,
} from "../src/kernel-calculus/index.ts";
import {
  decodeNormalizedCore,
  decodeNormalizedCoreBytes,
  emitNormalizedCore,
  validateNormalizedCoreBytes,
  type EmissionMetadataInput,
  type NormalizedCoreArtifact,
} from "../src/normalized-core/index.ts";

const run = <Value, Error>(effect: Effect.Effect<Value, Error, Crypto.Crypto>): Promise<Value> =>
  Effect.runPromise(effect.pipe(Effect.provide(BunCrypto.layer)));

const contentIdentity = `sha256:${"1".repeat(64)}` as const;

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

describe("semantic.normalized-core version 1", () => {
  test("emits the frozen handled-program bytes and independently rechecks them", async () => {
    const result = await emitted();
    const expected = await Bun.file(
      new URL("../examples/normalized-core/handled-program.expected.json", import.meta.url),
    ).text();
    expect(result.artifact).toEqual(
      Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(expected) as NormalizedCoreArtifact,
    );
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
