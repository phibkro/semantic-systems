/**
 * Finite host-neutral action interpreter over one accepted runtime closure.
 *
 * This Effect application boundary owns representation custody, capability
 * admission, digest observations, and canonical action-receipt validation. It
 * performs no host or deployment effects.
 */
import { Crypto, Data, Effect, Match, Schema } from "effect";
import { canonicalBytes, scanJson, type CanonicalJsonValue } from "../normalized-core/canonical.ts";
import type { Identity } from "../normalized-core/index.ts";
import {
  type RuntimeClosureManifest,
  type RuntimeClosureValidationFailure,
  validateRuntimeClosureBytes,
} from "./runtime-closure.ts";

const IdentitySchema = Schema.String.check(Schema.isPattern(/^sha256:[0-9a-f]{64}$/));
const CountSchema = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);

export const reproducibleActionBounds = Object.freeze({
  maximumBytes: 1_048_576,
  maximumDepth: 64,
  maximumJsonValues: 16_384,
  maximumCapabilities: 16,
} as const);

export const reproducibleActionProcedureIdentity =
  "semantic.language-build/reproducible-action/0035/v1" as const;

export const reproducibleActionIdentityDomains = Object.freeze({
  recipe: "semantic.language-build/action-recipe/v1",
  environment: "semantic.language-build/action-environment/v1",
  execution: "semantic.language-build/action-execution/v1",
  receipt: "semantic.language-build/action-observation-receipt/v1",
} as const);

export const ReproducibleActionCapabilitySchema = Schema.Literals([
  "semantic.runtime-closure.member-count/v1",
  "semantic.runtime-closure.membership-query/v1",
]);

export const ReproducibleActionRecipeSchema = Schema.Struct({
  format: Schema.Literal("semantic.action-recipe"),
  version: Schema.Literal(1),
  action: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("closure.member-count") }),
    Schema.Struct({
      kind: Schema.Literal("closure.artifact-present"),
      semantic_identity: IdentitySchema,
      artifact_identity: IdentitySchema,
    }),
  ]),
});

export const ReproducibleActionEnvironmentSchema = Schema.Struct({
  format: Schema.Literal("semantic.action-environment"),
  version: Schema.Literal(1),
  runtime: Schema.Literal("semantic.host-neutral-reference"),
  capabilities: Schema.Array(ReproducibleActionCapabilitySchema),
});

export const ReproducibleActionObservationSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("closure.member-count"),
    member_count: CountSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("closure.artifact-present"),
    present: Schema.Boolean,
  }),
]);

export const ReproducibleActionReceiptSchema = Schema.Struct({
  format: Schema.Literal("semantic.action-observation-receipt"),
  version: Schema.Literal(1),
  status: Schema.Literal("completed"),
  procedure_identity: Schema.Literal(reproducibleActionProcedureIdentity),
  execution_authority: Schema.Literal("semantic.host-neutral-reference-interpreter"),
  recipe: ReproducibleActionRecipeSchema,
  recipe_identity: IdentitySchema,
  declared_environment: ReproducibleActionEnvironmentSchema,
  environment_identity: IdentitySchema,
  required_capabilities: Schema.Array(ReproducibleActionCapabilitySchema),
  runtime_closure_manifest_identity: IdentitySchema,
  execution_identity: IdentitySchema,
  observation: ReproducibleActionObservationSchema,
  deployment_observation: Schema.Struct({
    status: Schema.Literal("not-observed"),
    evidence: Schema.Literal("unsupported"),
  }),
  receipt_identity: IdentitySchema,
});

export type ReproducibleActionCapability = typeof ReproducibleActionCapabilitySchema.Type;
export type ReproducibleActionRecipe = typeof ReproducibleActionRecipeSchema.Type;
export type ReproducibleActionEnvironment = typeof ReproducibleActionEnvironmentSchema.Type;
export type ReproducibleActionObservation = typeof ReproducibleActionObservationSchema.Type;
export type ReproducibleActionReceipt = typeof ReproducibleActionReceiptSchema.Type;

export interface ReproducibleActionArtifact {
  readonly receipt: ReproducibleActionReceipt;
  readonly bytes: Uint8Array;
}

export class ReproducibleActionRecipeRejected extends Data.TaggedError(
  "ReproducibleActionRecipeRejected",
)<{ readonly reason: string }> {}

export class ReproducibleActionEnvironmentRejected extends Data.TaggedError(
  "ReproducibleActionEnvironmentRejected",
)<{ readonly reason: string }> {}

export class ReproducibleActionCapabilityRejected extends Data.TaggedError(
  "ReproducibleActionCapabilityRejected",
)<{ readonly reason: string }> {}

export class ReproducibleActionReceiptRejected extends Data.TaggedError(
  "ReproducibleActionReceiptRejected",
)<{ readonly reason: string }> {}

export class ReproducibleActionDigestFailure extends Data.TaggedError(
  "ReproducibleActionDigestFailure",
)<{
  readonly phase: "recipe" | "environment" | "execution" | "receipt";
  readonly message: string;
  readonly cause: unknown;
}> {}

export type ReproducibleActionBuildFailure =
  | RuntimeClosureValidationFailure
  | ReproducibleActionRecipeRejected
  | ReproducibleActionEnvironmentRejected
  | ReproducibleActionCapabilityRejected
  | ReproducibleActionReceiptRejected
  | ReproducibleActionDigestFailure;

export type ReproducibleActionValidationFailure =
  | RuntimeClosureValidationFailure
  | ReproducibleActionCapabilityRejected
  | ReproducibleActionReceiptRejected
  | ReproducibleActionDigestFailure;

type InputRejection =
  | ReproducibleActionRecipeRejected
  | ReproducibleActionEnvironmentRejected
  | ReproducibleActionReceiptRejected;

const immutable = <Value extends object>(value: Value): Readonly<Value> => Object.freeze(value);

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

const toHex = (bytes: Uint8Array): string => {
  let output = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    output += bytes[index]!.toString(16).padStart(2, "0");
  }
  return output;
};

const decodeJsonText = <S extends Schema.Constraint>(
  schema: S,
  input: unknown,
  reject: (reason: string) => InputRejection,
): Effect.Effect<S["Type"], InputRejection, S["DecodingServices"]> =>
  Effect.gen(function* () {
    if (typeof input !== "string") {
      return yield* reject("input must be a primitive JSON string");
    }
    if (input.length > reproducibleActionBounds.maximumBytes) {
      return yield* reject(
        `input exceeds ${reproducibleActionBounds.maximumBytes} UTF-16 code units`,
      );
    }
    const encodedLength = new TextEncoder().encode(input).byteLength;
    if (encodedLength > reproducibleActionBounds.maximumBytes) {
      return yield* reject(`input exceeds ${reproducibleActionBounds.maximumBytes} UTF-8 bytes`);
    }
    const scanIssue = scanJson(
      input,
      reproducibleActionBounds.maximumDepth,
      reproducibleActionBounds.maximumJsonValues,
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

const normalizeRecipe = (recipe: ReproducibleActionRecipe): ReproducibleActionRecipe =>
  immutable({
    format: "semantic.action-recipe" as const,
    version: 1 as const,
    action: Match.value(recipe.action).pipe(
      Match.when({ kind: "closure.member-count" }, () =>
        immutable({ kind: "closure.member-count" as const }),
      ),
      Match.when({ kind: "closure.artifact-present" }, (action) =>
        immutable({
          kind: "closure.artifact-present" as const,
          semantic_identity: action.semantic_identity,
          artifact_identity: action.artifact_identity,
        }),
      ),
      Match.exhaustive,
    ),
  });

const decodeRecipeJson = (
  input: unknown,
): Effect.Effect<ReproducibleActionRecipe, ReproducibleActionRecipeRejected> =>
  Effect.map(
    decodeJsonText(
      ReproducibleActionRecipeSchema,
      input,
      (reason) => new ReproducibleActionRecipeRejected({ reason }),
    ),
    normalizeRecipe,
  ) as Effect.Effect<ReproducibleActionRecipe, ReproducibleActionRecipeRejected>;

const normalizeEnvironment = (
  environment: ReproducibleActionEnvironment,
): Effect.Effect<ReproducibleActionEnvironment, ReproducibleActionEnvironmentRejected> =>
  Effect.gen(function* () {
    if (environment.capabilities.length > reproducibleActionBounds.maximumCapabilities) {
      return yield* new ReproducibleActionEnvironmentRejected({
        reason: `environment exceeds ${reproducibleActionBounds.maximumCapabilities} capabilities`,
      });
    }
    const capabilities = [...environment.capabilities].sort(compareStrings);
    for (let index = 1; index < capabilities.length; index += 1) {
      if (capabilities[index - 1] === capabilities[index]) {
        return yield* new ReproducibleActionEnvironmentRejected({
          reason: `environment repeats capability ${capabilities[index]}`,
        });
      }
    }
    return immutable({
      format: "semantic.action-environment" as const,
      version: 1 as const,
      runtime: "semantic.host-neutral-reference" as const,
      capabilities: Object.freeze(capabilities),
    });
  });

const decodeEnvironmentJson = (
  input: unknown,
): Effect.Effect<ReproducibleActionEnvironment, ReproducibleActionEnvironmentRejected> =>
  Effect.flatMap(
    decodeJsonText(
      ReproducibleActionEnvironmentSchema,
      input,
      (reason) => new ReproducibleActionEnvironmentRejected({ reason }),
    ),
    normalizeEnvironment,
  ) as Effect.Effect<ReproducibleActionEnvironment, ReproducibleActionEnvironmentRejected>;

interface PreparedReceipt {
  readonly receipt: ReproducibleActionReceipt;
  readonly bytes: Uint8Array;
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get;
const typedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")?.get;

const snapshotReceiptBytes = (
  input: unknown,
): Effect.Effect<Uint8Array, ReproducibleActionReceiptRejected> =>
  Effect.try({
    try: () => {
      if (
        typedArrayTag === undefined ||
        typedArrayLength === undefined ||
        typedArrayTag.call(input) !== "Uint8Array"
      ) {
        throw new TypeError("receipt input must be a Uint8Array");
      }
      const length = typedArrayLength.call(input) as number;
      if (length > reproducibleActionBounds.maximumBytes) {
        throw new RangeError(`receipt exceeds ${reproducibleActionBounds.maximumBytes} bytes`);
      }
      const output = new Uint8Array(length);
      Uint8Array.prototype.set.call(output, input as Uint8Array);
      return output;
    },
    catch: (cause) =>
      new ReproducibleActionReceiptRejected({
        reason: cause instanceof Error ? cause.message : "receipt bytes could not be captured",
      }),
  });

const snapshotSha256Digest = (
  phase: ReproducibleActionDigestFailure["phase"],
  input: unknown,
): Effect.Effect<Uint8Array, ReproducibleActionDigestFailure> =>
  Effect.try({
    try: () => {
      if (
        typedArrayTag === undefined ||
        typedArrayLength === undefined ||
        typedArrayTag.call(input) !== "Uint8Array"
      ) {
        throw new TypeError("digest observation must be a Uint8Array");
      }
      const length = typedArrayLength.call(input) as number;
      if (length !== 32) {
        throw new RangeError(`digest observation contains ${length} bytes rather than 32`);
      }
      const output = new Uint8Array(32);
      Uint8Array.prototype.set.call(output, input as Uint8Array);
      return output;
    },
    catch: (cause) =>
      new ReproducibleActionDigestFailure({
        phase,
        message: `invalid SHA-256 digest observation for reproducible action ${phase} identity`,
        cause,
      }),
  });

const decodeReceiptBytes = (
  input: unknown,
): Effect.Effect<PreparedReceipt, ReproducibleActionReceiptRejected> =>
  Effect.gen(function* () {
    const bytes = yield* snapshotReceiptBytes(input);
    const text = yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      catch: () => new ReproducibleActionReceiptRejected({ reason: "receipt is not valid UTF-8" }),
    });
    const receipt = yield* decodeJsonText(
      ReproducibleActionReceiptSchema,
      text,
      (reason) => new ReproducibleActionReceiptRejected({ reason }),
    ) as Effect.Effect<ReproducibleActionReceipt, ReproducibleActionReceiptRejected>;
    return immutable({ receipt, bytes });
  });

const requiredCapability = (recipe: ReproducibleActionRecipe): ReproducibleActionCapability =>
  Match.value(recipe.action).pipe(
    Match.when(
      { kind: "closure.member-count" },
      () => "semantic.runtime-closure.member-count/v1" as const,
    ),
    Match.when(
      { kind: "closure.artifact-present" },
      () => "semantic.runtime-closure.membership-query/v1" as const,
    ),
    Match.exhaustive,
  );

const admitCapability = (
  recipe: ReproducibleActionRecipe,
  environment: ReproducibleActionEnvironment,
): Effect.Effect<
  ReadonlyArray<ReproducibleActionCapability>,
  ReproducibleActionCapabilityRejected
> =>
  Effect.gen(function* () {
    const required = requiredCapability(recipe);
    if (!environment.capabilities.includes(required)) {
      return yield* new ReproducibleActionCapabilityRejected({
        reason: `declared environment lacks required capability ${required}`,
      });
    }
    return Object.freeze([required]);
  });

const interpret = (
  recipe: ReproducibleActionRecipe,
  manifest: RuntimeClosureManifest,
): ReproducibleActionObservation =>
  Match.value(recipe.action).pipe(
    Match.when({ kind: "closure.member-count" }, () =>
      immutable({ kind: "closure.member-count" as const, member_count: manifest.member_count }),
    ),
    Match.when({ kind: "closure.artifact-present" }, (action) =>
      immutable({
        kind: "closure.artifact-present" as const,
        present: manifest.members.some(
          (member) =>
            member.semantic_identity === action.semantic_identity &&
            member.artifact_identity === action.artifact_identity,
        ),
      }),
    ),
    Match.exhaustive,
  );

const deriveIdentity = (
  phase: ReproducibleActionDigestFailure["phase"],
  domain: string,
  payload: CanonicalJsonValue,
): Effect.Effect<Identity, ReproducibleActionDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const domainBytes = new TextEncoder().encode(domain);
    const payloadBytes = canonicalBytes(payload, false);
    const preimage = new Uint8Array(domainBytes.length + 1 + payloadBytes.length);
    preimage.set(domainBytes);
    preimage[domainBytes.length] = 0;
    preimage.set(payloadBytes, domainBytes.length + 1);
    const digest = yield* crypto.digest("SHA-256", preimage).pipe(
      Effect.mapError(
        (cause) =>
          new ReproducibleActionDigestFailure({
            phase,
            message: `cannot compute reproducible action ${phase} identity`,
            cause,
          }),
      ),
    );
    const trustedDigest = yield* snapshotSha256Digest(phase, digest);
    return `sha256:${toHex(trustedDigest)}` as Identity;
  });

const executionPayload = (
  recipeIdentity: Identity,
  environmentIdentity: Identity,
  closureIdentity: string,
): CanonicalJsonValue => ({
  procedure_identity: reproducibleActionProcedureIdentity,
  recipe_identity: recipeIdentity,
  environment_identity: environmentIdentity,
  runtime_closure_manifest_identity: closureIdentity,
});

const receiptPayload = (
  recipe: ReproducibleActionRecipe,
  recipeIdentity: Identity,
  environment: ReproducibleActionEnvironment,
  environmentIdentity: Identity,
  requiredCapabilities: ReadonlyArray<ReproducibleActionCapability>,
  manifest: RuntimeClosureManifest,
  executionIdentity: Identity,
  observation: ReproducibleActionObservation,
): CanonicalJsonValue => ({
  format: "semantic.action-observation-receipt",
  version: 1,
  status: "completed",
  procedure_identity: reproducibleActionProcedureIdentity,
  execution_authority: "semantic.host-neutral-reference-interpreter",
  recipe: recipe as unknown as CanonicalJsonValue,
  recipe_identity: recipeIdentity,
  declared_environment: environment as unknown as CanonicalJsonValue,
  environment_identity: environmentIdentity,
  required_capabilities: [...requiredCapabilities],
  runtime_closure_manifest_identity: manifest.manifest_identity,
  execution_identity: executionIdentity,
  observation: observation as unknown as CanonicalJsonValue,
  deployment_observation: { status: "not-observed", evidence: "unsupported" },
});

const assembleArtifact = (
  recipe: ReproducibleActionRecipe,
  environment: ReproducibleActionEnvironment,
  manifest: RuntimeClosureManifest,
): Effect.Effect<
  ReproducibleActionArtifact,
  | ReproducibleActionCapabilityRejected
  | ReproducibleActionReceiptRejected
  | ReproducibleActionDigestFailure,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    const requiredCapabilities = yield* admitCapability(recipe, environment);
    const recipeIdentity = yield* deriveIdentity(
      "recipe",
      reproducibleActionIdentityDomains.recipe,
      recipe as unknown as CanonicalJsonValue,
    );
    const environmentIdentity = yield* deriveIdentity(
      "environment",
      reproducibleActionIdentityDomains.environment,
      environment as unknown as CanonicalJsonValue,
    );
    const executionIdentity = yield* deriveIdentity(
      "execution",
      reproducibleActionIdentityDomains.execution,
      executionPayload(recipeIdentity, environmentIdentity, manifest.manifest_identity),
    );
    const observation = interpret(recipe, manifest);
    const payload = receiptPayload(
      recipe,
      recipeIdentity,
      environment,
      environmentIdentity,
      requiredCapabilities,
      manifest,
      executionIdentity,
      observation,
    );
    const receiptIdentity = yield* deriveIdentity(
      "receipt",
      reproducibleActionIdentityDomains.receipt,
      payload,
    );
    const receipt = immutable({
      ...(payload as unknown as Omit<ReproducibleActionReceipt, "receipt_identity">),
      deployment_observation: immutable({
        status: "not-observed" as const,
        evidence: "unsupported" as const,
      }),
      receipt_identity: receiptIdentity,
    });
    const custodiedBytes = canonicalBytes(receipt as unknown as CanonicalJsonValue);
    if (custodiedBytes.byteLength > reproducibleActionBounds.maximumBytes) {
      return yield* new ReproducibleActionReceiptRejected({
        reason: `assembled receipt exceeds ${reproducibleActionBounds.maximumBytes} bytes`,
      });
    }
    return immutable({
      receipt,
      get bytes(): Uint8Array {
        return custodiedBytes.slice();
      },
    });
  });

export const executeReproducibleAction = (
  storeSnapshotJson: unknown,
  closureManifestBytes: unknown,
  recipeJson: unknown,
  environmentJson: unknown,
): Effect.Effect<ReproducibleActionArtifact, ReproducibleActionBuildFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const recipe = yield* decodeRecipeJson(recipeJson);
    const environment = yield* decodeEnvironmentJson(environmentJson);
    const manifest = yield* validateRuntimeClosureBytes(storeSnapshotJson, closureManifestBytes);
    return yield* assembleArtifact(recipe, environment, manifest);
  });

export const validateReproducibleActionReceiptBytes = (
  storeSnapshotJson: unknown,
  closureManifestBytes: unknown,
  receiptBytes: unknown,
): Effect.Effect<ReproducibleActionReceipt, ReproducibleActionValidationFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const prepared = yield* decodeReceiptBytes(receiptBytes);
    const recipe = normalizeRecipe(prepared.receipt.recipe);
    const environment = yield* normalizeEnvironment(prepared.receipt.declared_environment).pipe(
      Effect.mapError(
        (failure) => new ReproducibleActionReceiptRejected({ reason: failure.reason }),
      ),
    );
    const manifest = yield* validateRuntimeClosureBytes(storeSnapshotJson, closureManifestBytes);
    const expected = yield* assembleArtifact(recipe, environment, manifest);
    if (!bytesEqual(prepared.bytes, expected.bytes)) {
      return yield* new ReproducibleActionReceiptRejected({
        reason: "receipt bytes are not the canonical recomputed action observation",
      });
    }
    return expected.receipt;
  });
