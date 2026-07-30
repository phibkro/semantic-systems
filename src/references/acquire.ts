import { Clock, Effect, FileSystem, Path, type Crypto } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { catalogDigest, type CatalogSource, isLockable } from "./catalog.ts";
import { AcquisitionError, NotLockableError, type CatalogError } from "./errors.ts";
import {
  blobSha256,
  commitObjectExists,
  type GitEnvironment,
  lsTreeEntry,
  objectFormat,
  observeConcreteRef,
  rawLocalRemoteUrl,
  repositoryProgramReasons,
  requireFullObjectId,
  resolveCommit,
  resolveCommitIfPresent,
  treeOfCommit,
} from "./git.ts";
import { lockEntryContentEqual, type LicenseObservation, type LockEntry } from "./lockfile.ts";
import {
  inspectCheckoutAdministration,
  inspectObjectCache,
  inspectObjectCacheAdministration,
  inspectRepositoryObjectPaths,
} from "./paths.ts";
import { verifyRepositoryObjectClosure } from "./verify.ts";

const REGULAR_BLOB_MODES = new Set(["100644", "100755"]);
export type OfflineAcquisition = "local-sibling" | "local-object-cache";

export const resolveLocalSibling = (
  source: CatalogSource,
  projectRoot: string,
): Effect.Effect<
  string,
  AcquisitionError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  Effect.gen(function* () {
    if (source.localHint === null) {
      return yield* new AcquisitionError({
        message:
          `source ${JSON.stringify(source.id)}: offline lock needs a declared local_hint ` +
          "sibling",
      });
    }
    const paths = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const sibling = paths.resolve(projectRoot, source.localHint);
    const gitDirectory = paths.join(sibling, ".git");
    const exists = yield* fs.exists(gitDirectory).pipe(
      Effect.mapError(
        (cause) =>
          new AcquisitionError({
            message: `cannot inspect local sibling Git directory ${gitDirectory}`,
            cause,
          }),
      ),
    );
    if (!exists) {
      return yield* new AcquisitionError({
        message: `source ${JSON.stringify(source.id)}: local_hint ${sibling} has no .git directory`,
      });
    }
    const info = yield* fs.stat(gitDirectory).pipe(
      Effect.mapError(
        (cause) =>
          new AcquisitionError({
            message: `cannot inspect local sibling Git directory ${gitDirectory}`,
            cause,
          }),
      ),
    );
    if (info.type !== "Directory") {
      return yield* new AcquisitionError({
        message: `source ${JSON.stringify(source.id)}: local_hint ${sibling} has no .git directory`,
      });
    }
    yield* inspectCheckoutAdministration(sibling);
    const programReasons = yield* repositoryProgramReasons(sibling);
    if (programReasons.length > 0) {
      return yield* new AcquisitionError({
        message:
          `source ${JSON.stringify(source.id)}: local sibling is not self-contained: ` +
          programReasons.join("; "),
      });
    }

    const observed = yield* rawLocalRemoteUrl(sibling);
    const accepted = new Set([source.origin, ...source.originAliases]);
    if (observed === null || !accepted.has(observed)) {
      return yield* new AcquisitionError({
        message:
          `source ${JSON.stringify(source.id)}: local sibling remote ${JSON.stringify(observed)} ` +
          `does not match declared origin or aliases ${JSON.stringify([...accepted].sort())}`,
      });
    }
    return sibling;
  });

export interface OfflineMaterializationRepository {
  readonly repository: string;
  readonly acquisition: OfflineAcquisition;
}

const requireSelfContainedManagedCache = (
  source: CatalogSource,
  cache: string,
): Effect.Effect<
  void,
  AcquisitionError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  Effect.gen(function* () {
    yield* inspectObjectCacheAdministration(cache);
    const programReasons = yield* repositoryProgramReasons(cache);
    if (programReasons.length > 0) {
      return yield* new AcquisitionError({
        message:
          `source ${JSON.stringify(source.id)}: managed object cache is not self-contained: ` +
          programReasons.join("; "),
      });
    }
  });

/**
 * Select a local repository that actually contains the locked commit.
 * A managed cache has priority, but its raw origin remains exact-bound to the
 * catalog before any object is trusted.
 */
export const resolveOfflineMaterializationRepository = (
  source: CatalogSource,
  projectRoot: string,
  referencesRoot: string,
  commit: string,
): Effect.Effect<
  OfflineMaterializationRepository,
  AcquisitionError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  Effect.gen(function* () {
    const cache = yield* inspectObjectCache(referencesRoot, source.id);
    if (cache !== null) {
      yield* requireSelfContainedManagedCache(source, cache);
      const observedOrigin = yield* rawLocalRemoteUrl(cache);
      if (observedOrigin !== source.origin) {
        return yield* new AcquisitionError({
          message:
            `source ${JSON.stringify(source.id)}: managed object cache origin ` +
            `${JSON.stringify(observedOrigin)} does not match declared origin ` +
            `${JSON.stringify(source.origin)}`,
        });
      }
      yield* inspectRepositoryObjectPaths(cache, [commit]);
      if (yield* commitObjectExists(cache, commit)) {
        yield* verifyRepositoryObjectClosure(cache, commit);
        return { repository: cache, acquisition: "local-object-cache" };
      }
    }

    const sibling = yield* resolveLocalSibling(source, projectRoot).pipe(
      Effect.mapError((error) =>
        source.localHint === null
          ? new AcquisitionError({
              message:
                `source ${JSON.stringify(source.id)}: locked commit ${commit} is unavailable ` +
                "offline from both the managed object cache and a declared local_hint sibling",
              cause: error,
            })
          : error,
      ),
    );
    yield* inspectRepositoryObjectPaths(sibling, [commit]);
    if (!(yield* commitObjectExists(sibling, commit))) {
      return yield* new AcquisitionError({
        message:
          `source ${JSON.stringify(source.id)}: locked commit ${commit} is unavailable ` +
          "offline from both the managed object cache and the declared local sibling",
      });
    }
    yield* verifyRepositoryObjectClosure(sibling, commit);
    return { repository: sibling, acquisition: "local-sibling" };
  });

const hashLicenses = (
  repository: string,
  source: CatalogSource,
  commit: string,
  format: string,
): Effect.Effect<
  ReadonlyMap<string, LicenseObservation>,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const licenses = new Map<string, LicenseObservation>();
    for (const path of source.licensePaths) {
      const entry = yield* lsTreeEntry(repository, commit, path);
      if (entry === null) {
        return yield* new AcquisitionError({
          message: `source ${JSON.stringify(source.id)}: license path ${JSON.stringify(path)} not in commit`,
        });
      }
      if (entry.objectType !== "blob") {
        return yield* new AcquisitionError({
          message:
            `source ${JSON.stringify(source.id)}: license path ${JSON.stringify(path)} is a ` +
            `${entry.objectType}, not a blob`,
        });
      }
      if (entry.mode === "120000") {
        return yield* new AcquisitionError({
          message: `source ${JSON.stringify(source.id)}: license path ${JSON.stringify(path)} is a symlink`,
        });
      }
      if (!REGULAR_BLOB_MODES.has(entry.mode)) {
        return yield* new AcquisitionError({
          message:
            `source ${JSON.stringify(source.id)}: license path ${JSON.stringify(path)} has ` +
            `non-regular mode ${entry.mode}`,
        });
      }
      yield* requireFullObjectId(format, `license blob ${JSON.stringify(path)}`, entry.oid);
      licenses.set(path, {
        mode: entry.mode,
        size: entry.size,
        sha256: yield* blobSha256(repository, entry.oid),
      });
    }
    return licenses;
  });

const retrievedAt = (milliseconds: number): string =>
  new Date(Math.floor(milliseconds / 1000) * 1000).toISOString().replace(".000Z", "Z");

const observeOfflineRepository = (
  source: CatalogSource,
  repository: string,
  acquisition: OfflineAcquisition,
  existingEntry: LockEntry | null,
): Effect.Effect<
  LockEntry,
  AcquisitionError | CatalogError | NotLockableError,
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | ChildProcessSpawner.ChildProcessSpawner
  | GitEnvironment
> =>
  Effect.gen(function* () {
    if (!isLockable(source) || source.track === null) {
      return yield* new NotLockableError({
        message:
          `source ${JSON.stringify(source.id)} has no track/license_paths declaration and ` +
          "cannot be locked",
      });
    }
    const format = yield* objectFormat(repository);
    const commit = yield* resolveCommit(repository, source.track);
    yield* requireFullObjectId(format, "resolved commit", commit);
    const resolvedRef = yield* observeConcreteRef(repository, source.track, commit);
    const tree = yield* treeOfCommit(repository, commit);
    yield* requireFullObjectId(format, "resolved tree", tree);
    const candidate: LockEntry = {
      origin: source.origin,
      track: source.track,
      resolvedRef,
      objectFormat: format,
      commit,
      tree,
      catalogDigest: yield* catalogDigest(source.raw),
      retrievedAt: retrievedAt(yield* Clock.currentTimeMillis),
      acquisition,
      originVerified: false,
      licenses: yield* hashLicenses(repository, source, commit, format),
    };
    return existingEntry !== null && lockEntryContentEqual(existingEntry, candidate)
      ? existingEntry
      : candidate;
  });

/**
 * Observe only committed objects from a declared local sibling. This path is
 * structurally offline: Git receives a default-deny environment and every
 * location observation rejects transport schemes and helper syntax.
 */
export const lockFromLocalSibling = (
  source: CatalogSource,
  projectRoot: string,
  existingEntry: LockEntry | null,
): Effect.Effect<
  LockEntry,
  AcquisitionError | CatalogError | NotLockableError,
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | ChildProcessSpawner.ChildProcessSpawner
  | GitEnvironment
> =>
  Effect.gen(function* () {
    if (!isLockable(source) || source.track === null) {
      return yield* new NotLockableError({
        message:
          `source ${JSON.stringify(source.id)} has no track/license_paths declaration and ` +
          "cannot be locked",
      });
    }
    const repository = yield* resolveLocalSibling(source, projectRoot);
    return yield* observeOfflineRepository(source, repository, "local-sibling", existingEntry);
  });

/**
 * Prefer a previously managed object cache when it contains the requested
 * selector, otherwise fall back to the catalogued local sibling. Both paths
 * are read-only and run through the same transport-denying Git boundary.
 */
export const lockOfflineSource = (
  source: CatalogSource,
  projectRoot: string,
  existingEntry: LockEntry | null,
): Effect.Effect<
  LockEntry,
  AcquisitionError | CatalogError | NotLockableError,
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | ChildProcessSpawner.ChildProcessSpawner
  | GitEnvironment
> =>
  Effect.gen(function* () {
    if (!isLockable(source) || source.track === null) {
      return yield* new NotLockableError({
        message:
          `source ${JSON.stringify(source.id)} has no track/license_paths declaration and ` +
          "cannot be locked",
      });
    }
    const paths = yield* Path.Path;
    const referencesRoot = paths.join(paths.resolve(projectRoot), ".references");
    const cache = yield* inspectObjectCache(referencesRoot, source.id);
    if (cache !== null) {
      yield* requireSelfContainedManagedCache(source, cache);
      const observedOrigin = yield* rawLocalRemoteUrl(cache);
      if (observedOrigin !== source.origin) {
        return yield* new AcquisitionError({
          message:
            `source ${JSON.stringify(source.id)}: managed object cache origin ` +
            `${JSON.stringify(observedOrigin)} does not match declared origin ` +
            `${JSON.stringify(source.origin)}`,
        });
      }
      const cacheCommit = yield* resolveCommitIfPresent(cache, source.track);
      if (cacheCommit !== null) {
        return yield* observeOfflineRepository(source, cache, "local-object-cache", existingEntry);
      }
    }
    return yield* lockFromLocalSibling(source, projectRoot, existingEntry).pipe(
      Effect.mapError((error) =>
        source.localHint === null && error instanceof AcquisitionError
          ? new AcquisitionError({
              message:
                `source ${JSON.stringify(source.id)}: offline lock needs a declared ` +
                "local_hint sibling or an existing local object cache",
              cause: error,
            })
          : error,
      ),
    );
  });
