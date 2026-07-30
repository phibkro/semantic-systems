import { Effect, FileSystem, Path } from "effect";
import { isValidSourceId } from "./catalog.ts";
import { AcquisitionError } from "./errors.ts";

const pathError = (message: string, cause?: unknown) =>
  new AcquisitionError({
    message,
    ...(cause === undefined ? {} : { cause }),
  });

const errnoCode = (cause: unknown): string | null => {
  if (typeof cause !== "object" || cause === null || !("reason" in cause)) return null;
  const reason = cause.reason;
  if (typeof reason !== "object" || reason === null || !("cause" in reason)) return null;
  const original = reason.cause;
  if (typeof original !== "object" || original === null || !("code" in original)) return null;
  return typeof original.code === "string" ? original.code : null;
};

const inspectDirectory = (
  path: string,
  label: string,
): Effect.Effect<string | null, AcquisitionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const link = yield* fs.readLink(path).pipe(
      Effect.map((target) => ({ linked: true as const, target })),
      Effect.catch((cause) => {
        const code = errnoCode(cause);
        return code === "EINVAL" || code === "ENOENT"
          ? Effect.succeed({ linked: false as const })
          : Effect.fail(
              pathError(`cannot inspect ${label} ${path} without following links`, cause),
            );
      }),
    );
    if (link.linked) {
      return yield* pathError(`${label} ${path} is an unsafe symlink`);
    }
    const exists = yield* fs
      .exists(path)
      .pipe(Effect.mapError((cause) => pathError(`cannot inspect ${label} ${path}`, cause)));
    if (!exists) return null;
    const info = yield* fs
      .stat(path)
      .pipe(Effect.mapError((cause) => pathError(`cannot inspect ${label} ${path}`, cause)));
    if (info.type !== "Directory") {
      return yield* pathError(`${label} ${path} is not a directory`);
    }
    return path;
  });

/**
 * Inspect an optional tool-managed directory without following any managed
 * symlink. `null` means that the root, source directory, or child is absent.
 *
 * These checks close stable symlink substitution. They do not claim
 * descriptor-relative safety against a concurrently malicious filesystem
 * actor; curator serialization excludes cooperating mutations.
 */
export const inspectManagedDirectory = (
  referencesRoot: string,
  sourceId: string,
  childName: string,
): Effect.Effect<string | null, AcquisitionError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (!isValidSourceId(sourceId)) {
      return yield* pathError(`unsafe custody source id ${JSON.stringify(sourceId)}`);
    }
    if (
      childName.length === 0 ||
      childName === "." ||
      childName === ".." ||
      childName.includes("/") ||
      childName.includes("\\")
    ) {
      return yield* pathError(`unsafe managed child name ${JSON.stringify(childName)}`);
    }
    const paths = yield* Path.Path;
    const root = paths.resolve(referencesRoot);
    if ((yield* inspectDirectory(root, "custody root")) === null) return null;
    const sourceRoot = paths.join(root, sourceId);
    if (
      (yield* inspectDirectory(
        sourceRoot,
        `custody source root for ${JSON.stringify(sourceId)}`,
      )) === null
    ) {
      return null;
    }
    return yield* inspectDirectory(paths.join(sourceRoot, childName), "managed custody path");
  });

export const inspectObjectCache = (referencesRoot: string, sourceId: string) =>
  inspectManagedDirectory(referencesRoot, sourceId, ".git-cache");
