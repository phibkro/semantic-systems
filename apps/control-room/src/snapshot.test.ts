import { describe, expect, test } from "vitest";
import { VERSION_SCHEMA, type PublicSnapshot, type PublicVersion } from "./model.ts";
import {
  freshnessState,
  isPublicSnapshot,
  isPublicVersion,
  isRollback,
  verifyCandidate,
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

  test("rejects extra nested fields, duplicates, broken endpoints, and invalid time", async () => {
    const pair = await validPair();
    const extra = structuredClone(pair.snapshot) as PublicSnapshot & {
      metadata: PublicSnapshot["metadata"] & { private: string };
    };
    extra.metadata.private = "SECRET_SHAPED_SENTINEL";
    expect(isPublicSnapshot(extra)).toBe(false);

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

    const invalid = { ...pair.version, observed_at: "2026-02-30T12:00:00Z" };
    expect(isPublicVersion(invalid)).toBe(false);
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
});
