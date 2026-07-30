import { type Crypto, Effect, FileSystem, Path, Result, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { resolveOfflineMaterializationRepository } from "./acquire.ts";
import { catalogDigest, type CatalogSource, loadCatalog } from "./catalog.ts";
import { acquireCuratorLock, type CuratorProcess, superviseCurator } from "./curator.ts";
import {
  AcquisitionError,
  CatalogError,
  type CuratorLockedError,
  type LockFileError,
} from "./errors.ts";
import { checkoutDetached, cloneLocalRepository, GitEnvironment } from "./git.ts";
import { loadLock, type LockEntry } from "./lockfile.ts";
import { ensureManagedSourceDirectory, inspectManagedDirectory } from "./paths.ts";
import type { TomlParser } from "./toml.ts";
import { publicationBlockingReasons, verifyCheckout } from "./verify.ts";
import { catalogBindingReasons } from "./status.ts";

type MaterializationCapabilities =
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | GitEnvironment
  | Path.Path;

const acquisitionError = (message: string, cause?: unknown) =>
  new AcquisitionError({
    message,
    ...(cause === undefined ? {} : { cause }),
  });

const publishDirectoryNoReplace = (
  source: string,
  target: string,
): Effect.Effect<
  void,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const environments = yield* GitEnvironment;
      const command = ChildProcess.make(
        "mv",
        ["--no-copy", "--update=none-fail", "--no-target-directory", "--", source, target],
        {
          env: environments.forMode(false),
          extendEnv: false,
          shell: false,
          detached: false,
          stdin: "ignore",
        },
      );
      const handle = yield* spawner.spawn(command);
      const [output, exit] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.all)), handle.exitCode] as const,
        { concurrency: "unbounded" },
      );
      if (Number(exit) !== 0) {
        return yield* acquisitionError(
          `cannot atomically publish checkout without replacing ${target} ` +
            `(mv exit ${Number(exit)}): ${output.trim()}`,
        );
      }
    }),
  ).pipe(
    Effect.mapError((cause) =>
      cause instanceof AcquisitionError
        ? cause
        : acquisitionError(`cannot atomically publish checkout without replacing ${target}`, cause),
    ),
  );

const requireCatalogBinding = (
  source: CatalogSource,
  entry: LockEntry,
): Effect.Effect<void, AcquisitionError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const digest = yield* catalogDigest(source.raw).pipe(
      Effect.mapError((cause) =>
        acquisitionError(
          `source ${JSON.stringify(source.id)}: cannot recompute catalog binding`,
          cause,
        ),
      ),
    );
    const reasons = catalogBindingReasons(source, digest, entry);
    if (reasons.length > 0) {
      return yield* acquisitionError(
        `source ${JSON.stringify(source.id)}: refusing to materialize a lock entry that ` +
          `no longer matches the catalog record: ${reasons.join("; ")}`,
      );
    }
  });

const verificationReasons = (
  headMismatch: string | null,
  reasons: ReadonlyArray<string>,
  blocking: ReadonlyArray<string>,
): ReadonlyArray<string> => (headMismatch === null ? blocking : reasons);

const requirePublishableCheckout = (
  sourceId: string,
  worktree: string,
  entry: LockEntry,
): Effect.Effect<void, AcquisitionError, MaterializationCapabilities> =>
  Effect.gen(function* () {
    const verification = yield* verifyCheckout(worktree, entry);
    const blocking = publicationBlockingReasons(verification);
    if (verification.headMismatch === null && blocking.length === 0) return;
    const reasons = verificationReasons(verification.headMismatch, verification.reasons, blocking);
    return yield* acquisitionError(
      `source ${JSON.stringify(sourceId)}: ${reasons.join("; ") || "checkout verification failed"}`,
    );
  });

/**
 * Build one locked checkout offline in a scoped sibling directory and publish
 * it with one atomic rename. The caller must hold the curator throughout.
 */
export const materializeOfflineSource = (
  source: CatalogSource,
  entry: LockEntry,
  projectRoot: string,
  referencesRoot: string,
): Effect.Effect<string, AcquisitionError, MaterializationCapabilities> =>
  Effect.gen(function* () {
    yield* requireCatalogBinding(source, entry);
    const paths = yield* Path.Path;
    const root = paths.resolve(referencesRoot);
    const target = paths.join(root, source.id, "checkout");
    const existing = yield* inspectManagedDirectory(root, source.id, "checkout");
    if (existing !== null) {
      const verification = yield* verifyCheckout(existing, entry);
      const blocking = publicationBlockingReasons(verification);
      if (verification.headMismatch === null && blocking.length === 0) return existing;
      const reasons = verificationReasons(
        verification.headMismatch,
        verification.reasons,
        blocking,
      );
      return yield* acquisitionError(
        `source ${JSON.stringify(source.id)}: an existing checkout at ${existing} does not ` +
          "match the locked commit; refusing to overwrite or delete it — remove it manually " +
          `first if you want it rebuilt: ${reasons.join("; ")}`,
      );
    }

    const selected = yield* resolveOfflineMaterializationRepository(
      source,
      paths.resolve(projectRoot),
      root,
      entry.commit,
    );
    const sourceRoot = yield* ensureManagedSourceDirectory(root, source.id);
    const fs = yield* FileSystem.FileSystem;

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const temporary = yield* Effect.acquireRelease(
          fs
            .makeTempDirectory({
              directory: sourceRoot,
              prefix: ".materialize-",
            })
            .pipe(
              Effect.mapError((cause) =>
                acquisitionError(
                  `source ${JSON.stringify(source.id)}: cannot create temporary checkout`,
                  cause,
                ),
              ),
            ),
          (temporaryPath) =>
            fs.remove(temporaryPath, { recursive: true, force: true }).pipe(Effect.ignore),
        );
        yield* cloneLocalRepository(selected.repository, temporary);
        yield* checkoutDetached(temporary, entry.commit);
        yield* requirePublishableCheckout(source.id, temporary, entry);

        if ((yield* inspectManagedDirectory(root, source.id, "checkout")) !== null) {
          return yield* acquisitionError(
            `source ${JSON.stringify(source.id)}: checkout target ${target} appeared during materialization`,
          );
        }
        yield* publishDirectoryNoReplace(temporary, target).pipe(
          Effect.mapError((cause) =>
            acquisitionError(
              `source ${JSON.stringify(source.id)}: cannot atomically publish checkout`,
              cause,
            ),
          ),
        );
        return target;
      }),
    );
  });

export interface OfflineMaterializeFailure {
  readonly id: string;
  readonly error: AcquisitionError;
}

export interface OfflineMaterializeResult {
  readonly materialized: ReadonlyMap<string, string>;
  readonly failures: ReadonlyArray<OfflineMaterializeFailure>;
}

/** Materialize selected sources sequentially under one supervised curator. */
export const materializeOfflineSources = (
  projectRoot: string,
  selectedIds: ReadonlyArray<string>,
): Effect.Effect<
  OfflineMaterializeResult,
  CatalogError | CuratorLockedError | LockFileError,
  MaterializationCapabilities | CuratorProcess | TomlParser
> =>
  Effect.gen(function* () {
    const paths = yield* Path.Path;
    const root = paths.resolve(projectRoot);
    const catalog = yield* loadCatalog(paths.join(root, "references", "sources.toml"));
    const lock = yield* loadLock(paths.join(root, "references", "sources.lock.json"));
    const failures: Array<OfflineMaterializeFailure> = [];
    const candidates: Array<readonly [CatalogSource, LockEntry]> = [];

    for (const id of selectedIds) {
      const source = catalog.sources.get(id);
      if (source === undefined) {
        return yield* new CatalogError({
          message: `unknown source id ${JSON.stringify(id)}`,
        });
      }
      const entry = lock.sources.get(id);
      if (entry === undefined) {
        failures.push({
          id,
          error: acquisitionError(`source ${JSON.stringify(id)}: no lock entry (run 'lock' first)`),
        });
        continue;
      }
      const binding = yield* Effect.result(requireCatalogBinding(source, entry));
      if (Result.isFailure(binding)) {
        failures.push({ id, error: binding.failure });
        continue;
      }
      candidates.push([source, entry]);
    }

    if (candidates.length === 0) {
      return { materialized: new Map(), failures };
    }

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const referencesRoot = paths.join(root, ".references");
        const curator = yield* acquireCuratorLock(referencesRoot);
        return yield* superviseCurator(
          curator,
          Effect.gen(function* () {
            const materialized = new Map<string, string>();
            for (const [source, entry] of candidates) {
              const result = yield* Effect.result(
                materializeOfflineSource(source, entry, root, referencesRoot),
              );
              if (Result.isFailure(result)) {
                failures.push({ id: source.id, error: result.failure });
              } else {
                materialized.set(source.id, result.success);
              }
            }
            return { materialized, failures };
          }),
        );
      }),
    );
  });
