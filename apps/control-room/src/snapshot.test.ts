import { describe, expect, it } from "vitest";

import { VERSION_SCHEMA, type PublicVersion } from "./model";
import {
  freshnessState,
  isPublicSnapshot,
  isPublicVersion,
  isRollback,
  verifyCandidate,
} from "./snapshot";
import { fixtureSnapshot } from "./test/fixture";

function version(overrides: Partial<PublicVersion> = {}): PublicVersion {
  return {
    schema_version: VERSION_SCHEMA,
    commit: fixtureSnapshot.metadata.commit,
    digest: fixtureSnapshot.metadata.digest,
    observed_at: fixtureSnapshot.metadata.observed_at,
    snapshot: `snapshot.${fixtureSnapshot.metadata.digest}.json`,
    ...overrides,
  };
}

describe("snapshot truth states", () => {
  it("distinguishes current, stale, and offline data", () => {
    expect(freshnessState(fixtureSnapshot, Date.parse("2026-07-29T12:01:00Z"), true)).toBe(
      "current",
    );
    expect(freshnessState(fixtureSnapshot, Date.parse("2026-07-31T12:00:00Z"), true)).toBe("stale");
    expect(freshnessState(fixtureSnapshot, Date.parse("2026-07-29T12:01:00Z"), false)).toBe(
      "offline",
    );
  });

  it("rejects out-of-order observations as rollback", () => {
    expect(isRollback(fixtureSnapshot, version())).toBe(true);
    expect(
      isRollback(
        fixtureSnapshot,
        version({
          observed_at: "2026-07-28T12:00:00Z",
        }),
      ),
    ).toBe(true);
    expect(
      isRollback(
        fixtureSnapshot,
        version({
          observed_at: "2026-07-30T12:00:00Z",
        }),
      ),
    ).toBe(false);
  });

  it("rejects a version or content digest mismatch before publication", async () => {
    await expect(
      verifyCandidate(
        version({
          digest: "0".repeat(64),
          snapshot: `snapshot.${"0".repeat(64)}.json`,
        }),
        fixtureSnapshot,
      ),
    ).rejects.toThrow("version digest mismatch");

    const forged = structuredClone(fixtureSnapshot);
    forged.metadata.digest = "0".repeat(64);
    await expect(
      verifyCandidate(
        version({
          digest: "0".repeat(64),
          snapshot: `snapshot.${"0".repeat(64)}.json`,
        }),
        forged,
      ),
    ).rejects.toThrow("snapshot content digest mismatch");
  });

  it("rejects invalid timestamps and disagreement between version and snapshot", async () => {
    expect(isPublicVersion(version({ observed_at: "not-a-dateZ" }))).toBe(false);
    const invalidSnapshot = structuredClone(fixtureSnapshot);
    invalidSnapshot.metadata.observed_at = "2026-13-29T12:00:00Z";
    expect(isPublicSnapshot(invalidSnapshot)).toBe(false);
    expect(freshnessState(invalidSnapshot, Date.parse("2026-07-29T12:01:00Z"), true)).toBe(
      "invalid",
    );

    await expect(
      verifyCandidate(
        version({
          observed_at: "2026-07-30T12:00:00Z",
        }),
        fixtureSnapshot,
      ),
    ).rejects.toThrow("observation time mismatch");
  });
});
