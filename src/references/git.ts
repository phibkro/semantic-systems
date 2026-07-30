import { Context, Crypto, Effect, FileSystem, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { isConcreteGitRef } from "./catalog.ts";
import { AcquisitionError } from "./errors.ts";

const ENVIRONMENT_PASSTHROUGH = ["PATH", "TMPDIR", "HOME"] as const;
const TRANSPORT_ENVIRONMENT_PASSTHROUGH = [
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NIX_SSL_CERT_FILE",
  "GIT_SSL_CAINFO",
  "CURL_CA_BUNDLE",
  "SSH_AUTH_SOCK",
  "http_proxy",
  "https_proxy",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "no_proxy",
  "NO_PROXY",
] as const;

const FIXED_ENVIRONMENT: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "true",
  SSH_ASKPASS: "true",
  GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
  GIT_PAGER: "cat",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_ATTR_NOSYSTEM: "1",
  GIT_NO_REPLACE_OBJECTS: "1",
  LC_ALL: "C",
  TZ: "UTC",
};

const HARDENING_ARGUMENTS = [
  "--no-optional-locks",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "credential.helper=",
  "-c",
  "protocol.allow=never",
  "-c",
  "protocol.file.allow=always",
  "-c",
  "protocol.ext.allow=never",
  "-c",
  "gc.auto=0",
  "-c",
  "maintenance.auto=false",
  "-c",
  "core.askPass=",
] as const;

export interface GitEnvironmentShape {
  readonly forMode: (
    allowTransport: boolean,
    repositoryCeiling?: string,
  ) => Readonly<Record<string, string>>;
}

export class GitEnvironment extends Context.Service<GitEnvironment, GitEnvironmentShape>()(
  "references/GitEnvironment",
) {}

/** Capture only the explicit environment channels allowed at the Git boundary. */
export const makeGitEnvironment = (
  ambient: Readonly<Record<string, string | undefined>>,
): GitEnvironmentShape => ({
  forMode: (allowTransport, repositoryCeiling) => {
    const names = allowTransport
      ? [...ENVIRONMENT_PASSTHROUGH, ...TRANSPORT_ENVIRONMENT_PASSTHROUGH]
      : ENVIRONMENT_PASSTHROUGH;
    const environment: Record<string, string> = {};
    for (const name of names) {
      const value = ambient[name];
      if (value !== undefined) environment[name] = value;
    }
    Object.assign(environment, FIXED_ENVIRONMENT);
    if (!allowTransport) environment.GIT_NO_LAZY_FETCH = "1";
    if (repositoryCeiling !== undefined) {
      environment.GIT_CEILING_DIRECTORIES = repositoryCeiling;
    }
    return environment;
  },
});

const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const ALLOWED_REMOTE_SCHEMES = new Set(["file", "https"]);

export const requireAllowedLocation = (
  location: string,
  allowTransport: boolean,
): Effect.Effect<void, AcquisitionError> => {
  if (location.length === 0 || location.startsWith("-")) {
    return Effect.fail(
      new AcquisitionError({ message: `unsafe Git location ${JSON.stringify(location)}` }),
    );
  }
  if (location.includes("::")) {
    return Effect.fail(
      new AcquisitionError({
        message: `unapproved Git transport helper in location ${JSON.stringify(location)}`,
      }),
    );
  }
  const schemeMatch = SCHEME_PATTERN.exec(location);
  if (schemeMatch !== null) {
    const scheme = schemeMatch[0]!.slice(0, -1).toLowerCase();
    if (!allowTransport) {
      return Effect.fail(
        new AcquisitionError({
          message: `offline Git observation refuses transport scheme ${JSON.stringify(scheme)}`,
        }),
      );
    }
    return ALLOWED_REMOTE_SCHEMES.has(scheme)
      ? Effect.void
      : Effect.fail(
          new AcquisitionError({
            message: `unapproved Git transport scheme ${JSON.stringify(scheme)}`,
          }),
        );
  }

  const firstColon = location.indexOf(":");
  const firstSlash = location.indexOf("/");
  const scpLike = firstColon > 0 && (firstSlash === -1 || firstColon < firstSlash);
  return scpLike
    ? Effect.fail(
        new AcquisitionError({
          message: `${allowTransport ? "online" : "offline"} Git observation refuses an SSH transport`,
        }),
      )
    : Effect.void;
};

const concatenate = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  const length = chunks.reduce((total, bytes) => total + bytes.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const bytes of chunks) {
    result.set(bytes, offset);
    offset += bytes.length;
  }
  return result;
};

const collectBytes = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.runCollect(stream).pipe(Effect.map(concatenate));

export interface GitResult {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: string;
}

export interface RunGitOptions {
  readonly check?: boolean;
  readonly allowTransport?: boolean;
  readonly cwd?: string;
  readonly repositoryCeiling?: string;
}

export const runGit = (
  arguments_: ReadonlyArray<string>,
  options: RunGitOptions = {},
): Effect.Effect<
  GitResult,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const environments = yield* GitEnvironment;
    const allowTransport = options.allowTransport ?? false;
    const command = ChildProcess.make(
      "git",
      [
        ...HARDENING_ARGUMENTS,
        "-c",
        `protocol.https.allow=${allowTransport ? "always" : "never"}`,
        ...arguments_,
      ],
      {
        cwd: options.cwd,
        env: environments.forMode(allowTransport, options.repositoryCeiling),
        extendEnv: false,
        shell: false,
        detached: false,
        stdin: "ignore",
      },
    );
    const result = yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(command);
        const [stdout, stderrBytes, exitCode] = yield* Effect.all(
          [collectBytes(handle.stdout), collectBytes(handle.stderr), handle.exitCode] as const,
          { concurrency: "unbounded" },
        );
        return {
          stdout,
          stderr: new TextDecoder().decode(stderrBytes),
          exitCode: Number(exitCode),
        };
      }),
    ).pipe(
      Effect.mapError(
        (cause) =>
          new AcquisitionError({
            message: `cannot execute Git command ${JSON.stringify(arguments_)}`,
            cause,
          }),
      ),
    );
    if ((options.check ?? true) && result.exitCode !== 0) {
      return yield* new AcquisitionError({
        message:
          `git ${arguments_.join(" ")} failed (exit ${result.exitCode}): ` + result.stderr.trim(),
      });
    }
    return result;
  });

const text = (result: GitResult): string => new TextDecoder().decode(result.stdout);

export interface TreeEntry {
  readonly mode: string;
  readonly objectType: string;
  readonly oid: string;
  readonly size: bigint;
}

export interface TreePathEntry extends TreeEntry {
  readonly path: string;
}

export const objectFormat = (repository: string) =>
  runGit(["-C", repository, "rev-parse", "--show-object-format"]).pipe(
    Effect.flatMap((result) => {
      const format = text(result).trim() || "sha1";
      return format === "sha1" || format === "sha256"
        ? Effect.succeed(format)
        : Effect.fail(
            new AcquisitionError({
              message: `unsupported Git object format ${JSON.stringify(format)}`,
            }),
          );
    }),
  );

export const requireFullObjectId = (
  format: string,
  label: string,
  oid: string,
): Effect.Effect<void, AcquisitionError> => {
  const length = format === "sha1" ? 40 : format === "sha256" ? 64 : 0;
  return length > 0 && oid.length === length && /^[0-9a-f]+$/.test(oid)
    ? Effect.void
    : Effect.fail(
        new AcquisitionError({
          message: `${label} is not a full ${format} object id: ` + JSON.stringify(oid),
        }),
      );
};

const rejectOptionLike = (label: string, value: string): Effect.Effect<void, AcquisitionError> =>
  value.startsWith("-")
    ? Effect.fail(
        new AcquisitionError({
          message: `refusing to resolve option-like ${label} ${JSON.stringify(value)}`,
        }),
      )
    : Effect.void;

export const resolveCommit = (repository: string, revision: string) =>
  rejectOptionLike("revision", revision).pipe(
    Effect.andThen(runGit(["-C", repository, "rev-parse", "--verify", `${revision}^{commit}`])),
    Effect.map((result) => text(result).trim()),
  );

/**
 * Resolve a commit selector, returning `null` only for Git's quiet
 * selector-absent result. Operational, repository, and object failures remain
 * typed acquisition errors and must not be mistaken for cache absence.
 */
export const resolveCommitIfPresent = (
  repository: string,
  revision: string,
): Effect.Effect<
  string | null,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  rejectOptionLike("revision", revision).pipe(
    Effect.andThen(
      runGit(["-C", repository, "rev-parse", "--verify", "--quiet", revision], {
        check: false,
      }),
    ),
    Effect.flatMap((probe) => {
      const object = text(probe).trim();
      if (probe.exitCode === 1 && object.length === 0 && probe.stderr.trim().length === 0) {
        return Effect.succeed(null);
      }
      if (probe.exitCode !== 0 || object.length === 0) {
        return Effect.fail(
          new AcquisitionError({
            message:
              `cannot probe commit selector ${JSON.stringify(revision)} in ` +
              `${JSON.stringify(repository)} (exit ${probe.exitCode}): ${probe.stderr.trim()}`,
          }),
        );
      }
      return resolveCommit(repository, revision);
    }),
  );

export const treeOfCommit = (repository: string, commit: string) =>
  rejectOptionLike("commit", commit).pipe(
    Effect.andThen(runGit(["-C", repository, "rev-parse", "--verify", `${commit}^{tree}`])),
    Effect.map((result) => text(result).trim()),
  );

/** Observe whether HEAD is detached, failing closed on non-quiet Git errors. */
export const isDetachedHead = (
  worktree: string,
): Effect.Effect<
  boolean,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  runGit(["-C", worktree, "symbolic-ref", "-q", "HEAD"], { check: false }).pipe(
    Effect.flatMap((result) => {
      if (result.exitCode === 0) return Effect.succeed(false);
      if (
        result.exitCode === 1 &&
        result.stdout.length === 0 &&
        result.stderr.trim().length === 0
      ) {
        return Effect.succeed(true);
      }
      return Effect.fail(
        new AcquisitionError({
          message:
            `cannot inspect checkout HEAD detachment (exit ${result.exitCode}): ` +
            result.stderr.trim(),
        }),
      );
    }),
  );

export const headCommit = (
  worktree: string,
): Effect.Effect<
  string,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  runGit(["-C", worktree, "rev-parse", "--verify", "HEAD"]).pipe(
    Effect.map((result) => text(result).trim()),
  );

export const isCleanWorktree = (
  worktree: string,
): Effect.Effect<
  boolean,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  runGit([
    "-C",
    worktree,
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--ignored=no",
  ]).pipe(Effect.map((result) => text(result).trim().length === 0));

const splitNulRecords = (bytes: Uint8Array): ReadonlyArray<Uint8Array> => {
  const records: Array<Uint8Array> = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue;
    records.push(bytes.slice(start, index));
    start = index + 1;
  }
  if (start < bytes.length) records.push(bytes.slice(start));
  return records;
};

const decodePath = (bytes: Uint8Array, label: string): Effect.Effect<string, AcquisitionError> =>
  Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    catch: (cause) =>
      new AcquisitionError({
        message: `${label} contains a path that is not valid UTF-8`,
        cause,
      }),
  });

/**
 * Expose index flags and sparse-checkout configuration that can suppress
 * ordinary dirt. Every observation is read-only and inherits runGit's
 * environment and transport hardening.
 */
export const hiddenIndexReasons = (
  worktree: string,
): Effect.Effect<
  ReadonlyArray<string>,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  Effect.gen(function* () {
    const result = yield* runGit(["-C", worktree, "ls-files", "-v", "-z"], { check: false });
    if (result.exitCode !== 0) {
      return yield* new AcquisitionError({
        message: `git ls-files -v failed: ${result.stderr.trim()}`,
      });
    }
    const reasons: Array<string> = [];
    for (const record of splitNulRecords(result.stdout)) {
      if (record.length < 3 || record[1] !== 0x20) continue;
      const marker = record[0]!;
      const path = yield* decodePath(record.slice(2), "git ls-files -v output");
      if (marker >= 0x61 && marker <= 0x7a) {
        reasons.push(`tracked path ${JSON.stringify(path)} is hidden by assume-unchanged`);
      }
      if ((marker & 0xdf) === 0x53) {
        reasons.push(`tracked path ${JSON.stringify(path)} is hidden by skip-worktree`);
      }
    }

    const sparse = yield* runGit(["-C", worktree, "config", "--bool", "core.sparseCheckout"], {
      check: false,
    });
    if (sparse.exitCode === 0) {
      if (text(sparse).trim() === "true") {
        reasons.push("checkout uses sparse-checkout and is not a complete locked tree");
      }
    } else if (sparse.exitCode !== 1) {
      return yield* new AcquisitionError({
        message:
          `cannot inspect core.sparseCheckout (exit ${sparse.exitCode}): ` + sparse.stderr.trim(),
      });
    }
    return reasons;
  });

/**
 * Reject repository-local filter commands before any worktree comparison can
 * cause Git to execute them. Includes are disabled so merely inspecting this
 * boundary cannot widen the repository's configuration authority.
 */
export const repositoryProgramReasons = (
  worktree: string,
): Effect.Effect<
  ReadonlyArray<string>,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  runGit(
    [
      "-C",
      worktree,
      "config",
      "--local",
      "--no-includes",
      "--null",
      "--name-only",
      "--get-regexp",
      String.raw`^filter\..*\.(clean|smudge|process)$`,
    ],
    { check: false },
  ).pipe(
    Effect.flatMap((result) => {
      if (result.exitCode === 1 && result.stdout.length === 0) return Effect.succeed([]);
      if (result.exitCode !== 0) {
        return Effect.fail(
          new AcquisitionError({
            message:
              `cannot inspect repository-configured Git filters (exit ${result.exitCode}): ` +
              result.stderr.trim(),
          }),
        );
      }
      if (result.stdout.length > 0 && result.stdout[result.stdout.length - 1] !== 0) {
        return Effect.fail(
          new AcquisitionError({
            message: "repository-configured Git filter keys are not NUL-terminated",
          }),
        );
      }
      return Effect.forEach(splitNulRecords(result.stdout), (record) =>
        decodePath(record, "repository-configured Git filter").pipe(
          Effect.map(
            (key) => `checkout config declares executable Git filter ${JSON.stringify(key)}`,
          ),
        ),
      );
    }),
  );

export const lsTreeEntry = (
  repository: string,
  commit: string,
  path: string,
): Effect.Effect<
  TreeEntry | null,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  runGit(["-C", repository, "ls-tree", "-l", "-z", commit, "--", path], {
    check: false,
  }).pipe(
    Effect.flatMap((result) => {
      if (result.exitCode !== 0) {
        return Effect.fail(
          new AcquisitionError({
            message: `git ls-tree failed for ${JSON.stringify(path)}: ${result.stderr.trim()}`,
          }),
        );
      }
      const output = text(result);
      if (output.length === 0) return Effect.succeed(null);
      if (!output.endsWith("\0")) {
        return Effect.fail(
          new AcquisitionError({
            message: `unexpected non-NUL-terminated ls-tree output for ${JSON.stringify(path)}`,
          }),
        );
      }
      const records = output.slice(0, -1).split("\0");
      if (records.length !== 1) {
        return Effect.fail(
          new AcquisitionError({
            message: `unexpected multiple ls-tree records for ${JSON.stringify(path)}`,
          }),
        );
      }
      const line = records[0]!;
      const tab = line.indexOf("\t");
      if (tab < 0 || line.slice(tab + 1) !== path) return Effect.succeed(null);
      const fields = line.slice(0, tab).split(/\s+/);
      if (fields.length !== 4) {
        return Effect.fail(
          new AcquisitionError({
            message: `unexpected ls-tree output for ${JSON.stringify(path)}: ${JSON.stringify(line)}`,
          }),
        );
      }
      const [mode, objectType, oid, size] = fields as [string, string, string, string];
      return Effect.try({
        try: () => ({
          mode,
          objectType,
          oid,
          size: size === "-" ? -1n : BigInt(size),
        }),
        catch: (cause) =>
          new AcquisitionError({
            message: `invalid ls-tree size for ${JSON.stringify(path)}: ${JSON.stringify(size)}`,
            cause,
          }),
      });
    }),
  );

/**
 * List every path in a committed tree without C-style path quoting. Invalid
 * UTF-8 paths fail closed because the portable filesystem boundary cannot
 * address them without silently changing their bytes.
 */
export const lsTreeRecursive = (
  repository: string,
  commit: string,
): Effect.Effect<
  ReadonlyArray<TreePathEntry>,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  rejectOptionLike("commit", commit).pipe(
    Effect.andThen(
      runGit(["-C", repository, "ls-tree", "-r", "-l", "-z", "--full-tree", commit], {
        check: false,
      }),
    ),
    Effect.flatMap((result) =>
      Effect.gen(function* () {
        if (result.exitCode !== 0) {
          return yield* new AcquisitionError({
            message: `git ls-tree -r failed: ${result.stderr.trim()}`,
          });
        }
        if (result.stdout.length > 0 && result.stdout[result.stdout.length - 1] !== 0) {
          return yield* new AcquisitionError({
            message: "unexpected non-NUL-terminated recursive ls-tree output",
          });
        }
        const entries: Array<TreePathEntry> = [];
        for (const record of splitNulRecords(result.stdout)) {
          if (record.length === 0) continue;
          const tab = record.indexOf(0x09);
          if (tab < 0) {
            return yield* new AcquisitionError({
              message: "unexpected recursive ls-tree record without a path separator",
            });
          }
          const metadata = yield* decodePath(record.slice(0, tab), "recursive ls-tree metadata");
          const fields = metadata.split(/\s+/);
          if (fields.length !== 4) {
            return yield* new AcquisitionError({
              message: `unexpected recursive ls-tree metadata ${JSON.stringify(metadata)}`,
            });
          }
          const [mode, objectType, oid, rawSize] = fields as [string, string, string, string];
          const path = yield* decodePath(record.slice(tab + 1), "recursive ls-tree output");
          const size = yield* Effect.try({
            try: () => (rawSize === "-" ? -1n : BigInt(rawSize)),
            catch: (cause) =>
              new AcquisitionError({
                message: `invalid recursive ls-tree size for ${JSON.stringify(path)}`,
                cause,
              }),
          });
          entries.push({ path, mode, objectType, oid, size });
        }
        return entries;
      }),
    ),
  );

export const blobSha256 = (
  repository: string,
  oid: string,
): Effect.Effect<
  string,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const result = yield* runGit(["-C", repository, "cat-file", "blob", oid]);
    const crypto = yield* Crypto.Crypto;
    const digest = yield* crypto
      .digest("SHA-256", result.stdout)
      .pipe(
        Effect.mapError(
          (cause) => new AcquisitionError({ message: `cannot hash Git blob ${oid}`, cause }),
        ),
      );
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  });

interface RemoteRefs {
  readonly symrefs: ReadonlyArray<readonly [string, string]>;
  readonly refs: ReadonlyArray<readonly [string, string]>;
}

const lsRemoteRefs = (
  location: string,
  pattern: string,
): Effect.Effect<
  RemoteRefs,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | GitEnvironment | Path.Path
> =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* requireAllowedLocation(location, false);
      yield* rejectOptionLike("ref", pattern);
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* Path.Path;
      const scratch = yield* fs
        .makeTempDirectoryScoped({ prefix: "semantic-git-observation-" })
        .pipe(
          Effect.mapError(
            (cause) =>
              new AcquisitionError({
                message: "cannot create a neutral Git observation directory",
                cause,
              }),
          ),
        );
      const cwd = paths.join(scratch, "cwd");
      yield* fs.makeDirectory(cwd).pipe(
        Effect.mapError(
          (cause) =>
            new AcquisitionError({
              message: "cannot initialize a neutral Git observation directory",
              cause,
            }),
        ),
      );
      const result = yield* runGit(["ls-remote", "--symref", location, pattern], {
        cwd,
        repositoryCeiling: scratch,
      });
      const symrefs: Array<readonly [string, string]> = [];
      const refs: Array<readonly [string, string]> = [];
      for (const line of text(result).split(/\r?\n/)) {
        const tab = line.indexOf("\t");
        if (tab < 0) continue;
        const left = line.slice(0, tab);
        const right = line.slice(tab + 1).trim();
        if (left.startsWith("ref: ")) symrefs.push([right, left.slice("ref: ".length).trim()]);
        else refs.push([left.trim(), right]);
      }
      return { symrefs, refs };
    }),
  );

const undereference = (ref: string): string => (ref.endsWith("^{}") ? ref.slice(0, -3) : ref);

export const observeConcreteRef = (
  location: string,
  track: string,
  expectedCommit: string,
): Effect.Effect<
  string,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | GitEnvironment | Path.Path
> =>
  Effect.gen(function* () {
    const observed = yield* lsRemoteRefs(location, track);
    const symrefTargets = new Set(
      observed.symrefs.filter(([queried]) => queried === track).map(([, target]) => target),
    );
    const candidates =
      symrefTargets.size > 0
        ? symrefTargets
        : new Set(observed.refs.map(([, ref]) => undereference(ref)));
    if (candidates.size === 0) {
      return yield* new AcquisitionError({
        message: `selector ${JSON.stringify(track)} does not name a concrete ref at ${JSON.stringify(location)}`,
      });
    }
    if (candidates.size !== 1) {
      return yield* new AcquisitionError({
        message: `selector ${JSON.stringify(track)} is ambiguous: ${JSON.stringify([...candidates].sort())}`,
      });
    }
    const concrete = [...candidates][0]!;
    if (!isConcreteGitRef(concrete)) {
      return yield* new AcquisitionError({
        message: `selector ${JSON.stringify(track)} resolved to non-concrete ref ${JSON.stringify(concrete)}`,
      });
    }
    const confirmation = yield* lsRemoteRefs(location, concrete);
    const matching = new Set(
      confirmation.refs.filter(([, ref]) => undereference(ref) === concrete).map(([oid]) => oid),
    );
    if (!matching.has(expectedCommit)) {
      return yield* new AcquisitionError({
        message:
          `selector ${JSON.stringify(track)} -> ${JSON.stringify(concrete)} resolves to ` +
          `${JSON.stringify([...matching].sort())}, not observed commit ${expectedCommit}`,
      });
    }
    return concrete;
  });

export const rawLocalRemoteUrl = (
  repository: string,
): Effect.Effect<
  string | null,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  runGit(
    [
      "-C",
      repository,
      "config",
      "--local",
      "--no-includes",
      "--null",
      "--get-all",
      "remote.origin.url",
    ],
    { check: false },
  ).pipe(
    Effect.flatMap((result) => {
      if (result.exitCode === 1 && result.stdout.length === 0) return Effect.succeed(null);
      if (result.exitCode !== 0) {
        return Effect.fail(
          new AcquisitionError({
            message: `cannot read raw local remote.origin.url: ${result.stderr.trim()}`,
          }),
        );
      }
      const output = text(result);
      if (!output.endsWith("\0")) {
        return Effect.fail(
          new AcquisitionError({
            message: "raw local remote.origin.url output is not NUL-terminated",
          }),
        );
      }
      const values = output.slice(0, -1).split("\0");
      if (values.length !== 1 || values[0]!.length === 0) {
        return Effect.fail(
          new AcquisitionError({
            message: `expected exactly one raw local remote.origin.url, observed ${values.length}`,
          }),
        );
      }
      return Effect.succeed(values[0]!);
    }),
  );
