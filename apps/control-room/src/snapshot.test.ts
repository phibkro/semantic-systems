import { describe, expect, test } from "vitest";
import { VERSION_SCHEMA, type PublicSnapshot, type PublicVersion } from "./model.ts";
import {
  freshnessState,
  isPublicSnapshot,
  isPublicVersion,
  isRollback,
  readCachedSnapshot,
  verifyCandidate,
  writeCachedSnapshot,
} from "./snapshot.ts";
import { fixtureSnapshot } from "./test/fixture.ts";

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

const digestSnapshot = async (snapshot: PublicSnapshot): Promise<string> => {
  const input = {
    ...snapshot,
    metadata: { ...snapshot.metadata, digest: "" },
  };
  const bytes = new TextEncoder().encode(`${JSON.stringify(canonicalize(input))}\n`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const validPair = async (): Promise<{
  readonly snapshot: PublicSnapshot;
  readonly version: PublicVersion;
}> => {
  const digest = await digestSnapshot(fixtureSnapshot);
  const snapshot: PublicSnapshot = {
    ...fixtureSnapshot,
    metadata: { ...fixtureSnapshot.metadata, digest },
  };
  return {
    snapshot,
    version: {
      schema_version: VERSION_SCHEMA,
      commit: snapshot.metadata.commit,
      digest: snapshot.metadata.digest,
      observed_at: snapshot.metadata.observed_at,
      snapshot: `snapshot.${snapshot.metadata.digest}.json`,
    },
  };
};

class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>();

  get length(): number {
    return this.#items.size;
  }

  clear(): void {
    this.#items.clear();
  }

  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#items.set(key, value);
  }
}

const readCachedValue = (value: unknown) => {
  const storage = new MemoryStorage();
  storage.setItem("semantic-control-room.snapshot-v1", JSON.stringify(value));
  return readCachedSnapshot(storage);
};

describe("snapshot custody", () => {
  test("distinguishes current, stale, and offline last-known-valid state", () => {
    expect(freshnessState(fixtureSnapshot, Date.parse("2026-07-31T12:01:00Z"), true)).toBe(
      "current",
    );
    expect(freshnessState(fixtureSnapshot, Date.parse("2026-08-02T12:00:00Z"), true)).toBe("stale");
    expect(freshnessState(fixtureSnapshot, Date.parse("2026-07-31T12:01:00Z"), false)).toBe(
      "offline",
    );
  });

  test("accepts one exact matching content-addressed pair", async () => {
    const pair = await validPair();
    expect(isPublicVersion(pair.version)).toBe(true);
    expect(isPublicSnapshot(pair.snapshot)).toBe(true);
    await expect(verifyCandidate(pair.version, pair.snapshot)).resolves.toEqual(pair.snapshot);
  });

  test("rejects excess fields at every closed document boundary", async () => {
    const pair = await validPair();
    expect(isPublicVersion({ ...pair.version, private: true })).toBe(false);
    expect(isPublicSnapshot({ ...pair.snapshot, private: true })).toBe(false);

    const metadataExtra = structuredClone(pair.snapshot) as PublicSnapshot & {
      metadata: PublicSnapshot["metadata"] & { private: string };
    };
    metadataExtra.metadata.private = "SECRET_SHAPED_SENTINEL";
    expect(isPublicSnapshot(metadataExtra)).toBe(false);

    const entityExtra = structuredClone(pair.snapshot) as unknown as {
      entities: Array<Record<string, unknown>>;
    };
    entityExtra.entities[0]!.private = true;
    expect(isPublicSnapshot(entityExtra)).toBe(false);

    const relationExtra = structuredClone(pair.snapshot) as unknown as {
      relations: Array<Record<string, unknown>>;
    };
    relationExtra.relations[0]!.private = true;
    expect(isPublicSnapshot(relationExtra)).toBe(false);

    await expect(readCachedValue({ ...pair, private: true })).resolves.toBeNull();
  });

  test("rejects semantic whole-value counterexamples", async () => {
    const pair = await validPair();

    const duplicate = {
      ...pair.snapshot,
      entities: [...pair.snapshot.entities, pair.snapshot.entities[0]!],
    };
    expect(isPublicSnapshot(duplicate)).toBe(false);

    const broken = {
      ...pair.snapshot,
      relations: [
        { ...pair.snapshot.relations[0]!, target_id: "missing" },
        ...pair.snapshot.relations.slice(1),
      ],
    };
    expect(isPublicSnapshot(broken)).toBe(false);

    const unknownKind = {
      ...pair.snapshot,
      entities: [
        { ...pair.snapshot.entities[0]!, kind: "not_a_public_kind" },
        ...pair.snapshot.entities.slice(1),
      ],
    };
    expect(isPublicSnapshot(unknownKind)).toBe(false);

    for (const observed_at of [
      "0000-01-01T00:00:00Z",
      "2026-02-30T12:00:00Z",
      "2026-07-31T12:00:00.000Z",
      "2026-07-31T12:00:00+00:00",
    ]) {
      expect(isPublicVersion({ ...pair.version, observed_at })).toBe(false);
    }
    expect(isPublicVersion({ ...pair.version, observed_at: "2024-02-29T23:59:59Z" })).toBe(true);
    expect(isPublicVersion({ ...pair.version, snapshot: `snapshot.${"0".repeat(64)}.json` })).toBe(
      false,
    );

    expect(
      isPublicSnapshot({
        ...pair.snapshot,
        metadata: { ...pair.snapshot.metadata, freshness_seconds: 0 },
      }),
    ).toBe(false);
    expect(
      isPublicSnapshot({
        ...pair.snapshot,
        counts_by_kind: { ...pair.snapshot.counts_by_kind, component: Number.MAX_SAFE_INTEGER + 1 },
      }),
    ).toBe(false);
    expect(
      isPublicSnapshot({
        ...pair.snapshot,
        metadata: { ...pair.snapshot.metadata, deployed_check_status: "unknown" },
      }),
    ).toBe(false);
  });

  test("rejects digest mismatch and out-of-order observations", async () => {
    const pair = await validPair();
    const forged = {
      ...pair.snapshot,
      metadata: { ...pair.snapshot.metadata, digest: "0".repeat(64) },
    };
    const forgedVersion = {
      ...pair.version,
      digest: forged.metadata.digest,
      snapshot: `snapshot.${forged.metadata.digest}.json`,
    };
    await expect(verifyCandidate(forgedVersion, forged)).rejects.toThrow(
      "snapshot content digest mismatch",
    );

    expect(isRollback(pair.snapshot, pair.version)).toBe(true);
    expect(
      isRollback(pair.snapshot, { ...pair.version, observed_at: "2026-07-30T12:00:00Z" }),
    ).toBe(true);
    expect(
      isRollback(pair.snapshot, { ...pair.version, observed_at: "2026-08-01T12:00:00Z" }),
    ).toBe(false);
  });

  test("persists and asynchronously re-verifies the complete version and snapshot pair", async () => {
    const pair = await validPair();
    const storage = new MemoryStorage();
    writeCachedSnapshot(pair.snapshot, storage);

    expect(storage.length).toBe(1);
    const key = storage.key(0);
    expect(key).not.toBeNull();
    const raw = storage.getItem(key!)!;
    expect(raw).toBe(JSON.stringify(pair));
    const persisted: unknown = JSON.parse(raw);
    expect(persisted).toEqual(pair);
    await expect(readCachedSnapshot(storage)).resolves.toEqual(pair.snapshot);
  });

  test("refuses to normalize excess nested fields into an adoptable cache entry", async () => {
    const pair = await validPair();
    const snapshotWithPrivateMetadata = {
      ...pair.snapshot,
      metadata: {
        ...pair.snapshot.metadata,
        private: "unexpected",
      },
    };
    const storage = new MemoryStorage();

    expect(() => writeCachedSnapshot(snapshotWithPrivateMetadata, storage)).toThrow();
    expect(storage.length).toBe(0);
    await expect(
      readCachedValue({ snapshot: snapshotWithPrivateMetadata, version: pair.version }),
    ).resolves.toBeNull();
  });

  test("treats malformed and schema-invalid cache JSON as absent", async () => {
    const storage = new MemoryStorage();
    storage.setItem("semantic-control-room.snapshot-v1", "{not-json");
    await expect(readCachedSnapshot(storage)).resolves.toBeNull();

    const pair = await validPair();
    await expect(
      readCachedValue({
        ...pair,
        snapshot: {
          ...pair.snapshot,
          entities: [{ ...pair.snapshot.entities[0]!, tags: ["valid", 1] }],
          relations: [],
        },
      }),
    ).resolves.toBeNull();
  });

  test("never adopts schema-valid cached content whose digest or binding was forged", async () => {
    const pair = await validPair();

    const contentForged: PublicSnapshot = {
      ...pair.snapshot,
      entities: [
        { ...pair.snapshot.entities[0]!, summary: "schema-valid forged cached content" },
        ...pair.snapshot.entities.slice(1),
      ],
    };
    expect(isPublicSnapshot(contentForged)).toBe(true);
    await expect(
      readCachedValue({ version: pair.version, snapshot: contentForged }),
    ).resolves.toBeNull();

    const bindingForged: PublicSnapshot = {
      ...pair.snapshot,
      metadata: {
        ...pair.snapshot.metadata,
        observed_at: "2026-08-01T12:00:00Z",
      },
    };
    expect(isPublicSnapshot(bindingForged)).toBe(true);
    await expect(
      readCachedValue({ version: pair.version, snapshot: bindingForged }),
    ).resolves.toBeNull();
  });
});
