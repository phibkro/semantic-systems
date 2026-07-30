import { Context, Crypto, Effect, Stream } from "effect";
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
  "protocol.https.allow=always",
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
  readonly forMode: (allowTransport: boolean) => Readonly<Record<string, string>>;
}

export class GitEnvironment extends Context.Service<GitEnvironment, GitEnvironmentShape>()(
  "references/GitEnvironment",
) {}

/** Capture only the explicit environment channels allowed at the Git boundary. */
export const makeGitEnvironment = (
  ambient: Readonly<Record<string, string | undefined>>,
): GitEnvironmentShape => ({
  forMode: (allowTransport) => {
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

interface RunGitOptions {
  readonly check?: boolean;
  readonly allowTransport?: boolean;
  readonly cwd?: string;
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
    const command = ChildProcess.make("git", [...HARDENING_ARGUMENTS, ...arguments_], {
      cwd: options.cwd,
      env: environments.forMode(allowTransport),
      extendEnv: false,
      shell: false,
      detached: false,
      stdin: "ignore",
    });
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

export const treeOfCommit = (repository: string, commit: string) =>
  rejectOptionLike("commit", commit).pipe(
    Effect.andThen(runGit(["-C", repository, "rev-parse", "--verify", `${commit}^{tree}`])),
    Effect.map((result) => text(result).trim()),
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
  runGit(["-C", repository, "ls-tree", "-l", commit, "--", path], { check: false }).pipe(
    Effect.flatMap((result) => {
      if (result.exitCode !== 0) {
        return Effect.fail(
          new AcquisitionError({
            message: `git ls-tree failed for ${JSON.stringify(path)}: ${result.stderr.trim()}`,
          }),
        );
      }
      const line = text(result).trim();
      if (line.length === 0) return Effect.succeed(null);
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
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  requireAllowedLocation(location, false).pipe(
    Effect.andThen(rejectOptionLike("ref", pattern)),
    Effect.andThen(runGit(["ls-remote", "--symref", location, pattern])),
    Effect.map((result) => {
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
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
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

export const remoteUrl = (
  repository: string,
): Effect.Effect<
  string | null,
  AcquisitionError,
  ChildProcessSpawner.ChildProcessSpawner | GitEnvironment
> =>
  runGit(["-C", repository, "remote", "get-url", "origin"], { check: false }).pipe(
    Effect.map((result) => (result.exitCode === 0 ? text(result).trim() : null)),
  );
