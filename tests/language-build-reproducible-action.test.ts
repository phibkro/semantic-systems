import { BunCrypto } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { assert as fcAssert, asyncProperty, boolean } from "fast-check";
import { Crypto, Effect, Result } from "effect";
import { check, int, operationSignature, returnTerm } from "../src/kernel-calculus/index.ts";
import {
  analyzeJson,
  buildRuntimeClosure,
  executeReproducibleAction,
  ReproducibleActionCapabilityRejected,
  ReproducibleActionDigestFailure,
  ReproducibleActionEnvironmentRejected,
  ReproducibleActionReceiptRejected,
  ReproducibleActionRecipeRejected,
  reproducibleActionBounds,
  SemanticStore,
  SemanticStoreLayer,
  type SemanticStoreSnapshot,
  validateReproducibleActionReceiptBytes,
} from "../src/language-build/index.ts";
import { canonicalBytes, type CanonicalJsonValue } from "../src/normalized-core/canonical.ts";
import {
  emitNormalizedCore,
  type EmissionMetadataInput,
  type Identity,
  type NormalizedCoreDigestFailure,
} from "../src/normalized-core/index.ts";

const contentIdentity = `sha256:${"8".repeat(64)}` as const;

const metadata = (value: number): EmissionMetadataInput => ({
  assumptions: [],
  source: {
    units: [
      {
        source_key: "main",
        uri: `memory:reproducible-action-${value}`,
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

interface Fixture {
  readonly snapshotJson: string;
  readonly closureBytes: Uint8Array;
  readonly semanticIdentity: Identity;
  readonly artifactIdentity: Identity;
}

const createFixture = (): Effect.Effect<Fixture, unknown, SemanticStore | Crypto.Crypto> =>
  Effect.gen(function* () {
    const store = yield* SemanticStore;
    const stored = yield* store.insert(yield* artifactBytes(1));
    const receipt = yield* analyzeJson(
      JSON.stringify({
        format: "semantic.declared-dependency-graph",
        version: 1,
        root_semantic_identity: stored.semantic_identity,
        nodes: [{ semantic_identity: stored.semantic_identity, runtime_dependencies: [] }],
      }),
    );
    const snapshot: SemanticStoreSnapshot = yield* store.snapshot;
    const snapshotJson = JSON.stringify(snapshot);
    const closure = yield* buildRuntimeClosure(
      snapshotJson,
      receipt.bytes,
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
    return {
      snapshotJson,
      closureBytes: closure.bytes,
      semanticIdentity: stored.semantic_identity,
      artifactIdentity: stored.artifact_identity,
    };
  });

const run = <Value, Error>(
  effect: Effect.Effect<Value, Error, SemanticStore | Crypto.Crypto>,
): Promise<Value> =>
  Effect.runPromise(effect.pipe(Effect.provide([SemanticStoreLayer, BunCrypto.layer])));

const recipe = (action: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({ format: "semantic.action-recipe", version: 1, action });

const environment = (capabilities: ReadonlyArray<string>): string =>
  JSON.stringify({
    format: "semantic.action-environment",
    version: 1,
    runtime: "semantic.host-neutral-reference",
    capabilities,
  });

const countCapability = "semantic.runtime-closure.member-count/v1";
const membershipCapability = "semantic.runtime-closure.membership-query/v1";

const refreshReceiptIdentity = (document: Record<string, unknown>): void => {
  const payload = { ...document };
  delete payload.receipt_identity;
  const domainBytes = new TextEncoder().encode(
    "semantic.language-build/action-observation-receipt/v1",
  );
  const payloadBytes = canonicalBytes(payload as CanonicalJsonValue, false);
  const preimage = new Uint8Array(domainBytes.length + 1 + payloadBytes.length);
  preimage.set(domainBytes);
  preimage.set(payloadBytes, domainBytes.length + 1);
  document.receipt_identity = `sha256:${new Bun.CryptoHasher("sha256")
    .update(preimage)
    .digest("hex")}`;
};

describe("reproducible action/observation receipt", () => {
  test("executes closed count and membership actions and validates canonical receipts", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const count = yield* executeReproducibleAction(
          fixture.snapshotJson,
          fixture.closureBytes,
          recipe({ kind: "closure.member-count" }),
          environment([countCapability]),
        );
        const present = yield* executeReproducibleAction(
          fixture.snapshotJson,
          fixture.closureBytes,
          recipe({
            kind: "closure.artifact-present",
            semantic_identity: fixture.semanticIdentity,
            artifact_identity: fixture.artifactIdentity,
          }),
          environment([membershipCapability]),
        );
        const absent = yield* executeReproducibleAction(
          fixture.snapshotJson,
          fixture.closureBytes,
          recipe({
            kind: "closure.artifact-present",
            semantic_identity: fixture.semanticIdentity,
            artifact_identity: `sha256:${"0".repeat(64)}`,
          }),
          environment([membershipCapability]),
        );
        const validated = yield* validateReproducibleActionReceiptBytes(
          fixture.snapshotJson,
          fixture.closureBytes,
          present.bytes,
        );
        return { count, present, absent, validated };
      }),
    );

    expect(result.count.receipt.observation).toEqual({
      kind: "closure.member-count",
      member_count: 1,
    });
    expect(result.present.receipt.observation).toEqual({
      kind: "closure.artifact-present",
      present: true,
    });
    expect(result.absent.receipt.observation).toEqual({
      kind: "closure.artifact-present",
      present: false,
    });
    expect(result.validated).toEqual(result.present.receipt);
    expect(result.present.receipt.deployment_observation).toEqual({
      status: "not-observed",
      evidence: "unsupported",
    });
    expect(result.present.receipt.execution_authority).toBe(
      "semantic.host-neutral-reference-interpreter",
    );
  });

  test("normalizes capability order as a property", async () => {
    const fixture = await run(createFixture());
    await fcAssert(
      asyncProperty(boolean(), async (reverse) => {
        const capabilities = reverse
          ? [membershipCapability, countCapability]
          : [countCapability, membershipCapability];
        const artifact = await run(
          executeReproducibleAction(
            fixture.snapshotJson,
            fixture.closureBytes,
            recipe({ kind: "closure.member-count" }),
            environment(capabilities),
          ),
        );
        const canonical = await run(
          executeReproducibleAction(
            fixture.snapshotJson,
            fixture.closureBytes,
            recipe({ kind: "closure.member-count" }),
            environment([countCapability, membershipCapability]),
          ),
        );
        expect(artifact.bytes).toEqual(canonical.bytes);
      }),
      { numRuns: 20 },
    );
  });

  test("keeps recipe identity separate from declared environment and execution identity", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const minimal = yield* executeReproducibleAction(
          fixture.snapshotJson,
          fixture.closureBytes,
          recipe({ kind: "closure.member-count" }),
          environment([countCapability]),
        );
        const extended = yield* executeReproducibleAction(
          fixture.snapshotJson,
          fixture.closureBytes,
          recipe({ kind: "closure.member-count" }),
          environment([countCapability, membershipCapability]),
        );
        return { minimal, extended };
      }),
    );

    expect(result.minimal.receipt.recipe_identity).toBe(result.extended.receipt.recipe_identity);
    expect(result.minimal.receipt.observation).toEqual(result.extended.receipt.observation);
    expect(result.minimal.receipt.environment_identity).not.toBe(
      result.extended.receipt.environment_identity,
    );
    expect(result.minimal.receipt.execution_identity).not.toBe(
      result.extended.receipt.execution_identity,
    );
    expect(result.minimal.receipt.receipt_identity).not.toBe(
      result.extended.receipt.receipt_identity,
    );
  });

  test("rejects missing, duplicate, and unknown capability declarations", async () => {
    const results = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const execute = (environmentJson: string) =>
          executeReproducibleAction(
            fixture.snapshotJson,
            fixture.closureBytes,
            recipe({ kind: "closure.member-count" }),
            environmentJson,
          ).pipe(Effect.result);
        return yield* Effect.all({
          missing: execute(environment([])),
          duplicate: execute(environment([countCapability, countCapability])),
          unknown: execute(environment(["semantic.host.command/v1"])),
          overLimit: execute(
            environment(
              Array.from(
                { length: reproducibleActionBounds.maximumCapabilities + 1 },
                () => countCapability,
              ),
            ),
          ),
        });
      }),
    );

    expect(Result.isFailure(results.missing)).toBeTrue();
    expect(Result.isFailure(results.duplicate)).toBeTrue();
    expect(Result.isFailure(results.unknown)).toBeTrue();
    expect(Result.isFailure(results.overLimit)).toBeTrue();
    if (Result.isFailure(results.missing)) {
      expect(results.missing.failure).toBeInstanceOf(ReproducibleActionCapabilityRejected);
    }
    if (Result.isFailure(results.duplicate)) {
      expect(results.duplicate.failure).toBeInstanceOf(ReproducibleActionEnvironmentRejected);
    }
    if (Result.isFailure(results.unknown)) {
      expect(results.unknown.failure).toBeInstanceOf(ReproducibleActionEnvironmentRejected);
    }
    if (
      Result.isFailure(results.overLimit) &&
      results.overLimit.failure instanceof ReproducibleActionEnvironmentRejected
    ) {
      expect(results.overLimit.failure).toBeInstanceOf(ReproducibleActionEnvironmentRejected);
      expect(results.overLimit.failure.reason).toContain("exceeds");
    }
  });

  test("strictly rejects malformed, excess, duplicate-key, and over-limit inputs", async () => {
    const fixture = await run(createFixture());
    const candidates = [
      "{",
      '{"format":"semantic.action-recipe","format":"semantic.action-recipe","version":1,"action":{"kind":"closure.member-count"}}',
      JSON.stringify({
        format: "semantic.action-recipe",
        version: 1,
        action: { kind: "closure.member-count", ambient_path: "/tmp/hidden" },
      }),
      ` ${" ".repeat(reproducibleActionBounds.maximumBytes)}`,
    ];
    for (const candidate of candidates) {
      const result = await run(
        executeReproducibleAction(
          fixture.snapshotJson,
          fixture.closureBytes,
          candidate,
          environment([countCapability]),
        ).pipe(Effect.result),
      );
      expect(Result.isFailure(result)).toBeTrue();
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(ReproducibleActionRecipeRejected);
      }
    }
  });

  test("rejects a forged observation even when the outer receipt identity is refreshed", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const artifact = yield* executeReproducibleAction(
          fixture.snapshotJson,
          fixture.closureBytes,
          recipe({ kind: "closure.member-count" }),
          environment([countCapability]),
        );
        const forged = JSON.parse(new TextDecoder().decode(artifact.bytes)) as Record<
          string,
          unknown
        >;
        forged.observation = { kind: "closure.member-count", member_count: 0 };
        refreshReceiptIdentity(forged);
        return yield* validateReproducibleActionReceiptBytes(
          fixture.snapshotJson,
          fixture.closureBytes,
          canonicalBytes(forged as CanonicalJsonValue),
        ).pipe(Effect.result);
      }),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(ReproducibleActionReceiptRejected);
    }
  });

  test("inherits exact closure custody and rejects deployment claims", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        const artifact = yield* executeReproducibleAction(
          fixture.snapshotJson,
          fixture.closureBytes,
          recipe({ kind: "closure.member-count" }),
          environment([countCapability]),
        );
        const forgedClosure = fixture.closureBytes.slice();
        forgedClosure[0] ^= 1;
        const closure = yield* executeReproducibleAction(
          fixture.snapshotJson,
          forgedClosure,
          recipe({ kind: "closure.member-count" }),
          environment([countCapability]),
        ).pipe(Effect.result);
        const deployment = JSON.parse(new TextDecoder().decode(artifact.bytes)) as Record<
          string,
          unknown
        >;
        deployment.deployment_observation = { status: "deployed", evidence: "caller" };
        refreshReceiptIdentity(deployment);
        const claimed = yield* validateReproducibleActionReceiptBytes(
          fixture.snapshotJson,
          fixture.closureBytes,
          canonicalBytes(deployment as CanonicalJsonValue),
        ).pipe(Effect.result);
        return { closure, claimed };
      }),
    );

    expect(Result.isFailure(result.closure)).toBeTrue();
    expect(Result.isFailure(result.claimed)).toBeTrue();
  });

  test("rejects receipt byte lookalikes without invoking caller accessors", async () => {
    const fixture = await run(createFixture());
    let accessorCalls = 0;
    const lookalike = {
      get byteLength(): number {
        accessorCalls += 1;
        return 0;
      },
    };
    const overLimit = new Uint8Array(reproducibleActionBounds.maximumBytes + 1);
    const [lookalikeResult, overLimitResult] = await run(
      Effect.all([
        validateReproducibleActionReceiptBytes(
          fixture.snapshotJson,
          fixture.closureBytes,
          lookalike,
        ).pipe(Effect.result),
        validateReproducibleActionReceiptBytes(
          fixture.snapshotJson,
          fixture.closureBytes,
          overLimit,
        ).pipe(Effect.result),
      ]),
    );
    expect(Result.isFailure(lookalikeResult)).toBeTrue();
    expect(Result.isFailure(overLimitResult)).toBeTrue();
    if (Result.isFailure(lookalikeResult)) {
      expect(lookalikeResult.failure).toBeInstanceOf(ReproducibleActionReceiptRejected);
    }
    if (
      Result.isFailure(overLimitResult) &&
      overLimitResult.failure instanceof ReproducibleActionReceiptRejected
    ) {
      expect(overLimitResult.failure.reason).toContain("exceeds");
    }
    expect(accessorCalls).toBe(0);
  });

  test("returns immutable values and defensive-copy bytes", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fixture = yield* createFixture();
        return yield* executeReproducibleAction(
          fixture.snapshotJson,
          fixture.closureBytes,
          recipe({ kind: "closure.member-count" }),
          environment([countCapability]),
        );
      }),
    );
    const first = result.bytes;
    const expected = first[0];
    first[0] = 0;
    expect(result.bytes[0]).toBe(expected);
    expect(Object.isFrozen(result.receipt)).toBeTrue();
    expect(Object.isFrozen(result.receipt.recipe)).toBeTrue();
    expect(Object.isFrozen(result.receipt.recipe.action)).toBeTrue();
    expect(Object.isFrozen(result.receipt.declared_environment)).toBeTrue();
    expect(Object.isFrozen(result.receipt.declared_environment.capabilities)).toBeTrue();
    expect(Object.isFrozen(result.receipt.observation)).toBeTrue();
    expect(Object.isFrozen(result.receipt.deployment_observation)).toBeTrue();
    expect(new TextDecoder().decode(result.bytes).endsWith("\n")).toBeTrue();
  });

  test("keeps digest failure typed by identity phase", async () => {
    const fixture = await run(createFixture());
    const recipeDomain = new TextEncoder().encode("semantic.language-build/action-recipe/v1");
    const failing = Crypto.make({
      digest: (_algorithm, bytes) => {
        const isRecipe =
          bytes.byteLength > recipeDomain.byteLength &&
          recipeDomain.every((byte, index) => bytes[index] === byte) &&
          bytes[recipeDomain.byteLength] === 0;
        return Effect.succeed(
          isRecipe ? Uint8Array.of(0) : new Bun.CryptoHasher("sha256").update(bytes).digest(),
        );
      },
      randomBytes: (size) => new Uint8Array(size),
    });
    const result = await Effect.runPromise(
      executeReproducibleAction(
        fixture.snapshotJson,
        fixture.closureBytes,
        recipe({ kind: "closure.member-count" }),
        environment([countCapability]),
      ).pipe(Effect.provideService(Crypto.Crypto, failing), Effect.result),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result) && result.failure instanceof ReproducibleActionDigestFailure) {
      expect(result.failure.phase).toBe("recipe");
    } else {
      throw new Error("recipe identity must fail with ReproducibleActionDigestFailure");
    }
  });

  test("rejects an oversized digest observation through the typed identity phase", async () => {
    const fixture = await run(createFixture());
    const recipeDomain = new TextEncoder().encode("semantic.language-build/action-recipe/v1");
    const oversizedDigest = new Uint8Array(reproducibleActionBounds.maximumBytes + 1);
    const crypto = Crypto.make({
      digest: (_algorithm, bytes) => {
        const isRecipe =
          bytes.byteLength > recipeDomain.byteLength &&
          recipeDomain.every((byte, index) => bytes[index] === byte) &&
          bytes[recipeDomain.byteLength] === 0;
        return Effect.succeed(
          isRecipe ? oversizedDigest : new Bun.CryptoHasher("sha256").update(bytes).digest(),
        );
      },
      randomBytes: (size) => new Uint8Array(size),
    });
    const result = await Effect.runPromise(
      executeReproducibleAction(
        fixture.snapshotJson,
        fixture.closureBytes,
        recipe({ kind: "closure.member-count" }),
        environment([countCapability]),
      ).pipe(Effect.provideService(Crypto.Crypto, crypto), Effect.result),
    );

    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result) && result.failure instanceof ReproducibleActionDigestFailure) {
      expect(result.failure.phase).toBe("recipe");
      expect(result.failure.message).toContain("invalid SHA-256 digest observation");
    } else {
      throw new Error("oversized recipe digest must fail with ReproducibleActionDigestFailure");
    }
  });
});
