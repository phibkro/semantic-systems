import { type Crypto, Effect, type FileSystem, type Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";
import type { CatalogSource } from "./catalog.ts";
import { isConcreteGitRef } from "./catalog.ts";
import type { GitEnvironment } from "./git.ts";
import type { Lock, LockEntry } from "./lockfile.ts";
import { inspectManagedDirectory } from "./paths.ts";
import { verifyCheckout } from "./verify.ts";

export type CustodyState =
  | "queued_unlocked"
  | "locked_unmaterialized"
  | "materialized_verified"
  | "materialized_with_visible_assumption"
  | "drifted"
  | "unverifiable";

/**
 * Reasons the lock entry is not a faithful observation of this catalog
 * record. The digest covers the canonical catalog record; the field
 * comparisons cross-bind the entry's own semantic claims, which a
 * hand-edited lock can change while leaving a correct digest in place.
 *
 * This only needs `source.raw`'s digest to have been computed by the
 * caller (see `catalogDigest` in `catalog.ts`) — it stays a pure
 * comparison so lock-only status never touches Git or the filesystem.
 */
export const catalogBindingReasons = (
  source: CatalogSource,
  sourceDigest: string,
  entry: LockEntry,
): ReadonlyArray<string> => {
  const reasons: Array<string> = [];
  if (entry.catalogDigest !== sourceDigest) {
    reasons.push("catalog record no longer matches the digest recorded at lock time");
  }
  if (entry.origin !== source.origin) {
    reasons.push(
      `locked origin ${JSON.stringify(entry.origin)} is not the catalog origin ${JSON.stringify(source.origin)}`,
    );
  }
  if (source.track === null || entry.track !== source.track) {
    reasons.push(
      `locked track ${JSON.stringify(entry.track)} is not the catalog track ${JSON.stringify(source.track)}`,
    );
  }
  if (!isConcreteGitRef(entry.resolvedRef)) {
    reasons.push(
      `locked resolved_ref ${JSON.stringify(entry.resolvedRef)} is not a concrete valid refs/... name`,
    );
  }
  const lockedPaths = new Set(entry.licenses.keys());
  const declaredPaths = new Set(source.licensePaths);
  if (
    lockedPaths.size !== declaredPaths.size ||
    ![...lockedPaths].every((path) => declaredPaths.has(path))
  ) {
    reasons.push(
      `locked license set ${JSON.stringify([...lockedPaths].sort())} is not the catalog declaration ` +
        `${JSON.stringify([...declaredPaths].sort())}`,
    );
  }
  return reasons;
};

export interface StatusReport {
  readonly sourceId: string;
  readonly state: CustodyState;
  readonly reasons: ReadonlyArray<string>;
  readonly lockOnly: boolean;
  readonly origin: string | null;
  readonly track: string | null;
  readonly resolvedRef: string | null;
  readonly commit: string | null;
  readonly tree: string | null;
  readonly acquisition: string | null;
  readonly originVerified: boolean | null;
  readonly licenses: ReadonlyMap<string, string> | null;
}

const STRICT_OK_STATES: ReadonlySet<CustodyState> = new Set([
  "materialized_verified",
  "materialized_with_visible_assumption",
]);

/**
 * Whether `report` satisfies strict status for the mode it ran in.
 * `--lock-only` never opens a checkout, so its success bar is a
 * structurally valid, undrifted lock (`locked_unmaterialized`); the strict
 * default requires an actual verified materialization.
 */
export const isStrictOk = (report: StatusReport): boolean =>
  report.lockOnly ? report.state === "locked_unmaterialized" : STRICT_OK_STATES.has(report.state);

const reportFromEntry = (
  sourceId: string,
  entry: LockEntry,
  state: CustodyState,
  reasons: ReadonlyArray<string>,
  lockOnly: boolean,
): StatusReport => ({
  sourceId,
  state,
  reasons,
  lockOnly,
  origin: entry.origin,
  track: entry.track,
  resolvedRef: entry.resolvedRef,
  commit: entry.commit,
  tree: entry.tree,
  acquisition: entry.acquisition,
  originVerified: entry.originVerified,
  licenses: new Map([...entry.licenses].map(([path, observation]) => [path, observation.sha256])),
});

/**
 * Network-free, mutation-free strict status computed against catalog and
 * lock data alone.
 */
export const computeLockOnlyStatus = (
  source: CatalogSource,
  sourceDigest: string,
  lock: Lock,
): StatusReport => {
  const entry = lock.sources.get(source.id);
  if (entry === undefined) {
    const isLockable = source.track !== null && source.licensePaths.length > 0;
    const reasons = isLockable ? [] : ["not lockable: 'track'/'license_paths' undeclared"];
    return {
      sourceId: source.id,
      state: "queued_unlocked",
      reasons,
      lockOnly: true,
      origin: source.origin,
      track: source.track,
      resolvedRef: null,
      commit: null,
      tree: null,
      acquisition: null,
      originVerified: null,
      licenses: null,
    };
  }

  const drift = catalogBindingReasons(source, sourceDigest, entry);
  if (drift.length > 0) return reportFromEntry(source.id, entry, "drifted", drift, true);

  return reportFromEntry(
    source.id,
    entry,
    "locked_unmaterialized",
    ["--lock-only: checkout was not inspected"],
    true,
  );
};

type StatusCapabilities =
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | GitEnvironment
  | Path.Path;

/**
 * Compute all six custody states. Full status opens only the managed checkout
 * and invokes hardened, transport-disabled Git observations; it never
 * acquires the curator lock because it performs no mutation.
 */
export const computeStatus = (
  source: CatalogSource,
  sourceDigest: string,
  lock: Lock,
  referencesRoot: string,
  lockOnly: boolean,
): Effect.Effect<StatusReport, never, StatusCapabilities> =>
  Effect.gen(function* () {
    const preliminary = computeLockOnlyStatus(source, sourceDigest, lock);
    if (lockOnly) return preliminary;
    if (preliminary.state !== "locked_unmaterialized") {
      return { ...preliminary, lockOnly: false };
    }

    const entry = lock.sources.get(source.id);
    if (entry === undefined) return { ...preliminary, lockOnly: false };
    const checkout = yield* inspectManagedDirectory(referencesRoot, source.id, "checkout").pipe(
      Effect.map((target) => ({ kind: "success" as const, target })),
      Effect.catch((error) => Effect.succeed({ kind: "failure" as const, error })),
    );
    if (checkout.kind === "failure") {
      return reportFromEntry(source.id, entry, "unverifiable", [checkout.error.message], false);
    }
    if (checkout.target === null) {
      return reportFromEntry(source.id, entry, "locked_unmaterialized", [], false);
    }

    const verification = yield* verifyCheckout(checkout.target, entry);
    if (verification.headMismatch !== null) {
      return reportFromEntry(source.id, entry, "drifted", verification.reasons, false);
    }
    if (verification.reasons.length > 0) {
      return reportFromEntry(source.id, entry, "unverifiable", verification.reasons, false);
    }
    return reportFromEntry(
      source.id,
      entry,
      entry.originVerified ? "materialized_verified" : "materialized_with_visible_assumption",
      [],
      false,
    );
  });

/** Report a lock observation whose canonical catalog source was removed. */
export const orphanedLockReport = (
  sourceId: string,
  entry: LockEntry,
  lockOnly = true,
): StatusReport =>
  reportFromEntry(
    sourceId,
    entry,
    "drifted",
    ["lock entry has no current catalog source"],
    lockOnly,
  );
