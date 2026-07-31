import {
  PUBLIC_ENTITY_KINDS,
  PUBLIC_RELATION_KINDS,
  SNAPSHOT_SCHEMA,
  VERSION_SCHEMA,
  type DataState,
  type PublicEntity,
  type PublicRelation,
  type PublicSnapshot,
  type PublicVersion,
} from "./model.ts";

const SNAPSHOT_NAME = /^snapshot\.([0-9a-f]{64})\.json$/;
const EXACT_COMMIT = /^[0-9a-f]{40}$/;
const EXACT_DIGEST = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
const CACHE_KEY = "semantic-control-room.snapshot-v1";

const SNAPSHOT_KEYS = [
  "active_work_ids",
  "blocked_work_ids",
  "completed_work_ids",
  "counts_by_kind",
  "entities",
  "metadata",
  "ready_work_ids",
  "relations",
  "schema_version",
  "unsupported_claim_ids",
] as const;
const METADATA_KEYS = [
  "commit",
  "deployed_check_status",
  "digest",
  "freshness_seconds",
  "generated_at",
  "observation_source",
  "observed_at",
  "repository_url",
] as const;
const ENTITY_KEYS = [
  "assumptions",
  "evidence_category",
  "id",
  "kind",
  "name",
  "source_url",
  "status",
  "summary",
  "tags",
] as const;
const RELATION_KEYS = ["kind", "source_id", "source_url", "summary", "target_id"] as const;
const VERSION_KEYS = ["commit", "digest", "observed_at", "schema_version", "snapshot"] as const;

export class SnapshotCandidateError extends Error {
  readonly kind: "invalid" | "unavailable";

  constructor(kind: "invalid" | "unavailable", message: string) {
    super(message);
    this.name = "SnapshotCandidateError";
    this.kind = kind;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, expected: ReadonlyArray<string>): boolean => {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

const isStringArray = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isUtcTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = UTC_TIMESTAMP.exec(value);
  if (match === null) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1]! &&
    Number(hourText) <= 23 &&
    Number(minuteText) <= 59 &&
    Number(secondText) <= 59
  );
};

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
  if (isRecord(value)) {
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

const isPublicEntity = (value: unknown): value is PublicEntity =>
  isRecord(value) &&
  hasExactKeys(value, ENTITY_KEYS) &&
  ["id", "kind", "name", "summary", "source_url"].every((key) => typeof value[key] === "string") &&
  (typeof value.status === "string" || value.status === null) &&
  (typeof value.evidence_category === "string" || value.evidence_category === null) &&
  isStringArray(value.tags) &&
  isStringArray(value.assumptions) &&
  PUBLIC_ENTITY_KINDS.has(typeof value.kind === "string" ? value.kind : "");

const isPublicRelation = (value: unknown): value is PublicRelation =>
  isRecord(value) &&
  hasExactKeys(value, RELATION_KEYS) &&
  RELATION_KEYS.every((key) => typeof value[key] === "string") &&
  PUBLIC_RELATION_KINDS.has(typeof value.kind === "string" ? value.kind : "");

export const isPublicVersion = (value: unknown): value is PublicVersion =>
  isRecord(value) &&
  hasExactKeys(value, VERSION_KEYS) &&
  value.schema_version === VERSION_SCHEMA &&
  typeof value.commit === "string" &&
  EXACT_COMMIT.test(value.commit) &&
  typeof value.digest === "string" &&
  EXACT_DIGEST.test(value.digest) &&
  isUtcTimestamp(value.observed_at) &&
  typeof value.snapshot === "string" &&
  SNAPSHOT_NAME.test(value.snapshot) &&
  value.snapshot === `snapshot.${value.digest}.json`;

export const isPublicSnapshot = (value: unknown): value is PublicSnapshot => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, SNAPSHOT_KEYS) ||
    value.schema_version !== SNAPSHOT_SCHEMA ||
    !isRecord(value.metadata) ||
    !hasExactKeys(value.metadata, METADATA_KEYS) ||
    !Array.isArray(value.entities) ||
    !value.entities.every(isPublicEntity) ||
    !Array.isArray(value.relations) ||
    !value.relations.every(isPublicRelation) ||
    !isRecord(value.counts_by_kind)
  ) {
    return false;
  }
  const metadata = value.metadata;
  if (
    typeof metadata.commit !== "string" ||
    !EXACT_COMMIT.test(metadata.commit) ||
    typeof metadata.digest !== "string" ||
    !EXACT_DIGEST.test(metadata.digest) ||
    !isUtcTimestamp(metadata.generated_at) ||
    !isUtcTimestamp(metadata.observed_at) ||
    !Number.isSafeInteger(metadata.freshness_seconds) ||
    Number(metadata.freshness_seconds) <= 0 ||
    !["not_checked", "passed", "failed"].includes(String(metadata.deployed_check_status)) ||
    !["local_preview", "main_ci_assertion", "pr_ci_assertion"].includes(
      String(metadata.observation_source),
    ) ||
    typeof metadata.repository_url !== "string" ||
    !metadata.repository_url.startsWith("https://")
  ) {
    return false;
  }
  if (
    !Object.values(value.counts_by_kind).every(
      (count) => Number.isSafeInteger(count) && Number(count) >= 0,
    ) ||
    ![
      value.ready_work_ids,
      value.active_work_ids,
      value.blocked_work_ids,
      value.completed_work_ids,
      value.unsupported_claim_ids,
    ].every(isStringArray)
  ) {
    return false;
  }
  const identities = new Set<string>();
  for (const entity of value.entities) {
    if (identities.has(entity.id)) return false;
    identities.add(entity.id);
  }
  return value.relations.every(
    (relation) => identities.has(relation.source_id) && identities.has(relation.target_id),
  );
};

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

export const readCachedSnapshot = (storage: Storage = localStorage): PublicSnapshot | null => {
  try {
    const value: unknown = JSON.parse(storage.getItem(CACHE_KEY) ?? "null");
    return isPublicSnapshot(value) ? value : null;
  } catch {
    return null;
  }
};

export const writeCachedSnapshot = (
  snapshot: PublicSnapshot,
  storage: Storage = localStorage,
): void => {
  storage.setItem(CACHE_KEY, JSON.stringify(snapshot));
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
