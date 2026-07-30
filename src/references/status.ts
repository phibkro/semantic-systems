import type { CatalogSource } from "./catalog.ts";
import { isConcreteGitRef } from "./catalog.ts";
import type { Lock, LockEntry } from "./lockfile.ts";

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
 * default still requires an actual verified materialization (out of scope
 * for this lock-only slice, so that branch is unreachable here).
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
 * lock data alone. Only the three states reachable without inspecting a
 * checkout (`queued_unlocked`, `drifted`, `locked_unmaterialized`) are
 * produced; materialized/unverifiable states require the checkout
 * inspection this slice does not port (design spec 0004's `verify.py`).
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

/** Report a lock observation whose canonical catalog source was removed. */
export const orphanedLockReport = (sourceId: string, entry: LockEntry): StatusReport =>
  reportFromEntry(sourceId, entry, "drifted", ["lock entry has no current catalog source"], true);
