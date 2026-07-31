/**
 * Effect service for the first content-addressed language-build tracer.
 *
 * The 0019 validator owns acceptance and identity checks. This service only
 * indexes accepted values, exact artifact variants, and separate authored-name
 * projections.
 */
import { Context, Data, Effect, Layer, Ref, Schema, type Crypto } from "effect";
import {
  validateNormalizedCoreBytes,
  type Identity,
  type NormalizedCoreDiagnostic,
  type NormalizedCoreDigestFailure,
} from "../normalized-core/index.ts";

const IdentitySchema = Schema.String.check(Schema.isPattern(/^sha256:[0-9a-f]{64}$/));

export const NameBindingInputSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  semantic_identity: IdentitySchema,
});

export const NameLookupInputSchema = Schema.Struct({
  name: Schema.NonEmptyString,
});

const SnapshotArtifactSchema = Schema.Struct({
  artifact_identity: IdentitySchema,
  canonical_bytes: Schema.String,
});

const SnapshotSemanticValueSchema = Schema.Struct({
  semantic_identity: IdentitySchema,
  artifacts: Schema.Array(SnapshotArtifactSchema),
});

const SnapshotNameBindingSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  semantic_identity: IdentitySchema,
});

export const SemanticStoreSnapshotSchema = Schema.Struct({
  format: Schema.Literal("semantic.language-build-store"),
  version: Schema.Literal(1),
  semantic_values: Schema.Array(SnapshotSemanticValueSchema),
  name_bindings: Schema.Array(SnapshotNameBindingSchema),
});

export type NameBindingInput = typeof NameBindingInputSchema.Type;
export type NameLookupInput = typeof NameLookupInputSchema.Type;
export type SemanticStoreSnapshot = typeof SemanticStoreSnapshotSchema.Type;

export const semanticStoreReplayBounds = Object.freeze({
  semanticValues: 1_024,
  artifacts: 4_096,
  nameBindings: 4_096,
} as const);

export class SemanticArtifactRejected extends Data.TaggedError("SemanticArtifactRejected")<{
  readonly diagnostics: readonly [NormalizedCoreDiagnostic];
}> {}

export class NameBindingInputRejected extends Data.TaggedError("NameBindingInputRejected")<{
  readonly reason: string;
}> {}

export class SemanticTargetAbsent extends Data.TaggedError("SemanticTargetAbsent")<{
  readonly semanticIdentity: string;
}> {}

export class AuthoredNameAbsent extends Data.TaggedError("AuthoredNameAbsent")<{
  readonly name: string;
}> {}

export class SemanticStoreSnapshotRejected extends Data.TaggedError(
  "SemanticStoreSnapshotRejected",
)<{
  readonly reason: string;
}> {}

export type StoreStatus = "stored" | "artifact-hit" | "semantic-hit";

export interface SemanticStoreReceipt {
  readonly status: StoreStatus;
  readonly semantic_identity: Identity;
  readonly artifact_identity: Identity;
  readonly artifact_count: number;
}

export interface NameBindingReceipt {
  readonly status: "bound" | "binding-hit" | "rebound";
  readonly name: string;
  readonly semantic_identity: Identity;
}

export interface NameResolutionReceipt {
  readonly status: "resolved";
  readonly name: string;
  readonly semantic_identity: Identity;
}

export interface ReplayReceipt {
  readonly status: "replayed";
  readonly semantic_value_count: number;
  readonly artifact_count: number;
  readonly name_binding_count: number;
}

interface StoredArtifact {
  readonly artifactIdentity: Identity;
  readonly canonicalBytes: string;
}

interface StoredSemanticValue {
  readonly semanticIdentity: Identity;
  readonly artifacts: ReadonlyMap<string, StoredArtifact>;
}

interface StoreState {
  readonly semanticValues: ReadonlyMap<string, StoredSemanticValue>;
  readonly nameBindings: ReadonlyMap<string, Identity>;
}

type NameBindingOutcome = Readonly<{ readonly status: "absent" }> | NameBindingReceipt;

const emptyState = (): StoreState => ({
  semanticValues: new Map(),
  nameBindings: new Map(),
});

const immutable = <Value extends object>(value: Value): Readonly<Value> => Object.freeze(value);

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const decodeNameBinding = (
  input: unknown,
): Effect.Effect<NameBindingInput, NameBindingInputRejected> =>
  Schema.decodeUnknownEffect(NameBindingInputSchema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError((cause) => new NameBindingInputRejected({ reason: cause.message })),
    Effect.catchDefect(() =>
      Effect.fail(
        new NameBindingInputRejected({ reason: "name binding input could not be decoded" }),
      ),
    ),
  );

const decodeNameLookup = (
  input: unknown,
): Effect.Effect<NameLookupInput, NameBindingInputRejected> =>
  Schema.decodeUnknownEffect(NameLookupInputSchema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError((cause) => new NameBindingInputRejected({ reason: cause.message })),
    Effect.catchDefect(() =>
      Effect.fail(
        new NameBindingInputRejected({ reason: "name lookup input could not be decoded" }),
      ),
    ),
  );

const snapshotState = (state: StoreState): SemanticStoreSnapshot => {
  const semanticValues = [...state.semanticValues.values()]
    .sort((left, right) => compareStrings(left.semanticIdentity, right.semanticIdentity))
    .map((semanticValue) =>
      immutable({
        semantic_identity: semanticValue.semanticIdentity,
        artifacts: Object.freeze(
          [...semanticValue.artifacts.values()]
            .sort((left, right) => compareStrings(left.artifactIdentity, right.artifactIdentity))
            .map((artifact) =>
              immutable({
                artifact_identity: artifact.artifactIdentity,
                canonical_bytes: artifact.canonicalBytes,
              }),
            ),
        ),
      }),
    );
  const nameBindings = [...state.nameBindings.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([name, semanticIdentity]) => immutable({ name, semantic_identity: semanticIdentity }));
  return immutable({
    format: "semantic.language-build-store" as const,
    version: 1 as const,
    semantic_values: Object.freeze(semanticValues),
    name_bindings: Object.freeze(nameBindings),
  });
};

interface PreparedSnapshot {
  readonly state: StoreState;
  readonly artifactCount: number;
}

const prepareSnapshot = (
  input: unknown,
): Effect.Effect<
  PreparedSnapshot,
  SemanticStoreSnapshotRejected | NormalizedCoreDigestFailure,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    const snapshot = yield* Schema.decodeUnknownEffect(SemanticStoreSnapshotSchema, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError((cause) => new SemanticStoreSnapshotRejected({ reason: cause.message })),
      Effect.catchDefect(() =>
        Effect.fail(
          new SemanticStoreSnapshotRejected({ reason: "snapshot input could not be decoded" }),
        ),
      ),
    );
    if (snapshot.semantic_values.length > semanticStoreReplayBounds.semanticValues) {
      return yield* new SemanticStoreSnapshotRejected({
        reason: `snapshot exceeds ${semanticStoreReplayBounds.semanticValues} semantic values`,
      });
    }
    if (snapshot.name_bindings.length > semanticStoreReplayBounds.nameBindings) {
      return yield* new SemanticStoreSnapshotRejected({
        reason: `snapshot exceeds ${semanticStoreReplayBounds.nameBindings} authored-name bindings`,
      });
    }
    let candidateArtifactCount = 0;
    for (const semanticValue of snapshot.semantic_values) {
      candidateArtifactCount += semanticValue.artifacts.length;
      if (candidateArtifactCount > semanticStoreReplayBounds.artifacts) {
        return yield* new SemanticStoreSnapshotRejected({
          reason: `snapshot exceeds ${semanticStoreReplayBounds.artifacts} artifact variants`,
        });
      }
    }
    const semanticValues = new Map<string, StoredSemanticValue>();
    let artifactCount = 0;
    for (const semanticValue of snapshot.semantic_values) {
      if (semanticValues.has(semanticValue.semantic_identity)) {
        return yield* new SemanticStoreSnapshotRejected({
          reason: `duplicate semantic identity ${semanticValue.semantic_identity}`,
        });
      }
      const artifacts = new Map<string, StoredArtifact>();
      let acceptedSemanticIdentity: Identity | undefined;
      for (const artifact of semanticValue.artifacts) {
        if (artifacts.has(artifact.artifact_identity)) {
          return yield* new SemanticStoreSnapshotRejected({
            reason: `duplicate artifact identity ${artifact.artifact_identity}`,
          });
        }
        const validation = yield* validateNormalizedCoreBytes(
          new TextEncoder().encode(artifact.canonical_bytes),
        );
        if (validation.status === "rejected") {
          return yield* new SemanticStoreSnapshotRejected({
            reason: `artifact ${artifact.artifact_identity} was rejected: ${validation.diagnostics[0].code}`,
          });
        }
        if (
          validation.artifact.semantic_identity !== semanticValue.semantic_identity ||
          validation.artifact.artifact_identity !== artifact.artifact_identity
        ) {
          return yield* new SemanticStoreSnapshotRejected({
            reason: `artifact ${artifact.artifact_identity} does not match its declared identities`,
          });
        }
        acceptedSemanticIdentity = validation.artifact.semantic_identity;
        artifacts.set(
          artifact.artifact_identity,
          immutable({
            artifactIdentity: validation.artifact.artifact_identity,
            canonicalBytes: new TextDecoder().decode(validation.bytes),
          }),
        );
        artifactCount += 1;
      }
      if (artifacts.size === 0) {
        return yield* new SemanticStoreSnapshotRejected({
          reason: `semantic identity ${semanticValue.semantic_identity} has no accepted artifact`,
        });
      }
      if (acceptedSemanticIdentity === undefined) {
        return yield* new SemanticStoreSnapshotRejected({
          reason: `semantic identity ${semanticValue.semantic_identity} has no accepted artifact`,
        });
      }
      semanticValues.set(
        semanticValue.semantic_identity,
        immutable({
          semanticIdentity: acceptedSemanticIdentity,
          artifacts,
        }),
      );
    }
    const nameBindings = new Map<string, Identity>();
    for (const binding of snapshot.name_bindings) {
      if (nameBindings.has(binding.name)) {
        return yield* new SemanticStoreSnapshotRejected({
          reason: `duplicate authored name ${binding.name}`,
        });
      }
      const target = semanticValues.get(binding.semantic_identity);
      if (target === undefined) {
        return yield* new SemanticStoreSnapshotRejected({
          reason: `authored name ${binding.name} targets an absent semantic value`,
        });
      }
      nameBindings.set(binding.name, target.semanticIdentity);
    }
    return {
      state: { semanticValues, nameBindings },
      artifactCount,
    };
  });

export interface SemanticStoreShape {
  readonly insert: (
    bytes: unknown,
  ) => Effect.Effect<
    SemanticStoreReceipt,
    SemanticArtifactRejected | NormalizedCoreDigestFailure,
    Crypto.Crypto
  >;
  readonly bindName: (
    input: unknown,
  ) => Effect.Effect<NameBindingReceipt, NameBindingInputRejected | SemanticTargetAbsent>;
  readonly resolveName: (
    input: unknown,
  ) => Effect.Effect<NameResolutionReceipt, NameBindingInputRejected | AuthoredNameAbsent>;
  readonly snapshot: Effect.Effect<SemanticStoreSnapshot>;
  readonly replay: (
    input: unknown,
  ) => Effect.Effect<
    ReplayReceipt,
    SemanticStoreSnapshotRejected | NormalizedCoreDigestFailure,
    Crypto.Crypto
  >;
}

export class SemanticStore extends Context.Service<SemanticStore, SemanticStoreShape>()(
  "language-build/SemanticStore",
) {}

export const SemanticStoreLayer: Layer.Layer<SemanticStore> = Layer.effect(
  SemanticStore,
  Effect.gen(function* () {
    const state = yield* Ref.make<StoreState>(emptyState());
    return {
      insert: (bytes) =>
        Effect.gen(function* () {
          const validation = yield* validateNormalizedCoreBytes(bytes);
          if (validation.status === "rejected") {
            return yield* new SemanticArtifactRejected({
              diagnostics: validation.diagnostics,
            });
          }
          const artifact = validation.artifact;
          const canonicalBytes = new TextDecoder().decode(validation.bytes);
          return yield* Ref.modify(
            state,
            (current): readonly [SemanticStoreReceipt, StoreState] => {
              const existingSemantic = current.semanticValues.get(artifact.semantic_identity);
              if (
                existingSemantic !== undefined &&
                existingSemantic.artifacts.has(artifact.artifact_identity)
              ) {
                return [
                  immutable({
                    status: "artifact-hit" as const,
                    semantic_identity: artifact.semantic_identity,
                    artifact_identity: artifact.artifact_identity,
                    artifact_count: existingSemantic.artifacts.size,
                  }),
                  current,
                ];
              }
              const artifacts = new Map(existingSemantic?.artifacts ?? []);
              artifacts.set(
                artifact.artifact_identity,
                immutable({ artifactIdentity: artifact.artifact_identity, canonicalBytes }),
              );
              const semanticValues = new Map(current.semanticValues);
              semanticValues.set(
                artifact.semantic_identity,
                immutable({ semanticIdentity: artifact.semantic_identity, artifacts }),
              );
              return [
                immutable({
                  status:
                    existingSemantic === undefined
                      ? ("stored" as const)
                      : ("semantic-hit" as const),
                  semantic_identity: artifact.semantic_identity,
                  artifact_identity: artifact.artifact_identity,
                  artifact_count: artifacts.size,
                }),
                { ...current, semanticValues },
              ];
            },
          );
        }),
      bindName: (input) =>
        Effect.gen(function* () {
          const binding = yield* decodeNameBinding(input);
          const outcome = yield* Ref.modify<StoreState, NameBindingOutcome>(state, (current) => {
            const target = current.semanticValues.get(binding.semantic_identity);
            if (target === undefined) {
              return [immutable({ status: "absent" as const }), current];
            }
            const previous = current.nameBindings.get(binding.name);
            if (previous === target.semanticIdentity) {
              return [
                immutable({
                  status: "binding-hit" as const,
                  name: binding.name,
                  semantic_identity: target.semanticIdentity,
                }),
                current,
              ];
            }
            const nameBindings = new Map(current.nameBindings);
            nameBindings.set(binding.name, target.semanticIdentity);
            return [
              immutable({
                status: previous === undefined ? ("bound" as const) : ("rebound" as const),
                name: binding.name,
                semantic_identity: target.semanticIdentity,
              }),
              { ...current, nameBindings },
            ];
          });
          if (outcome.status === "absent") {
            return yield* new SemanticTargetAbsent({
              semanticIdentity: binding.semantic_identity,
            });
          }
          return outcome;
        }),
      resolveName: (input) =>
        Effect.gen(function* () {
          const lookup = yield* decodeNameLookup(input);
          const semanticIdentity = (yield* Ref.get(state)).nameBindings.get(lookup.name);
          if (semanticIdentity === undefined) {
            return yield* new AuthoredNameAbsent({ name: lookup.name });
          }
          return immutable({
            status: "resolved" as const,
            name: lookup.name,
            semantic_identity: semanticIdentity,
          });
        }),
      snapshot: Ref.get(state).pipe(Effect.map(snapshotState)),
      replay: (input) =>
        Effect.gen(function* () {
          const prepared = yield* prepareSnapshot(input);
          yield* Ref.set(state, prepared.state);
          return immutable({
            status: "replayed" as const,
            semantic_value_count: prepared.state.semanticValues.size,
            artifact_count: prepared.artifactCount,
            name_binding_count: prepared.state.nameBindings.size,
          });
        }),
    };
  }),
);
