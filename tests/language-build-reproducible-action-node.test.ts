import assert from "node:assert/strict";
import test from "node:test";
import { NodeCrypto } from "@effect/platform-node";
import { Effect, type Crypto } from "effect";
import { check, int, operationSignature, returnTerm } from "../src/kernel-calculus/index.ts";
import {
  analyzeJson,
  buildRuntimeClosure,
  executeReproducibleAction,
  SemanticStore,
  SemanticStoreLayer,
  validateReproducibleActionReceiptBytes,
} from "../src/language-build/index.ts";
import {
  emitNormalizedCore,
  type EmissionMetadataInput,
  type NormalizedCoreDigestFailure,
} from "../src/normalized-core/index.ts";

const metadata: EmissionMetadataInput = {
  assumptions: [],
  source: {
    units: [
      {
        source_key: "main",
        uri: "memory:reproducible-action-node",
        content_identity: `sha256:${"8".repeat(64)}`,
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
};

const artifactBytes = (): Effect.Effect<Uint8Array, NormalizedCoreDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const checked = check(operationSignature([]), returnTerm("1", int(1)));
    if (checked.status !== "accepted") throw new Error("test program must check");
    const emitted = yield* emitNormalizedCore(checked.program, metadata);
    if (emitted.status !== "emitted") throw new Error(emitted.diagnostics[0].message);
    return emitted.bytes;
  });

test("genuine Node executes and validates the host-neutral action receipt", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* SemanticStore;
      const stored = yield* store.insert(yield* artifactBytes());
      const analysis = yield* analyzeJson(
        JSON.stringify({
          format: "semantic.declared-dependency-graph",
          version: 1,
          root_semantic_identity: stored.semantic_identity,
          nodes: [{ semantic_identity: stored.semantic_identity, runtime_dependencies: [] }],
        }),
      );
      const snapshotJson = JSON.stringify(yield* store.snapshot);
      const closure = yield* buildRuntimeClosure(
        snapshotJson,
        analysis.bytes,
        JSON.stringify({
          format: "semantic.runtime-artifact-selection",
          version: 1,
          members: [
            {
              semantic_identity: stored.semantic_identity,
              artifact_identity: stored.artifact_identity,
            },
          ],
        }),
      );
      const action = yield* executeReproducibleAction(
        snapshotJson,
        closure.bytes,
        JSON.stringify({
          format: "semantic.action-recipe",
          version: 1,
          action: { kind: "closure.member-count" },
        }),
        JSON.stringify({
          format: "semantic.action-environment",
          version: 1,
          runtime: "semantic.host-neutral-reference",
          capabilities: ["semantic.runtime-closure.member-count/v1"],
        }),
      );
      const validated = yield* validateReproducibleActionReceiptBytes(
        snapshotJson,
        closure.bytes,
        action.bytes,
      );
      return { action, validated };
    }).pipe(Effect.provide([SemanticStoreLayer, NodeCrypto.layer])),
  );

  assert.equal(result.action.receipt.observation.kind, "closure.member-count");
  assert.equal(
    result.action.receipt.receipt_identity,
    "sha256:f3854f915f858d1ec02bd4e02cf720bb9acdeece72fd52a2e194ed77164fdee6",
  );
  assert.deepEqual(result.validated, result.action.receipt);
  assert.equal(new TextDecoder().decode(result.action.bytes).endsWith("\n"), true);
});
