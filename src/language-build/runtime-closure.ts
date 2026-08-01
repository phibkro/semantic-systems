/**
 * Content-addressed compiler-to-build closure over one admitted reachability
 * receipt and one caller-selected artifact variant per reachable value.
 *
 * This module is an Effect application boundary. It captures the operation's
 * receipt/selection or manifest before decoding the bounded snapshot witness.
 */
import { Crypto, Data, Effect, Schema } from "effect";
import {
  canonicalBytes,
  scanJson,
  trustedUint8ArrayCopy,
  type CanonicalJsonValue,
} from "../normalized-core/canonical.ts";
import type { Identity, NormalizedCoreDigestFailure } from "../normalized-core/index.ts";
import {
  prepareReachabilityReceiptBytes,
  ReachabilityReceiptSchema,
  reachabilityBounds,
  withValidatedReceiptSnapshot,
  type ReachabilityDigestFailure,
  type ReachabilityGraphRejected,
  type ReachabilityReceipt,
  type ReachabilityReceiptRejected,
} from "./reachability.ts";
import {
  SemanticStore,
  SemanticStoreLayer,
  SemanticStoreSnapshotRejected,
  SemanticStoreSnapshotSchema,
  type SemanticStoreSnapshot,
} from "./semantic-store.ts";

const IdentitySchema = Schema.String.check(Schema.isPattern(/^sha256:[0-9a-f]{64}$/));
const CountSchema = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);

export const runtimeClosureBounds = Object.freeze({
  maximumBytes: reachabilityBounds.maximumBytes,
  maximumDepth: reachabilityBounds.maximumDepth,
  maximumJsonValues: reachabilityBounds.maximumJsonValues,
  maximumMembers: reachabilityBounds.maximumNodes,
  maximumSnapshotBytes: 16_777_216,
  maximumSnapshotDepth: 64,
  maximumSnapshotJsonValues: 65_536,
} as const);

export const runtimeClosureIdentityDomain =
  "semantic.language-build/runtime-closure-manifest/v1" as const;

export const runtimeClosureProcedureIdentity =
  "semantic.language-build/runtime-closure/0033/v1" as const;

export const RuntimeArtifactSelectionMemberSchema = Schema.Struct({
  semantic_identity: IdentitySchema,
  artifact_identity: IdentitySchema,
});

export const RuntimeArtifactSelectionSchema = Schema.Struct({
  format: Schema.Literal("semantic.runtime-artifact-selection"),
  version: Schema.Literal(1),
  members: Schema.Array(RuntimeArtifactSelectionMemberSchema),
});

export const RuntimeClosureMemberSchema = Schema.Struct({
  semantic_identity: IdentitySchema,
  artifact_identity: IdentitySchema,
});

export const RuntimeClosureManifestSchema = Schema.Struct({
  format: Schema.Literal("semantic.runtime-closure-manifest"),
  version: Schema.Literal(1),
  status: Schema.Literal("assembled"),
  procedure_identity: Schema.Literal(runtimeClosureProcedureIdentity),
  edge_authority: Schema.Literal("caller-declared"),
  artifact_selection_authority: Schema.Literal("caller-selected"),
  analysis: ReachabilityReceiptSchema,
  root_semantic_identity: IdentitySchema,
  members: Schema.Array(RuntimeClosureMemberSchema),
  excluded_semantic_identities: Schema.Array(IdentitySchema),
  member_count: CountSchema,
  excluded_count: CountSchema,
  manifest_identity: IdentitySchema,
});

export type RuntimeArtifactSelectionMember = typeof RuntimeArtifactSelectionMemberSchema.Type;
export type RuntimeArtifactSelection = typeof RuntimeArtifactSelectionSchema.Type;
export type RuntimeClosureMember = typeof RuntimeClosureMemberSchema.Type;
export type RuntimeClosureManifest = typeof RuntimeClosureManifestSchema.Type;

export interface RuntimeClosureArtifact {
  readonly manifest: RuntimeClosureManifest;
  readonly bytes: Uint8Array;
}

export class RuntimeClosureSelectionRejected extends Data.TaggedError(
  "RuntimeClosureSelectionRejected",
)<{
  readonly reason: string;
}> {}

export class RuntimeClosureMembershipRejected extends Data.TaggedError(
  "RuntimeClosureMembershipRejected",
)<{
  readonly reason: string;
}> {}

export class RuntimeClosureSnapshotRejected extends Data.TaggedError(
  "RuntimeClosureSnapshotRejected",
)<{
  readonly reason: string;
}> {}

export class RuntimeClosureManifestRejected extends Data.TaggedError(
  "RuntimeClosureManifestRejected",
)<{
  readonly reason: string;
}> {}

export class RuntimeClosureDigestFailure extends Data.TaggedError("RuntimeClosureDigestFailure")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export type RuntimeClosureReceiptFailure =
  | ReachabilityReceiptRejected
  | ReachabilityGraphRejected
  | ReachabilityDigestFailure;

export type RuntimeClosureBuildFailure =
  | RuntimeClosureReceiptFailure
  | RuntimeClosureSelectionRejected
  | RuntimeClosureSnapshotRejected
  | RuntimeClosureMembershipRejected
  | RuntimeClosureManifestRejected
  | RuntimeClosureDigestFailure;

export type RuntimeClosureValidationFailure =
  | RuntimeClosureReceiptFailure
  | RuntimeClosureSnapshotRejected
  | RuntimeClosureMembershipRejected
  | RuntimeClosureManifestRejected
  | RuntimeClosureDigestFailure;

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const immutable = <Value extends object>(value: Value): Readonly<Value> => Object.freeze(value);

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

const toHex = (bytes: Uint8Array): string => {
  let output = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    output += bytes[index]!.toString(16).padStart(2, "0");
  }
  return output;
};

const decodeSnapshotJson = (
  input: unknown,
): Effect.Effect<SemanticStoreSnapshot, RuntimeClosureSnapshotRejected> =>
  Effect.gen(function* () {
    if (typeof input !== "string") {
      return yield* new RuntimeClosureSnapshotRejected({
        reason: "snapshot input must be a primitive JSON string",
      });
    }
    if (input.length > runtimeClosureBounds.maximumSnapshotBytes) {
      return yield* new RuntimeClosureSnapshotRejected({
        reason: `snapshot exceeds ${runtimeClosureBounds.maximumSnapshotBytes} UTF-16 code units`,
      });
    }
    const encodedLength = new TextEncoder().encode(input).byteLength;
    if (encodedLength > runtimeClosureBounds.maximumSnapshotBytes) {
      return yield* new RuntimeClosureSnapshotRejected({
        reason: `snapshot exceeds ${runtimeClosureBounds.maximumSnapshotBytes} UTF-8 bytes`,
      });
    }
    const scanIssue = scanJson(
      input,
      runtimeClosureBounds.maximumSnapshotDepth,
      runtimeClosureBounds.maximumSnapshotJsonValues,
    );
    if (scanIssue !== undefined) {
      return yield* new RuntimeClosureSnapshotRejected({ reason: scanIssue.message });
    }
    const parsed = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(input).pipe(
      Effect.mapError((cause) => new RuntimeClosureSnapshotRejected({ reason: cause.message })),
      Effect.catchDefect(() =>
        Effect.fail(
          new RuntimeClosureSnapshotRejected({
            reason: "snapshot JSON could not be decoded",
          }),
        ),
      ),
    );
    const decoded = yield* Schema.decodeUnknownEffect(SemanticStoreSnapshotSchema, {
      onExcessProperty: "error",
    })(parsed).pipe(
      Effect.mapError((cause) => new RuntimeClosureSnapshotRejected({ reason: cause.message })),
      Effect.catchDefect(() =>
        Effect.fail(
          new RuntimeClosureSnapshotRejected({
            reason: "snapshot value could not be decoded",
          }),
        ),
      ),
    );
    return immutable({
      format: decoded.format,
      version: decoded.version,
      semantic_values: Object.freeze(
        decoded.semantic_values.map((semanticValue) =>
          immutable({
            semantic_identity: semanticValue.semantic_identity,
            artifacts: Object.freeze(
              semanticValue.artifacts.map((artifact) =>
                immutable({
                  artifact_identity: artifact.artifact_identity,
                  canonical_bytes: artifact.canonical_bytes,
                }),
              ),
            ),
          }),
        ),
      ),
      name_bindings: Object.freeze([]),
    });
  });

const replayFailure = (
  failure: SemanticStoreSnapshotRejected | NormalizedCoreDigestFailure,
): RuntimeClosureSnapshotRejected | RuntimeClosureDigestFailure =>
  failure instanceof SemanticStoreSnapshotRejected
    ? new RuntimeClosureSnapshotRejected({ reason: failure.reason })
    : new RuntimeClosureDigestFailure({
        message: `cannot replay runtime-closure snapshot witness: ${failure.message}`,
        cause: { phase: "snapshot-replay", failure },
      });

const withPrivateSnapshot = <Value, Error>(
  snapshot: SemanticStoreSnapshot,
  program: Effect.Effect<Value, Error, SemanticStore | Crypto.Crypto>,
): Effect.Effect<
  Value,
  Error | RuntimeClosureSnapshotRejected | RuntimeClosureDigestFailure,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    const store = yield* SemanticStore;
    yield* store.replay(snapshot).pipe(Effect.mapError(replayFailure));
    return yield* program;
  }).pipe(Effect.provide(SemanticStoreLayer));

const snapshotManifestBytes = (
  input: unknown,
): Effect.Effect<Uint8Array, RuntimeClosureManifestRejected> =>
  Effect.try({
    try: () => {
      const bytes = trustedUint8ArrayCopy(input);
      if (bytes === undefined) throw new TypeError("manifest input must be a Uint8Array");
      if (bytes.byteLength > runtimeClosureBounds.maximumBytes) {
        throw new RangeError(`manifest exceeds ${runtimeClosureBounds.maximumBytes} bytes`);
      }
      return bytes;
    },
    catch: (cause) =>
      new RuntimeClosureManifestRejected({
        reason: cause instanceof Error ? cause.message : "manifest bytes could not be captured",
      }),
  });

const decodeJsonText = <S extends Schema.Constraint>(
  schema: S,
  input: string,
  reject: (reason: string) => RuntimeClosureSelectionRejected | RuntimeClosureManifestRejected,
): Effect.Effect<
  S["Type"],
  RuntimeClosureSelectionRejected | RuntimeClosureManifestRejected,
  S["DecodingServices"]
> =>
  Effect.gen(function* () {
    const encodedLength = new TextEncoder().encode(input).byteLength;
    if (encodedLength > runtimeClosureBounds.maximumBytes) {
      return yield* reject(`input exceeds ${runtimeClosureBounds.maximumBytes} UTF-8 bytes`);
    }
    const scanIssue = scanJson(
      input,
      runtimeClosureBounds.maximumDepth,
      runtimeClosureBounds.maximumJsonValues,
    );
    if (scanIssue !== undefined) return yield* reject(scanIssue.message);
    const parsed = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(input).pipe(
      Effect.mapError((cause) => reject(cause.message)),
      Effect.catchDefect(() => Effect.fail(reject("JSON input could not be decoded"))),
    );
    return yield* Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(parsed).pipe(
      Effect.mapError((cause) => reject(cause.message)),
      Effect.catchDefect(() => Effect.fail(reject("JSON value could not be decoded"))),
    );
  });

const decodeSelectionJson = (
  input: unknown,
): Effect.Effect<RuntimeArtifactSelection, RuntimeClosureSelectionRejected> =>
  Effect.gen(function* () {
    if (typeof input !== "string") {
      return yield* new RuntimeClosureSelectionRejected({
        reason: "selection input must be a primitive JSON string",
      });
    }
    const selection = yield* decodeJsonText(
      RuntimeArtifactSelectionSchema,
      input,
      (reason) => new RuntimeClosureSelectionRejected({ reason }),
    ) as Effect.Effect<RuntimeArtifactSelection, RuntimeClosureSelectionRejected>;
    if (selection.members.length > runtimeClosureBounds.maximumMembers) {
      return yield* new RuntimeClosureSelectionRejected({
        reason: `selection exceeds ${runtimeClosureBounds.maximumMembers} members`,
      });
    }
    return selection;
  });

interface PreparedManifest {
  readonly manifest: RuntimeClosureManifest;
  readonly bytes: Uint8Array;
}

const decodeManifestBytes = (
  input: unknown,
): Effect.Effect<PreparedManifest, RuntimeClosureManifestRejected> =>
  Effect.gen(function* () {
    const bytes = yield* snapshotManifestBytes(input);
    const text = yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      catch: () => new RuntimeClosureManifestRejected({ reason: "manifest is not valid UTF-8" }),
    });
    const manifest = yield* decodeJsonText(
      RuntimeClosureManifestSchema,
      text,
      (reason) => new RuntimeClosureManifestRejected({ reason }),
    ) as Effect.Effect<RuntimeClosureManifest, RuntimeClosureManifestRejected>;
    if (manifest.members.length > runtimeClosureBounds.maximumMembers) {
      return yield* new RuntimeClosureManifestRejected({
        reason: `manifest exceeds ${runtimeClosureBounds.maximumMembers} members`,
      });
    }
    return immutable({ manifest, bytes });
  });

const normalizeSelection = (
  members: ReadonlyArray<RuntimeArtifactSelectionMember | RuntimeClosureMember>,
  analysis: ReachabilityReceipt,
  snapshot: SemanticStoreSnapshot,
): Effect.Effect<ReadonlyArray<RuntimeClosureMember>, RuntimeClosureMembershipRejected> =>
  Effect.gen(function* () {
    const bySemanticIdentity = new Map<string, RuntimeClosureMember>();
    const reachable = new Set<string>(analysis.reachable_semantic_identities);
    const unreachable = new Set<string>(analysis.unreachable_semantic_identities);

    for (const member of members) {
      if (bySemanticIdentity.has(member.semantic_identity)) {
        return yield* new RuntimeClosureMembershipRejected({
          reason: `duplicate selected semantic identity ${member.semantic_identity}`,
        });
      }
      if (unreachable.has(member.semantic_identity)) {
        return yield* new RuntimeClosureMembershipRejected({
          reason: `selection includes unreachable semantic identity ${member.semantic_identity}`,
        });
      }
      if (!reachable.has(member.semantic_identity)) {
        return yield* new RuntimeClosureMembershipRejected({
          reason: `selection includes semantic identity outside the reachable universe ${member.semantic_identity}`,
        });
      }
      bySemanticIdentity.set(
        member.semantic_identity,
        immutable({
          semantic_identity: member.semantic_identity,
          artifact_identity: member.artifact_identity,
        }),
      );
    }

    for (const semanticIdentity of analysis.reachable_semantic_identities) {
      if (!bySemanticIdentity.has(semanticIdentity)) {
        return yield* new RuntimeClosureMembershipRejected({
          reason: `selection is missing reachable semantic identity ${semanticIdentity}`,
        });
      }
    }

    const storedBySemanticIdentity = new Map(
      snapshot.semantic_values.map((value) => [value.semantic_identity, value] as const),
    );
    for (const member of bySemanticIdentity.values()) {
      const stored = storedBySemanticIdentity.get(member.semantic_identity);
      if (
        stored === undefined ||
        !stored.artifacts.some(
          (artifact) => artifact.artifact_identity === member.artifact_identity,
        )
      ) {
        return yield* new RuntimeClosureMembershipRejected({
          reason: `artifact ${member.artifact_identity} is not present under semantic identity ${member.semantic_identity}`,
        });
      }
    }

    return Object.freeze(
      [...bySemanticIdentity.values()].sort((left, right) =>
        compareStrings(left.semantic_identity, right.semantic_identity),
      ),
    );
  });

const manifestPayload = (
  analysis: ReachabilityReceipt,
  members: ReadonlyArray<RuntimeClosureMember>,
): CanonicalJsonValue => ({
  format: "semantic.runtime-closure-manifest",
  version: 1,
  status: "assembled",
  procedure_identity: runtimeClosureProcedureIdentity,
  edge_authority: "caller-declared",
  artifact_selection_authority: "caller-selected",
  analysis: analysis as unknown as CanonicalJsonValue,
  root_semantic_identity: analysis.root_semantic_identity,
  members: members.map((member) => ({
    semantic_identity: member.semantic_identity,
    artifact_identity: member.artifact_identity,
  })),
  excluded_semantic_identities: [...analysis.unreachable_semantic_identities],
  member_count: members.length,
  excluded_count: analysis.unreachable_semantic_identities.length,
});

const manifestDocument = (
  payload: CanonicalJsonValue,
  manifestIdentity: Identity,
): CanonicalJsonValue => ({
  ...(payload as Readonly<Record<string, CanonicalJsonValue>>),
  manifest_identity: manifestIdentity,
});

const deriveManifestIdentity = (
  payload: CanonicalJsonValue,
): Effect.Effect<Identity, RuntimeClosureDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const domainBytes = new TextEncoder().encode(runtimeClosureIdentityDomain);
    const payloadBytes = canonicalBytes(payload, false);
    const preimage = new Uint8Array(domainBytes.length + 1 + payloadBytes.length);
    preimage.set(domainBytes);
    preimage[domainBytes.length] = 0;
    preimage.set(payloadBytes, domainBytes.length + 1);
    const digest = yield* crypto.digest("SHA-256", preimage).pipe(
      Effect.mapError(
        (cause) =>
          new RuntimeClosureDigestFailure({
            message: "cannot compute runtime-closure manifest identity",
            cause,
          }),
      ),
    );
    const trustedDigest = trustedUint8ArrayCopy(digest);
    if (trustedDigest === undefined || trustedDigest.byteLength !== 32) {
      return yield* new RuntimeClosureDigestFailure({
        message: "invalid SHA-256 digest length for runtime-closure manifest",
        cause: { expectedBytes: 32, actualBytes: trustedDigest?.byteLength },
      });
    }
    return `sha256:${toHex(trustedDigest)}` as Identity;
  });

const assembleArtifact = (
  analysis: ReachabilityReceipt,
  members: ReadonlyArray<RuntimeClosureMember>,
): Effect.Effect<
  RuntimeClosureArtifact,
  RuntimeClosureManifestRejected | RuntimeClosureDigestFailure,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    const payload = manifestPayload(analysis, members);
    const manifestIdentity = yield* deriveManifestIdentity(payload);
    const excluded = Object.freeze([...analysis.unreachable_semantic_identities]);
    const manifest = immutable({
      format: "semantic.runtime-closure-manifest" as const,
      version: 1 as const,
      status: "assembled" as const,
      procedure_identity: runtimeClosureProcedureIdentity,
      edge_authority: "caller-declared" as const,
      artifact_selection_authority: "caller-selected" as const,
      analysis,
      root_semantic_identity: analysis.root_semantic_identity,
      members,
      excluded_semantic_identities: excluded,
      member_count: members.length,
      excluded_count: excluded.length,
      manifest_identity: manifestIdentity,
    });
    const custodiedBytes = canonicalBytes(manifestDocument(payload, manifestIdentity));
    if (custodiedBytes.byteLength > runtimeClosureBounds.maximumBytes) {
      return yield* new RuntimeClosureManifestRejected({
        reason: `assembled manifest exceeds ${runtimeClosureBounds.maximumBytes} bytes`,
      });
    }
    return immutable({
      manifest,
      get bytes(): Uint8Array {
        return custodiedBytes.slice();
      },
    });
  });

export const buildRuntimeClosure = (
  storeSnapshotJson: unknown,
  receiptBytes: unknown,
  selectionJson: unknown,
): Effect.Effect<RuntimeClosureArtifact, RuntimeClosureBuildFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const preparedReceipt = yield* prepareReachabilityReceiptBytes(receiptBytes);
    const selection = yield* decodeSelectionJson(selectionJson);
    const storeSnapshot = yield* decodeSnapshotJson(storeSnapshotJson);
    return yield* withPrivateSnapshot(
      storeSnapshot,
      withValidatedReceiptSnapshot(preparedReceipt.bytes, (analysis, snapshot) =>
        Effect.gen(function* () {
          const members = yield* normalizeSelection(selection.members, analysis, snapshot);
          return yield* assembleArtifact(analysis, members);
        }),
      ),
    );
  });

export const validateRuntimeClosureBytes = (
  storeSnapshotJson: unknown,
  manifestBytes: unknown,
): Effect.Effect<RuntimeClosureManifest, RuntimeClosureValidationFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const preparedManifest = yield* decodeManifestBytes(manifestBytes);
    const embeddedReceiptBytes = yield* Effect.try({
      try: () =>
        canonicalBytes(preparedManifest.manifest.analysis as unknown as CanonicalJsonValue),
      catch: () =>
        new RuntimeClosureManifestRejected({
          reason: "embedded reachability receipt could not be canonicalized",
        }),
    });
    const preparedReceipt = yield* prepareReachabilityReceiptBytes(embeddedReceiptBytes);
    const storeSnapshot = yield* decodeSnapshotJson(storeSnapshotJson);
    return yield* withPrivateSnapshot(
      storeSnapshot,
      withValidatedReceiptSnapshot(preparedReceipt.bytes, (analysis, snapshot) =>
        Effect.gen(function* () {
          const members = yield* normalizeSelection(
            preparedManifest.manifest.members,
            analysis,
            snapshot,
          );
          const expected = yield* assembleArtifact(analysis, members);
          if (!bytesEqual(preparedManifest.bytes, expected.bytes)) {
            return yield* new RuntimeClosureManifestRejected({
              reason: "manifest bytes are not the canonical recomputed runtime closure",
            });
          }
          return expected.manifest;
        }),
      ),
    );
  });
