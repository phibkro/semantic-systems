/**
 * Online `lock`: fetch a catalog source's selected commit blobless, hydrate
 * its complete object closure into a scoped temporary cache, and publish
 * every selected cache together with the canonical lock — or publish none.
 *
 * This reuses the same curator, canonical lock writer, path confinement, and
 * transport-denying Git environment as offline custody; only the acquisition
 * step (a real Git fetch instead of a local read) and the cache-publication
 * transaction below are new.
 */
import { Clock, Effect, FileSystem, Path, Result, type Crypto, type Scope } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { hashLicenses, retrievedAt } from "./acquire.ts";
import { catalogDigest, isLockable, loadCatalog, type CatalogSource } from "./catalog.ts";
import { acquireCuratorLock, type CuratorProcess, superviseCurator } from "./curator.ts";
import {
  AcquisitionError,
  CatalogError,
  NotLockableError,
  type CuratorLockedError,
  type LockFileError,
} from "./errors.ts";
import {
  cloneRemoteBare,
  fetchShallowBlobless,
  hydrateReplayObjects,
  objectFormat,
  observeConcreteRef,
  prepareReplayRefs,
  requireFullObjectId,
  treeOfCommit,
  type GitEnvironment,
} from "./git.ts";
import { lockEntryContentEqual, loadLock, writeLock, type LockEntry } from "./lockfile.ts";
import {
  ensureManagedSourceDirectory,
  ensureNotLink,
  inspectObjectCacheAdministration,
} from "./paths.ts";
import type { TomlParser } from "./toml.ts";
import { verifyRepositoryObjectClosure } from "./verify.ts";

type RemoteLockCapabilities =
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | GitEnvironment
  | Path.Path;

export interface StagedCache {
  readonly sourceId: string;
  readonly temporaryDirectory: string;
  readonly targetDirectory: string;
}

interface RemoteLockObservation {
  readonly entry: LockEntry;
  readonly staged: StagedCache;
}

const OBJECT_CACHE_DIRNAME = ".git-cache";

/**
 * Fetch, fully validate in an isolated temporary cache, and stage it for
 * publication. Nothing under `referencesRoot` is mutated.
 *
 * The temporary directory is acquired as a scoped resource, not a bare
 * `makeTempDirectory` call: its lifetime is bound to the caller's scope
 * (the curator-held transaction in `lockRemoteSources`), which spans past
 * this function's own return and through `publishStagedCaches`'s later
 * rename. The release action removes the directory if it still exists,
 * which is what happens on any failure or interruption reached before that
 * rename; once the rename has moved it into place, the same removal is a
 * safe no-op. Because this is a genuine scope finalizer rather than a
 * manual "if failed, clean up" branch, it also runs correctly if the fiber
 * running this source is interrupted (for example, by a lost curator lock
 * racing via `superviseCurator`), not only on an ordinary typed failure.
 */
export const lockRemoteSource = (
  source: CatalogSource,
  referencesRoot: string,
  existingEntry: LockEntry | null,
): Effect.Effect<
  RemoteLockObservation,
  AcquisitionError | CatalogError | NotLockableError,
  RemoteLockCapabilities | Scope.Scope
> =>
  Effect.gen(function* () {
    if (!isLockable(source) || source.track === null) {
      return yield* new NotLockableError({
        message:
          `source ${JSON.stringify(source.id)} has no track/license_paths declaration and ` +
          "cannot be locked",
      });
    }
    const track = source.track;
    const paths = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const sourceRoot = yield* ensureManagedSourceDirectory(referencesRoot, source.id);
    const cacheDirectory = paths.join(sourceRoot, OBJECT_CACHE_DIRNAME);
    const temporaryDirectory = yield* Effect.acquireRelease(
      fs.makeTempDirectory({ directory: sourceRoot, prefix: ".lock-fetch-" }).pipe(
        Effect.mapError(
          (cause) =>
            new AcquisitionError({
              message: `source ${JSON.stringify(source.id)}: cannot create temporary fetch directory`,
              cause,
            }),
        ),
      ),
      (temporaryPath) =>
        fs.remove(temporaryPath, { recursive: true, force: true }).pipe(Effect.ignore),
    );

    yield* cloneRemoteBare(source.origin, temporaryDirectory);
    const format = yield* objectFormat(temporaryDirectory);
    const commit = yield* fetchShallowBlobless(temporaryDirectory, source.origin, track);
    yield* requireFullObjectId(format, "resolved commit", commit);
    const tree = yield* treeOfCommit(temporaryDirectory, commit);
    yield* requireFullObjectId(format, "resolved tree", tree);
    // The fetch was blob-filtered, so hashing the declared license blobs
    // legitimately needs the transport this online path already opened.
    const licenses = yield* hashLicenses(temporaryDirectory, source, commit, format, true);
    const resolvedRef = yield* observeConcreteRef(source.origin, track, commit, true);
    yield* hydrateReplayObjects(temporaryDirectory, commit);
    // Advertise only refs backed by the complete selected object closure,
    // so an offline clone never traverses a partially cached default ref.
    yield* prepareReplayRefs(temporaryDirectory, resolvedRef, commit);

    // The freshly fetched cache becomes a trusted offline replay source the
    // instant it is staged; nothing this far has independently proven that
    // its administration is self-contained or that its stored bytes truly
    // hash to the object ids Git reports. Reuse the same closure proof
    // offline acquisition already requires of an existing sibling/cache
    // before trusting it, rather than trusting a fresh fetch on faith.
    yield* inspectObjectCacheAdministration(temporaryDirectory);
    const recomputedTree = yield* verifyRepositoryObjectClosure(temporaryDirectory, commit);
    if (recomputedTree !== tree) {
      return yield* new AcquisitionError({
        message:
          `source ${JSON.stringify(source.id)}: recomputed tree ${recomputedTree} for commit ` +
          `${commit} does not match the observed tree ${tree}`,
      });
    }

    const candidate: LockEntry = {
      origin: source.origin,
      track,
      resolvedRef,
      objectFormat: format,
      commit,
      tree,
      catalogDigest: yield* catalogDigest(source.raw),
      retrievedAt: retrievedAt(yield* Clock.currentTimeMillis),
      acquisition: "remote",
      originVerified: true,
      licenses,
    };
    const entry =
      existingEntry !== null && lockEntryContentEqual(existingEntry, candidate)
        ? existingEntry
        : candidate;
    return {
      entry,
      staged: { sourceId: source.id, temporaryDirectory, targetDirectory: cacheDirectory },
    };
  });

const BACKUP_SUFFIX = ".backup-swap";

/** Move a prior cache aside (same parent, so the rename is atomic). */
const displaceExisting = (
  fs: FileSystem.FileSystem,
  target: string,
): Effect.Effect<string | null, AcquisitionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    yield* ensureNotLink(target, `refusing to replace symlinked object cache ${target}`);
    const exists = yield* fs
      .exists(target)
      .pipe(
        Effect.mapError(
          (cause) =>
            new AcquisitionError({ message: `cannot inspect object cache ${target}`, cause }),
        ),
      );
    if (!exists) return null;
    const backup = `${target}${BACKUP_SUFFIX}`;
    yield* ensureNotLink(backup, `refusing symlinked cache backup path ${backup}`);
    const backupExists = yield* fs
      .exists(backup)
      .pipe(
        Effect.mapError(
          (cause) =>
            new AcquisitionError({ message: `cannot inspect cache backup path ${backup}`, cause }),
        ),
      );
    if (backupExists) {
      // A pre-existing backup is unexplained recovery state — most likely a
      // prior transaction that crashed before it could restore or clean up.
      // Deleting it on faith could destroy the only path back to a valid
      // prior cache, so this fails closed and leaves it untouched instead.
      return yield* new AcquisitionError({
        message:
          `refusing to publish object cache ${target}: a prior backup ${backup} already exists; ` +
          "it was not cleanly removed after an earlier operation and is left in place — " +
          "inspect and remove it manually only after confirming it holds no needed recovery state",
      });
    }
    yield* fs.rename(target, backup).pipe(
      Effect.mapError(
        (cause) =>
          new AcquisitionError({
            message: `cannot displace prior object cache ${target}`,
            cause,
          }),
      ),
    );
    return backup;
  });

/** One rollback step (undoing an install) that could not be completed. */
interface RollbackStepFailure {
  readonly sourceId: string;
  readonly targetDirectory: string;
  readonly step: "remove-published" | "restore-backup";
  readonly cause: unknown;
}

/** A `.backup-swap` directory that could not be removed after a durably successful publish. */
export interface CacheBackupResidue {
  readonly sourceId: string;
  readonly targetDirectory: string;
  readonly backupDirectory: string;
  readonly cause: unknown;
}

export interface PublishStagedCachesResult<A> {
  readonly value: A;
  readonly residualBackups: ReadonlyArray<CacheBackupResidue>;
}

/**
 * Publish every staged cache and then run `body` (the canonical lock write)
 * as one transaction. A failure at any point — a rename, or `body` itself —
 * restores every displaced cache from its backup and leaves every remaining
 * staged temporary directory removed; this is the only place a `lock`
 * transaction crosses more than one source's cache.
 *
 * The publish and `body` succeeding means the lock and every cache are
 * already durably committed: that fact must never be reported as failure.
 * A backup left over from displacing a prior cache is disk litter, not an
 * uncommitted state, so it is reported back as `residualBackups` — visible,
 * not silently discarded — rather than flipping this call's own outcome to
 * a failure that would misleadingly read as "nothing was committed."
 */
export const publishStagedCaches = <A, E, R>(
  staged: ReadonlyArray<StagedCache>,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<PublishStagedCachesResult<A>, AcquisitionError | E, FileSystem.FileSystem | R> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const installed: Array<{
      readonly sourceId: string;
      readonly target: string;
      readonly backup: string | null;
    }> = [];

    const removeStagedLeftovers = Effect.forEach(
      staged,
      (cache) =>
        fs.remove(cache.temporaryDirectory, { recursive: true, force: true }).pipe(Effect.ignore),
      { discard: true },
    );

    // Every step below is deliberately never `Effect.ignore`d: a rollback
    // that cannot fully undo an install still attempts every installed
    // cache (in reverse order, same as before), but any step it cannot
    // complete is collected and surfaced on the eventual failure rather than
    // silently swallowed — a rollback that "succeeds" while quietly leaving
    // a cache missing or displaced would itself be exactly the unexplained
    // recovery state this transaction exists to prevent.
    const rollback = Effect.suspend(() =>
      Effect.forEach(
        [...installed].reverse(),
        ({ sourceId, target, backup }) =>
          Effect.gen(function* () {
            const stepFailures: Array<RollbackStepFailure> = [];
            yield* fs.remove(target, { recursive: true, force: true }).pipe(
              Effect.catch((cause) => {
                stepFailures.push({
                  sourceId,
                  targetDirectory: target,
                  step: "remove-published",
                  cause,
                });
                return Effect.void;
              }),
            );
            if (backup !== null) {
              yield* fs.rename(backup, target).pipe(
                Effect.catch((cause) => {
                  stepFailures.push({
                    sourceId,
                    targetDirectory: target,
                    step: "restore-backup",
                    cause,
                  });
                  return Effect.void;
                }),
              );
            }
            return stepFailures;
          }),
        { discard: false },
      ).pipe(
        Effect.map((results) => results.flat()),
        Effect.flatMap((rollbackFailures) =>
          removeStagedLeftovers.pipe(Effect.as(rollbackFailures)),
        ),
      ),
    );

    const attempt = Effect.gen(function* () {
      for (const cache of staged) {
        const backup = yield* displaceExisting(fs, cache.targetDirectory);
        installed.push({ sourceId: cache.sourceId, target: cache.targetDirectory, backup });
        yield* fs.rename(cache.temporaryDirectory, cache.targetDirectory).pipe(
          Effect.mapError(
            (cause) =>
              new AcquisitionError({
                message: `cannot publish object cache ${cache.targetDirectory}`,
                cause,
              }),
          ),
        );
      }
      return yield* body;
    });

    // No network or object verification occurs in this window: it contains
    // only same-parent renames, the canonical atomic lock write, and backup
    // cleanup. Keep the whole transaction uninterruptible so curator loss or
    // runtime shutdown cannot bypass `matchCauseEffect` between installing a
    // cache and committing its matching lock. A pending interruption is
    // observed only after the transaction has reached either its fully
    // committed state or its typed-failure rollback state.
    return yield* Effect.uninterruptible(
      attempt.pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) =>
            rollback.pipe(
              Effect.flatMap((rollbackFailures) => {
                if (rollbackFailures.length === 0) return Effect.failCause(cause);
                const summary = rollbackFailures
                  .map((f) => `${f.targetDirectory} (${f.step} for ${JSON.stringify(f.sourceId)})`)
                  .join("; ");
                return new AcquisitionError({
                  message:
                    "publish failed and rollback could not fully restore prior state for: " +
                    `${summary} — inspect these caches and their \`.backup-swap\` directories ` +
                    "before retrying",
                  cause,
                });
              }),
            ),
          onSuccess: (value) =>
            // The publish and lock write are already durable at this point.
            // A leftover `.backup-swap` directory is disk litter, not
            // uncommitted state, so it is collected and reported back rather
            // than turned into a failure that would misleadingly read as
            // "nothing was committed."
            Effect.forEach(
              installed,
              ({ sourceId, target, backup }) =>
                backup === null
                  ? Effect.succeed(null)
                  : fs.remove(backup, { recursive: true, force: true }).pipe(
                      Effect.map(() => null),
                      Effect.catch((cause) =>
                        Effect.succeed({
                          sourceId,
                          targetDirectory: target,
                          backupDirectory: backup,
                          cause,
                        } satisfies CacheBackupResidue),
                      ),
                    ),
              { discard: false },
            ).pipe(
              Effect.map((results) => ({
                value,
                residualBackups: results.filter((result) => result !== null),
              })),
            ),
        }),
      ),
    );
  });

export interface RemoteLockFailure {
  readonly id: string;
  readonly error: AcquisitionError | CatalogError | NotLockableError;
}

export interface RemoteLockResult {
  readonly committed: boolean;
  readonly locked: ReadonlyMap<string, LockEntry>;
  readonly skipped: ReadonlyArray<string>;
  readonly failures: ReadonlyArray<RemoteLockFailure>;
  /**
   * Non-empty only when `committed` is `true` but a displaced prior cache's
   * backup directory could not be removed afterward. The lock and every
   * cache are already durably correct; this is visible disk litter, not an
   * uncommitted source.
   */
  readonly residualBackups: ReadonlyArray<CacheBackupResidue>;
}

/**
 * Fetch every selected source into its own scoped temporary cache, then
 * publish every cache and the canonical lock together, or publish nothing.
 */
export const lockRemoteSources = (
  projectRoot: string,
  selectedIds: ReadonlyArray<string>,
  generator: string,
): Effect.Effect<
  RemoteLockResult,
  AcquisitionError | CatalogError | CuratorLockedError | LockFileError,
  RemoteLockCapabilities | CuratorProcess | TomlParser
> =>
  Effect.gen(function* () {
    const paths = yield* Path.Path;
    const root = paths.resolve(projectRoot);
    const catalog = yield* loadCatalog(paths.join(root, "references", "sources.toml"));
    for (const id of selectedIds) {
      if (!catalog.sources.has(id)) {
        return yield* new CatalogError({ message: `unknown source id ${JSON.stringify(id)}` });
      }
    }

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const referencesRoot = paths.join(root, ".references");
        const curator = yield* acquireCuratorLock(referencesRoot);
        return yield* superviseCurator(
          curator,
          Effect.gen(function* () {
            const lockPath = paths.join(root, "references", "sources.lock.json");
            const lock = yield* loadLock(lockPath);
            const entries = new Map(lock.sources);
            const locked = new Map<string, LockEntry>();
            const skipped: Array<string> = [];
            const failures: Array<RemoteLockFailure> = [];
            const staged: Array<StagedCache> = [];

            for (const id of selectedIds) {
              const source = catalog.sources.get(id)!;
              if (!isLockable(source)) {
                skipped.push(id);
                continue;
              }
              const observed = yield* Effect.result(
                lockRemoteSource(source, referencesRoot, lock.sources.get(id) ?? null),
              );
              if (Result.isFailure(observed)) {
                failures.push({ id, error: observed.failure });
                continue;
              }
              entries.set(id, observed.success.entry);
              locked.set(id, observed.success.entry);
              staged.push(observed.success.staged);
            }

            if (failures.length > 0) {
              // No manual cleanup here: every staged source's temporary
              // fetch directory was acquired against this scope, so it is
              // removed by that scope's own finalizers when this `Effect.
              // scoped` block concludes below — uniformly for this early
              // return, for an ordinary failure, and for interruption alike.
              return { committed: false, locked, skipped, failures, residualBackups: [] };
            }

            const published = yield* publishStagedCaches(
              staged,
              writeLock(lockPath, { generator, sources: entries }),
            );
            return {
              committed: true,
              locked,
              skipped,
              failures,
              residualBackups: published.residualBackups,
            };
          }),
        );
      }),
    );
  });
