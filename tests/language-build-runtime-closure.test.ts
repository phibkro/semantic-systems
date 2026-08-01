import { BunCrypto } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Crypto, Effect, Layer, Result } from "effect";
import { check, int, operationSignature, returnTerm } from "../src/kernel-calculus/index.ts";
import {
  analyzeJson,
  buildRuntimeClosure,
  ReachabilityReceiptRejected,
  RuntimeClosureDigestFailure,
  RuntimeClosureManifestRejected,
  RuntimeClosureMembershipRejected,
  RuntimeClosureSelectionRejected,
  RuntimeClosureSnapshotRejected,
  runtimeClosureBounds,
  SemanticStore,
  SemanticStoreLayer,
  type SemanticStoreSnapshot,
  validateRuntimeClosureBytes,
} from "../src/language-build/index.ts";
import { canonicalBytes, type CanonicalJsonValue } from "../src/normalized-core/canonical.ts";
import {
  emitNormalizedCore,
  type EmissionMetadataInput,
  type Identity,
  type NormalizedCoreDigestFailure,
} from "../src/normalized-core/index.ts";

const contentIdentity = `sha256:${"7".repeat(64)}` as const;

const metadata = (value: number, endByte = 1): EmissionMetadataInput => ({
  assumptions: [],
  source: {
    units: [
      {
        source_key: "main",
        uri: `memory:runtime-closure-${value}`,
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
        end_byte: endByte,
      },
    ],
  },
});

const artifactBytes = (
  value: number,
  endByte = 1,
): Effect.Effect<Uint8Array, NormalizedCoreDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const checked = check(operationSignature([]), returnTerm("1", int(value)));
    if (checked.status !== "accepted") throw new Error("test program must check");
    const emitted = yield* emitNormalizedCore(checked.program, metadata(value, endByte));
    if (emitted.status !== "emitted") throw new Error(emitted.diagnostics[0].message);
    return emitted.bytes;
  });

interface Fixture {
  readonly receiptBytes: Uint8Array;
  readonly snapshot: SemanticStoreSnapshot;
  readonly a: Identity;
  readonly b: Identity;
  readonly c: Identity;
  readonly aArtifact: Identity;
  readonly aVariant: Identity;
  readonly bArtifact: Identity;
  readonly cArtifact: Identity;
}

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

const selectionJson = (
  members: ReadonlyArray<{
    readonly semantic_identity: string;
    readonly artifact_identity: string;
  }>,
): string =>
  JSON.stringify({
    format: "semantic.runtime-artifact-selection",
    version: 1,
    members,
  });

const snapshotJson = (
  snapshot: SemanticStoreSnapshot,
  nameBindings: ReadonlyArray<{
    readonly name: string;
    readonly semantic_identity: string;
  }> = snapshot.name_bindings,
): string => JSON.stringify({ ...snapshot, name_bindings: nameBindings });

const createFixture = (): Effect.Effect<Fixture, unknown, SemanticStore | Crypto.Crypto> =>
  Effect.gen(function* () {
    const store = yield* SemanticStore;
    const aStored = yield* store.insert(yield* artifactBytes(1));
    const aVariant = yield* store.insert(yield* artifactBytes(1, 2));
    const bStored = yield* store.insert(yield* artifactBytes(2));
    const cStored = yield* store.insert(yield* artifactBytes(3));
    const receipt = yield* analyzeJson(
      graphJson(aStored.semantic_identity, [
        {
          semantic_identity: cStored.semantic_identity,
          runtime_dependencies: [],
        },
        {
          semantic_identity: aStored.semantic_identity,
          runtime_dependencies: [bStored.semantic_identity],
        },
        {
          semantic_identity: bStored.semantic_identity,
          runtime_dependencies: [],
        },
      ]),
    );
    return {
      receiptBytes: receipt.bytes,
      snapshot: yield* store.snapshot,
      a: aStored.semantic_identity,
      b: bStored.semantic_identity,
      c: cStored.semantic_identity,
      aArtifact: aStored.artifact_identity,
      aVariant: aVariant.artifact_identity,
      bArtifact: bStored.artifact_identity,
      cArtifact: cStored.artifact_identity,
    };
  });

const run = <Value, Error>(
  effect: Effect.Effect<Value, Error, SemanticStore | Crypto.Crypto>,
): Promise<Value> =>
  Effect.runPromise(effect.pipe(Effect.provide([SemanticStoreLayer, BunCrypto.layer])));

const selected = (fixture: Fixture, reverse = false, variant = false): string => {
  const members = [
    {
      semantic_identity: fixture.a,
      artifact_identity: variant ? fixture.aVariant : fixture.aArtifact,
    },
    { semantic_identity: fixture.b, artifact_identity: fixture.bArtifact },
  ];
  return selectionJson(reverse ? members.reverse() : members);
};

const makeIdentity = (index: number): Identity =>
  `sha256:${index.toString(16).padStart(64, "0")}` as Identity;

const refreshIdentity = (
  document: Record<string, unknown>,
  field: string,
  domain: string,
): void => {
  const payload = { ...document };
  delete payload[field];
  const domainBytes = new TextEncoder().encode(domain);
  const payloadBytes = canonicalBytes(payload as CanonicalJsonValue, false);
  const preimage = new Uint8Array(domainBytes.length + 1 + payloadBytes.length);
  preimage.set(domainBytes);
  preimage.set(payloadBytes, domainBytes.length + 1);
  document[field] = `sha256:${new Bun.CryptoHasher("sha256").update(preimage).digest("hex")}`;
};

describe("semantic runtime-closure manifest", () => {
  test("assembles and validates the exact reachable artifact selection", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const artifact = yield* buildRuntimeClosure(
          snapshotJson(fixture.snapshot),
          fixture.receiptBytes,
          selected(fixture),
        );
        const validated = yield* validateRuntimeClosureBytes(
          snapshotJson(fixture.snapshot),
          artifact.bytes,
        );
        return { fixture, artifact, validated };
      }),
    );

    expect(result.artifact.manifest.analysis.reachable_semantic_identities).toEqual(
      [result.fixture.a, result.fixture.b].sort(),
    );
    expect(result.artifact.manifest.members).toEqual(
      [
        { semantic_identity: result.fixture.a, artifact_identity: result.fixture.aArtifact },
        { semantic_identity: result.fixture.b, artifact_identity: result.fixture.bArtifact },
      ].sort((left, right) => left.semantic_identity.localeCompare(right.semantic_identity)),
    );
    expect(result.artifact.manifest.excluded_semantic_identities).toEqual([result.fixture.c]);
    expect(result.artifact.manifest.edge_authority).toBe("caller-declared");
    expect(result.artifact.manifest.artifact_selection_authority).toBe("caller-selected");
    expect(result.artifact.manifest.member_count).toBe(2);
    expect(result.artifact.manifest.excluded_count).toBe(1);
    expect(result.validated).toEqual(result.artifact.manifest);
    expect(new TextDecoder().decode(result.artifact.bytes).endsWith("\n")).toBeTrue();
    expect(Object.isFrozen(result.artifact.manifest)).toBeTrue();
    expect(Object.isFrozen(result.artifact.manifest.members)).toBeTrue();
    expect(Object.isFrozen(result.artifact.manifest.members[0])).toBeTrue();
    expect(Object.isFrozen(result.artifact.manifest.analysis.graph.nodes)).toBeTrue();
  });

  test("normalizes selection order and remains sensitive only to the chosen present variant", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const first = yield* buildRuntimeClosure(
          snapshotJson(fixture.snapshot),
          fixture.receiptBytes,
          selected(fixture),
        );
        const permuted = yield* buildRuntimeClosure(
          snapshotJson(fixture.snapshot),
          fixture.receiptBytes,
          selected(fixture, true),
        );
        const variant = yield* buildRuntimeClosure(
          snapshotJson(fixture.snapshot),
          fixture.receiptBytes,
          selected(fixture, false, true),
        );
        return { fixture, first, permuted, variant };
      }),
    );

    expect(result.permuted.bytes).toEqual(result.first.bytes);
    expect(result.permuted.manifest.manifest_identity).toBe(
      result.first.manifest.manifest_identity,
    );
    expect(result.variant.manifest.analysis).toEqual(result.first.manifest.analysis);
    expect(
      result.variant.manifest.members.find(
        (member) => member.semantic_identity === result.fixture.a,
      )?.artifact_identity,
    ).not.toBe(
      result.first.manifest.members.find((member) => member.semantic_identity === result.fixture.a)
        ?.artifact_identity,
    );
    expect(result.variant.manifest.manifest_identity).not.toBe(
      result.first.manifest.manifest_identity,
    );
  });

  test("rejects missing, extra, duplicate, unreachable, outside-universe, and name-shaped members", async () => {
    const results = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const foreign = makeIdentity(999);
        const cases = [
          selectionJson([{ semantic_identity: fixture.a, artifact_identity: fixture.aArtifact }]),
          selectionJson([
            { semantic_identity: fixture.a, artifact_identity: fixture.aArtifact },
            { semantic_identity: fixture.b, artifact_identity: fixture.bArtifact },
            { semantic_identity: fixture.c, artifact_identity: fixture.cArtifact },
          ]),
          selectionJson([
            { semantic_identity: fixture.a, artifact_identity: fixture.aArtifact },
            { semantic_identity: fixture.a, artifact_identity: fixture.aVariant },
            { semantic_identity: fixture.b, artifact_identity: fixture.bArtifact },
          ]),
          selectionJson([
            { semantic_identity: fixture.a, artifact_identity: fixture.aArtifact },
            { semantic_identity: fixture.b, artifact_identity: fixture.bArtifact },
            { semantic_identity: foreign, artifact_identity: fixture.cArtifact },
          ]),
        ];
        const membership = yield* Effect.forEach(cases, (candidate) =>
          buildRuntimeClosure(snapshotJson(fixture.snapshot), fixture.receiptBytes, candidate).pipe(
            Effect.result,
          ),
        );
        const name = yield* buildRuntimeClosure(
          snapshotJson(fixture.snapshot),
          fixture.receiptBytes,
          JSON.stringify({
            format: "semantic.runtime-artifact-selection",
            version: 1,
            members: [{ semantic_identity: "entry", artifact_identity: fixture.aArtifact }],
          }),
        ).pipe(Effect.result);
        return { membership, name };
      }),
    );

    expect(results.membership.every(Result.isFailure)).toBeTrue();
    for (const result of results.membership) {
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(RuntimeClosureMembershipRejected);
      }
    }
    expect(Result.isFailure(results.name)).toBeTrue();
    if (Result.isFailure(results.name)) {
      expect(results.name.failure).toBeInstanceOf(RuntimeClosureSelectionRejected);
    }
  });

  test("rejects an artifact owned by another semantic value", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        return yield* buildRuntimeClosure(
          snapshotJson(fixture.snapshot),
          fixture.receiptBytes,
          selectionJson([
            { semantic_identity: fixture.a, artifact_identity: fixture.bArtifact },
            { semantic_identity: fixture.b, artifact_identity: fixture.bArtifact },
          ]),
        ).pipe(Effect.result);
      }),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(RuntimeClosureMembershipRejected);
    }
  });

  test("rejects a forged embedded receipt even when both enclosing identities are refreshed", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const artifact = yield* buildRuntimeClosure(
          snapshotJson(fixture.snapshot),
          fixture.receiptBytes,
          selected(fixture),
        );
        const forged = JSON.parse(new TextDecoder().decode(artifact.bytes)) as Record<
          string,
          unknown
        >;
        const analysis = forged["analysis"] as Record<string, unknown>;
        analysis["reachable_semantic_identities"] = [fixture.a];
        analysis["unreachable_semantic_identities"] = [fixture.b, fixture.c].sort();
        refreshIdentity(
          analysis,
          "receipt_identity",
          "semantic.language-build/reachability-receipt/v1",
        );
        refreshIdentity(
          forged,
          "manifest_identity",
          "semantic.language-build/runtime-closure-manifest/v1",
        );
        return yield* validateRuntimeClosureBytes(
          snapshotJson(fixture.snapshot),
          canonicalBytes(forged as CanonicalJsonValue),
        ).pipe(Effect.result);
      }),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result))
      expect(result.failure).toBeInstanceOf(ReachabilityReceiptRejected);
  });

  test("erases authored names and makes their projection invariant", async () => {
    const fixture = await run(createFixture());
    const first = await Effect.runPromise(
      buildRuntimeClosure(
        snapshotJson(fixture.snapshot, [{ name: "entry", semantic_identity: fixture.a }]),
        fixture.receiptBytes,
        selected(fixture),
      ).pipe(Effect.provide(BunCrypto.layer)),
    );
    const changedNames = snapshotJson(fixture.snapshot, [
      { name: "renamed-entry", semantic_identity: fixture.b },
      { name: "unused", semantic_identity: fixture.c },
    ]);
    const second = await Effect.runPromise(
      buildRuntimeClosure(changedNames, fixture.receiptBytes, selected(fixture)).pipe(
        Effect.provide(BunCrypto.layer),
      ),
    );
    const validated = await Effect.runPromise(
      validateRuntimeClosureBytes(changedNames, first.bytes).pipe(Effect.provide(BunCrypto.layer)),
    );

    expect(second.bytes).toEqual(first.bytes);
    expect(second.manifest.manifest_identity).toBe(first.manifest.manifest_identity);
    expect(validated).toEqual(first.manifest);
  });

  test("rejects arbitrary objects and replay-invalid JSON witnesses", async () => {
    const fixture = await run(createFixture());
    let proxyTraps = 0;
    const proxy = new Proxy(fixture.snapshot, {
      getOwnPropertyDescriptor: () => {
        proxyTraps += 1;
        throw new Error("caller object must remain uninspected");
      },
    });
    const objectRepresentations: ReadonlyArray<unknown> = [
      fixture.snapshot,
      proxy,
      new TextEncoder().encode(snapshotJson(fixture.snapshot)),
    ];
    const overLimit = Array.from({ length: 1_025 }, () => fixture.snapshot.semantic_values[0]!);
    const forged = fixture.snapshot.semantic_values.map((value, index) =>
      index === 0 ? { ...value, semantic_identity: makeIdentity(60_000) } : value,
    );
    const jsonRepresentations = [
      JSON.stringify({ ...fixture.snapshot, semantic_values: overLimit }),
      JSON.stringify({ ...fixture.snapshot, semantic_values: forged }),
    ];
    const results = await Effect.runPromise(
      Effect.forEach([...objectRepresentations, ...jsonRepresentations], (candidate) =>
        buildRuntimeClosure(candidate, fixture.receiptBytes, selected(fixture)).pipe(Effect.result),
      ).pipe(Effect.provide(BunCrypto.layer)),
    );

    expect(results.every(Result.isFailure)).toBeTrue();
    for (const result of results) {
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(RuntimeClosureSnapshotRejected);
      }
    }
    expect(proxyTraps).toBe(0);
  });

  test("admits one primitive snapshot view that cannot move with its former source", async () => {
    const fixture = await run(createFixture());
    const mutable = JSON.parse(snapshotJson(fixture.snapshot)) as {
      semantic_values: unknown[];
    };
    const captured = JSON.stringify(mutable);
    mutable.semantic_values.length = 0;
    const artifact = await Effect.runPromise(
      buildRuntimeClosure(captured, fixture.receiptBytes, selected(fixture)).pipe(
        Effect.provide(BunCrypto.layer),
      ),
    );

    expect(mutable.semantic_values).toEqual([]);
    expect(artifact.manifest.member_count).toBe(2);
  });

  test("accepts witness extension but rejects loss of a selected artifact", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const artifact = yield* buildRuntimeClosure(
          snapshotJson(fixture.snapshot),
          fixture.receiptBytes,
          selected(fixture),
        );
        const store = yield* SemanticStore;
        yield* store.insert(yield* artifactBytes(2, 2));
        yield* store.insert(yield* artifactBytes(4));
        const extended = yield* store.snapshot;
        const validated = yield* validateRuntimeClosureBytes(
          snapshotJson(extended),
          artifact.bytes,
        );
        const staleWitness: SemanticStoreSnapshot = Object.freeze({
          ...fixture.snapshot,
          semantic_values: Object.freeze(
            fixture.snapshot.semantic_values.map((value) =>
              value.semantic_identity === fixture.a
                ? Object.freeze({
                    ...value,
                    artifacts: Object.freeze(
                      value.artifacts.filter(
                        (candidate) => candidate.artifact_identity !== fixture.aArtifact,
                      ),
                    ),
                  })
                : value,
            ),
          ),
        });
        const stale = yield* validateRuntimeClosureBytes(
          snapshotJson(staleWitness),
          artifact.bytes,
        ).pipe(Effect.result);
        return { artifact, extended, validated, stale };
      }),
    );

    expect(result.extended.semantic_values).toHaveLength(4);
    expect(result.validated).toEqual(result.artifact.manifest);
    expect(Result.isFailure(result.stale)).toBeTrue();
    if (Result.isFailure(result.stale)) {
      expect(result.stale.failure).toBeInstanceOf(RuntimeClosureMembershipRejected);
    }
  });

  test("invalid representations and over-limit selections never inspect the snapshot witness", async () => {
    const fixture = await run(createFixture());
    let inspections = 0;
    const hostileSnapshot = new Proxy(fixture.snapshot, {
      getOwnPropertyDescriptor: () => {
        inspections += 1;
        throw new Error("snapshot must not be inspected");
      },
    });
    const overLimitSelection = selectionJson(
      Array.from({ length: runtimeClosureBounds.maximumMembers + 1 }, (_, index) => ({
        semantic_identity: makeIdentity(index + 1),
        artifact_identity: makeIdentity(index + 10_000),
      })),
    );
    const overCodeUnitSelection = " ".repeat(runtimeClosureBounds.maximumBytes + 1);
    const overLimitManifest = new Uint8Array(runtimeClosureBounds.maximumBytes + 1);
    const results = await Effect.runPromise(
      Effect.all([
        buildRuntimeClosure(hostileSnapshot, "not bytes", selected(fixture)).pipe(Effect.result),
        buildRuntimeClosure(hostileSnapshot, fixture.receiptBytes, "{").pipe(Effect.result),
        buildRuntimeClosure(hostileSnapshot, fixture.receiptBytes, overCodeUnitSelection).pipe(
          Effect.result,
        ),
        buildRuntimeClosure(hostileSnapshot, fixture.receiptBytes, overLimitSelection).pipe(
          Effect.result,
        ),
        validateRuntimeClosureBytes(hostileSnapshot, "not bytes").pipe(Effect.result),
        validateRuntimeClosureBytes(hostileSnapshot, overLimitManifest).pipe(Effect.result),
        validateRuntimeClosureBytes(hostileSnapshot, Uint8Array.of(0xff)).pipe(Effect.result),
      ]).pipe(Effect.provide(BunCrypto.layer)),
    );

    expect(results.every((result) => "failure" in result)).toBeTrue();
    expect(inspections).toBe(0);
  });

  test("bounds snapshot JSON by code units, UTF-8 bytes, depth, values, keys, and schema", async () => {
    const fixture = await run(createFixture());
    const duplicate = `{"format":"semantic.language-build-store","format":"semantic.language-build-store","version":1,"semantic_values":[],"name_bindings":[]}`;
    const overDepth = `${"[".repeat(runtimeClosureBounds.maximumSnapshotDepth + 2)}0${"]".repeat(runtimeClosureBounds.maximumSnapshotDepth + 2)}`;
    const overValues = `[${Array.from(
      { length: runtimeClosureBounds.maximumSnapshotJsonValues + 1 },
      () => "0",
    ).join(",")}]`;
    const overCodeUnits = " ".repeat(runtimeClosureBounds.maximumSnapshotBytes + 1);
    const overUtf8Bytes = "é".repeat(Math.floor(runtimeClosureBounds.maximumSnapshotBytes / 2) + 1);
    const candidates = [
      "{",
      duplicate,
      overDepth,
      overValues,
      JSON.stringify({ ...fixture.snapshot, surprise: true }),
      overCodeUnits,
      overUtf8Bytes,
    ];
    const results = await Effect.runPromise(
      Effect.forEach(candidates, (candidate) =>
        buildRuntimeClosure(candidate, fixture.receiptBytes, selected(fixture)).pipe(Effect.result),
      ).pipe(Effect.provide(BunCrypto.layer)),
    );

    expect(results.every(Result.isFailure)).toBeTrue();
    for (const result of results) {
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(RuntimeClosureSnapshotRejected);
      }
    }
    if (
      Result.isFailure(results[5]!) &&
      results[5].failure instanceof RuntimeClosureSnapshotRejected
    ) {
      expect(results[5].failure.reason).toContain("UTF-16 code units");
    }
    if (
      Result.isFailure(results[6]!) &&
      results[6].failure instanceof RuntimeClosureSnapshotRejected
    ) {
      expect(results[6].failure.reason).toContain("UTF-8 bytes");
    }
  });

  test("returns a typed failure when the manifest digest observation is invalid", async () => {
    const fixture = await run(createFixture());
    const manifestDomain = new TextEncoder().encode(
      "semantic.language-build/runtime-closure-manifest/v1",
    );
    let rejectedManifestDigest = false;
    const crypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: (_algorithm, bytes) => {
          const isManifest =
            bytes.byteLength > manifestDomain.byteLength &&
            manifestDomain.every((byte, index) => bytes[index] === byte) &&
            bytes[manifestDomain.byteLength] === 0;
          if (isManifest) rejectedManifestDigest = true;
          return Effect.succeed(
            isManifest ? Uint8Array.of(0) : new Bun.CryptoHasher("sha256").update(bytes).digest(),
          );
        },
      }),
    );
    const result = await Effect.runPromise(
      buildRuntimeClosure(
        snapshotJson(fixture.snapshot),
        fixture.receiptBytes,
        selected(fixture),
      ).pipe(Effect.provide(crypto), Effect.result),
    );

    expect(Result.isFailure(result)).toBeTrue();
    expect(rejectedManifestDigest).toBeTrue();
    if (Result.isFailure(result))
      expect(result.failure).toBeInstanceOf(RuntimeClosureDigestFailure);
  });

  test("maps normalized-core replay digest failure with the snapshot-replay phase", async () => {
    const fixture = await run(createFixture());
    const semanticDomain = new TextEncoder().encode("semantic.normalized-core/semantic/v1");
    const crypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: (_algorithm, bytes) => {
          const isReplayDigest =
            bytes.byteLength > semanticDomain.byteLength &&
            semanticDomain.every((byte, index) => bytes[index] === byte) &&
            bytes[semanticDomain.byteLength] === 0;
          return Effect.succeed(
            isReplayDigest
              ? Uint8Array.of(0)
              : new Bun.CryptoHasher("sha256").update(bytes).digest(),
          );
        },
      }),
    );
    const result = await Effect.runPromise(
      buildRuntimeClosure(
        snapshotJson(fixture.snapshot),
        fixture.receiptBytes,
        selected(fixture),
      ).pipe(Effect.provide(crypto), Effect.result),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result) && result.failure instanceof RuntimeClosureDigestFailure) {
      expect(result.failure.cause).toMatchObject({ phase: "snapshot-replay" });
    } else {
      throw new Error("snapshot replay digest must fail with RuntimeClosureDigestFailure");
    }
  });

  test("snapshots inputs and returns defensive byte copies", async () => {
    const fixture = await run(createFixture());
    const receiptInput = fixture.receiptBytes;
    const originalReceipt = receiptInput.slice();
    let mutated = false;
    const crypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: (_algorithm, bytes) => {
          if (!mutated) {
            mutated = true;
            receiptInput.fill(0);
          }
          return Effect.succeed(new Bun.CryptoHasher("sha256").update(bytes).digest());
        },
      }),
    );
    const artifact = await Effect.runPromise(
      buildRuntimeClosure(snapshotJson(fixture.snapshot), receiptInput, selected(fixture)).pipe(
        Effect.provide(crypto),
      ),
    );
    const first = artifact.bytes;
    const second = artifact.bytes;
    first.fill(0);

    expect(receiptInput).not.toEqual(originalReceipt);
    expect(artifact.bytes).toEqual(second);
    expect(first).not.toEqual(second);
    expect(first).not.toBe(second);
  });

  test("rejects non-canonical outer bytes and publishes the frozen bounds", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const artifact = yield* buildRuntimeClosure(
          snapshotJson(fixture.snapshot),
          fixture.receiptBytes,
          selected(fixture),
        );
        const pretty = new TextEncoder().encode(JSON.stringify(artifact.manifest, null, 2));
        return yield* validateRuntimeClosureBytes(snapshotJson(fixture.snapshot), pretty).pipe(
          Effect.result,
        );
      }),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(RuntimeClosureManifestRejected);
    }
    expect(runtimeClosureBounds).toEqual({
      maximumBytes: 1_048_576,
      maximumDepth: 64,
      maximumJsonValues: 16_384,
      maximumMembers: 1_024,
      maximumSnapshotBytes: 16_777_216,
      maximumSnapshotDepth: 64,
      maximumSnapshotJsonValues: 65_536,
    });
  });

  test("constructs and revalidates the maximum legal node, edge, and member shape", async () => {
    const result = await run(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const stored = yield* Effect.forEach(
          Array.from({ length: runtimeClosureBounds.maximumMembers }, (_, index) => index),
          (index) => artifactBytes(index + 1_000).pipe(Effect.flatMap(store.insert)),
          { concurrency: 1 },
        );
        const identities = stored.map((receipt) => receipt.semantic_identity);
        const receipt = yield* analyzeJson(
          graphJson(
            identities[0]!,
            identities.map((semanticIdentity, index) => ({
              semantic_identity: semanticIdentity,
              runtime_dependencies: [1, 2, 3, 4].map(
                (offset) => identities[(index + offset) % identities.length]!,
              ),
            })),
          ),
        );
        const snapshot = yield* store.snapshot;
        const serializedSnapshot = snapshotJson(snapshot);
        const closure = yield* buildRuntimeClosure(
          serializedSnapshot,
          receipt.bytes,
          selectionJson(
            stored.map((storeReceipt) => ({
              semantic_identity: storeReceipt.semantic_identity,
              artifact_identity: storeReceipt.artifact_identity,
            })),
          ),
        );
        const validated = yield* validateRuntimeClosureBytes(serializedSnapshot, closure.bytes);
        return { closure, serializedSnapshot, validated };
      }),
    );

    expect(result.closure.manifest.analysis.node_count).toBe(1_024);
    expect(result.closure.manifest.analysis.edge_count).toBe(4_096);
    expect(result.closure.manifest.member_count).toBe(1_024);
    expect(result.closure.bytes.byteLength).toBeLessThanOrEqual(runtimeClosureBounds.maximumBytes);
    expect(new TextEncoder().encode(result.serializedSnapshot).byteLength).toBeLessThanOrEqual(
      runtimeClosureBounds.maximumSnapshotBytes,
    );
    expect(result.validated).toEqual(result.closure.manifest);
  }, 30_000);
});
