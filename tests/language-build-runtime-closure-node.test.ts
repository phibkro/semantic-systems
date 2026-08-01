import assert from "node:assert/strict";
import test from "node:test";
import { NodeCrypto } from "@effect/platform-node";
import { Effect, type Crypto } from "effect";
import { check, int, operationSignature, returnTerm } from "../src/kernel-calculus/index.ts";
import {
  analyzeJson,
  buildRuntimeClosure,
  SemanticStore,
  SemanticStoreLayer,
  validateRuntimeClosureBytes,
} from "../src/language-build/index.ts";
import {
  emitNormalizedCore,
  type EmissionMetadataInput,
  type NormalizedCoreDigestFailure,
} from "../src/normalized-core/index.ts";

const contentIdentity = `sha256:${"7".repeat(64)}` as const;

const metadata = (value: number): EmissionMetadataInput => ({
  assumptions: [],
  source: {
    units: [
      {
        source_key: "main",
        uri: `memory:runtime-closure-node-${value}`,
        content_identity: contentIdentity,
        byte_length: 8,
      },
    ],
    correspondence: [
      {
        node_path: "/term",
        source_key: "main",
        role: "expression",
        start_byte: 0,
        end_byte: 1,
      },
    ],
  },
});

const artifactBytes = (
  value: number,
): Effect.Effect<Uint8Array, NormalizedCoreDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const checked = check(operationSignature([]), returnTerm("1", int(value)));
    if (checked.status !== "accepted") throw new Error("test program must check");
    const emitted = yield* emitNormalizedCore(checked.program, metadata(value));
    if (emitted.status !== "emitted") throw new Error(emitted.diagnostics[0].message);
    return emitted.bytes;
  });

test("genuine Node assembles the host-neutral semantic runtime closure", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* SemanticStore;
      const a = yield* store.insert(yield* artifactBytes(1));
      const b = yield* store.insert(yield* artifactBytes(2));
      const c = yield* store.insert(yield* artifactBytes(3));
      const receipt = yield* analyzeJson(
        JSON.stringify({
          format: "semantic.declared-dependency-graph",
          version: 1,
          root_semantic_identity: a.semantic_identity,
          nodes: [
            { semantic_identity: c.semantic_identity, runtime_dependencies: [] },
            {
              semantic_identity: a.semantic_identity,
              runtime_dependencies: [b.semantic_identity],
            },
            { semantic_identity: b.semantic_identity, runtime_dependencies: [] },
          ],
        }),
      );
      const snapshot = yield* store.snapshot;
      const snapshotJson = JSON.stringify(snapshot);
      const closure = yield* buildRuntimeClosure(
        snapshotJson,
        receipt.bytes,
        JSON.stringify({
          format: "semantic.runtime-artifact-selection",
          version: 1,
          members: [
            {
              semantic_identity: b.semantic_identity,
              artifact_identity: b.artifact_identity,
            },
            {
              semantic_identity: a.semantic_identity,
              artifact_identity: a.artifact_identity,
            },
          ],
        }),
      );
      const validated = yield* validateRuntimeClosureBytes(snapshotJson, closure.bytes);
      return { closure, validated };
    }).pipe(Effect.provide([SemanticStoreLayer, NodeCrypto.layer])),
  );

  assert.equal(
    result.closure.manifest.manifest_identity,
    "sha256:454e5b246be4a58a5429e59b8d4e398b7b58488635e75afba757cffe3476275e",
  );
  assert.deepEqual(result.validated, result.closure.manifest);
  assert.equal(new TextDecoder().decode(result.closure.bytes).endsWith("\n"), true);
});
