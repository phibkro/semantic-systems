import { BunCrypto } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Crypto, Effect, Layer, Result } from "effect";
import { check, int, operationSignature, returnTerm } from "../src/kernel-calculus/index.ts";
import {
  AuthoredNameAbsent,
  NameBindingInputRejected,
  SemanticArtifactRejected,
  SemanticStore,
  SemanticStoreLayer,
  SemanticStoreSnapshotRejected,
  SemanticTargetAbsent,
  semanticStoreReplayBounds,
} from "../src/language-build/index.ts";
import {
  emitNormalizedCore,
  NormalizedCoreDigestFailure,
  type EmissionMetadataInput,
} from "../src/normalized-core/index.ts";

const contentIdentity = `sha256:${"7".repeat(64)}` as const;

const metadata = (endByte: number, uri = "memory:main"): EmissionMetadataInput => ({
  assumptions: [],
  source: {
    units: [
      {
        source_key: "main",
        uri,
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
  endByte: number,
  uri?: string,
): Effect.Effect<Uint8Array, NormalizedCoreDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const checked = check(operationSignature([]), returnTerm("1", int(value)));
    if (checked.status !== "accepted") throw new Error("test program must check");
    const emitted = yield* emitNormalizedCore(checked.program, metadata(endByte, uri));
    if (emitted.status !== "emitted") throw new Error(emitted.diagnostics[0].message);
    return emitted.bytes;
  });

const runStore = <Value, Error>(
  effect: Effect.Effect<Value, Error, SemanticStore | Crypto.Crypto>,
): Promise<Value> =>
  Effect.runPromise(effect.pipe(Effect.provide([SemanticStoreLayer, BunCrypto.layer])));

describe("language-build semantic store", () => {
  test("rejects invalid and forged normalized-core bytes without changing state", async () => {
    const result = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const valid = yield* artifactBytes(1, 1);
        yield* store.insert(valid);
        const before = yield* store.snapshot;

        const invalidResult = yield* store
          .insert(new TextEncoder().encode("[]\n"))
          .pipe(Effect.result);
        const text = new TextDecoder().decode(valid);
        const semanticIdentity = before.semantic_values[0]!.semantic_identity;
        const forged = new TextEncoder().encode(
          text.replace(semanticIdentity, `sha256:${"0".repeat(64)}`),
        );
        const forgedResult = yield* store.insert(forged).pipe(Effect.result);

        return { before, after: yield* store.snapshot, invalidResult, forgedResult };
      }),
    );

    expect(result.after).toEqual(result.before);
    expect(Result.isFailure(result.invalidResult)).toBeTrue();
    expect(Result.isFailure(result.forgedResult)).toBeTrue();
    if (Result.isFailure(result.invalidResult)) {
      expect(result.invalidResult.failure).toBeInstanceOf(SemanticArtifactRejected);
    }
    if (Result.isFailure(result.forgedResult)) {
      expect(result.forgedResult.failure).toBeInstanceOf(SemanticArtifactRejected);
    }
  });

  test("distinguishes first store, exact artifact hit, and semantic reuse", async () => {
    const result = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const original = yield* artifactBytes(1, 1);
        const sourceVariant = yield* artifactBytes(1, 2);
        const semanticVariant = yield* artifactBytes(2, 1);
        const first = yield* store.insert(original);
        const exact = yield* store.insert(original);
        const sameSemantic = yield* store.insert(sourceVariant);
        const changedSemantic = yield* store.insert(semanticVariant);
        return { first, exact, sameSemantic, changedSemantic, snapshot: yield* store.snapshot };
      }),
    );

    expect(result.first.status).toBe("stored");
    expect(result.exact.status).toBe("artifact-hit");
    expect(result.sameSemantic.status).toBe("semantic-hit");
    expect(result.sameSemantic.semantic_identity).toBe(result.first.semantic_identity);
    expect(result.sameSemantic.artifact_identity).not.toBe(result.first.artifact_identity);
    expect(result.changedSemantic.status).toBe("stored");
    expect(result.changedSemantic.semantic_identity).not.toBe(result.first.semantic_identity);
    expect(result.snapshot.semantic_values).toHaveLength(2);
    expect(result.snapshot.semantic_values.map((value) => value.artifacts.length).sort()).toEqual([
      1, 2,
    ]);
    expect(Object.isFrozen(result.first)).toBeTrue();
    expect(Object.isFrozen(result.snapshot)).toBeTrue();
    expect(Object.isFrozen(result.snapshot.semantic_values)).toBeTrue();
  });

  test("keeps strict authored-name bindings outside semantic values", async () => {
    const result = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const bytes = yield* artifactBytes(1, 1);
        const stored = yield* store.insert(bytes);
        const other = yield* store.insert(yield* artifactBytes(2, 1));
        const beforeBinding = yield* store.snapshot;
        const absentResult = yield* store
          .bindName({ name: "missing", semantic_identity: `sha256:${"f".repeat(64)}` })
          .pipe(Effect.result);
        const malformedResult = yield* store
          .bindName({ name: "main", semantic_identity: stored.semantic_identity, extra: true })
          .pipe(Effect.result);
        const afterRejections = yield* store.snapshot;
        const binding = yield* store.bindName({
          name: "main",
          semantic_identity: stored.semantic_identity,
        });
        const bindingHit = yield* store.bindName({
          name: "main",
          semantic_identity: stored.semantic_identity,
        });
        const rebound = yield* store.bindName({
          name: "main",
          semantic_identity: other.semantic_identity,
        });
        const resolution = yield* store.resolveName({ name: "main" });
        const unknownResult = yield* store.resolveName({ name: "unknown" }).pipe(Effect.result);
        return {
          absentResult,
          malformedResult,
          unknownResult,
          beforeBinding,
          afterRejections,
          binding,
          bindingHit,
          rebound,
          resolution,
          afterBinding: yield* store.snapshot,
        };
      }),
    );

    expect(result.afterRejections).toEqual(result.beforeBinding);
    expect(result.binding).toMatchObject({ status: "bound", name: "main" });
    expect(result.bindingHit).toEqual({ ...result.binding, status: "binding-hit" });
    expect(result.rebound).toMatchObject({ status: "rebound", name: "main" });
    expect(result.resolution.semantic_identity).toBe(result.rebound.semantic_identity);
    expect(result.afterBinding.semantic_values).toEqual(result.beforeBinding.semantic_values);
    expect(result.afterBinding.name_bindings).toEqual([
      { name: "main", semantic_identity: result.rebound.semantic_identity },
    ]);
    if (Result.isFailure(result.absentResult)) {
      expect(result.absentResult.failure).toBeInstanceOf(SemanticTargetAbsent);
    } else throw new Error("absent target must fail");
    if (Result.isFailure(result.malformedResult)) {
      expect(result.malformedResult.failure).toBeInstanceOf(NameBindingInputRejected);
    } else throw new Error("excess binding input must fail");
    if (Result.isFailure(result.unknownResult)) {
      expect(result.unknownResult.failure).toBeInstanceOf(AuthoredNameAbsent);
    } else throw new Error("unknown name must fail");
  });

  test("snapshots and replays deterministically after full validation", async () => {
    const sourceSnapshot = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const original = yield* artifactBytes(1, 1);
        const sourceVariant = yield* artifactBytes(1, 2);
        const stored = yield* store.insert(original);
        yield* store.insert(sourceVariant);
        yield* store.bindName({ name: "main", semantic_identity: stored.semantic_identity });
        return yield* store.snapshot;
      }),
    );

    const replayed = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const receipt = yield* store.replay(sourceSnapshot);
        const exact = yield* store.insert(
          new TextEncoder().encode(
            sourceSnapshot.semantic_values[0]!.artifacts[0]!.canonical_bytes,
          ),
        );
        return { receipt, exact, snapshot: yield* store.snapshot };
      }),
    );
    expect(replayed.receipt).toEqual({
      status: "replayed",
      semantic_value_count: 1,
      artifact_count: 2,
      name_binding_count: 1,
    });
    expect(replayed.exact.status).toBe("artifact-hit");
    expect(replayed.snapshot).toEqual(sourceSnapshot);

    const forgedSnapshot = {
      format: sourceSnapshot.format,
      version: sourceSnapshot.version,
      semantic_values: sourceSnapshot.semantic_values.map((semanticValue, semanticIndex) => ({
        semantic_identity: semanticValue.semantic_identity,
        artifacts: semanticValue.artifacts.map((artifact, artifactIndex) => ({
          artifact_identity: artifact.artifact_identity,
          canonical_bytes:
            semanticIndex === 0 && artifactIndex === 0 ? "[]\n" : artifact.canonical_bytes,
        })),
      })),
      name_bindings: sourceSnapshot.name_bindings,
    };
    const rejectedReplay = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const before = yield* store.snapshot;
        const result = yield* store.replay(forgedSnapshot).pipe(Effect.result);
        return { before, after: yield* store.snapshot, result };
      }),
    );
    expect(rejectedReplay.after).toEqual(rejectedReplay.before);
    if (Result.isFailure(rejectedReplay.result)) {
      expect(rejectedReplay.result.failure).toBeInstanceOf(SemanticStoreSnapshotRejected);
    } else throw new Error("forged snapshot must fail");
  });

  test("rejects a lone-surrogate snapshot string instead of normalizing its bytes", async () => {
    const result = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        yield* store.insert(yield* artifactBytes(1, 1, "memory:\uFFFD"));
        const before = yield* store.snapshot;
        const semanticValue = before.semantic_values[0]!;
        const artifact = semanticValue.artifacts[0]!;
        const candidate = {
          ...before,
          semantic_values: [
            {
              ...semanticValue,
              artifacts: [
                {
                  ...artifact,
                  canonical_bytes: artifact.canonical_bytes.replace("\uFFFD", "\uD800"),
                },
              ],
            },
          ],
        };
        const replay = yield* store.replay(candidate).pipe(Effect.result);
        return { before, after: yield* store.snapshot, candidate, replay };
      }),
    );

    expect(result.candidate.semantic_values[0]!.artifacts[0]!.canonical_bytes).not.toBe(
      result.before.semantic_values[0]!.artifacts[0]!.canonical_bytes,
    );
    expect(result.after).toEqual(result.before);
    if (Result.isFailure(result.replay)) {
      expect(result.replay.failure).toBeInstanceOf(SemanticStoreSnapshotRejected);
    } else throw new Error("lone-surrogate snapshot text must fail");
  });

  test("orders semantic values, artifact variants, and authored names deterministically", async () => {
    const snapshot = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const second = yield* store.insert(yield* artifactBytes(2, 1));
        const firstVariant = yield* store.insert(yield* artifactBytes(1, 2));
        yield* store.insert(yield* artifactBytes(1, 1));
        yield* store.bindName({ name: "z", semantic_identity: second.semantic_identity });
        yield* store.bindName({ name: "a", semantic_identity: firstVariant.semantic_identity });
        return yield* store.snapshot;
      }),
    );

    const semanticIdentities = snapshot.semantic_values.map((value) => value.semantic_identity);
    expect(semanticIdentities).toEqual([...semanticIdentities].sort());
    for (const semanticValue of snapshot.semantic_values) {
      const artifactIdentities = semanticValue.artifacts.map(
        (artifact) => artifact.artifact_identity,
      );
      expect(artifactIdentities).toEqual([...artifactIdentities].sort());
    }
    expect(snapshot.name_bindings.map((binding) => binding.name)).toEqual(["a", "z"]);
    expect(Object.isFrozen(snapshot.name_bindings)).toBeTrue();
    expect(snapshot.name_bindings.every(Object.isFrozen)).toBeTrue();
  });

  test("rejects structurally invalid and over-limit replays atomically", async () => {
    const result = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const stored = yield* store.insert(yield* artifactBytes(1, 1));
        yield* store.bindName({ name: "main", semantic_identity: stored.semantic_identity });
        const source = yield* store.snapshot;
        const semanticValue = source.semantic_values[0]!;
        const artifact = semanticValue.artifacts[0]!;
        const absentIdentity = `sha256:${"f".repeat(64)}`;
        const forgedIdentity = `sha256:${"0".repeat(64)}`;
        const revoked = Proxy.revocable({}, {});
        revoked.revoke();
        const throwing = new Proxy(
          {},
          {
            ownKeys: () => {
              throw new Error("ownKeys trap must remain a typed rejection");
            },
          },
        );

        const candidates: ReadonlyArray<unknown> = [
          { ...source, semantic_values: [semanticValue, semanticValue] },
          {
            ...source,
            semantic_values: [{ ...semanticValue, semantic_identity: forgedIdentity }],
          },
          {
            ...source,
            semantic_values: [
              {
                ...semanticValue,
                artifacts: [{ ...artifact, artifact_identity: forgedIdentity }],
              },
            ],
          },
          {
            ...source,
            semantic_values: [{ ...semanticValue, artifacts: [artifact, artifact] }],
          },
          { ...source, semantic_values: [{ ...semanticValue, artifacts: [] }] },
          {
            ...source,
            name_bindings: [{ name: "missing", semantic_identity: absentIdentity }],
          },
          {
            ...source,
            semantic_values: Array.from(
              { length: semanticStoreReplayBounds.semanticValues + 1 },
              () => semanticValue,
            ),
          },
          {
            ...source,
            semantic_values: [
              {
                ...semanticValue,
                artifacts: Array.from(
                  { length: semanticStoreReplayBounds.artifacts + 1 },
                  () => artifact,
                ),
              },
            ],
          },
          {
            ...source,
            name_bindings: Array.from(
              { length: semanticStoreReplayBounds.nameBindings + 1 },
              (_, index) => ({
                name: `name-${index}`,
                semantic_identity: semanticValue.semantic_identity,
              }),
            ),
          },
          { ...source, excess: true },
          revoked.proxy,
          throwing,
        ];

        const attempts = yield* Effect.forEach(candidates, (candidate) =>
          Effect.gen(function* () {
            const before = yield* store.snapshot;
            const replay = yield* store.replay(candidate).pipe(Effect.result);
            const after = yield* store.snapshot;
            return { before, replay, after };
          }),
        );
        return { source, attempts };
      }),
    );

    expect(result.attempts).toHaveLength(12);
    for (const attempt of result.attempts) {
      expect(attempt.after).toEqual(attempt.before);
      expect(attempt.after).toEqual(result.source);
      if (Result.isFailure(attempt.replay)) {
        expect(attempt.replay.failure).toBeInstanceOf(SemanticStoreSnapshotRejected);
      } else throw new Error("invalid snapshot must fail");
    }
  });

  test("turns hostile name-boundary objects into typed failures", async () => {
    const result = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const stored = yield* store.insert(yield* artifactBytes(1, 1));
        const before = yield* store.snapshot;
        const revoked = Proxy.revocable({}, {});
        revoked.revoke();
        const throwing = new Proxy(
          {},
          {
            ownKeys: () => {
              throw new Error("ownKeys trap must remain a typed rejection");
            },
          },
        );
        const bind = yield* store.bindName(revoked.proxy).pipe(Effect.result);
        const resolve = yield* store.resolveName(throwing).pipe(Effect.result);
        return { stored, before, after: yield* store.snapshot, bind, resolve };
      }),
    );

    expect(result.after).toEqual(result.before);
    if (Result.isFailure(result.bind)) {
      expect(result.bind.failure).toBeInstanceOf(NameBindingInputRejected);
    } else throw new Error("hostile name binding input must fail");
    if (Result.isFailure(result.resolve)) {
      expect(result.resolve.failure).toBeInstanceOf(NameBindingInputRejected);
    } else throw new Error("hostile name lookup input must fail");
  });

  test("rejects an oversized sparse replay before reading array elements", async () => {
    let elementReads = 0;
    const sparseTarget: unknown[] = [];
    sparseTarget.length = semanticStoreReplayBounds.semanticValues + 1;
    const sparse = new Proxy(sparseTarget, {
      get: (target, key, receiver) => {
        elementReads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const result = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const stored = yield* store.insert(yield* artifactBytes(1, 1));
        const before = yield* store.snapshot;
        const replay = yield* store
          .replay({
            format: before.format,
            version: before.version,
            semantic_values: sparse,
            name_bindings: [{ name: "main", semantic_identity: stored.semantic_identity }],
          })
          .pipe(Effect.result);
        return { before, after: yield* store.snapshot, replay };
      }),
    );

    expect(elementReads).toBe(0);
    expect(result.after).toEqual(result.before);
    if (Result.isFailure(result.replay)) {
      expect(result.replay.failure).toBeInstanceOf(SemanticStoreSnapshotRejected);
    } else throw new Error("oversized sparse snapshot must fail");
  });

  test("decodes the one bounded descriptor snapshot of a stateful proxy", async () => {
    const source = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        yield* store.insert(yield* artifactBytes(1, 1));
        return yield* store.snapshot;
      }),
    );
    const safe = structuredClone(source);
    let switchedReads = 0;
    let elementReads = 0;
    const oversizedTarget: unknown[] = [];
    oversizedTarget.length = semanticStoreReplayBounds.semanticValues + 1;
    const oversized = new Proxy(oversizedTarget, {
      get: (target, key, receiver) => {
        elementReads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const switching = new Proxy(safe, {
      get: (target, key, receiver) => {
        if (key === "semantic_values") {
          switchedReads += 1;
          return oversized;
        }
        return Reflect.get(target, key, receiver);
      },
    });

    const replayed = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const receipt = yield* store.replay(switching);
        return { receipt, snapshot: yield* store.snapshot };
      }),
    );

    expect(switchedReads).toBe(0);
    expect(elementReads).toBe(0);
    expect(replayed.receipt.status).toBe("replayed");
    expect(replayed.snapshot).toEqual(source);
  });

  test("alternate insertion orders produce one equal deeply immutable snapshot", async () => {
    const populate = (reverse: boolean) =>
      runStore(
        Effect.gen(function* () {
          const store = yield* SemanticStore;
          const first = yield* artifactBytes(1, 1);
          const firstVariant = yield* artifactBytes(1, 2);
          const second = yield* artifactBytes(2, 1);
          const bytes = reverse ? [second, firstVariant, first] : [first, firstVariant, second];
          yield* Effect.forEach(bytes, store.insert);
          const beforeNames = yield* store.snapshot;
          const firstSemantic = beforeNames.semantic_values.find(
            (semanticValue) => semanticValue.artifacts.length === 2,
          )!;
          const secondSemantic = beforeNames.semantic_values.find(
            (semanticValue) => semanticValue.artifacts.length === 1,
          )!;
          yield* store.bindName({
            name: "z",
            semantic_identity: secondSemantic.semantic_identity,
          });
          yield* store.bindName({
            name: "a",
            semantic_identity: firstSemantic.semantic_identity,
          });
          return yield* store.snapshot;
        }),
      );

    const forward = await populate(false);
    const reverse = await populate(true);
    expect(reverse).toEqual(forward);
    for (const semanticValue of forward.semantic_values) {
      expect(Object.isFrozen(semanticValue)).toBeTrue();
      expect(Object.isFrozen(semanticValue.artifacts)).toBeTrue();
      expect(semanticValue.artifacts.every(Object.isFrozen)).toBeTrue();
    }
    const artifact = forward.semantic_values[0]!.artifacts[0]!;
    expect(Reflect.set(artifact, "canonical_bytes", "changed")).toBeFalse();
    expect(reverse).toEqual(forward);
  });

  test("concurrent inserts and bindings linearize through complete transitions", async () => {
    const result = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const original = yield* artifactBytes(1, 1);
        const variant = yield* artifactBytes(1, 2);
        const other = yield* artifactBytes(2, 1);
        const inserts = yield* Effect.all([store.insert(original), store.insert(variant)], {
          concurrency: "unbounded",
        });
        const otherReceipt = yield* store.insert(other);
        const bindings = yield* Effect.all(
          [
            store.bindName({ name: "main", semantic_identity: inserts[0].semantic_identity }),
            store.bindName({ name: "main", semantic_identity: otherReceipt.semantic_identity }),
          ],
          { concurrency: "unbounded" },
        );
        return { inserts, bindings, snapshot: yield* store.snapshot };
      }),
    );

    expect(result.inserts.map((receipt) => receipt.status).sort()).toEqual([
      "semantic-hit",
      "stored",
    ]);
    expect(result.bindings.map((receipt) => receipt.status).sort()).toEqual(["bound", "rebound"]);
    expect(result.snapshot.semantic_values).toHaveLength(2);
    expect(result.snapshot.semantic_values.map((value) => value.artifacts.length).sort()).toEqual([
      1, 2,
    ]);
    const resolved = result.snapshot.name_bindings[0]!.semantic_identity;
    expect(result.bindings.some((receipt) => receipt.semantic_identity === resolved)).toBeTrue();
  });

  test("a digest failure during replay leaves prior state byte-for-byte unchanged", async () => {
    const sourceSnapshot = await runStore(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        yield* store.insert(yield* artifactBytes(1, 1));
        yield* store.insert(yield* artifactBytes(2, 1));
        return yield* store.snapshot;
      }),
    );
    let digestCalls = 0;
    const failingCrypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: (_algorithm, bytes) => {
          digestCalls += 1;
          return Effect.succeed(
            digestCalls === 2
              ? Uint8Array.of(0)
              : new Bun.CryptoHasher("sha256").update(bytes).digest(),
          );
        },
      }),
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* SemanticStore;
        const prior = yield* artifactBytes(9, 1).pipe(Effect.provide(BunCrypto.layer));
        yield* store.insert(prior).pipe(Effect.provide(BunCrypto.layer));
        const before = yield* store.snapshot;
        const replay = yield* store
          .replay(sourceSnapshot)
          .pipe(Effect.provide(failingCrypto), Effect.result);
        return { before, after: yield* store.snapshot, replay };
      }).pipe(Effect.provide(SemanticStoreLayer)),
    );

    expect(digestCalls).toBe(2);
    expect(result.after).toEqual(result.before);
    if (Result.isFailure(result.replay)) {
      expect(result.replay.failure).toBeInstanceOf(NormalizedCoreDigestFailure);
    } else throw new Error("digest failure during replay must fail");
  });
});
