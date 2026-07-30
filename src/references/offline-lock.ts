import { type Crypto, Effect, type FileSystem, Path, Result } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { lockFromLocalSibling } from "./acquire.ts";
import { isLockable, loadCatalog } from "./catalog.ts";
import { acquireCuratorLock, type CuratorProcess } from "./curator.ts";
import {
  CatalogError,
  type AcquisitionError,
  type CuratorLockedError,
  type NotLockableError,
  type LockFileError,
} from "./errors.ts";
import type { GitEnvironment } from "./git.ts";
import { loadLock, type LockEntry, writeLock } from "./lockfile.ts";
import type { TomlParser } from "./toml.ts";

export interface OfflineLockFailure {
  readonly id: string;
  readonly error: AcquisitionError | CatalogError | NotLockableError;
}

export interface OfflineLockResult {
  readonly committed: boolean;
  readonly locked: ReadonlyMap<string, LockEntry>;
  readonly skipped: ReadonlyArray<string>;
  readonly failures: ReadonlyArray<OfflineLockFailure>;
}

/**
 * Observe selected local siblings and publish one canonical lock transaction.
 *
 * Every observation completes before `writeLock` is reached. A failed source
 * therefore leaves the prior lock byte-identical; this local-sibling slice has
 * no object-cache side effects to roll back.
 */
export const lockOfflineLocalSiblings = (
  projectRoot: string,
  selectedIds: ReadonlyArray<string>,
  generator: string,
): Effect.Effect<
  OfflineLockResult,
  CatalogError | CuratorLockedError | LockFileError,
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | CuratorProcess
  | FileSystem.FileSystem
  | GitEnvironment
  | Path.Path
  | TomlParser
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
        yield* acquireCuratorLock(paths.join(root, ".references"));
        const lockPath = paths.join(root, "references", "sources.lock.json");
        const lock = yield* loadLock(lockPath);
        const entries = new Map(lock.sources);
        const locked = new Map<string, LockEntry>();
        const skipped: Array<string> = [];
        const failures: Array<OfflineLockFailure> = [];

        for (const id of selectedIds) {
          const source = catalog.sources.get(id)!;
          if (!isLockable(source)) {
            skipped.push(id);
            continue;
          }
          const observed = yield* Effect.result(
            lockFromLocalSibling(source, root, lock.sources.get(id) ?? null),
          );
          if (Result.isFailure(observed)) {
            failures.push({ id, error: observed.failure });
            continue;
          }
          entries.set(id, observed.success);
          locked.set(id, observed.success);
        }

        if (failures.length > 0) {
          return { committed: false, locked, skipped, failures };
        }
        yield* writeLock(lockPath, { generator, sources: entries });
        return { committed: true, locked, skipped, failures };
      }),
    );
  });
