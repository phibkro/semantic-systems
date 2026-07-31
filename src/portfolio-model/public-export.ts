import { Crypto, Data, Effect, Schema } from "effect";
import { stringifyPublicJson } from "../project-model/public-export.ts";
import type { JsonValue } from "../project-model/types.ts";
import { PortfolioDocumentSchema, type PortfolioDocument } from "./decode.ts";

export const PORTFOLIO_PUBLIC_SCHEMA = "pbk.portfolio-public/v1" as const;
export const PORTFOLIO_VERSION_SCHEMA = "pbk.portfolio-public-version/v1" as const;

export const PortfolioExportObservationSchema = Schema.Struct({
  commit: Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{40}$/))),
  observed_at: Schema.String.pipe(
    Schema.check(
      Schema.isPattern(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/,
      ),
    ),
  ),
  freshness_seconds: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0))),
});
export type PortfolioExportObservation = typeof PortfolioExportObservationSchema.Type;

export const PublicPortfolioSnapshotSchema = Schema.Struct({
  schema_version: Schema.Literal(PORTFOLIO_PUBLIC_SCHEMA),
  metadata: Schema.Struct({
    ...PortfolioExportObservationSchema.fields,
    digest: Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/))),
  }),
  document: PortfolioDocumentSchema,
});

export const PublicPortfolioVersionSchema = Schema.Struct({
  schema_version: Schema.Literal(PORTFOLIO_VERSION_SCHEMA),
  commit: PortfolioExportObservationSchema.fields.commit,
  digest: Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/))),
  observed_at: PortfolioExportObservationSchema.fields.observed_at,
  snapshot: Schema.String.pipe(Schema.check(Schema.isPattern(/^portfolio\.[0-9a-f]{64}\.json$/))),
});

export type PublicPortfolioSnapshot = typeof PublicPortfolioSnapshotSchema.Type;

export type PublicPortfolioVersion = typeof PublicPortfolioVersionSchema.Type;

export interface PublicPortfolioArtifact {
  readonly digest: string;
  readonly snapshot_name: string;
  readonly snapshot: PublicPortfolioSnapshot;
  readonly version: PublicPortfolioVersion;
  readonly snapshot_bytes: string;
  readonly version_bytes: string;
}

export class PortfolioExportFailure extends Data.TaggedError("PortfolioExportFailure")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const digest = (value: string): Effect.Effect<string, PortfolioExportFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const bytes = yield* crypto
      .digest("SHA-256", new TextEncoder().encode(value))
      .pipe(
        Effect.mapError(
          (cause) =>
            new PortfolioExportFailure({ message: "cannot digest portfolio snapshot", cause }),
        ),
      );
    return toHex(bytes);
  });

const asJson = (value: PublicPortfolioSnapshot | PublicPortfolioVersion): JsonValue =>
  value as unknown as JsonValue;

const deepFreeze = <A>(value: A): A => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const buildPublicPortfolioArtifact = (
  document: PortfolioDocument,
  input: PortfolioExportObservation,
): Effect.Effect<PublicPortfolioArtifact, PortfolioExportFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const observation = yield* Schema.decodeUnknownEffect(PortfolioExportObservationSchema, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError(
        (cause) =>
          new PortfolioExportFailure({
            message: `invalid portfolio observation: ${cause.message}`,
          }),
      ),
    );
    const withoutDigest: PublicPortfolioSnapshot = {
      schema_version: PORTFOLIO_PUBLIC_SCHEMA,
      metadata: { ...observation, digest: "" },
      document,
    };
    const digestInput = yield* stringifyPublicJson(asJson(withoutDigest)).pipe(
      Effect.mapError((cause) => new PortfolioExportFailure({ message: cause.message, cause })),
    );
    const contentDigest = yield* digest(digestInput);
    const snapshot: PublicPortfolioSnapshot = {
      ...withoutDigest,
      metadata: { ...withoutDigest.metadata, digest: contentDigest },
    };
    const snapshot_name = `portfolio.${contentDigest}.json`;
    const version: PublicPortfolioVersion = {
      schema_version: PORTFOLIO_VERSION_SCHEMA,
      commit: observation.commit,
      digest: contentDigest,
      observed_at: observation.observed_at,
      snapshot: snapshot_name,
    };
    const snapshot_bytes = yield* stringifyPublicJson(asJson(snapshot)).pipe(
      Effect.mapError((cause) => new PortfolioExportFailure({ message: cause.message, cause })),
    );
    const version_bytes = yield* stringifyPublicJson(asJson(version)).pipe(
      Effect.mapError((cause) => new PortfolioExportFailure({ message: cause.message, cause })),
    );
    return deepFreeze({
      digest: contentDigest,
      snapshot_name,
      snapshot,
      version,
      snapshot_bytes,
      version_bytes,
    });
  });
