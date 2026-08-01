import assert from "node:assert/strict";
import test from "node:test";
import { NodeCrypto } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { canonicalBytes, type CanonicalJsonValue } from "../src/normalized-core/canonical.ts";
import {
  analyzeJson,
  SemanticStore,
  type SemanticStoreShape,
  type SemanticStoreSnapshot,
  validateReceiptBytes,
} from "../src/language-build/index.ts";
import type { Identity } from "../src/normalized-core/index.ts";

const identity = (index: number): Identity =>
  `sha256:${index.toString(16).padStart(64, "0")}` as Identity;

const identities = [identity(1), identity(2), identity(3)] as const;
const snapshot: SemanticStoreSnapshot = Object.freeze({
  format: "semantic.language-build-store",
  version: 1,
  semantic_values: Object.freeze(
    identities.map((semanticIdentity) =>
      Object.freeze({ semantic_identity: semanticIdentity, artifacts: Object.freeze([]) }),
    ),
  ),
  name_bindings: Object.freeze([]),
});
const unavailable = () => Effect.die("unused fake store operation");
const service: SemanticStoreShape = {
  insert: unavailable,
  bindName: unavailable,
  resolveName: unavailable,
  replay: unavailable,
  snapshot: Effect.succeed(snapshot),
};

test("genuine Node derives and validates the host-neutral canonical reachability receipt", async () => {
  const [a, b, c] = identities;
  const input = JSON.stringify({
    format: "semantic.declared-dependency-graph",
    version: 1,
    root_semantic_identity: a,
    nodes: [
      { semantic_identity: c, runtime_dependencies: [] },
      { semantic_identity: a, runtime_dependencies: [c, b] },
      { semantic_identity: b, runtime_dependencies: [c] },
    ],
  });
  const layer = Layer.succeed(SemanticStore, service);
  const artifact = await Effect.runPromise(
    analyzeJson(input).pipe(Effect.provide([layer, NodeCrypto.layer])),
  );
  const validated = await Effect.runPromise(
    validateReceiptBytes(artifact.bytes).pipe(Effect.provide([layer, NodeCrypto.layer])),
  );

  assert.equal(
    artifact.receipt.graph.graph_identity,
    "sha256:5a2b7c6150d1581a7627a002c549596aa87ec103fbb2ff04444f73d251e036d5",
  );
  assert.equal(
    artifact.receipt.receipt_identity,
    "sha256:9c5c00c6a7946ca5de222a2327f0c78bf0b696ee5683cdbf07e201a328ee3a01",
  );
  assert.deepEqual(validated, artifact.receipt);
  assert.equal(
    new TextDecoder().decode(artifact.bytes),
    new TextDecoder().decode(canonicalBytes(artifact.receipt as unknown as CanonicalJsonValue)),
  );
});
