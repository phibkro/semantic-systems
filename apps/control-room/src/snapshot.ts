import {
  SNAPSHOT_SCHEMA,
  VERSION_SCHEMA,
  type DataState,
  type PublicSnapshot,
  type PublicVersion,
} from "./model";

const SNAPSHOT_NAME = /^snapshot\.([0-9a-f]{64})\.json$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const CACHE_KEY = "semantic-control-room.snapshot-v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_TIMESTAMP.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value.replace("Z", ".000Z");
}

export function isPublicVersion(value: unknown): value is PublicVersion {
  return (
    isRecord(value) &&
    value.schema_version === VERSION_SCHEMA &&
    typeof value.commit === "string" &&
    /^[0-9a-f]{40}$/.test(value.commit) &&
    typeof value.digest === "string" &&
    /^[0-9a-f]{64}$/.test(value.digest) &&
    isUtcTimestamp(value.observed_at) &&
    typeof value.snapshot === "string" &&
    SNAPSHOT_NAME.test(value.snapshot) &&
    value.snapshot === `snapshot.${value.digest}.json`
  );
}

export function isPublicSnapshot(value: unknown): value is PublicSnapshot {
  if (!isRecord(value) || value.schema_version !== SNAPSHOT_SCHEMA) return false;
  if (
    !isRecord(value.metadata) ||
    !Array.isArray(value.entities) ||
    !Array.isArray(value.relations)
  )
    return false;
  return (
    typeof value.metadata.commit === "string" &&
    /^[0-9a-f]{40}$/.test(value.metadata.commit) &&
    typeof value.metadata.digest === "string" &&
    /^[0-9a-f]{64}$/.test(value.metadata.digest) &&
    isUtcTimestamp(value.metadata.generated_at) &&
    isUtcTimestamp(value.metadata.observed_at) &&
    typeof value.metadata.freshness_seconds === "number" &&
    (value.metadata.observation_source === "local_preview" ||
      value.metadata.observation_source === "accepted_main")
  );
}

export async function verifyCandidate(
  version: PublicVersion,
  value: unknown,
): Promise<PublicSnapshot> {
  if (!isPublicSnapshot(value)) throw new Error("snapshot schema is invalid");
  if (value.metadata.commit !== version.commit) throw new Error("commit mismatch");
  if (value.metadata.digest !== version.digest) throw new Error("version digest mismatch");
  if (value.metadata.observed_at !== version.observed_at)
    throw new Error("observation time mismatch");
  const digestInput = structuredClone(value) as PublicSnapshot;
  digestInput.metadata.digest = "";
  const calculated = await sha256(`${stableStringify(digestInput)}\n`);
  if (calculated !== version.digest) throw new Error("snapshot content digest mismatch");
  return value;
}

export function freshnessState(snapshot: PublicSnapshot, now: number, online: boolean): DataState {
  if (!online) return "offline";
  const age = now - Date.parse(snapshot.metadata.observed_at);
  if (!Number.isFinite(age)) return "invalid";
  return age > snapshot.metadata.freshness_seconds * 1000 ? "stale" : "current";
}

export function isRollback(current: PublicSnapshot, next: PublicVersion): boolean {
  return Date.parse(next.observed_at) <= Date.parse(current.metadata.observed_at);
}

export function readCachedSnapshot(storage: Storage = localStorage): PublicSnapshot | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(CACHE_KEY) ?? "null");
    return isPublicSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeCachedSnapshot(
  snapshot: PublicSnapshot,
  storage: Storage = localStorage,
): void {
  storage.setItem(CACHE_KEY, JSON.stringify(snapshot));
}

export async function fetchCandidate(baseUrl: URL): Promise<{
  version: PublicVersion;
  snapshot: PublicSnapshot;
}> {
  const versionResponse = await fetch(new URL("data/version.json", baseUrl), {
    cache: "no-store",
  });
  if (!versionResponse.ok) throw new Error(`version fetch failed (${versionResponse.status})`);
  const versionValue: unknown = await versionResponse.json();
  if (!isPublicVersion(versionValue)) throw new Error("version document is invalid");
  const snapshotResponse = await fetch(new URL(`data/${versionValue.snapshot}`, baseUrl), {
    cache: "no-store",
  });
  if (!snapshotResponse.ok) throw new Error(`snapshot fetch failed (${snapshotResponse.status})`);
  return {
    version: versionValue,
    snapshot: await verifyCandidate(versionValue, await snapshotResponse.json()),
  };
}
