import { Effect, Schema } from "effect";
import { acceptPortfolioUpdate } from "../../../src/portfolio-model/project.ts";
import {
  decodePortfolioDocument,
  type PortfolioDocument,
} from "../../../src/portfolio-model/decode.ts";
import {
  PORTFOLIO_VERSION_SCHEMA,
  PublicPortfolioSnapshotSchema,
  PublicPortfolioVersionSchema,
  type PublicPortfolioSnapshot,
  type PublicPortfolioVersion,
} from "../../../src/portfolio-model/public-export.ts";
import type { DataState } from "./model.ts";

const CACHE_KEY = "semantic-control-room.portfolio-v1";

export interface PortfolioState {
  readonly state: DataState;
  readonly snapshot: PublicPortfolioSnapshot | null;
  readonly pending: PublicPortfolioSnapshot | null;
  readonly detail?: string;
}

interface CachedPortfolioPair {
  readonly snapshot: PublicPortfolioSnapshot;
  readonly version: PublicPortfolioVersion;
}

export class PortfolioCandidateError extends Error {
  readonly kind: "invalid" | "unavailable";

  constructor(kind: "invalid" | "unavailable", message: string) {
    super(message);
    this.name = "PortfolioCandidateError";
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
  if (value !== null && typeof value === "object") {
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

const decodeVersion = (value: unknown): Promise<PublicPortfolioVersion> =>
  Effect.runPromise(
    Schema.decodeUnknownEffect(PublicPortfolioVersionSchema, { onExcessProperty: "error" })(value),
  ).catch((cause: unknown) => {
    throw new PortfolioCandidateError(
      "invalid",
      `portfolio version document is invalid: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  });

const decodeSnapshot = async (value: unknown): Promise<PublicPortfolioSnapshot> => {
  const decoded = await Effect.runPromise(
    Schema.decodeUnknownEffect(PublicPortfolioSnapshotSchema, { onExcessProperty: "error" })(value),
  ).catch((cause: unknown) => {
    throw new PortfolioCandidateError(
      "invalid",
      `portfolio snapshot schema is invalid: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  });
  const document = await Effect.runPromise(decodePortfolioDocument(decoded.document)).catch(
    (cause: unknown) => {
      throw new PortfolioCandidateError(
        "invalid",
        `portfolio snapshot relations are invalid: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    },
  );
  return { ...decoded, document };
};

const versionFor = (snapshot: PublicPortfolioSnapshot): PublicPortfolioVersion => ({
  schema_version: PORTFOLIO_VERSION_SCHEMA,
  commit: snapshot.metadata.commit,
  digest: snapshot.metadata.digest,
  observed_at: snapshot.metadata.observed_at,
  snapshot: `portfolio.${snapshot.metadata.digest}.json`,
});

export const verifyPortfolioCandidate = async (
  version: PublicPortfolioVersion,
  value: unknown,
  previous?: PortfolioDocument,
): Promise<PublicPortfolioSnapshot> => {
  const snapshot = await decodeSnapshot(value);
  if (snapshot.metadata.commit !== version.commit) {
    throw new PortfolioCandidateError("invalid", "portfolio commit mismatch");
  }
  if (snapshot.metadata.digest !== version.digest) {
    throw new PortfolioCandidateError("invalid", "portfolio version digest mismatch");
  }
  if (snapshot.metadata.observed_at !== version.observed_at) {
    throw new PortfolioCandidateError("invalid", "portfolio observation time mismatch");
  }
  if (version.snapshot !== `portfolio.${version.digest}.json`) {
    throw new PortfolioCandidateError("invalid", "portfolio snapshot name mismatch");
  }
  const digestInput = {
    ...snapshot,
    metadata: { ...snapshot.metadata, digest: "" },
  };
  if ((await sha256(stableStringify(digestInput))) !== version.digest) {
    throw new PortfolioCandidateError("invalid", "portfolio content digest mismatch");
  }
  if (previous !== undefined) {
    await Effect.runPromise(acceptPortfolioUpdate(previous, snapshot.document)).catch(
      (cause: unknown) => {
        throw new PortfolioCandidateError(
          "invalid",
          cause instanceof Error ? cause.message : "portfolio history changed",
        );
      },
    );
  }
  return snapshot;
};

export const portfolioFreshnessState = (
  snapshot: PublicPortfolioSnapshot,
  now: number,
  online: boolean,
): DataState => {
  if (!online) return "offline";
  const observedAt = Date.parse(snapshot.metadata.observed_at);
  if (!Number.isFinite(observedAt)) return "invalid";
  return now - observedAt > snapshot.metadata.freshness_seconds * 1000 ? "stale" : "current";
};

export const isPortfolioRollback = (
  current: PublicPortfolioSnapshot,
  next: PublicPortfolioVersion,
): boolean => Date.parse(next.observed_at) <= Date.parse(current.metadata.observed_at);

export const readCachedPortfolio = async (
  storage: Storage = localStorage,
): Promise<PublicPortfolioSnapshot | null> => {
  try {
    const value: unknown = JSON.parse(storage.getItem(CACHE_KEY) ?? "null");
    if (value === null || typeof value !== "object") return null;
    const pair = value as Partial<CachedPortfolioPair>;
    if (pair.version === undefined || pair.snapshot === undefined) return null;
    const version = await decodeVersion(pair.version);
    return await verifyPortfolioCandidate(version, pair.snapshot);
  } catch {
    return null;
  }
};

export const writeCachedPortfolio = (
  snapshot: PublicPortfolioSnapshot,
  storage: Storage = localStorage,
): void => {
  storage.setItem(
    CACHE_KEY,
    JSON.stringify({ snapshot, version: versionFor(snapshot) } satisfies CachedPortfolioPair),
  );
};

export const fetchPortfolioCandidate = async (
  baseUrl: URL,
  previous?: PortfolioDocument,
  signal?: AbortSignal,
): Promise<{
  readonly version: PublicPortfolioVersion;
  readonly snapshot: PublicPortfolioSnapshot;
}> => {
  let versionResponse: Response;
  try {
    versionResponse = await fetch(new URL("data/portfolio-version.json", baseUrl), {
      cache: "no-store",
      signal: signal ?? null,
    });
  } catch (cause) {
    throw new PortfolioCandidateError(
      "unavailable",
      cause instanceof Error ? cause.message : "portfolio version fetch failed",
    );
  }
  if (!versionResponse.ok) {
    throw new PortfolioCandidateError(
      "unavailable",
      `portfolio version fetch failed (${versionResponse.status})`,
    );
  }
  const version = await decodeVersion(await versionResponse.json());
  const snapshotResponse = await fetch(new URL(`data/${version.snapshot}`, baseUrl), {
    cache: "no-store",
    signal: signal ?? null,
  });
  if (!snapshotResponse.ok) {
    throw new PortfolioCandidateError(
      "unavailable",
      `portfolio snapshot fetch failed (${snapshotResponse.status})`,
    );
  }
  return {
    version,
    snapshot: await verifyPortfolioCandidate(version, await snapshotResponse.json(), previous),
  };
};
