/**
 * Online `materialize`: try the exact locked commit shallowly, then the
 * recorded concrete ref only if it still resolves to that commit. Broader
 * blobless history is fetched only behind explicit `allowHistoryFallback`.
 *
 * This reuses the offline materializer's catalog binding, existing-checkout
 * resolution, checkout verifier, and atomic no-replace publication instead of
 * forking a second implementation of those semantics; only the acquisition
 * step (a real Git fetch instead of a local clone) is new.
 */
import { Effect, FileSystem, Path, Result } from "effect";
import { type CatalogSource, loadCatalog } from "./catalog.ts";
import { acquireCuratorLock, type CuratorProcess, superviseCurator } from "./curator.ts";
import {
  AcquisitionError,
  CatalogError,
  type CuratorLockedError,
  type LockFileError,
} from "./errors.ts";
import {
  checkoutDetached,
  commitObjectExists,
  fetchBloblessHistory,
  fetchShallowBlobless,
  initRepository,
  requireAllowedLocation,
  resolveRemoteRefTarget,
} from "./git.ts";
import { loadLock, type LockEntry } from "./lockfile.ts";
import {
  type MaterializationCapabilities,
  publishDirectoryNoReplace,
  requireCatalogBinding,
  requirePublishableCheckout,
  resolveExistingCheckout,
} from "./offline-materialize.ts";
import { ensureManagedSourceDirectory, inspectManagedDirectory } from "./paths.ts";
import type { TomlParser } from "./toml.ts";

const acquisitionError = (message: string, cause?: unknown) =>
  new AcquisitionError({
    message,
    ...(cause === undefined ? {} : { cause }),
  });

/**
 * Build one locked checkout in a scoped sibling directory from a real Git
 * fetch and publish it with one atomic rename. The caller must hold the
 * curator throughout.
 *
 * Whether to widen from an exact-commit request to a full-history fetch is
 * decided by exactly one independent, structural observation — whether
 * `entry.resolvedRef` still names `entry.commit` at the origin right now —
 * never by interpreting a fetch's exit code or stderr. Every fetch attempted
 * below is therefore expected to succeed; if one fails anyway, that is an
 * operational or corruption failure and propagates immediately. It is never
 * reinterpreted as "try something wider."
 */
export const materializeRemoteSource = (
  source: CatalogSource,
  entry: LockEntry,
  referencesRoot: string,
  allowHistoryFallback: boolean,
): Effect.Effect<string, AcquisitionError, MaterializationCapabilities> =>
  Effect.gen(function* () {
    yield* requireCatalogBinding(source, entry);
    const paths = yield* Path.Path;
    const root = paths.resolve(referencesRoot);
    const target = paths.join(root, source.id, "checkout");
    const existing = yield* resolveExistingCheckout(source.id, root, entry);
    if (existing !== null) return existing;

    // Validated once, up front: a rejected origin location must abort
    // immediately, never be treated as "this attempt missed, try a wider
    // one" by anything below.
    yield* requireAllowedLocation(source.origin, true);
    const observedRefTarget = yield* resolveRemoteRefTarget(source.origin, entry.resolvedRef, true);
    const refStillNamesLockedCommit = observedRefTarget === entry.commit;

    const sourceRoot = yield* ensureManagedSourceDirectory(root, source.id);
    const fs = yield* FileSystem.FileSystem;

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const temporary = yield* Effect.acquireRelease(
          fs
            .makeTempDirectory({ directory: sourceRoot, prefix: ".materialize-" })
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

        yield* initRepository(temporary, entry.objectFormat);

        if (refStillNamesLockedCommit) {
          // The recorded ref is independently confirmed to still name the
          // locked commit. 1. Try an exact shallow fetch of the commit
          // itself. 2. Some servers refuse an arbitrary, non-tip SHA; when
          // that specific request fails, fetching the same already-confirmed
          // object by its current ref name is not "wider" — it names the
          // identical commit — so this fallback is expected, not a retry
          // past a real failure.
          const exact = yield* Effect.result(
            fetchShallowBlobless(temporary, source.origin, entry.commit),
          );
          if (Result.isFailure(exact) || exact.success !== entry.commit) {
            const resolved = yield* fetchShallowBlobless(
              temporary,
              source.origin,
              entry.resolvedRef,
            );
            if (resolved !== entry.commit) {
              return yield* acquisitionError(
                `source ${JSON.stringify(source.id)}: recorded ref ${JSON.stringify(entry.resolvedRef)} ` +
                  `unexpectedly fetched ${resolved}, not the independently confirmed locked commit ` +
                  entry.commit,
              );
            }
          }
        } else {
          if (!allowHistoryFallback) {
            return yield* acquisitionError(
              `source ${JSON.stringify(source.id)}: the recorded ref ` +
                `${JSON.stringify(entry.resolvedRef)} no longer resolves to the locked commit ` +
                `${entry.commit} (observed ${JSON.stringify(observedRefTarget)}); ` +
                "--allow-history-fallback was not given",
            );
          }
          // The recorded ref is independently confirmed to have moved (or
          // disappeared): only this verified condition, not a fetch failure,
          // may widen the request to full history.
          yield* fetchBloblessHistory(temporary, source.origin, entry.track);
          if (!(yield* commitObjectExists(temporary, entry.commit))) {
            return yield* acquisitionError(
              `source ${JSON.stringify(source.id)}: locked commit ${entry.commit} is not reachable ` +
                `from tracked ref ${JSON.stringify(entry.track)} even after a broader history fetch`,
            );
          }
        }

        // This repository was fetched blobless from the network; checking
        // out the working tree legitimately needs its blobs, so transport is
        // allowed here and only here.
        yield* checkoutDetached(temporary, entry.commit, { allowTransport: true });
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

export interface RemoteMaterializeFailure {
  readonly id: string;
  readonly error: AcquisitionError;
}

export interface RemoteMaterializeResult {
  readonly materialized: ReadonlyMap<string, string>;
  readonly failures: ReadonlyArray<RemoteMaterializeFailure>;
}

/** Materialize selected sources sequentially, over the network, under one supervised curator. */
export const materializeRemoteSources = (
  projectRoot: string,
  selectedIds: ReadonlyArray<string>,
  allowHistoryFallback: boolean,
): Effect.Effect<
  RemoteMaterializeResult,
  CatalogError | CuratorLockedError | LockFileError,
  MaterializationCapabilities | CuratorProcess | TomlParser
> =>
  Effect.gen(function* () {
    const paths = yield* Path.Path;
    const root = paths.resolve(projectRoot);
    const catalog = yield* loadCatalog(paths.join(root, "references", "sources.toml"));
    const lock = yield* loadLock(paths.join(root, "references", "sources.lock.json"));
    const failures: Array<RemoteMaterializeFailure> = [];
    const candidates: Array<readonly [CatalogSource, LockEntry]> = [];

    for (const id of selectedIds) {
      const source = catalog.sources.get(id);
      if (source === undefined) {
        return yield* new CatalogError({ message: `unknown source id ${JSON.stringify(id)}` });
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
                materializeRemoteSource(source, entry, referencesRoot, allowHistoryFallback),
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
