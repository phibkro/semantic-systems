import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NodeCrypto } from "@effect/platform-node";
import { Effect, Schema } from "effect";
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
import { emitNormalizedCore, validateNormalizedCoreBytes } from "../src/normalized-core/index.ts";

test("genuine Node emits and validates the frozen host-neutral bytes", async () => {
  const checked = check(
    operationSignature([
      {
        label: "fresh",
        operation: "allocate",
        argumentType: unitType(),
        resultType: intType(),
      },
    ]),
    handle(
      "fresh",
      operation("1", "fresh", "allocate", unit()),
      returnClause(returnTerm("1", variable(0))),
      [operationClause("allocate", resumeTerm(0, int(7)))],
    ),
  );
  assert.equal(checked.status, "accepted");
  if (checked.status !== "accepted") return;
  const effect = emitNormalizedCore(checked.program, {
    assumptions: [{ kind: "declared", statement: "SHA-256 is collision resistant" }],
    source: {
      units: [
        {
          source_key: "main",
          uri: "memory:handled",
          content_identity: `sha256:${"1".repeat(64)}`,
          byte_length: 64,
        },
      ],
      correspondence: [
        {
          node_path: "/term",
          source_key: "main",
          role: "expression",
          start_byte: 0,
          end_byte: 32,
        },
        {
          node_path: "/signature/0",
          source_key: "main",
          role: "definition",
          start_byte: 33,
          end_byte: 64,
        },
      ],
    },
  }).pipe(Effect.provide(NodeCrypto.layer));
  const result = await Effect.runPromise(effect);
  assert.equal(result.status, "emitted");
  if (result.status !== "emitted") return;
  const expected = await readFile(
    new URL("../examples/normalized-core/handled-program.expected.json", import.meta.url),
  );
  assert.deepEqual(
    result.artifact,
    Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(expected.toString("utf8")),
  );
  const expectedBase64 = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(
    await readFile(
      new URL("../examples/normalized-core/handled-program.expected.bytes.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(typeof expectedBase64, "string");
  if (typeof expectedBase64 !== "string") throw new Error("expected base64 fixture string");
  assert.deepEqual(result.bytes, Uint8Array.from(Buffer.from(expectedBase64, "base64")));
  assert.equal(
    (
      await Effect.runPromise(
        validateNormalizedCoreBytes(result.bytes).pipe(Effect.provide(NodeCrypto.layer)),
      )
    ).status,
    "accepted",
  );
});
