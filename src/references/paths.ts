import { Effect, FileSystem, Option, Path } from "effect";
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

const requireSafeRelativePath = (
  relativePath: string,
  label: string,
): Effect.Effect<ReadonlyArray<string>, AcquisitionError> => {
  const parts = relativePath.split("/");
  return relativePath.length > 0 &&
    !relativePath.startsWith("/") &&
    !relativePath.includes("\\") &&
    parts.every((part) => part.length > 0 && part !== "." && part !== "..")
    ? Effect.succeed(parts)
    : Effect.fail(
        pathError(`${label} ${JSON.stringify(relativePath)} is not a safe relative path`),
      );
};

const ensureNotLink = (
  path: string,
  symlinkMessage: string,
): Effect.Effect<void, AcquisitionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const linked = yield* fs.readLink(path).pipe(
      Effect.as(true),
      Effect.catch((cause) => {
        const code = errnoCode(cause);
        return code === "EINVAL" || code === "ENOENT"
          ? Effect.succeed(false)
          : Effect.fail(pathError(`cannot inspect ${path} without following links`, cause));
      }),
    );
    if (linked) return yield* pathError(symlinkMessage);
  });

const entryExistsNoFollow = (
  path: string,
): Effect.Effect<boolean, AcquisitionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const link = yield* fs.readLink(path).pipe(
      Effect.map(() => true),
      Effect.catch((cause) => {
        const code = errnoCode(cause);
        return code === "EINVAL"
          ? Effect.succeed(false)
          : code === "ENOENT"
            ? Effect.succeed(null)
            : Effect.fail(pathError(`cannot inspect ${path} without following links`, cause));
      }),
    );
    if (link !== false) return link !== null;
    return yield* fs
      .exists(path)
      .pipe(Effect.mapError((cause) => pathError(`cannot inspect ${path}`, cause)));
  });

const requireRegularFile = (
  path: string,
  label: string,
): Effect.Effect<void, AcquisitionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* ensureNotLink(path, `${label} ${path} is an unsafe symlink`);
    const info = yield* fs
      .stat(path)
      .pipe(
        Effect.mapError((cause) =>
          errnoCode(cause) === "ENOENT"
            ? pathError(`${label} ${path} is missing`, cause)
            : pathError(`cannot inspect ${label} ${path}`, cause),
        ),
      );
    if (info.type !== "File") return yield* pathError(`${label} ${path} is not a regular file`);
  });

const requireOptionalRegularFile = (
  path: string,
  label: string,
): Effect.Effect<void, AcquisitionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (!(yield* entryExistsNoFollow(path))) return;
    yield* requireRegularFile(path, label);
  });

const requireOptionalDirectory = (
  path: string,
  label: string,
): Effect.Effect<void, AcquisitionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (!(yield* entryExistsNoFollow(path))) return;
    const inspected = yield* inspectDirectory(path, label);
    if (inspected === null) return yield* pathError(`${label} ${path} disappeared`);
  });

const requireContained = (
  root: string,
  child: string,
  label: string,
): Effect.Effect<void, AcquisitionError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    const [realRoot, realChild] = yield* Effect.all([
      fs.realPath(root),
      fs.realPath(child),
    ] as const).pipe(
      Effect.mapError((cause) =>
        pathError(`cannot resolve ${label} containment under ${root}`, cause),
      ),
    );
    const relation = paths.relative(realRoot, realChild);
    if (
      relation === "" ||
      relation === ".." ||
      relation.startsWith(`..${paths.sep}`) ||
      paths.isAbsolute(relation)
    ) {
      return yield* pathError(`${label} ${child} is not contained by ${root}`);
    }
  });

interface WorktreeReadMessages {
  readonly symlink: string;
  readonly missing: string;
  readonly escape: string;
  readonly notFile: string;
  readonly unreadable: string;
}

const inspectWorktreeFile = (
  worktree: string,
  relativePath: string,
  label: string,
  messages: WorktreeReadMessages,
): Effect.Effect<string, AcquisitionError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    const parts = yield* requireSafeRelativePath(relativePath, label);
    const root = paths.resolve(worktree);
    let current = root;
    for (let index = 0; index < parts.length; index += 1) {
      current = paths.join(current, parts[index]!);
      yield* ensureNotLink(current, messages.symlink);
      const info = yield* fs
        .stat(current)
        .pipe(
          Effect.mapError((cause) =>
            errnoCode(cause) === "ENOENT"
              ? pathError(messages.missing, cause)
              : pathError(`cannot inspect ${label} ${JSON.stringify(relativePath)}`, cause),
          ),
        );
      if (index < parts.length - 1 && info.type !== "Directory") {
        return yield* pathError(messages.escape);
      }
      if (index === parts.length - 1 && info.type !== "File") {
        return yield* pathError(messages.notFile);
      }
    }

    const [realRoot, realFile] = yield* Effect.all([
      fs.realPath(root),
      fs.realPath(current),
    ] as const).pipe(
      Effect.mapError((cause) =>
        pathError(`cannot resolve ${label} ${JSON.stringify(relativePath)}`, cause),
      ),
    );
    const relation = paths.relative(realRoot, realFile);
    if (relation === ".." || relation.startsWith(`..${paths.sep}`) || paths.isAbsolute(relation)) {
      return yield* pathError(messages.escape);
    }
    return current;
  });

const licenseMessages = (path: string): WorktreeReadMessages => ({
  symlink: `license path ${JSON.stringify(path)} is a symlink in the checkout`,
  missing: `license path ${JSON.stringify(path)} is missing from the checkout`,
  escape: `license path ${JSON.stringify(path)} escapes the checkout directory`,
  notFile: `license path ${JSON.stringify(path)} is not a regular file in the checkout`,
  unreadable: `license path ${JSON.stringify(path)} cannot be read`,
});

const trackedMessages = (path: string): WorktreeReadMessages => ({
  symlink: `tracked path ${JSON.stringify(path)} is an unexpected symlink`,
  missing: `tracked path ${JSON.stringify(path)} is missing`,
  escape: `tracked path ${JSON.stringify(path)} escapes the checkout directory`,
  notFile: `tracked path ${JSON.stringify(path)} is not a regular file`,
  unreadable: `tracked path ${JSON.stringify(path)} cannot be opened no-follow`,
});

/** Read the ordinary checkout bytes for a declared license without following stable links. */
export const readWorktreeBlobBytes = (
  worktree: string,
  relativePath: string,
): Effect.Effect<Uint8Array, AcquisitionError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const messages = licenseMessages(relativePath);
    const target = yield* inspectWorktreeFile(worktree, relativePath, "license path", messages);
    return yield* fs
      .readFile(target)
      .pipe(Effect.mapError((cause) => pathError(messages.unreadable, cause)));
  });

/** Read only a bounded prefix of a tracked regular file. */
export const readWorktreeFilePrefix = (
  worktree: string,
  relativePath: string,
  length: number,
): Effect.Effect<Uint8Array, AcquisitionError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const messages = trackedMessages(relativePath);
    const target = yield* inspectWorktreeFile(worktree, relativePath, "tracked path", messages);
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const file = yield* fs
          .open(target, { flag: "r" })
          .pipe(Effect.mapError((cause) => pathError(messages.unreadable, cause)));
        const info = yield* file.stat.pipe(
          Effect.mapError((cause) => pathError(messages.unreadable, cause)),
        );
        if (info.type !== "File") return yield* pathError(messages.notFile);
        const bytes = yield* file
          .readAlloc(length)
          .pipe(Effect.mapError((cause) => pathError(messages.unreadable, cause)));
        return Option.getOrElse(bytes, () => new Uint8Array());
      }),
    );
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

/**
 * Establish a self-contained ordinary checkout administration boundary before
 * invoking Git. Linked worktrees, gitfiles, alternates, and worktree-specific
 * config all redirect repository authority beyond the managed checkout.
 */
export const inspectCheckoutAdministration = (
  worktree: string,
): Effect.Effect<void, AcquisitionError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const paths = yield* Path.Path;
    const root = paths.resolve(worktree);
    const gitDirectory = paths.join(root, ".git");
    const objects = paths.join(gitDirectory, "objects");

    if ((yield* inspectDirectory(gitDirectory, "checkout Git administration directory")) === null) {
      return yield* pathError(`checkout Git administration directory ${gitDirectory} is missing`);
    }
    yield* requireContained(root, gitDirectory, "checkout Git administration directory");
    if ((yield* inspectDirectory(objects, "checkout Git object directory")) === null) {
      return yield* pathError(`checkout Git object directory ${objects} is missing`);
    }
    yield* requireContained(gitDirectory, objects, "checkout Git object directory");

    for (const name of ["HEAD", "config", "index"]) {
      yield* requireRegularFile(
        paths.join(gitDirectory, name),
        `checkout Git administration file ${JSON.stringify(name)}`,
      );
    }
    for (const name of ["packed-refs", "shallow"]) {
      yield* requireOptionalRegularFile(
        paths.join(gitDirectory, name),
        `checkout Git administration file ${JSON.stringify(name)}`,
      );
    }
    for (const name of ["info", "pack"]) {
      yield* requireOptionalDirectory(
        paths.join(objects, name),
        `checkout Git object directory ${JSON.stringify(name)}`,
      );
    }

    const forbidden = [
      paths.join(gitDirectory, "commondir"),
      paths.join(gitDirectory, "config.worktree"),
      paths.join(objects, "info", "alternates"),
      paths.join(objects, "info", "http-alternates"),
    ];
    for (const redirected of forbidden) {
      if (yield* entryExistsNoFollow(redirected)) {
        return yield* pathError(
          `checkout Git administration declares unsupported redirection ${redirected}`,
        );
      }
    }
  });
