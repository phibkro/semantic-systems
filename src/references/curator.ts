import { Context, Effect, Exit, FileSystem, Option, Path, type Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { CuratorLockedError } from "./errors.ts";

const LOCK_NAME = ".curator.lock";
const READY = "semantic-curator-ready";
const CONFLICT_EXIT_CODE = 75;

export interface CuratorProcessShape {
  readonly flockExecutable: string;
  readonly holderExecutable: string;
  readonly holderArguments: ReadonlyArray<string>;
  readonly environment: Readonly<Record<string, string>>;
}

export class CuratorProcess extends Context.Service<CuratorProcess, CuratorProcessShape>()(
  "references/CuratorProcess",
) {}

export const makeCuratorProcess = (
  ambient: Readonly<Record<string, string | undefined>>,
  holderExecutable: string,
  holderArguments: ReadonlyArray<string>,
): CuratorProcessShape => ({
  flockExecutable: "flock",
  holderExecutable,
  holderArguments,
  environment: {
    ...(ambient.PATH === undefined ? {} : { PATH: ambient.PATH }),
    LC_ALL: "C",
    TZ: "UTC",
  },
});

const lockError = (lockPath: string, message: string, cause?: unknown) =>
  new CuratorLockedError({
    message: `unsafe curator lock at ${lockPath}: ${message}`,
    ...(cause === undefined ? {} : { cause }),
  });

const inspectLink = (fs: FileSystem.FileSystem, path: string) =>
  fs.readLink(path).pipe(Effect.exit);

const validateRoot = (
  referencesRoot: string,
): Effect.Effect<string, CuratorLockedError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    const root = paths.resolve(referencesRoot);
    const parent = paths.dirname(root);
    const parentLink = yield* inspectLink(fs, parent);
    if (Exit.isSuccess(parentLink)) {
      return yield* lockError(root, "parent of custody root is a symlink");
    }
    const parentInfo = yield* fs
      .stat(parent)
      .pipe(
        Effect.mapError((cause) => lockError(root, "cannot inspect custody-root parent", cause)),
      );
    if (parentInfo.type !== "Directory") {
      return yield* lockError(root, "parent of custody root is not a directory");
    }

    const exists = yield* fs
      .exists(root)
      .pipe(Effect.mapError((cause) => lockError(root, "cannot inspect custody root", cause)));
    if (!exists) {
      yield* fs
        .makeDirectory(root)
        .pipe(Effect.mapError((cause) => lockError(root, "cannot create custody root", cause)));
    }
    const rootLink = yield* inspectLink(fs, root);
    if (Exit.isSuccess(rootLink)) {
      return yield* lockError(root, "custody root is a symlink");
    }
    const rootInfo = yield* fs
      .stat(root)
      .pipe(Effect.mapError((cause) => lockError(root, "cannot inspect custody root", cause)));
    if (rootInfo.type !== "Directory") {
      return yield* lockError(root, "custody root is not a directory");
    }
    return root;
  });

const validateLockPath = (
  lockPath: string,
): Effect.Effect<void, CuratorLockedError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const link = yield* inspectLink(fs, lockPath);
    if (Exit.isSuccess(link)) {
      return yield* lockError(lockPath, "lock path is a symlink");
    }
    const info = yield* fs
      .stat(lockPath)
      .pipe(Effect.mapError((cause) => lockError(lockPath, "cannot inspect lock file", cause)));
    if (info.type !== "File" || !Option.contains(info.nlink, 1)) {
      return yield* lockError(lockPath, "expected one regular filesystem link");
    }
  });

const release = (handle: ChildProcessSpawner.ChildProcessHandle) =>
  Effect.gen(function* () {
    const running = yield* handle.isRunning.pipe(Effect.orElseSucceed(() => false));
    if (running) {
      yield* handle.kill({ forceKillAfter: "1 second" }).pipe(Effect.ignore);
    }
    yield* handle.exitCode.pipe(Effect.ignore);
  });

/**
 * Acquire the interoperable `.references/.curator.lock` kernel lock.
 *
 * The scoped holder uses util-linux `flock` and the same advisory lock file as
 * the transitional Python implementation. It never truncates or writes the
 * file. Stable symlink/hardlink substitution is rejected before and after
 * acquisition; the frozen local threat model does not claim race-free defense
 * against a concurrently malicious filesystem actor.
 */
export const acquireCuratorLock = (
  referencesRoot: string,
): Effect.Effect<
  void,
  CuratorLockedError,
  | ChildProcessSpawner.ChildProcessSpawner
  | CuratorProcess
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const process = yield* CuratorProcess;
    const root = yield* validateRoot(referencesRoot);
    const lockPath = paths.join(root, LOCK_NAME);
    const readinessDirectory = yield* fs
      .makeTempDirectoryScoped({ prefix: "semantic-curator-ready-" })
      .pipe(
        Effect.mapError((cause) =>
          lockError(lockPath, "cannot create lock-readiness directory", cause),
        ),
      );
    const readinessPath = paths.join(readinessDirectory, "ready");

    const lockExists = yield* fs
      .exists(lockPath)
      .pipe(Effect.mapError((cause) => lockError(lockPath, "cannot inspect lock path", cause)));
    if (lockExists) yield* validateLockPath(lockPath);
    else {
      const link = yield* inspectLink(fs, lockPath);
      if (Exit.isSuccess(link)) {
        return yield* lockError(lockPath, "lock path is a dangling symlink");
      }
    }

    const command = ChildProcess.make(
      process.flockExecutable,
      [
        "--exclusive",
        "--nonblock",
        "--conflict-exit-code",
        String(CONFLICT_EXIT_CODE),
        "--no-fork",
        lockPath,
        process.holderExecutable,
        ...process.holderArguments,
        readinessPath,
      ],
      {
        env: process.environment,
        extendEnv: false,
        shell: false,
        detached: false,
        stdout: "ignore",
        stderr: "ignore",
      },
    );
    const handle = yield* spawner
      .spawn(command)
      .pipe(
        Effect.mapError((cause) =>
          lockError(lockPath, "cannot start the curator lock holder", cause),
        ),
      );
    yield* Effect.addFinalizer(() => release(handle));

    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (yield* fs.exists(readinessPath).pipe(Effect.orElseSucceed(() => false))) {
        ready = true;
        break;
      }
      if (!(yield* handle.isRunning.pipe(Effect.orElseSucceed(() => false)))) break;
      yield* Effect.sleep("5 millis");
    }
    if (!ready) {
      const running = yield* handle.isRunning.pipe(Effect.orElseSucceed(() => false));
      if (running) {
        return yield* lockError(lockPath, "lock holder did not become ready within one second");
      }
      const exitCode = yield* handle.exitCode.pipe(
        Effect.map(Number),
        Effect.orElseSucceed(() => -1),
      );
      return yield* new CuratorLockedError({
        message:
          exitCode === CONFLICT_EXIT_CODE
            ? `another curator holds the mutation lock at ${lockPath}`
            : `curator lock holder failed at ${lockPath} (exit ${exitCode})`,
      });
    }
    const readiness = yield* fs
      .readFileString(readinessPath)
      .pipe(
        Effect.mapError((cause) => lockError(lockPath, "cannot read lock-holder readiness", cause)),
      );
    if (readiness !== READY) {
      return yield* lockError(lockPath, "invalid lock-holder readiness record");
    }
    const running = yield* handle.isRunning.pipe(
      Effect.mapError((cause) => lockError(lockPath, "cannot inspect lock holder", cause)),
    );
    if (!running) {
      return yield* lockError(lockPath, "lock holder exited after readiness");
    }
    yield* validateLockPath(lockPath);
  });
