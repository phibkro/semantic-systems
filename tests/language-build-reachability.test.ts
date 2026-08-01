import { BunCrypto } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Crypto, Effect, Layer, Result } from "effect";
import { array, assert as fcAssert, asyncProperty, boolean, integer } from "fast-check";
import { check, int, operationSignature, returnTerm } from "../src/kernel-calculus/index.ts";
import { canonicalBytes, type CanonicalJsonValue } from "../src/normalized-core/canonical.ts";
import {
  analyzeJson,
  ReachabilityDigestFailure,
  ReachabilityGraphRejected,
  ReachabilityInputRejected,
  ReachabilityReceiptRejected,
  reachabilityBounds,
  type SemanticArtifactRejected,
  SemanticStore,
  SemanticStoreLayer,
  type SemanticStoreShape,
  type SemanticStoreSnapshot,
  validateReceiptBytes,
} from "../src/language-build/index.ts";
import {
  emitNormalizedCore,
  type EmissionMetadataInput,
  type Identity,
  type NormalizedCoreDigestFailure,
} from "../src/normalized-core/index.ts";

const contentIdentity = `sha256:${"7".repeat(64)}` as const;

const metadata = (value: number): EmissionMetadataInput => ({
  assumptions: [],
  source: {
    units: [
      {
        source_key: "main",
        uri: `memory:reachability-${value}`,
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

interface StoredFixture {
  readonly identities: readonly [Identity, Identity, Identity];
  readonly before: SemanticStoreSnapshot;
}

const storeThree = (): Effect.Effect<
  StoredFixture,
  NormalizedCoreDigestFailure | SemanticArtifactRejected,
  SemanticStore | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const store = yield* SemanticStore;
    const first = yield* store.insert(yield* artifactBytes(1));
    const second = yield* store.insert(yield* artifactBytes(2));
    const third = yield* store.insert(yield* artifactBytes(3));
    return {
      identities: [first.semantic_identity, second.semantic_identity, third.semantic_identity],
      before: yield* store.snapshot,
    };
  });

const graphJson = (
  root: string,
  nodes: ReadonlyArray<{
    readonly semantic_identity: string;
    readonly runtime_dependencies: ReadonlyArray<string>;
  }>,
): string =>
  JSON.stringify({
    format: "semantic.declared-dependency-graph",
    version: 1,
    root_semantic_identity: root,
    nodes,
  });

const run = <Value, Error>(
  effect: Effect.Effect<Value, Error, SemanticStore | Crypto.Crypto>,
): Promise<Value> =>
  Effect.runPromise(effect.pipe(Effect.provide([SemanticStoreLayer, BunCrypto.layer])));

const makeIdentity = (index: number): Identity =>
  `sha256:${index.toString(16).padStart(64, "0")}` as Identity;

const refreshOuterReceiptIdentity = (receipt: Record<string, unknown>): Uint8Array => {
  const payload = { ...receipt };
  delete payload["receipt_identity"];
  const domain = new TextEncoder().encode("semantic.language-build/reachability-receipt/v1");
  const payloadBytes = canonicalBytes(payload as CanonicalJsonValue, false);
  const preimage = new Uint8Array(domain.length + 1 + payloadBytes.length);
  preimage.set(domain);
  preimage.set(payloadBytes, domain.length + 1);
  receipt["receipt_identity"] = `sha256:${new Bun.CryptoHasher("sha256")
    .update(preimage)
    .digest("hex")}`;
  return canonicalBytes(receipt as CanonicalJsonValue);
};

const fakeStoreLayer = (
  identities: ReadonlyArray<string>,
  onSnapshot: () => void = () => undefined,
): Layer.Layer<SemanticStore> => {
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
    snapshot: Effect.sync(() => {
      onSnapshot();
      return snapshot;
    }),
  };
  return Layer.succeed(SemanticStore, service);
};

describe("declared reachability analysis receipt", () => {
  test("derives exact chain closure and immutable canonical bytes without changing the store", async () => {
    const result = await run(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const fixture = yield* storeThree();
        const [a, b, c] = fixture.identities;
        const artifact = yield* analyzeJson(
          graphJson(a, [
            { semantic_identity: a, runtime_dependencies: [b] },
            { semantic_identity: b, runtime_dependencies: [] },
            { semantic_identity: c, runtime_dependencies: [] },
          ]),
        );
        const validated = yield* validateReceiptBytes(artifact.bytes);
        return { fixture, artifact, validated, after: yield* store.snapshot };
      }),
    );

    const [a, b, c] = result.fixture.identities;
    expect(result.artifact.receipt.edge_authority).toBe("caller-declared");
    expect(result.artifact.receipt.reachable_semantic_identities).toEqual([a, b].sort());
    expect(result.artifact.receipt.unreachable_semantic_identities).toEqual([c]);
    expect(result.artifact.receipt.node_count).toBe(3);
    expect(result.artifact.receipt.edge_count).toBe(1);
    expect(result.validated).toEqual(result.artifact.receipt);
    expect(new TextDecoder().decode(result.artifact.bytes).endsWith("\n")).toBeTrue();
    const firstBytes = result.artifact.bytes;
    const secondBytes = result.artifact.bytes;
    expect(firstBytes).not.toBe(secondBytes);
    firstBytes[0] = 0;
    expect(result.artifact.bytes).toEqual(secondBytes);
    expect(result.after).toEqual(result.fixture.before);
    expect(Object.isFrozen(result.artifact.receipt)).toBeTrue();
    expect(Object.isFrozen(result.artifact.receipt.graph)).toBeTrue();
    expect(Object.isFrozen(result.artifact.receipt.graph.nodes)).toBeTrue();
    expect(
      Object.isFrozen(result.artifact.receipt.graph.nodes[0]!.runtime_dependencies),
    ).toBeTrue();
    expect(Object.isFrozen(result.artifact.receipt.reachable_semantic_identities)).toBeTrue();
  });

  test("terminates through a cycle and partitions a branched graph", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* storeThree();
        const [a, b, c] = fixture.identities;
        return yield* analyzeJson(
          graphJson(a, [
            { semantic_identity: a, runtime_dependencies: [b, c] },
            { semantic_identity: b, runtime_dependencies: [a] },
            { semantic_identity: c, runtime_dependencies: [] },
          ]),
        );
      }),
    );

    expect(result.receipt.reachable_semantic_identities).toHaveLength(3);
    expect(result.receipt.unreachable_semantic_identities).toEqual([]);
    expect(result.receipt.edge_count).toBe(3);
  });

  test("normalizes presentation order and separates graph identity from root", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* storeThree();
        const [a, b, c] = fixture.identities;
        const first = yield* analyzeJson(
          graphJson(a, [
            { semantic_identity: c, runtime_dependencies: [] },
            { semantic_identity: a, runtime_dependencies: [c, b] },
            { semantic_identity: b, runtime_dependencies: [] },
          ]),
        );
        const permuted = yield* analyzeJson(
          graphJson(a, [
            { semantic_identity: b, runtime_dependencies: [] },
            { semantic_identity: a, runtime_dependencies: [b, c] },
            { semantic_identity: c, runtime_dependencies: [] },
          ]),
        );
        const changedRoot = yield* analyzeJson(
          graphJson(b, [
            { semantic_identity: a, runtime_dependencies: [c, b] },
            { semantic_identity: b, runtime_dependencies: [] },
            { semantic_identity: c, runtime_dependencies: [] },
          ]),
        );
        return { first, permuted, changedRoot };
      }),
    );

    expect(result.permuted.receipt).toEqual(result.first.receipt);
    expect(result.permuted.bytes).toEqual(result.first.bytes);
    expect(result.changedRoot.receipt.graph.graph_identity).toBe(
      result.first.receipt.graph.graph_identity,
    );
    expect(result.changedRoot.receipt.receipt_identity).not.toBe(
      result.first.receipt.receipt_identity,
    );
  });

  test("matches an independent breadth-first oracle across generated small graphs", async () => {
    const identities = [makeIdentity(1), makeIdentity(2), makeIdentity(3)] as const;
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ] as const;
    await fcAssert(
      asyncProperty(
        array(boolean(), { minLength: 9, maxLength: 9 }),
        integer({ min: 0, max: 2 }),
        integer({ min: 0, max: orders.length - 1 }),
        boolean(),
        async (edges, rootIndex, orderIndex, reverseDependencies) => {
          const adjacency = identities.map((_subjectIdentity, subject) =>
            identities.filter(
              (_targetIdentity, target) => edges[subject * identities.length + target],
            ),
          );
          const queue = [rootIndex];
          const visited = new Set<number>();
          while (queue.length > 0) {
            const subject = queue.shift()!;
            if (visited.has(subject)) continue;
            visited.add(subject);
            for (let target = 0; target < identities.length; target += 1) {
              if (edges[subject * identities.length + target] && !visited.has(target)) {
                queue.push(target);
              }
            }
          }
          const nodes = orders[orderIndex]!.map((subject) => ({
            semantic_identity: identities[subject]!,
            runtime_dependencies: reverseDependencies
              ? [...adjacency[subject]!].reverse()
              : adjacency[subject]!,
          }));
          const result = await Effect.runPromise(
            analyzeJson(graphJson(identities[rootIndex]!, nodes)).pipe(
              Effect.provide([fakeStoreLayer(identities), BunCrypto.layer]),
            ),
          );
          const expectedReachable = identities.filter((_, index) => visited.has(index)).sort();
          const expectedUnreachable = identities.filter((_, index) => !visited.has(index)).sort();
          expect(result.receipt.reachable_semantic_identities).toEqual(expectedReachable);
          expect(result.receipt.unreachable_semantic_identities).toEqual(expectedUnreachable);
        },
      ),
      { numRuns: 64, seed: 0x0030 },
    );
  });

  test("keeps omitted stored values outside the declared graph universe", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* storeThree();
        const [a, b] = fixture.identities;
        return yield* analyzeJson(
          graphJson(a, [
            { semantic_identity: a, runtime_dependencies: [b] },
            { semantic_identity: b, runtime_dependencies: [] },
          ]),
        );
      }),
    );

    expect(result.receipt.node_count).toBe(2);
    expect(result.receipt.unreachable_semantic_identities).toEqual([]);
  });

  test("rejects malformed, duplicate, excess, and foreign declarations through typed failures", async () => {
    const results = await run(
      Effect.gen(function* () {
        const fixture = yield* storeThree();
        const [a, b, c] = fixture.identities;
        const foreign = makeIdentity(65_535);
        const candidates = [
          "{",
          `{"format":"semantic.declared-dependency-graph","format":"semantic.declared-dependency-graph","version":1,"root_semantic_identity":"${a}","nodes":[]}`,
          JSON.stringify({
            format: "semantic.declared-dependency-graph",
            version: 1,
            root_semantic_identity: a,
            nodes: [],
            surprise: true,
          }),
          graphJson(a, [
            { semantic_identity: a, runtime_dependencies: [] },
            { semantic_identity: a, runtime_dependencies: [] },
          ]),
          graphJson(a, [
            { semantic_identity: a, runtime_dependencies: [b, b] },
            { semantic_identity: b, runtime_dependencies: [] },
          ]),
          graphJson(a, [{ semantic_identity: foreign, runtime_dependencies: [] }]),
          graphJson(c, [
            { semantic_identity: a, runtime_dependencies: [] },
            { semantic_identity: b, runtime_dependencies: [] },
          ]),
          graphJson(a, [{ semantic_identity: a, runtime_dependencies: [foreign] }]),
        ];
        return yield* Effect.forEach(candidates, (candidate) =>
          analyzeJson(candidate).pipe(Effect.result),
        );
      }),
    );

    expect(results).toHaveLength(8);
    for (const result of results) {
      expect(Result.isFailure(result)).toBeTrue();
      if (Result.isFailure(result)) {
        expect(
          result.failure instanceof ReachabilityInputRejected ||
            result.failure instanceof ReachabilityGraphRejected,
        ).toBeTrue();
      }
    }
  });

  test("rejects excessive nesting, node count, and total edge count before traversal", async () => {
    const identities = Array.from({ length: 1_025 }, (_, index) => makeIdentity(index + 1));
    const nodeHeavy = graphJson(
      identities[0]!,
      identities.map((identity) => ({ semantic_identity: identity, runtime_dependencies: [] })),
    );
    const edgeIdentities = identities.slice(0, 65);
    const edgeHeavy = graphJson(
      edgeIdentities[0]!,
      edgeIdentities.map((identity) => ({
        semantic_identity: identity,
        runtime_dependencies: edgeIdentities,
      })),
    );
    const deep = `${"[".repeat(66)}0${"]".repeat(66)}`;
    const tooManyValues = `[${Array.from(
      { length: reachabilityBounds.maximumJsonValues + 1 },
      () => "0",
    ).join(",")}]`;
    const tooManyBytes = " ".repeat(reachabilityBounds.maximumBytes + 1);
    const results = await Effect.runPromise(
      Effect.all([
        analyzeJson(nodeHeavy).pipe(Effect.result),
        analyzeJson(edgeHeavy).pipe(Effect.result),
        analyzeJson(deep).pipe(Effect.result),
        analyzeJson(tooManyValues).pipe(Effect.result),
        analyzeJson(tooManyBytes).pipe(Effect.result),
      ]).pipe(Effect.provide([fakeStoreLayer(identities), BunCrypto.layer])),
    );

    expect(results.every(Result.isFailure)).toBeTrue();
    expect(Result.isFailure(results[0]!) && results[0].failure).toBeInstanceOf(
      ReachabilityGraphRejected,
    );
    expect(Result.isFailure(results[1]!) && results[1].failure).toBeInstanceOf(
      ReachabilityGraphRejected,
    );
    expect(Result.isFailure(results[2]!) && results[2].failure).toBeInstanceOf(
      ReachabilityInputRejected,
    );
    expect(Result.isFailure(results[3]!) && results[3].failure).toBeInstanceOf(
      ReachabilityInputRejected,
    );
    expect(Result.isFailure(results[4]!) && results[4].failure).toBeInstanceOf(
      ReachabilityInputRejected,
    );
  });

  test("reads exactly one store snapshot per public operation", async () => {
    const identity = makeIdentity(1);
    let snapshots = 0;
    const layer = fakeStoreLayer([identity], () => {
      snapshots += 1;
    });
    const artifact = await Effect.runPromise(
      analyzeJson(
        graphJson(identity, [{ semantic_identity: identity, runtime_dependencies: [] }]),
      ).pipe(Effect.provide([layer, BunCrypto.layer])),
    );
    expect(snapshots).toBe(1);
    const receipt = await Effect.runPromise(
      validateReceiptBytes(artifact.bytes).pipe(Effect.provide([layer, BunCrypto.layer])),
    );

    expect(snapshots).toBe(2);
    expect(receipt).toEqual(artifact.receipt);

    const malformedGraph = await Effect.runPromise(
      analyzeJson(42).pipe(Effect.provide([layer, BunCrypto.layer]), Effect.result),
    );
    const malformedReceipt = await Effect.runPromise(
      validateReceiptBytes("not bytes").pipe(
        Effect.provide([layer, BunCrypto.layer]),
        Effect.result,
      ),
    );
    expect(Result.isFailure(malformedGraph)).toBeTrue();
    expect(Result.isFailure(malformedReceipt)).toBeTrue();
    expect(snapshots).toBe(2);
  });

  test("preserves graph and receipt digest failures in the typed channel", async () => {
    const identity = makeIdentity(1);
    for (const failAt of [1, 2]) {
      let calls = 0;
      const failingCrypto = Layer.succeed(
        Crypto.Crypto,
        Crypto.make({
          randomBytes: (size) => new Uint8Array(size),
          digest: (_algorithm, bytes) => {
            calls += 1;
            return Effect.succeed(
              calls === failAt
                ? Uint8Array.of(0)
                : new Bun.CryptoHasher("sha256").update(bytes).digest(),
            );
          },
        }),
      );
      const result = await Effect.runPromise(
        analyzeJson(
          graphJson(identity, [{ semantic_identity: identity, runtime_dependencies: [] }]),
        ).pipe(Effect.provide([fakeStoreLayer([identity]), failingCrypto]), Effect.result),
      );

      expect(Result.isFailure(result)).toBeTrue();
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(ReachabilityDigestFailure);
      }
    }
  });

  test("maps a hostile digest observation to a typed digest failure", async () => {
    const identity = makeIdentity(1);
    const hostile = new Proxy(Uint8Array.of(0), {}) as Uint8Array;
    const hostileCrypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: () => Effect.succeed(hostile),
      }),
    );
    const result = await Effect.runPromise(
      analyzeJson(
        graphJson(identity, [{ semantic_identity: identity, runtime_dependencies: [] }]),
      ).pipe(Effect.provide([fakeStoreLayer([identity]), hostileCrypto]), Effect.result),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(ReachabilityDigestFailure);
  });

  test("strictly revalidates receipt bytes and rejects altered or hostile representations", async () => {
    const identity = makeIdentity(1);
    const layer = fakeStoreLayer([identity]);
    const artifact = await Effect.runPromise(
      analyzeJson(
        graphJson(identity, [{ semantic_identity: identity, runtime_dependencies: [] }]),
      ).pipe(Effect.provide([layer, BunCrypto.layer])),
    );
    const parsed = JSON.parse(new TextDecoder().decode(artifact.bytes)) as Record<string, unknown>;
    parsed["receipt_identity"] = makeIdentity(999);
    const altered = new TextEncoder().encode(`${JSON.stringify(parsed)}\n`);
    const pretty = new TextEncoder().encode(JSON.stringify(artifact.receipt, null, 2));
    const proxy = new Proxy(artifact.bytes, {});
    const results = await Effect.runPromise(
      Effect.all([
        validateReceiptBytes(altered).pipe(Effect.result),
        validateReceiptBytes(pretty).pipe(Effect.result),
        validateReceiptBytes(Uint8Array.of(0xff)).pipe(Effect.result),
        validateReceiptBytes("not bytes").pipe(Effect.result),
        validateReceiptBytes(proxy).pipe(Effect.result),
      ]).pipe(Effect.provide([layer, BunCrypto.layer])),
    );

    for (const result of results) {
      expect(Result.isFailure(result)).toBeTrue();
      if (Result.isFailure(result)) {
        expect(
          result.failure instanceof ReachabilityReceiptRejected ||
            result.failure instanceof ReachabilityGraphRejected,
        ).toBeTrue();
      }
    }
  });

  test("rejects forged closure, count, and graph identity despite a refreshed outer hash", async () => {
    const identity = makeIdentity(1);
    const layer = fakeStoreLayer([identity]);
    const artifact = await Effect.runPromise(
      analyzeJson(
        graphJson(identity, [{ semantic_identity: identity, runtime_dependencies: [] }]),
      ).pipe(Effect.provide([layer, BunCrypto.layer])),
    );
    const parse = (): Record<string, unknown> =>
      JSON.parse(new TextDecoder().decode(artifact.bytes)) as Record<string, unknown>;
    const closure = parse();
    closure["reachable_semantic_identities"] = [];
    closure["unreachable_semantic_identities"] = [identity];
    const count = parse();
    count["node_count"] = 0;
    const graphIdentity = parse();
    (graphIdentity["graph"] as Record<string, unknown>)["graph_identity"] = makeIdentity(999);
    const results = await Effect.runPromise(
      Effect.forEach([closure, count, graphIdentity], (forgery) =>
        validateReceiptBytes(refreshOuterReceiptIdentity(forgery)).pipe(Effect.result),
      ).pipe(Effect.provide([layer, BunCrypto.layer])),
    );

    expect(results.every(Result.isFailure)).toBeTrue();
    for (const result of results) {
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(ReachabilityReceiptRejected);
      }
    }
  });

  test("publishes the frozen resource bounds", () => {
    expect(reachabilityBounds).toEqual({
      maximumBytes: 1_048_576,
      maximumDepth: 64,
      maximumJsonValues: 16_384,
      maximumNodes: 1_024,
      maximumEdges: 4_096,
    });
  });
});
