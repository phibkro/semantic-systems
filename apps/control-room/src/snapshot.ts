import { Exit, Schema } from "effect";
import {
  PublicSnapshotSchema,
  PublicVersionSchema,
  VERSION_SCHEMA,
  type DataState,
  type PublicSnapshot,
  type PublicVersion,
} from "./model.ts";

const CACHE_KEY = "semantic-control-room.snapshot-v1";
const strictDecode = { onExcessProperty: "error" } as const;

const CachedSnapshotPairSchema = Schema.Struct({
  snapshot: PublicSnapshotSchema,
  version: PublicVersionSchema,
});
const CachedSnapshotPairJsonSchema = Schema.fromJsonString(CachedSnapshotPairSchema);

export class SnapshotCandidateError extends Error {
  readonly kind: "invalid" | "unavailable";

  constructor(kind: "invalid" | "unavailable", message: string) {
    super(message);
    this.name = "SnapshotCandidateError";
    this.kind = kind;
  }
}

const compareCodeUnits = (left: string, right: string): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
};

const stableStringify = (value: unknown): string => `${JSON.stringify(canonicalize(value))}\n`;

const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const decodePublicVersion = Schema.decodeUnknownExit(PublicVersionSchema, strictDecode);
export const isPublicVersion = (value: unknown): value is PublicVersion =>
  Exit.isSuccess(decodePublicVersion(value));

const decodePublicSnapshot = Schema.decodeUnknownExit(PublicSnapshotSchema, strictDecode);
export const isPublicSnapshot = (value: unknown): value is PublicSnapshot =>
  Exit.isSuccess(decodePublicSnapshot(value));

export const verifyCandidate = async (
  version: PublicVersion,
  value: unknown,
): Promise<PublicSnapshot> => {
  if (!isPublicSnapshot(value)) {
    throw new SnapshotCandidateError("invalid", "snapshot schema is invalid");
  }
  if (value.metadata.commit !== version.commit) {
    throw new SnapshotCandidateError("invalid", "commit mismatch");
  }
  if (value.metadata.digest !== version.digest) {
    throw new SnapshotCandidateError("invalid", "version digest mismatch");
  }
  if (value.metadata.observed_at !== version.observed_at) {
    throw new SnapshotCandidateError("invalid", "observation time mismatch");
  }
  const digestInput = {
    ...value,
    metadata: { ...value.metadata, digest: "" },
  };
  const calculated = await sha256(stableStringify(digestInput));
  if (calculated !== version.digest) {
    throw new SnapshotCandidateError("invalid", "snapshot content digest mismatch");
  }
  return value;
};

export const freshnessState = (
  snapshot: PublicSnapshot,
  now: number,
  online: boolean,
): DataState => {
  if (!online) return "offline";
  const observedAt = Date.parse(snapshot.metadata.observed_at);
  if (!Number.isFinite(observedAt)) return "invalid";
  return now - observedAt > snapshot.metadata.freshness_seconds * 1000 ? "stale" : "current";
};

export const isRollback = (current: PublicSnapshot, next: PublicVersion): boolean =>
  Date.parse(next.observed_at) <= Date.parse(current.metadata.observed_at);

const versionForSnapshot = (snapshot: PublicSnapshot): PublicVersion => ({
  schema_version: VERSION_SCHEMA,
  commit: snapshot.metadata.commit,
  digest: snapshot.metadata.digest,
  observed_at: snapshot.metadata.observed_at,
  snapshot: `snapshot.${snapshot.metadata.digest}.json`,
});

/**
 * Cached bytes are untrusted input. Hydration deliberately remains
 * asynchronous so callers cannot render a schema-shaped snapshot before its
 * persisted version binding and content digest have both been recomputed.
 */
export const readCachedSnapshot = async (
  storage: Storage = localStorage,
): Promise<PublicSnapshot | null> => {
  try {
    const value = Schema.decodeUnknownSync(
      CachedSnapshotPairJsonSchema,
      strictDecode,
    )(storage.getItem(CACHE_KEY) ?? "null");
    return await verifyCandidate(value.version, value.snapshot);
  } catch {
    return null;
  }
};

export const writeCachedSnapshot = (
  snapshot: PublicSnapshot,
  storage: Storage = localStorage,
): void => {
  storage.setItem(
    CACHE_KEY,
    Schema.encodeSync(CachedSnapshotPairJsonSchema)({
      snapshot,
      version: versionForSnapshot(snapshot),
    }),
  );
};

export const fetchCandidate = async (
  baseUrl: URL,
  signal?: AbortSignal,
): Promise<{ readonly version: PublicVersion; readonly snapshot: PublicSnapshot }> => {
  let versionResponse: Response;
  try {
    versionResponse = await fetch(new URL("data/version.json", baseUrl), {
      cache: "no-store",
      signal: signal ?? null,
    });
  } catch (error) {
    throw new SnapshotCandidateError(
      "unavailable",
      error instanceof Error ? error.message : "version fetch failed",
    );
  }
  if (!versionResponse.ok) {
    throw new SnapshotCandidateError(
      "unavailable",
      `version fetch failed (${versionResponse.status})`,
    );
  }
  const versionValue: unknown = await versionResponse.json();
  if (!isPublicVersion(versionValue)) {
    throw new SnapshotCandidateError("invalid", "version document is invalid");
  }
  const snapshotResponse = await fetch(new URL(`data/${versionValue.snapshot}`, baseUrl), {
    cache: "no-store",
    signal: signal ?? null,
  });
  if (!snapshotResponse.ok) {
    throw new SnapshotCandidateError(
      "unavailable",
      `snapshot fetch failed (${snapshotResponse.status})`,
    );
  }
  return {
    version: versionValue,
    snapshot: await verifyCandidate(versionValue, await snapshotResponse.json()),
  };
};
