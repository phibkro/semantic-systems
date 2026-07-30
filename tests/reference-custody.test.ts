/**
 * Differential and adversarial oracle for the reference-custody
 * catalog/lock/status-lock-only slice (design specs 0004 and 0010 item 6).
 *
 * Every "matches Python" test shells out to the still-installed
 * `semantic_references` package as a temporary oracle (per design spec
 * 0010: "the existing Python implementation is a temporary differential
 * oracle, not a permanent runtime fallback"). No test needs network or
 * mutates `references/`.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { BunChildProcessSpawner, BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  Cause,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  PlatformError,
  type Crypto,
  type Path,
} from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { lockFromLocalSibling } from "../src/references/acquire.ts";
import {
  catalogDigest,
  isConcreteGitRef,
  isGitSafeValue,
  isLockable,
  isValidLicensePath,
  isValidSourceId,
  parseCatalogText,
} from "../src/references/catalog.ts";
import {
  acquireCuratorLock,
  CuratorProcess,
  makeCuratorProcess,
  superviseCurator,
} from "../src/references/curator.ts";
import { AcquisitionError, CuratorLockedError } from "../src/references/errors.ts";
import {
  GitEnvironment,
  makeGitEnvironment,
  requireAllowedLocation,
  runGit,
} from "../src/references/git.ts";
import { loadLock, parseLockText, serializeLock, writeLock } from "../src/references/lockfile.ts";
import { lockOfflineSources } from "../src/references/offline-lock.ts";
import { inspectObjectCache } from "../src/references/paths.ts";
import {
  catalogBindingReasons,
  computeLockOnlyStatus,
  isStrictOk,
  orphanedLockReport,
} from "../src/references/status.ts";
import { layer as BunTomlParser } from "../src/references/toml-bun.ts";
import type { TomlParser } from "../src/references/toml.ts";
import { publicationBlockingReasons } from "../src/references/verify.ts";

type TestCapabilities =
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | ChildProcessSpawner.ChildProcessSpawner
  | CuratorProcess
  | GitEnvironment
  | TomlParser;

const ROOT = resolve(import.meta.dir, "..");
const PYTHONPATH = join(ROOT, "src");
const MAIN_BUN = join(ROOT, "src", "references", "main-bun.ts");
const MAIN_NODE = join(ROOT, "src", "references", "main-node.ts");
const NODE_EXECUTABLE =
  Bun.which("node") ?? "/nix/store/lnfxdsvvm1srsa9kk94s7jqw06yq1h2d-nodejs-24.18.0/bin/node";
const temporaryRoots: Array<string> = [];
const GitEnvironmentLayer = Layer.succeed(GitEnvironment, makeGitEnvironment(process.env));
const CuratorProcessLayer = Layer.succeed(
  CuratorProcess,
  makeCuratorProcess(process.env, process.execPath, [
    join(ROOT, "src", "references", "curator-holder.ts"),
  ]),
);
const BunChildProcessLayer = BunChildProcessSpawner.layer.pipe(
  Layer.provide([BunFileSystem.layer, BunPath.layer]),
);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })));
});

const runBun = <A, E>(effect: Effect.Effect<A, E, TestCapabilities>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide([BunFileSystem.layer, BunPath.layer, BunCrypto.layer, BunTomlParser]),
      Effect.provide([BunChildProcessLayer, CuratorProcessLayer, GitEnvironmentLayer]),
    ),
  );

const runBunExit = <A, E>(effect: Effect.Effect<A, E, TestCapabilities>) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide([BunFileSystem.layer, BunPath.layer, BunCrypto.layer, BunTomlParser]),
      Effect.provide([BunChildProcessLayer, CuratorProcessLayer, GitEnvironmentLayer]),
    ),
  );

interface ProcResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

const runPythonCli = (args: ReadonlyArray<string>): ProcResult => {
  const result = Bun.spawnSync({
    cmd: ["python3", "-m", "semantic_references", ...args],
    cwd: ROOT,
    env: { ...process.env, PYTHONPATH },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode ?? 1,
  };
};

const runTsCli = (
  args: ReadonlyArray<string>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProcResult => {
  const result = Bun.spawnSync({
    cmd: ["bun", MAIN_BUN, ...args],
    cwd: ROOT,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode ?? 1,
  };
};

const runNodeCli = (args: ReadonlyArray<string>): ProcResult => {
  const result = Bun.spawnSync({
    cmd: [NODE_EXECUTABLE, MAIN_NODE, ...args],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode ?? 1,
  };
};

const pythonEval = (code: string): ProcResult => {
  const result = Bun.spawnSync({
    cmd: ["python3", "-c", code],
    cwd: ROOT,
    env: { ...process.env, PYTHONPATH },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode ?? 1,
  };
};

/** Python's canonical_digest for one source in an on-disk catalog fixture. */
const pythonCanonicalDigest = (root: string, sourceId: string): string => {
  const code = `
import sys
sys.path.insert(0, ${JSON.stringify(PYTHONPATH)})
from pathlib import Path
from semantic_references.catalog import load_catalog
catalog = load_catalog(Path(${JSON.stringify(root)}) / "references" / "sources.toml")
print(catalog.sources[${JSON.stringify(sourceId)}].canonical_digest())
`;
  const result = pythonEval(code);
  if (result.exitCode !== 0) throw new Error(`python digest oracle failed: ${result.stderr}`);
  return result.stdout.trim();
};

/** Python's canonical digest for an arbitrary JSON-shaped catalog record. */
const pythonCanonicalRecordDigest = (record: Readonly<Record<string, unknown>>): string => {
  const encoded = JSON.stringify(record);
  const code = `
import hashlib
import json
record = json.loads(${JSON.stringify(encoded)})
canonical = json.dumps(
    record,
    sort_keys=True,
    separators=(",", ":"),
    ensure_ascii=True,
).encode("utf-8")
print(hashlib.sha256(canonical).hexdigest())
`;
  const result = pythonEval(code);
  if (result.exitCode !== 0) throw new Error(`python digest oracle failed: ${result.stderr}`);
  return result.stdout.trim();
};

/** Whether Python's `parse_lock_text` accepts (vs. rejects) `text`. */
const pythonAcceptsLockText = (text: string): boolean => {
  const code = `
import sys
sys.path.insert(0, ${JSON.stringify(PYTHONPATH)})
from semantic_references.lockfile import parse_lock_text
from semantic_references.errors import LockFileError
try:
    parse_lock_text(${JSON.stringify(text)})
    print("ACCEPTED")
except LockFileError as exc:
    print("REJECTED", exc)
`;
  return pythonEval(code).stdout.startsWith("ACCEPTED");
};

/** Python's canonical lock bytes for an already JSON-encoded lock fixture. */
const pythonSerializeLock = (text: string): string => {
  const code = `
import sys
sys.path.insert(0, ${JSON.stringify(PYTHONPATH)})
from semantic_references.lockfile import parse_lock_text, serialize_lock
sys.stdout.write(serialize_lock(parse_lock_text(${JSON.stringify(text)})).decode("utf-8"))
`;
  const result = pythonEval(code);
  if (result.exitCode !== 0) throw new Error(`python lock serializer failed: ${result.stderr}`);
  return result.stdout;
};

/** Whether Python's `parse_catalog_text` accepts (vs. rejects) `text`. */
const pythonAcceptsCatalogText = (text: string): boolean => {
  const code = `
import sys
sys.path.insert(0, ${JSON.stringify(PYTHONPATH)})
from semantic_references.catalog import parse_catalog_text
from semantic_references.errors import CatalogError
try:
    parse_catalog_text(${JSON.stringify(text)})
    print("ACCEPTED")
except CatalogError as exc:
    print("REJECTED", exc)
`;
  return pythonEval(code).stdout.startsWith("ACCEPTED");
};

const temporaryProject = async (catalogToml: string, lockJson?: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "semantic-references-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "references"), { recursive: true });
  await writeFile(join(root, "references", "sources.toml"), catalogToml);
  if (lockJson !== undefined) {
    await writeFile(join(root, "references", "sources.lock.json"), lockJson);
  }
  return root;
};

const runCommand = (command: ReadonlyArray<string>, cwd: string): string => {
  const result = Bun.spawnSync({
    cmd: [...command],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed (${result.exitCode}): ${result.stderr.toString()}`,
    );
  }
  return result.stdout.toString().trim();
};

const localSiblingFixture = async (
  origin = "https://example.com/demo.git",
): Promise<{
  readonly project: string;
  readonly sibling: string;
  readonly sourceText: string;
  readonly license: string;
}> => {
  const root = await mkdtemp(join(tmpdir(), "semantic-references-git-"));
  temporaryRoots.push(root);
  const project = join(root, "project");
  const sibling = join(root, "sibling");
  await mkdir(project);
  await mkdir(sibling);
  runCommand(["git", "init", "-b", "main"], sibling);
  const license = "custodied license bytes\n";
  await writeFile(join(sibling, "LICENSE"), license);
  runCommand(["git", "add", "LICENSE"], sibling);
  runCommand(
    [
      "git",
      "-c",
      "user.name=Semantic Custody Test",
      "-c",
      "user.email=custody@example.invalid",
      "commit",
      "-m",
      "test: seed custody fixture",
    ],
    sibling,
  );
  runCommand(["git", "remote", "add", "origin", origin], sibling);
  return {
    project,
    sibling,
    license,
    sourceText: `
schema = 1

[[source]]
id = "demo.repo"
kind = "git"
origin = ${JSON.stringify(origin)}
local_hint = "../sibling"
track = "main"
license_paths = ["LICENSE"]
classes = ["testing"]
`,
  };
};

const installObjectCache = async (
  project: string,
  sibling: string,
  sourceId = "demo.repo",
  origin = "https://example.com/demo.git",
): Promise<string> => {
  const cache = join(project, ".references", sourceId, ".git-cache");
  await mkdir(join(project, ".references", sourceId), { recursive: true });
  runCommand(["git", "clone", "--bare", "--quiet", sibling, cache], project);
  runCommand(["git", "-C", cache, "remote", "set-url", "origin", origin], project);
  return cache;
};

const installCheckout = async (
  project: string,
  sibling: string,
  sourceId = "demo.repo",
): Promise<string> => {
  const sourceRoot = join(project, ".references", sourceId);
  const checkout = join(sourceRoot, "checkout");
  await mkdir(sourceRoot, { recursive: true });
  runCommand(["git", "clone", "--quiet", sibling, checkout], project);
  const commit = runCommand(["git", "rev-parse", "HEAD"], checkout);
  runCommand(["git", "checkout", "--quiet", "--detach", commit], checkout);
  return checkout;
};

const lockedFixture = async (
  materialize = true,
): Promise<{
  readonly fixture: Awaited<ReturnType<typeof localSiblingFixture>>;
  readonly checkout: string | null;
}> => {
  const fixture = await localSiblingFixture();
  await mkdir(join(fixture.project, "references"));
  await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);
  const locked = runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]);
  if (locked.exitCode !== 0) {
    throw new Error(`fixture lock failed (${locked.exitCode}): ${locked.stderr}`);
  }
  return {
    fixture,
    checkout: materialize ? await installCheckout(fixture.project, fixture.sibling) : null,
  };
};

const directoryByteSnapshot = async (root: string, relative = ""): Promise<string> => {
  const directory = join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const records: Array<string> = [];
  for (const entry of entries) {
    const child = relative === "" ? entry.name : join(relative, entry.name);
    const absolute = join(root, child);
    if (entry.isDirectory()) {
      records.push(`directory ${child}`);
      records.push(await directoryByteSnapshot(root, child));
    } else if (entry.isFile()) {
      const bytes = await readFile(absolute);
      const mode = (await stat(absolute)).mode;
      records.push(
        `file ${child} ${mode.toString(8)} ${createHash("sha256").update(bytes).digest("hex")}`,
      );
    } else if (entry.isSymbolicLink()) {
      records.push(`symlink ${child} ${await readlink(absolute)}`);
    } else {
      records.push(`other ${child}`);
    }
  }
  return records.join("\n");
};

const BASE_CATALOG = `
schema = 1

[[source]]
id = "demo.repo"
kind = "git"
origin = "https://example.com/demo.git"
track = "HEAD"
license_paths = ["LICENSE"]
classes = ["testing"]
`;

const FAKE_COMMIT = "a".repeat(40);
const FAKE_TREE = "b".repeat(40);
const FAKE_SHA256 = "c".repeat(64);

const buildLockJson = (
  catalogDigestValue: string,
  overrides: Record<string, unknown> = {},
): string =>
  JSON.stringify(
    {
      schema: "reference-lock-v1",
      generator: "test/0.0.0",
      sources: {
        "demo.repo": {
          origin: "https://example.com/demo.git",
          track: "HEAD",
          resolved_ref: "refs/heads/main",
          object_format: "sha1",
          commit: FAKE_COMMIT,
          tree: FAKE_TREE,
          catalog_digest: catalogDigestValue,
          retrieved_at: "2026-07-30T00:00:00Z",
          acquisition: "local-sibling",
          origin_verified: false,
          licenses: {
            LICENSE: { mode: "100644", size: 42, sha256: FAKE_SHA256 },
          },
          ...overrides,
        },
      },
    },
    null,
    2,
  );

describe("reference custody Effect v4 slice: pure predicates", () => {
  test("git-safe values reject option-like and control-bearing strings", () => {
    expect(isGitSafeValue("https://example.com/demo.git")).toBeTrue();
    expect(isGitSafeValue("")).toBeFalse();
    expect(isGitSafeValue("--upload-pack=evil")).toBeFalse();
    expect(isGitSafeValue("badbell")).toBeFalse();
    expect(isGitSafeValue("baddel")).toBeFalse();
  });

  test("concrete git refs must be a fully qualified refs/... name", () => {
    expect(isConcreteGitRef("refs/heads/main")).toBeTrue();
    expect(isConcreteGitRef("HEAD")).toBeFalse();
    expect(isConcreteGitRef("main")).toBeFalse();
    expect(isConcreteGitRef("refs/heads/")).toBeFalse();
    expect(isConcreteGitRef("refs/heads/..")).toBeFalse();
    expect(isConcreteGitRef("refs/heads/x.lock")).toBeFalse();
  });

  test("source ids are path-safe lowercase dotted identifiers", () => {
    expect(isValidSourceId("local.lang-bang")).toBeTrue();
    expect(isValidSourceId("koka")).toBeTrue();
    expect(isValidSourceId("Bad_ID")).toBeFalse();
    expect(isValidSourceId(".leading-dot")).toBeFalse();
    expect(isValidSourceId("trailing.")).toBeFalse();
  });

  test("license paths must be normalized, relative, and dot-free", () => {
    expect(isValidLicensePath("LICENSE")).toBeTrue();
    expect(isValidLicensePath("licenses/LICENSE-MIT")).toBeTrue();
    expect(isValidLicensePath("/LICENSE")).toBeFalse();
    expect(isValidLicensePath("LICENSE/")).toBeFalse();
    expect(isValidLicensePath("../LICENSE")).toBeFalse();
    expect(isValidLicensePath("a//b")).toBeFalse();
    expect(isValidLicensePath("a\\b")).toBeFalse();
    expect(isValidLicensePath(" LICENSE")).toBeFalse();
  });
});

describe("reference custody Effect v4 slice: catalog parsing", () => {
  test("parses the real repository catalog with byte-identical digests to Python", async () => {
    const catalog = await runBun(
      parseCatalogText(await Bun.file(join(ROOT, "references", "sources.toml")).text()),
    );
    expect(catalog.sources.size).toBeGreaterThanOrEqual(20);
    for (const [id, source] of catalog.sources) {
      const tsDigest = await runBun(catalogDigest(source.raw));
      const pyDigest = pythonCanonicalDigest(ROOT, id);
      expect(tsDigest).toBe(pyDigest);
    }
  });

  test("canonical digest escapes astral characters identically to Python", async () => {
    const record = {
      id: "demo.repo",
      questions: ["Does \u{1f600} preserve reference custody?"],
      "\ue000": "private-use sorts before astral by Unicode code point",
      "\u{1f600}": "astral key",
    };
    expect(await runBun(catalogDigest(record))).toBe(pythonCanonicalRecordDigest(record));
  });

  test("rejects a duplicate source id, matching Python", async () => {
    const text = `
schema = 1
[[source]]
id = "dup"
kind = "git"
origin = "https://example.com/a.git"
[[source]]
id = "dup"
kind = "git"
origin = "https://example.com/b.git"
`;
    const exit = await runBunExit(parseCatalogText(text));
    expect(Exit.isFailure(exit)).toBeTrue();
    expect(pythonAcceptsCatalogText(text)).toBeFalse();
  });

  test("rejects duplicate TOML keys in the same table, matching Python", () => {
    const text = `
schema = 1
schema = 2
`;
    expect(pythonAcceptsCatalogText(text)).toBeFalse();
    // Bun's native TOML decoder rejects the duplicate before Schema ever sees it.
    expect(() => Bun.TOML.parse(text)).toThrow();
  });

  test("rejects an unsafe source id", async () => {
    const text = `${BASE_CATALOG.replace('id = "demo.repo"', 'id = "Bad_ID"')}`;
    const exit = await runBunExit(parseCatalogText(text));
    expect(Exit.isFailure(exit)).toBeTrue();
    expect(pythonAcceptsCatalogText(text)).toBeFalse();
  });

  test("rejects an option-like origin", async () => {
    const text = BASE_CATALOG.replace(
      'origin = "https://example.com/demo.git"',
      'origin = "--upload-pack=evil"',
    );
    const exit = await runBunExit(parseCatalogText(text));
    expect(Exit.isFailure(exit)).toBeTrue();
    expect(pythonAcceptsCatalogText(text)).toBeFalse();
  });

  test("rejects duplicate license_paths entries", async () => {
    const text = BASE_CATALOG.replace(
      'license_paths = ["LICENSE"]',
      'license_paths = ["LICENSE", "LICENSE"]',
    );
    const exit = await runBunExit(parseCatalogText(text));
    expect(Exit.isFailure(exit)).toBeTrue();
    expect(pythonAcceptsCatalogText(text)).toBeFalse();
  });

  test("requires track and license_paths to be declared together", async () => {
    const trackOnly = BASE_CATALOG.replace('license_paths = ["LICENSE"]\n', "");
    const exitTrackOnly = await runBunExit(parseCatalogText(trackOnly));
    expect(Exit.isFailure(exitTrackOnly)).toBeTrue();
    expect(pythonAcceptsCatalogText(trackOnly)).toBeFalse();

    const licenseOnly = BASE_CATALOG.replace('track = "HEAD"\n', "");
    const exitLicenseOnly = await runBunExit(parseCatalogText(licenseOnly));
    expect(Exit.isFailure(exitLicenseOnly)).toBeTrue();
    expect(pythonAcceptsCatalogText(licenseOnly)).toBeFalse();
  });

  test("rejects an unsupported schema version", async () => {
    const text = BASE_CATALOG.replace("schema = 1", "schema = 2");
    const exit = await runBunExit(parseCatalogText(text));
    expect(Exit.isFailure(exit)).toBeTrue();
    expect(pythonAcceptsCatalogText(text)).toBeFalse();
  });

  test("a source stays queued when custody fields are undeclared, matching Python's 'lockable'", async () => {
    const text = `
schema = 1
[[source]]
id = "unlocked.repo"
kind = "git"
origin = "https://example.com/unlocked.git"
`;
    const catalog = await runBun(parseCatalogText(text));
    const source = catalog.sources.get("unlocked.repo")!;
    expect(isLockable(source)).toBeFalse();
    expect(pythonAcceptsCatalogText(text)).toBeTrue();
  });
});

describe("reference custody Effect v4 slice: curator serialization", () => {
  test("rejects a concurrent curator and releases the kernel lock with scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "semantic-curator-"));
    temporaryRoots.push(root);
    const referencesRoot = join(root, ".references");

    const conflict = await runBun(
      Effect.scoped(
        Effect.gen(function* () {
          yield* acquireCuratorLock(referencesRoot);
          return yield* Effect.exit(Effect.scoped(acquireCuratorLock(referencesRoot)));
        }),
      ),
    );
    expect(Exit.isFailure(conflict)).toBeTrue();

    await runBun(Effect.scoped(acquireCuratorLock(referencesRoot)));
  });

  test("fails supervised work when a ready lock holder dies", async () => {
    const root = await mkdtemp(join(tmpdir(), "semantic-curator-"));
    temporaryRoots.push(root);
    const referencesRoot = join(root, ".references");
    let completed = false;

    const exit = await runBunExit(
      Effect.scoped(
        Effect.gen(function* () {
          const curator = yield* acquireCuratorLock(referencesRoot);
          return yield* superviseCurator(
            curator,
            Effect.gen(function* () {
              yield* Effect.sync(() => process.kill(curator.holderPid, "SIGKILL"));
              yield* Effect.sleep("250 millis");
              yield* Effect.sync(() => {
                completed = true;
              });
            }),
          );
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBeTrue();
    if (!Exit.isFailure(exit)) throw new Error("expected supervised curator failure");
    const failure = Cause.findErrorOption(exit.cause);
    expect(Option.isSome(failure)).toBeTrue();
    if (!Option.isSome(failure)) throw new Error("expected typed curator failure");
    expect(failure.value).toBeInstanceOf(CuratorLockedError);
    expect(completed).toBeFalse();
  });

  test("holder loss during a real lock transaction preserves prior lock bytes", async () => {
    const fixture = await localSiblingFixture();
    const licensePaths = [
      "LICENSE",
      ...Array.from({ length: 20 }, (_, index) => `NOTICE-${index}`),
    ];
    for (const path of licensePaths.slice(1)) {
      await writeFile(join(fixture.sibling, path), `notice bytes for ${path}\n`);
    }
    runCommand(["git", "add", "."], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: add slow observation surface",
      ],
      fixture.sibling,
    );
    await mkdir(join(fixture.project, "references"));
    await writeFile(
      join(fixture.project, "references", "sources.toml"),
      fixture.sourceText.replace(
        'license_paths = ["LICENSE"]',
        `license_paths = ${JSON.stringify(licensePaths)}`,
      ),
    );
    const lockPath = join(fixture.project, "references", "sources.lock.json");
    const baseline = `{
  "generator": "baseline",
  "schema": "reference-lock-v1",
  "sources": {}
}
`;
    await writeFile(lockPath, baseline);
    const exitingHolder = [
      'const { writeFileSync } = require("node:fs");',
      'writeFileSync(process.argv[1], "semantic-curator-ready", { flag: "wx", mode: 0o600 });',
      "setTimeout(() => process.exit(23), 25);",
      "setInterval(() => {}, 1_000);",
    ].join("");
    const ExitingCuratorLayer = Layer.succeed(
      CuratorProcess,
      makeCuratorProcess(process.env, NODE_EXECUTABLE, ["-e", exitingHolder]),
    );

    const exit = await Effect.runPromiseExit(
      lockOfflineSources(fixture.project, ["demo.repo"], "semantic-systems/0.0.0").pipe(
        Effect.provide([BunFileSystem.layer, BunPath.layer, BunCrypto.layer, BunTomlParser]),
        Effect.provide([BunChildProcessLayer, ExitingCuratorLayer, GitEnvironmentLayer]),
      ),
    );
    expect(Exit.isFailure(exit)).toBeTrue();
    if (!Exit.isFailure(exit)) throw new Error("expected holder-loss transaction failure");
    const failure = Cause.findErrorOption(exit.cause);
    expect(Option.isSome(failure)).toBeTrue();
    if (!Option.isSome(failure)) throw new Error("expected typed holder-loss transaction failure");
    expect(failure.value).toBeInstanceOf(CuratorLockedError);
    expect(failure.value.message).toContain("exited unexpectedly");
    expect(await readFile(lockPath, "utf8")).toBe(baseline);
  });

  test("excludes the transitional Python curator through the same kernel lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "semantic-curator-"));
    temporaryRoots.push(root);
    const referencesRoot = join(root, ".references");
    const code = `
import sys
from pathlib import Path
from semantic_references.curator import curator_lock
from semantic_references.errors import CuratorLockedError
try:
    with curator_lock(Path(sys.argv[1])):
        print("unexpected acquisition")
except CuratorLockedError:
    print("conflict")
    raise SystemExit(75)
`;

    const result = await runBun(
      Effect.scoped(
        Effect.gen(function* () {
          yield* acquireCuratorLock(referencesRoot);
          return yield* Effect.sync(() =>
            Bun.spawnSync({
              cmd: ["python3", "-c", code, referencesRoot],
              cwd: ROOT,
              env: { ...process.env, PYTHONPATH },
              stdout: "pipe",
              stderr: "pipe",
            }),
          );
        }),
      ),
    );
    expect(result.exitCode).toBe(75);
    expect(result.stdout.toString().trim()).toBe("conflict");
  });

  test("interoperates with the persistent Python-format lock file without rewriting it", async () => {
    const root = await mkdtemp(join(tmpdir(), "semantic-curator-"));
    temporaryRoots.push(root);
    const referencesRoot = join(root, ".references");
    const lockPath = join(referencesRoot, ".curator.lock");
    await mkdir(referencesRoot);
    await writeFile(lockPath, "legacy-python-pid");

    await runBun(Effect.scoped(acquireCuratorLock(referencesRoot)));
    expect(await readFile(lockPath, "utf8")).toBe("legacy-python-pid");
  });

  test("rejects a symlinked lock without changing its target", async () => {
    const root = await mkdtemp(join(tmpdir(), "semantic-curator-"));
    temporaryRoots.push(root);
    const referencesRoot = join(root, ".references");
    const victim = join(root, "victim");
    const original = "must remain byte-identical\n";
    await mkdir(referencesRoot);
    await writeFile(victim, original);
    await symlink(victim, join(referencesRoot, ".curator.lock"));

    const exit = await runBunExit(Effect.scoped(acquireCuratorLock(referencesRoot)));
    expect(Exit.isFailure(exit)).toBeTrue();
    expect(await readFile(victim, "utf8")).toBe(original);
  });

  test("rejects a multiply-linked lock inode", async () => {
    const root = await mkdtemp(join(tmpdir(), "semantic-curator-"));
    temporaryRoots.push(root);
    const referencesRoot = join(root, ".references");
    const first = join(root, "first-link");
    await mkdir(referencesRoot);
    await writeFile(first, "shared inode");
    await link(first, join(referencesRoot, ".curator.lock"));

    const exit = await runBunExit(Effect.scoped(acquireCuratorLock(referencesRoot)));
    expect(Exit.isFailure(exit)).toBeTrue();
    expect(await readFile(first, "utf8")).toBe("shared inode");
  });

  test("publishes all selected local observations or leaves the prior lock byte-identical", async () => {
    const goodOrigin = "https://example.com/good.git";
    const badOrigin = "https://example.com/bad.git";
    const good = await localSiblingFixture(goodOrigin);
    const bad = await localSiblingFixture(badOrigin);
    runCommand(
      ["git", "remote", "set-url", "origin", "https://example.com/mismatch.git"],
      bad.sibling,
    );

    const root = await mkdtemp(join(tmpdir(), "semantic-lock-transaction-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "references"));
    await writeFile(
      join(root, "references", "sources.toml"),
      `
schema = 1

[[source]]
id = "local.good"
kind = "git"
origin = ${JSON.stringify(goodOrigin)}
local_hint = ${JSON.stringify(good.sibling)}
track = "main"
license_paths = ["LICENSE"]

[[source]]
id = "local.bad"
kind = "git"
origin = ${JSON.stringify(badOrigin)}
local_hint = ${JSON.stringify(bad.sibling)}
track = "main"
license_paths = ["LICENSE"]
`,
    );
    const lockPath = join(root, "references", "sources.lock.json");
    const baseline = `{
  "generator": "baseline",
  "schema": "reference-lock-v1",
  "sources": {}
}
`;
    await writeFile(lockPath, baseline);

    const failed = await runBun(
      lockOfflineSources(root, ["local.good", "local.bad"], "semantic-systems/0.0.0"),
    );
    expect(failed.committed).toBeFalse();
    expect([...failed.locked.keys()]).toEqual(["local.good"]);
    expect(failed.failures.map(({ id }) => id)).toEqual(["local.bad"]);
    expect(await readFile(lockPath, "utf8")).toBe(baseline);

    runCommand(["git", "remote", "set-url", "origin", badOrigin], bad.sibling);
    const committed = await runBun(
      lockOfflineSources(root, ["local.good", "local.bad"], "semantic-systems/0.0.0"),
    );
    expect(committed.committed).toBeTrue();
    expect(committed.failures).toEqual([]);
    const lock = await runBun(loadLock(lockPath));
    expect(lock.generator).toBe("semantic-systems/0.0.0");
    expect([...lock.sources.keys()].sort()).toEqual(["local.bad", "local.good"]);
  });
});

describe("reference custody Effect v4 slice: managed offline object cache", () => {
  test("locks from an existing cache when no local sibling is declared", async () => {
    const fixture = await localSiblingFixture();
    const expectedCommit = runCommand(["git", "rev-parse", "HEAD"], fixture.sibling);
    const cache = await installObjectCache(fixture.project, fixture.sibling);
    await mkdir(join(fixture.project, "references"));
    await writeFile(
      join(fixture.project, "references", "sources.toml"),
      fixture.sourceText.replace('local_hint = "../sibling"\n', ""),
    );

    const result = await runBun(
      lockOfflineSources(fixture.project, ["demo.repo"], "semantic-systems/0.0.0"),
    );
    expect(result.committed).toBeTrue();
    expect(result.failures).toEqual([]);
    expect(result.locked.get("demo.repo")?.acquisition).toBe("local-object-cache");
    expect(result.locked.get("demo.repo")?.commit).toBe(expectedCommit);
    expect(
      await runBun(inspectObjectCache(join(fixture.project, ".references"), "demo.repo")),
    ).toBe(cache);
  });

  test("prefers a usable managed cache over a newer local sibling", async () => {
    const fixture = await localSiblingFixture();
    const cachedCommit = runCommand(["git", "rev-parse", "HEAD"], fixture.sibling);
    await installObjectCache(fixture.project, fixture.sibling);
    await writeFile(join(fixture.sibling, "new.txt"), "new sibling bytes\n");
    runCommand(["git", "add", "new.txt"], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: advance sibling beyond cache",
      ],
      fixture.sibling,
    );
    const siblingCommit = runCommand(["git", "rev-parse", "HEAD"], fixture.sibling);
    expect(siblingCommit).not.toBe(cachedCommit);
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);

    const result = await runBun(
      lockOfflineSources(fixture.project, ["demo.repo"], "semantic-systems/0.0.0"),
    );
    expect(result.committed).toBeTrue();
    expect(result.locked.get("demo.repo")?.acquisition).toBe("local-object-cache");
    expect(result.locked.get("demo.repo")?.commit).toBe(cachedCommit);
  });

  test("rejects a managed cache whose raw origin differs from the catalog", async () => {
    const fixture = await localSiblingFixture();
    const cache = await installObjectCache(fixture.project, fixture.sibling);
    runCommand(
      ["git", "-C", cache, "remote", "set-url", "origin", "https://example.com/wrong.git"],
      fixture.project,
    );
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);

    const result = await runBun(
      lockOfflineSources(fixture.project, ["demo.repo"], "semantic-systems/0.0.0"),
    );
    expect(result.committed).toBeFalse();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toBeInstanceOf(AcquisitionError);
    expect(result.failures[0]?.error.message).toContain("does not match declared origin");
  });

  test("falls back to the declared sibling when the cache lacks the selector", async () => {
    const fixture = await localSiblingFixture();
    const expectedCommit = runCommand(["git", "rev-parse", "HEAD"], fixture.sibling);
    const cache = await installObjectCache(fixture.project, fixture.sibling);
    runCommand(["git", "-C", cache, "update-ref", "-d", "refs/heads/main"], fixture.project);
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);

    const result = await runBun(
      lockOfflineSources(fixture.project, ["demo.repo"], "semantic-systems/0.0.0"),
    );
    expect(result.committed).toBeTrue();
    expect(result.locked.get("demo.repo")?.acquisition).toBe("local-sibling");
    expect(result.locked.get("demo.repo")?.commit).toBe(expectedCommit);
  });

  test("does not fall back to the sibling for an operational cache failure", async () => {
    const fixture = await localSiblingFixture();
    const cache = join(fixture.project, ".references", "demo.repo", ".git-cache");
    await mkdir(cache, { recursive: true });
    runCommand(["git", "init", "--bare", "--quiet", cache], fixture.project);
    runCommand(
      ["git", "-C", cache, "remote", "add", "origin", "https://example.com/demo.git"],
      fixture.project,
    );
    await mkdir(join(cache, "refs", "heads"), { recursive: true });
    await writeFile(join(cache, "refs", "heads", "main"), `${"f".repeat(40)}\n`);
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);

    const result = await runBun(
      lockOfflineSources(fixture.project, ["demo.repo"], "semantic-systems/0.0.0"),
    );
    expect(result.committed).toBeFalse();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toBeInstanceOf(AcquisitionError);
    expect(result.failures[0]?.error.message).toContain("rev-parse --verify");
  });

  test("fails closed when no-follow inspection itself fails", async () => {
    const fixture = await localSiblingFixture();
    await installObjectCache(fixture.project, fixture.sibling);
    const referencesRoot = join(fixture.project, ".references");

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const live = yield* FileSystem.FileSystem;
        const faulty = FileSystem.make({
          ...live,
          readLink: (path) =>
            path.endsWith(".git-cache")
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    module: "FileSystem",
                    method: "readLink",
                    pathOrDescriptor: path,
                    cause: Object.assign(new Error("injected readLink failure"), {
                      code: "EACCES",
                    }),
                  }),
                )
              : live.readLink(path),
        });
        return yield* inspectObjectCache(referencesRoot, "demo.repo").pipe(
          Effect.provideService(FileSystem.FileSystem, faulty),
        );
      }).pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])),
    );
    expect(Exit.isFailure(exit)).toBeTrue();
    if (!Exit.isFailure(exit)) throw new Error("expected no-follow inspection failure");
    const failure = Cause.findErrorOption(exit.cause);
    expect(Option.isSome(failure)).toBeTrue();
    if (!Option.isSome(failure)) throw new Error("expected typed no-follow inspection failure");
    expect(failure.value).toBeInstanceOf(AcquisitionError);
    expect(failure.value.message).toContain("without following links");
  });

  for (const symlinkPosition of ["source-root", "object-cache"] as const) {
    test(`rejects a symlinked managed ${symlinkPosition}`, async () => {
      const fixture = await localSiblingFixture();
      const referencesRoot = join(fixture.project, ".references");
      const external = join(fixture.project, `external-${symlinkPosition}`);
      await mkdir(referencesRoot);
      await mkdir(external);
      if (symlinkPosition === "source-root") {
        await symlink(external, join(referencesRoot, "demo.repo"), "dir");
      } else {
        await mkdir(join(referencesRoot, "demo.repo"));
        await symlink(
          join(fixture.sibling, ".git"),
          join(referencesRoot, "demo.repo", ".git-cache"),
          "dir",
        );
      }
      await mkdir(join(fixture.project, "references"));
      await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);

      const result = await runBun(
        lockOfflineSources(fixture.project, ["demo.repo"], "semantic-systems/0.0.0"),
      );
      expect(result.committed).toBeFalse();
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.error).toBeInstanceOf(AcquisitionError);
      expect(result.failures[0]?.error.message).toContain("symlink");
      expect(await readdir(external)).toEqual([]);
    });
  }

  test("rejects a non-directory cache instead of silently using the sibling", async () => {
    const fixture = await localSiblingFixture();
    const sourceRoot = join(fixture.project, ".references", "demo.repo");
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(join(sourceRoot, ".git-cache"), "not a repository directory\n");
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);

    const result = await runBun(
      lockOfflineSources(fixture.project, ["demo.repo"], "semantic-systems/0.0.0"),
    );
    expect(result.committed).toBeFalse();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toBeInstanceOf(AcquisitionError);
    expect(result.failures[0]?.error.message).toContain("not a directory");
  });

  test("a promisor cache missing a license blob cannot invoke its transport", async () => {
    const fixture = await localSiblingFixture();
    runCommand(["git", "config", "uploadpack.allowFilter", "true"], fixture.sibling);
    const sourceRoot = join(fixture.project, ".references", "demo.repo");
    const cache = join(sourceRoot, ".git-cache");
    await mkdir(sourceRoot, { recursive: true });
    runCommand(
      [
        "git",
        "clone",
        "--quiet",
        "--filter=blob:none",
        "--no-checkout",
        `file://${fixture.sibling}`,
        cache,
      ],
      fixture.project,
    );
    expect(
      runCommand(
        ["git", "-C", cache, "config", "--get", "remote.origin.partialclonefilter"],
        fixture.project,
      ),
    ).toBe("blob:none");

    const marker = join(fixture.project, "transport-invoked");
    const bin = join(fixture.project, "bin");
    const helper = join(bin, "git-remote-custodyprobe");
    await mkdir(bin);
    await writeFile(
      helper,
      `#!${NODE_EXECUTABLE}\n` +
        `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "invoked\\n");\n` +
        "process.exit(1);\n",
    );
    await chmod(helper, 0o755);
    runCommand(["git", "-C", cache, "remote", "rename", "origin", "promisor"], fixture.project);
    runCommand(
      ["git", "-C", cache, "update-ref", "-d", "refs/remotes/promisor/main"],
      fixture.project,
    );
    runCommand(
      ["git", "-C", cache, "symbolic-ref", "-d", "refs/remotes/promisor/HEAD"],
      fixture.project,
    );
    runCommand(
      [
        "git",
        "-C",
        cache,
        "remote",
        "set-url",
        "promisor",
        `custodyprobe::file://${fixture.sibling}`,
      ],
      fixture.project,
    );
    runCommand(
      ["git", "-C", cache, "remote", "add", "origin", "https://example.com/demo.git"],
      fixture.project,
    );
    const licenseOid = runCommand(
      ["git", "-C", cache, "ls-tree", "HEAD", "--", "LICENSE"],
      fixture.project,
    ).split(/\s+/)[2];
    if (licenseOid === undefined) throw new Error("partial cache did not retain the license tree");
    const probeEnvironment: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    };
    delete probeEnvironment.GIT_NO_LAZY_FETCH;
    const missingCheck = Bun.spawnSync({
      cmd: ["git", "-C", cache, "cat-file", "-e", `${licenseOid}^{blob}`],
      cwd: fixture.project,
      env: { ...probeEnvironment, GIT_NO_LAZY_FETCH: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(missingCheck.exitCode).not.toBe(0);
    expect(await Bun.file(marker).exists()).toBeFalse();
    const positiveControl = Bun.spawnSync({
      cmd: ["git", "-C", cache, "cat-file", "blob", licenseOid],
      cwd: fixture.project,
      env: probeEnvironment,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(positiveControl.exitCode).not.toBe(0);
    expect(await Bun.file(marker).exists()).toBeTrue();
    await rm(marker);
    const cacheBefore = await directoryByteSnapshot(cache);
    await mkdir(join(fixture.project, "references"));
    await writeFile(
      join(fixture.project, "references", "sources.toml"),
      fixture.sourceText.replace('local_hint = "../sibling"\n', ""),
    );
    const ProbeGitEnvironmentLayer = Layer.succeed(
      GitEnvironment,
      makeGitEnvironment({
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      }),
    );

    const result = await Effect.runPromise(
      lockOfflineSources(fixture.project, ["demo.repo"], "semantic-systems/0.0.0").pipe(
        Effect.provide([BunFileSystem.layer, BunPath.layer, BunCrypto.layer, BunTomlParser]),
        Effect.provide([BunChildProcessLayer, CuratorProcessLayer, ProbeGitEnvironmentLayer]),
      ),
    );
    expect(result.committed).toBeFalse();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toBeInstanceOf(AcquisitionError);
    expect(result.failures[0]?.error.message).toContain('invalid ls-tree size for "LICENSE"');
    expect(await Bun.file(marker).exists()).toBeFalse();
    expect(await directoryByteSnapshot(cache)).toBe(cacheBefore);
  });
});

describe("reference custody Effect v4 slice: offline Git observation", () => {
  test("Git receives an allowlisted, default-deny environment", () => {
    const ambient = {
      PATH: "/test/bin",
      HOME: "/test/home",
      GIT_CONFIG_COUNT: "99",
      GIT_CONFIG_KEY_0: "credential.helper",
      GIT_CONFIG_VALUE_0: "evil",
      HTTPS_PROXY: "https://proxy.example",
      LD_PRELOAD: "/evil.so",
    };
    const offline = makeGitEnvironment(ambient).forMode(false);
    expect(offline.PATH).toBe("/test/bin");
    expect(offline.HOME).toBe("/test/home");
    expect(offline.GIT_TERMINAL_PROMPT).toBe("0");
    expect(offline.GIT_CONFIG_GLOBAL).toBe("/dev/null");
    expect(offline.GIT_NO_REPLACE_OBJECTS).toBe("1");
    expect(offline.GIT_NO_LAZY_FETCH).toBe("1");
    expect(offline).not.toHaveProperty("GIT_CONFIG_COUNT");
    expect(offline).not.toHaveProperty("GIT_CONFIG_KEY_0");
    expect(offline).not.toHaveProperty("GIT_CONFIG_VALUE_0");
    expect(offline).not.toHaveProperty("HTTPS_PROXY");
    expect(offline).not.toHaveProperty("LD_PRELOAD");

    const online = makeGitEnvironment(ambient).forMode(true);
    expect(online.HTTPS_PROXY).toBe("https://proxy.example");
    expect(online).not.toHaveProperty("GIT_CONFIG_COUNT");
    expect(online).not.toHaveProperty("LD_PRELOAD");
  });

  test("offline locations reject transports and helper syntax", () => {
    expect(
      Exit.isSuccess(Effect.runSyncExit(requireAllowedLocation("../sibling", false))),
    ).toBeTrue();
    expect(
      Exit.isFailure(
        Effect.runSyncExit(requireAllowedLocation("https://example.com/demo.git", false)),
      ),
    ).toBeTrue();
    expect(
      Exit.isFailure(Effect.runSyncExit(requireAllowedLocation("git@example.com:demo.git", false))),
    ).toBeTrue();
    expect(
      Exit.isFailure(Effect.runSyncExit(requireAllowedLocation("ext::helper payload", false))),
    ).toBeTrue();
    expect(
      Exit.isSuccess(
        Effect.runSyncExit(requireAllowedLocation("https://example.com/demo.git", true)),
      ),
    ).toBeTrue();
  });

  test("Git itself denies HTTPS when transport is not explicitly enabled", async () => {
    const result = await runBun(
      runGit(["ls-remote", "https://127.0.0.1:9/must-not-open.git"], { check: false }),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("transport 'https' not allowed");
  });

  test("locks only committed objects from an origin-matched local sibling", async () => {
    const fixture = await localSiblingFixture();
    const catalog = await runBun(parseCatalogText(fixture.sourceText));
    const source = catalog.sources.get("demo.repo")!;
    const entry = await runBun(lockFromLocalSibling(source, fixture.project, null));
    const expectedCommit = runCommand(["git", "rev-parse", "HEAD"], fixture.sibling);
    const expectedTree = runCommand(["git", "rev-parse", "HEAD^{tree}"], fixture.sibling);
    const expectedLicenseHash = createHash("sha256").update(fixture.license).digest("hex");

    expect(entry.origin).toBe("https://example.com/demo.git");
    expect(entry.track).toBe("main");
    expect(entry.resolvedRef).toBe("refs/heads/main");
    expect(entry.objectFormat).toBe("sha1");
    expect(entry.commit).toBe(expectedCommit);
    expect(entry.tree).toBe(expectedTree);
    expect(entry.acquisition).toBe("local-sibling");
    expect(entry.originVerified).toBeFalse();
    expect(entry.licenses.get("LICENSE")).toEqual({
      mode: "100644",
      size: BigInt(Buffer.byteLength(fixture.license)),
      sha256: expectedLicenseHash,
    });

    await writeFile(join(fixture.sibling, "LICENSE"), "uncommitted hostile replacement\n");
    const repeated = await runBun(lockFromLocalSibling(source, fixture.project, entry));
    expect(repeated).toBe(entry);
    expect(repeated.licenses.get("LICENSE")?.sha256).toBe(expectedLicenseHash);
  });

  test("rejects a local sibling whose configured origin is outside catalog custody", async () => {
    const fixture = await localSiblingFixture();
    runCommand(
      ["git", "remote", "set-url", "origin", "https://example.com/untrusted.git"],
      fixture.sibling,
    );
    const catalog = await runBun(parseCatalogText(fixture.sourceText));
    const source = catalog.sources.get("demo.repo")!;
    const exit = await runBunExit(lockFromLocalSibling(source, fixture.project, null));
    expect(Exit.isFailure(exit)).toBeTrue();
  });

  test("origin identity reads the raw URL rather than an insteadOf rewrite", async () => {
    const fixture = await localSiblingFixture();
    const declared = "https://example.com/demo.git";
    const untrusted = "https://example.com/untrusted.git";
    runCommand(["git", "remote", "set-url", "origin", untrusted], fixture.sibling);
    runCommand(["git", "config", `url.${declared}.insteadOf`, untrusted], fixture.sibling);
    expect(runCommand(["git", "remote", "get-url", "origin"], fixture.sibling)).toBe(declared);

    const catalog = await runBun(parseCatalogText(fixture.sourceText));
    const source = catalog.sources.get("demo.repo")!;
    const exit = await runBunExit(lockFromLocalSibling(source, fixture.project, null));
    expect(Exit.isFailure(exit)).toBeTrue();
  });

  test("origin identity rejects ambiguous multiple raw URLs", async () => {
    const fixture = await localSiblingFixture();
    runCommand(
      ["git", "config", "--add", "remote.origin.url", "https://example.com/demo.git"],
      fixture.sibling,
    );
    const catalog = await runBun(parseCatalogText(fixture.sourceText));
    const source = catalog.sources.get("demo.repo")!;
    const exit = await runBunExit(lockFromLocalSibling(source, fixture.project, null));
    expect(Exit.isFailure(exit)).toBeTrue();
  });

  test("replacement refs cannot substitute another tree for the recorded commit", async () => {
    const fixture = await localSiblingFixture();
    const originalCommit = runCommand(["git", "rev-parse", "HEAD"], fixture.sibling);
    const originalTree = runCommand(["git", "rev-parse", "HEAD^{tree}"], fixture.sibling);
    const originalLicenseHash = createHash("sha256").update(fixture.license).digest("hex");

    await writeFile(join(fixture.sibling, "LICENSE"), "replacement license bytes\n");
    runCommand(["git", "add", "LICENSE"], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: replacement object",
      ],
      fixture.sibling,
    );
    const replacementCommit = runCommand(["git", "rev-parse", "HEAD"], fixture.sibling);
    runCommand(["git", "replace", originalCommit, replacementCommit], fixture.sibling);
    runCommand(["git", "update-ref", "refs/heads/main", originalCommit], fixture.sibling);

    const catalog = await runBun(parseCatalogText(fixture.sourceText));
    const source = catalog.sources.get("demo.repo")!;
    const entry = await runBun(lockFromLocalSibling(source, fixture.project, null));
    expect(entry.commit).toBe(originalCommit);
    expect(entry.tree).toBe(originalTree);
    expect(entry.licenses.get("LICENSE")?.sha256).toBe(originalLicenseHash);
  });

  test("a repository-local insteadOf rule cannot rewrite a ref observation", async () => {
    const target = await localSiblingFixture();
    const redirected = await localSiblingFixture("https://example.com/redirected.git");
    await writeFile(join(redirected.sibling, "LICENSE"), "different redirect target\n");
    runCommand(["git", "add", "LICENSE"], redirected.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: distinguish redirect target",
      ],
      redirected.sibling,
    );
    const targetCommit = runCommand(["git", "rev-parse", "HEAD"], target.sibling);
    const redirectedCommit = runCommand(["git", "rev-parse", "HEAD"], redirected.sibling);
    expect(redirectedCommit).not.toBe(targetCommit);

    const hostileRoot = await mkdtemp(join(tmpdir(), "semantic-git-config-"));
    temporaryRoots.push(hostileRoot);
    runCommand(["git", "init"], hostileRoot);
    runCommand(
      ["git", "config", `url.${redirected.sibling}.insteadOf`, target.sibling],
      hostileRoot,
    );
    const hostileCwd = join(hostileRoot, "nested");
    await mkdir(hostileCwd);

    const inherited = await runBun(
      runGit(["ls-remote", target.sibling, "main"], { cwd: hostileCwd }),
    );
    expect(new TextDecoder().decode(inherited.stdout)).toContain(redirectedCommit);

    const sealed = await runBun(
      runGit(["ls-remote", target.sibling, "main"], {
        cwd: hostileCwd,
        repositoryCeiling: hostileRoot,
      }),
    );
    expect(new TextDecoder().decode(sealed.stdout)).toContain(targetCommit);
    expect(new TextDecoder().decode(sealed.stdout)).not.toContain(redirectedCommit);
  });

  test("NUL-delimited tree observation preserves quoted and control-bearing paths", async () => {
    const fixture = await localSiblingFixture();
    const unusualPath = "licenses/Licensé\ncontinued";
    await mkdir(join(fixture.sibling, "licenses"));
    runCommand(["git", "mv", "--", "LICENSE", unusualPath], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: unusual license path",
      ],
      fixture.sibling,
    );
    runCommand(["git", "config", "core.quotePath", "true"], fixture.sibling);
    const sourceText = fixture.sourceText.replace(
      'license_paths = ["LICENSE"]',
      `license_paths = [${JSON.stringify(unusualPath)}]`,
    );
    const catalog = await runBun(parseCatalogText(sourceText));
    const source = catalog.sources.get("demo.repo")!;
    const entry = await runBun(lockFromLocalSibling(source, fixture.project, null));
    expect(entry.licenses.get(unusualPath)?.sha256).toBe(
      createHash("sha256").update(fixture.license).digest("hex"),
    );
  });
});

describe("reference custody Effect v4 slice: lock parsing", () => {
  test("a missing lock file loads as an empty lock, matching Python", async () => {
    const root = await temporaryProject(BASE_CATALOG);
    const lock = await runBun(loadLock(join(root, "references", "sources.lock.json")));
    expect(lock.generator).toBe("");
    expect(lock.sources.size).toBe(0);
  });

  test("rejects a duplicate JSON key inside a lock entry, matching Python", () => {
    const text = `{
  "schema": "reference-lock-v1",
  "generator": "t",
  "sources": {
    "demo.repo": {
      "origin": "https://example.com/demo.git",
      "origin": "https://example.com/other.git",
      "track": "HEAD",
      "resolved_ref": "refs/heads/main",
      "object_format": "sha1",
      "commit": "${FAKE_COMMIT}",
      "tree": "${FAKE_TREE}",
      "catalog_digest": "${FAKE_SHA256}",
      "retrieved_at": "2026-07-30T00:00:00Z",
      "acquisition": "local-sibling",
      "origin_verified": false,
      "licenses": { "LICENSE": { "mode": "100644", "size": 1, "sha256": "${FAKE_SHA256}" } }
    }
  }
}`;
    const exit = Effect.runSyncExit(parseLockText(text));
    expect(Exit.isFailure(exit)).toBeTrue();
    expect(pythonAcceptsLockText(text)).toBeFalse();
  });

  test("rejects a duplicate JSON key at the top level, matching Python", () => {
    const text = `{"schema":"reference-lock-v1","schema":"reference-lock-v1","generator":"t","sources":{}}`;
    const exit = Effect.runSyncExit(parseLockText(text));
    expect(Exit.isFailure(exit)).toBeTrue();
    expect(pythonAcceptsLockText(text)).toBeFalse();
  });

  test("rejects an abbreviated commit id, matching Python", () => {
    const good = buildLockJson(FAKE_SHA256);
    const bad = good.replace(FAKE_COMMIT, FAKE_COMMIT.slice(0, 7));
    expect(Exit.isFailure(Effect.runSyncExit(parseLockText(bad)))).toBeTrue();
    expect(pythonAcceptsLockText(bad)).toBeFalse();
    // sanity: the unmodified fixture (aside from the missing "sources" top-key wrapper) still parses
    expect(Exit.isSuccess(Effect.runSyncExit(parseLockText(good)))).toBeTrue();
  });

  test("rejects an unknown schema value", () => {
    const text = buildLockJson(FAKE_SHA256).replace('"reference-lock-v1"', '"reference-lock-v2"');
    expect(Exit.isFailure(Effect.runSyncExit(parseLockText(text)))).toBeTrue();
    expect(pythonAcceptsLockText(text)).toBeFalse();
  });

  test("rejects a lock entry missing a required field", () => {
    const withoutTree = JSON.parse(buildLockJson(FAKE_SHA256));
    delete withoutTree.sources["demo.repo"].tree;
    const text = JSON.stringify(withoutTree);
    expect(Exit.isFailure(Effect.runSyncExit(parseLockText(text)))).toBeTrue();
    expect(pythonAcceptsLockText(text)).toBeFalse();
  });

  test("rejects a lock entry with an unexpected extra field", () => {
    const withExtra = JSON.parse(buildLockJson(FAKE_SHA256));
    withExtra.sources["demo.repo"].unexpected = true;
    const text = JSON.stringify(withExtra);
    expect(Exit.isFailure(Effect.runSyncExit(parseLockText(text)))).toBeTrue();
    expect(pythonAcceptsLockText(text)).toBeFalse();
  });

  test("rejects a symlink-shaped license mode", () => {
    const text = buildLockJson(FAKE_SHA256, {
      licenses: { LICENSE: { mode: "120000", size: 1, sha256: FAKE_SHA256 } },
    });
    expect(Exit.isFailure(Effect.runSyncExit(parseLockText(text)))).toBeTrue();
    expect(pythonAcceptsLockText(text)).toBeFalse();
  });

  test("rejects an acquisition/origin_verified pairing that isn't possible", () => {
    const text = buildLockJson(FAKE_SHA256, { acquisition: "remote", origin_verified: false });
    expect(Exit.isFailure(Effect.runSyncExit(parseLockText(text)))).toBeTrue();
    expect(pythonAcceptsLockText(text)).toBeFalse();
  });

  test("rejects an unsafe license path key", () => {
    const parsed = JSON.parse(buildLockJson(FAKE_SHA256));
    parsed.sources["demo.repo"].licenses = {
      "../LICENSE": { mode: "100644", size: 1, sha256: FAKE_SHA256 },
    };
    const text = JSON.stringify(parsed);
    expect(Exit.isFailure(Effect.runSyncExit(parseLockText(text)))).toBeTrue();
    expect(pythonAcceptsLockText(text)).toBeFalse();
  });

  test("serializes canonical lock bytes identically to Python", () => {
    const document = JSON.parse(buildLockJson(FAKE_SHA256));
    document.generator = "semantic-references/\u{1f600}";
    const text = JSON.stringify(document);
    const lock = Effect.runSync(parseLockText(text));
    expect(new TextDecoder().decode(serializeLock(lock))).toBe(pythonSerializeLock(text));
  });

  test("preserves arbitrary-size JSON integers and rejects integer-valued floats like Python", () => {
    const hugeInteger = buildLockJson(FAKE_SHA256).replace(
      '"size": 42',
      '"size": 9007199254740993',
    );
    const lock = Effect.runSync(parseLockText(hugeInteger));
    expect(new TextDecoder().decode(serializeLock(lock))).toBe(pythonSerializeLock(hugeInteger));

    const exponentFloat = buildLockJson(FAKE_SHA256).replace('"size": 42', '"size": 4.2e1');
    expect(Exit.isFailure(Effect.runSyncExit(parseLockText(exponentFloat)))).toBeTrue();
    expect(pythonAcceptsLockText(exponentFloat)).toBeFalse();
  });

  test("atomically writes a canonical lock and makes byte-identical writes true no-ops", async () => {
    const root = await temporaryProject(BASE_CATALOG);
    const lockPath = join(root, "references", "sources.lock.json");
    const text = buildLockJson(FAKE_SHA256);
    const lock = Effect.runSync(parseLockText(text));

    await runBun(writeLock(lockPath, lock));
    const firstBytes = await readFile(lockPath);
    const firstStat = await stat(lockPath);
    expect(firstBytes.toString()).toBe(pythonSerializeLock(text));

    await runBun(writeLock(lockPath, lock));
    const secondStat = await stat(lockPath);
    expect(secondStat.ino).toBe(firstStat.ino);
    expect((await readFile(lockPath)).toString()).toBe(firstBytes.toString());
    expect(
      (await readdir(join(root, "references"))).some((name) => name.startsWith(".sources.lock.")),
    ).toBeFalse();
  });

  test("a failed atomic rename preserves the prior lock and cleans temporary files", async () => {
    const root = await temporaryProject(BASE_CATALOG);
    const lockPath = join(root, "references", "sources.lock.json");
    const prior = "prior valid artifact remains visible\n";
    await writeFile(lockPath, prior);
    const lock = Effect.runSync(parseLockText(buildLockJson(FAKE_SHA256)));

    const injected = Effect.gen(function* () {
      const live = yield* FileSystem.FileSystem;
      const failing = FileSystem.FileSystem.of({
        ...live,
        rename: () => Effect.die("injected rename failure"),
      });
      return yield* writeLock(lockPath, lock).pipe(
        Effect.provideService(FileSystem.FileSystem, failing),
      );
    });
    const exit = await runBunExit(injected);
    expect(Exit.isFailure(exit)).toBeTrue();
    expect((await readFile(lockPath)).toString()).toBe(prior);
    expect(
      (await readdir(join(root, "references"))).some((name) => name.startsWith(".sources.lock.")),
    ).toBeFalse();
  });
});

describe("reference custody Effect v4 slice: lock-only status", () => {
  test("queued_unlocked for a lockable source with no lock entry", () => {
    const source = {
      id: "demo.repo",
      kind: "git",
      origin: "https://example.com/demo.git",
      localHint: null,
      originAliases: [],
      track: "HEAD",
      licensePaths: ["LICENSE"],
      classes: [],
      questions: [],
      raw: {},
    };
    const report = computeLockOnlyStatus(source, FAKE_SHA256, {
      generator: "",
      sources: new Map(),
    });
    expect(report.state).toBe("queued_unlocked");
    expect(report.reasons).toEqual([]);
    expect(isStrictOk(report)).toBeFalse();
  });

  test("queued_unlocked reports the undeclared-custody reason for a non-lockable source", () => {
    const source = {
      id: "demo.repo",
      kind: "git",
      origin: "https://example.com/demo.git",
      localHint: null,
      originAliases: [],
      track: null,
      licensePaths: [],
      classes: [],
      questions: [],
      raw: {},
    };
    const report = computeLockOnlyStatus(source, FAKE_SHA256, {
      generator: "",
      sources: new Map(),
    });
    expect(report.state).toBe("queued_unlocked");
    expect(report.reasons).toEqual(["not lockable: 'track'/'license_paths' undeclared"]);
  });

  test("catalogBindingReasons is empty exactly when origin/track/ref/licenses/digest all agree", () => {
    const source = {
      id: "demo.repo",
      kind: "git",
      origin: "https://example.com/demo.git",
      localHint: null,
      originAliases: [],
      track: "HEAD",
      licensePaths: ["LICENSE"],
      classes: [],
      questions: [],
      raw: {},
    };
    const entry = {
      origin: "https://example.com/demo.git",
      track: "HEAD",
      resolvedRef: "refs/heads/main",
      objectFormat: "sha1",
      commit: FAKE_COMMIT,
      tree: FAKE_TREE,
      catalogDigest: FAKE_SHA256,
      retrievedAt: "2026-07-30T00:00:00Z",
      acquisition: "local-sibling",
      originVerified: false,
      licenses: new Map([["LICENSE", { mode: "100644", size: 1, sha256: FAKE_SHA256 }]]),
    };
    expect(catalogBindingReasons(source, FAKE_SHA256, entry)).toEqual([]);
    expect(catalogBindingReasons(source, "different-digest", entry)).not.toEqual([]);
  });

  test("orphanedLockReport reports drifted with a stable reason", () => {
    const entry = {
      origin: "https://example.com/demo.git",
      track: "HEAD",
      resolvedRef: "refs/heads/main",
      objectFormat: "sha1",
      commit: FAKE_COMMIT,
      tree: FAKE_TREE,
      catalogDigest: FAKE_SHA256,
      retrievedAt: "2026-07-30T00:00:00Z",
      acquisition: "local-sibling",
      originVerified: false,
      licenses: new Map(),
    };
    const report = orphanedLockReport("gone.repo", entry);
    expect(report.state).toBe("drifted");
    expect(report.reasons).toEqual(["lock entry has no current catalog source"]);
    expect(isStrictOk(report)).toBeFalse();
  });
});

describe("reference custody Effect v4 slice: offline materialization", () => {
  test("only exact structured LFS and gitlink findings permit visible publication", () => {
    expect(
      publicationBlockingReasons({
        headMismatch: null,
        reasons: [
          'tracked path "submodule" is an unmaterialized submodule gitlink',
          'tracked path "payload" is a committed Git LFS pointer',
          'tracked path "payload" is a Git LFS pointer, not hydrated content',
          'license path "LICENSE" is a Git LFS pointer, not real content',
        ],
      }),
    ).toEqual([]);
    expect(
      publicationBlockingReasons({
        headMismatch: null,
        reasons: ['tracked path "Git LFS pointer" cannot be opened no-follow'],
      }),
    ).toEqual(['tracked path "Git LFS pointer" cannot be opened no-follow']);
  });

  test("Node materializes locked commit A after the sibling advances to B and Bun reuses it", async () => {
    const { fixture } = await lockedFixture(false);
    const lock = await runBun(loadLock(join(fixture.project, "references", "sources.lock.json")));
    const lockedCommit = lock.sources.get("demo.repo")?.commit;
    if (lockedCommit === undefined) throw new Error("expected a locked commit");

    await writeFile(join(fixture.sibling, "advanced.txt"), "branch moved after locking\n");
    runCommand(["git", "add", "advanced.txt"], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: advance after lock",
      ],
      fixture.sibling,
    );
    expect(runCommand(["git", "rev-parse", "HEAD"], fixture.sibling)).not.toBe(lockedCommit);

    const args = ["--root", fixture.project, "materialize", "demo.repo", "--offline"];
    const node = runNodeCli(args);
    expect(node.exitCode, `${node.stdout}\n${node.stderr}`).toBe(0);
    const checkout = join(fixture.project, ".references", "demo.repo", "checkout");
    expect(runCommand(["git", "rev-parse", "HEAD"], checkout)).toBe(lockedCommit);
    expect(runCommand(["git", "branch", "--show-current"], checkout)).toBe("");

    const bun = runTsCli(args);
    expect(bun.exitCode, `${bun.stdout}\n${bun.stderr}`).toBe(0);
    expect(bun.stdout).toBe(node.stdout);
    expect(runCommand(["git", "rev-parse", "HEAD"], checkout)).toBe(lockedCommit);

    const status = runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]);
    expect(status.exitCode).toBe(0);
    expect(JSON.parse(status.stdout)[0].state).toBe("materialized_with_visible_assumption");
  });

  test("catalog drift is rejected without changing any custody bytes", async () => {
    const { fixture } = await lockedFixture(false);
    const referencesRoot = join(fixture.project, ".references");
    const before = await directoryByteSnapshot(referencesRoot);
    await writeFile(
      join(fixture.project, "references", "sources.toml"),
      fixture.sourceText.replace(
        'classes = ["testing"]',
        'classes = ["testing"]\nquestions = ["drift after lock"]',
      ),
    );

    const result = runTsCli(["--root", fixture.project, "materialize", "demo.repo", "--offline"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("catalog");
    expect(await directoryByteSnapshot(referencesRoot)).toBe(before);
    expect(await Bun.file(join(referencesRoot, "demo.repo")).exists()).toBeFalse();
  });

  test("a mismatched existing checkout is refused and remains byte-identical", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    const originalHead = runCommand(["git", "rev-parse", "HEAD"], checkout);
    const before = await directoryByteSnapshot(checkout);

    await writeFile(join(fixture.sibling, "new-lock.txt"), "new locked commit\n");
    runCommand(["git", "add", "new-lock.txt"], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: advance lock target",
      ],
      fixture.sibling,
    );
    expect(runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]).exitCode).toBe(
      0,
    );

    const result = runTsCli(["--root", fixture.project, "materialize", "demo.repo", "--offline"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("refusing to overwrite or delete");
    expect(runCommand(["git", "rev-parse", "HEAD"], checkout)).toBe(originalHead);
    expect(await directoryByteSnapshot(checkout)).toBe(before);
  });

  test("a missing lock entry fails before creating the custody root", async () => {
    const project = await temporaryProject(BASE_CATALOG);
    const referencesRoot = join(project, ".references");
    expect(await Bun.file(referencesRoot).exists()).toBeFalse();

    const result = runTsCli(["--root", project, "materialize", "demo.repo", "--offline"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("no lock entry");
    expect(await Bun.file(referencesRoot).exists()).toBeFalse();
  });

  test("an unavailable locked commit leaves no source directory or temporary checkout", async () => {
    const { fixture } = await lockedFixture(false);
    const lockPath = join(fixture.project, "references", "sources.lock.json");
    const lock = await runBun(loadLock(lockPath));
    const entry = lock.sources.get("demo.repo");
    if (entry === undefined) throw new Error("expected a locked entry");
    const sources = new Map(lock.sources);
    sources.set("demo.repo", { ...entry, commit: "f".repeat(entry.commit.length) });
    await runBun(writeLock(lockPath, { generator: lock.generator, sources }));
    const referencesRoot = join(fixture.project, ".references");
    const before = await directoryByteSnapshot(referencesRoot);

    const result = runTsCli(["--root", fixture.project, "materialize", "demo.repo", "--offline"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unavailable offline");
    expect(await directoryByteSnapshot(referencesRoot)).toBe(before);
    expect(await Bun.file(join(referencesRoot, "demo.repo")).exists()).toBeFalse();
  });

  test("a managed cache can materialize without a declared local sibling", async () => {
    const fixture = await localSiblingFixture();
    const sourceText = fixture.sourceText.replace('local_hint = "../sibling"\n', "");
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), sourceText);
    await installObjectCache(fixture.project, fixture.sibling);
    expect(runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]).exitCode).toBe(
      0,
    );

    const args = ["--root", fixture.project, "materialize", "demo.repo", "--offline"];
    const result = runTsCli(args);
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
    const checkout = join(fixture.project, ".references", "demo.repo", "checkout");
    expect(runCommand(["git", "branch", "--show-current"], checkout)).toBe("");
    expect(runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]).exitCode).toBe(0);
  });

  test("an operational cache commit-probe failure does not fall back to the sibling", async () => {
    const { fixture } = await lockedFixture(false);
    const cache = await installObjectCache(fixture.project, fixture.sibling);
    const lock = await runBun(loadLock(join(fixture.project, "references", "sources.lock.json")));
    const commit = lock.sources.get("demo.repo")?.commit;
    if (commit === undefined) throw new Error("expected a locked commit");
    const commitPath = join(cache, "objects", commit.slice(0, 2), commit.slice(2));
    await rm(commitPath);
    await writeFile(commitPath, "not a Git object");

    const result = runTsCli(["--root", fixture.project, "materialize", "demo.repo", "--offline"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("cannot probe exact commit object");
    expect(
      await Bun.file(join(fixture.project, ".references", "demo.repo", "checkout")).exists(),
    ).toBeFalse();
  });

  test("a nested object-cache symlink is rejected before local cloning", async () => {
    const fixture = await localSiblingFixture();
    const sourceText = fixture.sourceText.replace('local_hint = "../sibling"\n', "");
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), sourceText);
    const cache = await installObjectCache(fixture.project, fixture.sibling);
    expect(runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]).exitCode).toBe(
      0,
    );
    const blob = runCommand(["git", "-C", cache, "rev-parse", "HEAD:LICENSE"], fixture.project);
    const objectPath = join(cache, "objects", blob.slice(0, 2), blob.slice(2));
    const external = join(resolve(cache, "..", "..", ".."), "external-cache-object");
    await rename(objectPath, external);
    await symlink(external, objectPath);
    expect(runCommand(["git", "-C", cache, "cat-file", "blob", blob], fixture.project)).toBe(
      fixture.license.trim(),
    );

    const result = runTsCli(["--root", fixture.project, "materialize", "demo.repo", "--offline"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unsafe symlink");
    expect(
      await Bun.file(join(fixture.project, ".references", "demo.repo", "checkout")).exists(),
    ).toBeFalse();
  });

  test("offline materialization cannot invoke a cache promisor transport", async () => {
    const fixture = await localSiblingFixture();
    const sourceText = fixture.sourceText.replace('local_hint = "../sibling"\n', "");
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), sourceText);
    const cache = await installObjectCache(fixture.project, fixture.sibling);
    expect(runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]).exitCode).toBe(
      0,
    );

    const blob = runCommand(["git", "-C", cache, "rev-parse", "HEAD:LICENSE"], fixture.project);
    const objectPath = join(cache, "objects", blob.slice(0, 2), blob.slice(2));
    const bin = join(fixture.project, "bin");
    const marker = join(fixture.project, "promisor-invoked");
    const helper = join(bin, "git-remote-custodyprobe");
    await mkdir(bin);
    await writeFile(
      helper,
      `#!${NODE_EXECUTABLE}\n` +
        `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "invoked\\n");\n` +
        "process.exit(1);\n",
    );
    await chmod(helper, 0o755);
    runCommand(
      ["git", "-C", cache, "config", "core.repositoryformatversion", "1"],
      fixture.project,
    );
    runCommand(
      ["git", "-C", cache, "config", "extensions.partialclone", "promisor"],
      fixture.project,
    );
    runCommand(
      ["git", "-C", cache, "remote", "add", "promisor", "custodyprobe::missing"],
      fixture.project,
    );
    runCommand(["git", "-C", cache, "config", "remote.promisor.promisor", "true"], fixture.project);
    runCommand(
      ["git", "-C", cache, "config", "remote.promisor.partialclonefilter", "blob:none"],
      fixture.project,
    );
    await rm(objectPath);

    const probeEnvironment: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    };
    delete probeEnvironment.GIT_NO_LAZY_FETCH;
    const positive = Bun.spawnSync({
      cmd: ["git", "-C", cache, "cat-file", "blob", blob],
      cwd: fixture.project,
      env: probeEnvironment,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(positive.exitCode).not.toBe(0);
    expect(await Bun.file(marker).exists()).toBeTrue();
    await rm(marker);

    const result = runTsCli(
      ["--root", fixture.project, "materialize", "demo.repo", "--offline"],
      probeEnvironment,
    );
    expect(result.exitCode).toBe(1);
    expect(await Bun.file(marker).exists()).toBeFalse();
    const sourceRoot = join(fixture.project, ".references", "demo.repo");
    expect(await Bun.file(join(sourceRoot, "checkout")).exists()).toBeFalse();
    expect(
      (await readdir(sourceRoot)).some((name) => name.startsWith(".materialize-")),
    ).toBeFalse();
  });

  test("a stable symlinked source root is rejected without touching its target", async () => {
    const { fixture } = await lockedFixture(false);
    const referencesRoot = join(fixture.project, ".references");
    const sourceRoot = join(referencesRoot, "demo.repo");
    const external = join(resolve(referencesRoot, "..", ".."), "external-source-root");
    await mkdir(external);
    await symlink(external, sourceRoot);
    const before = await directoryByteSnapshot(external);

    const result = runTsCli(["--root", fixture.project, "materialize", "demo.repo", "--offline"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("symlink");
    expect(await directoryByteSnapshot(external)).toBe(before);
  });

  test("an exact checkout with a visible LFS indirection is published but not strict", async () => {
    const fixture = await localSiblingFixture();
    await writeFile(
      join(fixture.sibling, "payload.bin"),
      `version https://git-lfs.github.com/spec/v1\noid sha256:${"0".repeat(64)}\nsize 4096\n`,
    );
    runCommand(["git", "add", "payload.bin"], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: add visible materialization assumption",
      ],
      fixture.sibling,
    );
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);
    expect(runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]).exitCode).toBe(
      0,
    );

    const materialize = runTsCli([
      "--root",
      fixture.project,
      "materialize",
      "demo.repo",
      "--offline",
    ]);
    expect(materialize.exitCode, `${materialize.stdout}\n${materialize.stderr}`).toBe(0);
    const status = runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]);
    expect(status.exitCode).toBe(1);
    const [report] = JSON.parse(status.stdout);
    expect(report.state).toBe("unverifiable");
    expect(report.reasons.join(" ")).toContain("Git LFS pointer");
  });
});

describe("reference custody Effect v4 slice: full checkout status", () => {
  test("a detached exact checkout is byte-identical to Python under Bun and Node", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    const indexPath = join(checkout, ".git", "index");
    const indexBytes = await readFile(indexPath);
    const indexMtime = (await stat(indexPath, { bigint: true })).mtimeNs;
    const args = ["--root", fixture.project, "status", "demo.repo", "--json"];

    const bun = runTsCli(args);
    const node = runNodeCli(args);
    const python = runPythonCli(args);
    expect(bun.exitCode).toBe(0);
    expect(node.exitCode).toBe(bun.exitCode);
    expect(python.exitCode).toBe(bun.exitCode);
    expect(JSON.parse(bun.stdout)).toEqual(JSON.parse(python.stdout));
    expect(JSON.parse(node.stdout)).toEqual(JSON.parse(bun.stdout));
    expect(JSON.parse(bun.stdout)[0].state).toBe("materialized_with_visible_assumption");
    expect(await readFile(indexPath)).toEqual(indexBytes);
    expect((await stat(indexPath, { bigint: true })).mtimeNs).toBe(indexMtime);
  });

  test("full status reports an absent checkout as locked_unmaterialized", async () => {
    const { fixture } = await lockedFixture(false);
    const args = ["--root", fixture.project, "status", "demo.repo", "--json"];
    const bun = runTsCli(args);
    const python = runPythonCli(args);
    expect(bun.exitCode).toBe(1);
    expect(bun.exitCode).toBe(python.exitCode);
    expect(JSON.parse(bun.stdout)).toEqual(JSON.parse(python.stdout));
    expect(JSON.parse(bun.stdout)[0].state).toBe("locked_unmaterialized");
  });

  test("an attached checkout is unverifiable", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    runCommand(["git", "switch", "--quiet", "main"], checkout);
    const args = ["--root", fixture.project, "status", "demo.repo", "--json"];
    const bun = runTsCli(args);
    const python = runPythonCli(args);
    expect(bun.exitCode).toBe(1);
    expect(JSON.parse(bun.stdout)).toEqual(JSON.parse(python.stdout));
    expect(JSON.parse(bun.stdout)[0]).toMatchObject({
      state: "unverifiable",
      reasons: ["checkout HEAD is not detached"],
    });
  });

  test("a checkout at another commit is drifted", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    await writeFile(join(checkout, "extra.txt"), "checkout drift\n");
    runCommand(["git", "add", "extra.txt"], checkout);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: drift checkout",
      ],
      checkout,
    );
    const args = ["--root", fixture.project, "status", "demo.repo", "--json"];
    const bun = runTsCli(args);
    const python = runPythonCli(args);
    expect(bun.exitCode).toBe(1);
    expect(JSON.parse(bun.stdout)).toEqual(JSON.parse(python.stdout));
    expect(JSON.parse(bun.stdout)[0].state).toBe("drifted");
  });

  test("untracked dirt is unverifiable even when repository config hides it", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    runCommand(["git", "config", "status.showUntrackedFiles", "no"], checkout);
    await writeFile(join(checkout, "untracked.txt"), "hidden dirt\n");
    const args = ["--root", fixture.project, "status", "demo.repo", "--json"];
    const bun = runTsCli(args);
    const python = runPythonCli(args);
    expect(bun.exitCode).toBe(1);
    expect(JSON.parse(bun.stdout)).toEqual(JSON.parse(python.stdout));
    expect(JSON.parse(bun.stdout)[0]).toMatchObject({
      state: "unverifiable",
      reasons: ["checkout has uncommitted changes"],
    });
  });

  test("status never executes a repository-configured clean filter", async () => {
    const fixture = await localSiblingFixture();
    await writeFile(join(fixture.sibling, ".gitattributes"), "LICENSE filter=custody\n");
    runCommand(["git", "add", ".gitattributes"], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: declare clean filter",
      ],
      fixture.sibling,
    );
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);
    expect(runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]).exitCode).toBe(
      0,
    );
    const checkout = await installCheckout(fixture.project, fixture.sibling);
    const marker = join(fixture.project, "filter-invoked");
    const helper = join(fixture.project, "clean-filter");
    await writeFile(helper, `#!/bin/sh\ntouch ${JSON.stringify(marker)}\ncat\n`);
    await chmod(helper, 0o755);
    runCommand(["git", "config", "filter.custody.clean", helper], checkout);
    runCommand(["git", "config", "filter.custody.required", "true"], checkout);
    await writeFile(join(checkout, "LICENSE"), `${"x".repeat(fixture.license.length - 1)}\n`);

    expect(runCommand(["git", "status", "--porcelain=v1"], checkout)).not.toBe("");
    expect(await Bun.file(marker).exists()).toBeTrue();
    await rm(marker);

    const result = runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)[0].state).toBe("unverifiable");
    expect(await Bun.file(marker).exists()).toBeFalse();
  });

  test("status rejects an included clean filter before Git can execute it", async () => {
    const fixture = await localSiblingFixture();
    await writeFile(join(fixture.sibling, ".gitattributes"), "LICENSE filter=custody\n");
    runCommand(["git", "add", ".gitattributes"], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: declare included clean filter",
      ],
      fixture.sibling,
    );
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);
    expect(runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]).exitCode).toBe(
      0,
    );
    const checkout = await installCheckout(fixture.project, fixture.sibling);
    const marker = join(fixture.project, "included-filter-invoked");
    const helper = join(fixture.project, "included-clean-filter");
    const includedConfig = join(fixture.project, "included.gitconfig");
    await writeFile(helper, `#!/bin/sh\ntouch ${JSON.stringify(marker)}\ncat\n`);
    await chmod(helper, 0o755);
    runCommand(
      ["git", "config", "--file", includedConfig, "filter.custody.clean", helper],
      checkout,
    );
    runCommand(
      ["git", "config", "--file", includedConfig, "filter.custody.required", "true"],
      checkout,
    );
    runCommand(["git", "config", "include.path", includedConfig], checkout);
    await writeFile(join(checkout, "LICENSE"), `${"y".repeat(fixture.license.length - 1)}\n`);

    expect(runCommand(["git", "status", "--porcelain=v1"], checkout)).not.toBe("");
    expect(await Bun.file(marker).exists()).toBeTrue();
    await rm(marker);

    const result = runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]);
    expect(result.exitCode).toBe(1);
    const [report] = JSON.parse(result.stdout);
    expect(report.state).toBe("unverifiable");
    expect(report.reasons.join(" ")).toContain("external include");
    expect(await Bun.file(marker).exists()).toBeFalse();
  });

  test("assume-unchanged cannot hide license tampering", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    runCommand(["git", "update-index", "--assume-unchanged", "LICENSE"], checkout);
    await writeFile(join(checkout, "LICENSE"), "tampered license\n");
    expect(runCommand(["git", "status", "--porcelain=v1"], checkout)).toBe("");
    const args = ["--root", fixture.project, "status", "demo.repo", "--json"];
    const bun = runTsCli(args);
    const python = runPythonCli(args);
    const [bunReport] = JSON.parse(bun.stdout);
    const [pythonReport] = JSON.parse(python.stdout);
    expect(bun.exitCode).toBe(1);
    expect(bun.exitCode).toBe(python.exitCode);
    expect({ ...bunReport, reasons: bunReport.reasons.length }).toEqual({
      ...pythonReport,
      reasons: pythonReport.reasons.length,
    });
    expect(bunReport.state).toBe("unverifiable");
    expect(bunReport.reasons.join(" ")).toContain("assume-unchanged");
  });

  for (const hiddenState of ["skip-worktree", "sparse"] as const) {
    test(`${hiddenState} checkout suppression is unverifiable`, async () => {
      const { fixture, checkout } = await lockedFixture();
      if (checkout === null) throw new Error("expected a materialized checkout");
      if (hiddenState === "skip-worktree") {
        runCommand(["git", "update-index", "--skip-worktree", "LICENSE"], checkout);
      } else {
        runCommand(["git", "config", "core.sparseCheckout", "true"], checkout);
      }
      const args = ["--root", fixture.project, "status", "demo.repo", "--json"];
      const bun = runTsCli(args);
      const python = runPythonCli(args);
      const [bunReport] = JSON.parse(bun.stdout);
      const [pythonReport] = JSON.parse(python.stdout);
      expect(bun.exitCode).toBe(1);
      expect(bun.exitCode).toBe(python.exitCode);
      expect({ ...bunReport, reasons: bunReport.reasons.length }).toEqual({
        ...pythonReport,
        reasons: pythonReport.reasons.length,
      });
      expect(bunReport.state).toBe("unverifiable");
      expect(bunReport.reasons.join(" ")).toContain(hiddenState);
    });
  }

  test("remote-verified custody reports materialized_verified", async () => {
    const { fixture } = await lockedFixture();
    const lockPath = join(fixture.project, "references", "sources.lock.json");
    const lock = await runBun(loadLock(lockPath));
    const entry = lock.sources.get("demo.repo");
    if (entry === undefined) throw new Error("fixture lock entry is absent");
    const sources = new Map(lock.sources);
    sources.set("demo.repo", {
      ...entry,
      acquisition: "remote",
      originVerified: true,
    });
    await runBun(writeLock(lockPath, { generator: lock.generator, sources }));
    const args = ["--root", fixture.project, "status", "demo.repo", "--json"];
    const bun = runTsCli(args);
    const python = runPythonCli(args);
    expect(bun.exitCode).toBe(0);
    expect(JSON.parse(bun.stdout)).toEqual(JSON.parse(python.stdout));
    expect(JSON.parse(bun.stdout)[0].state).toBe("materialized_verified");
  });

  test("locked tree and license observations are independently rebound to the checkout", async () => {
    const { fixture } = await lockedFixture();
    const lockPath = join(fixture.project, "references", "sources.lock.json");
    const lock = await runBun(loadLock(lockPath));
    const entry = lock.sources.get("demo.repo");
    const license = entry?.licenses.get("LICENSE");
    if (entry === undefined || license === undefined) {
      throw new Error("fixture lock observation is absent");
    }
    const sources = new Map(lock.sources);
    sources.set("demo.repo", {
      ...entry,
      tree: "b".repeat(entry.tree.length),
      licenses: new Map([["LICENSE", { ...license, sha256: "c".repeat(64) }]]),
    });
    await runBun(writeLock(lockPath, { generator: lock.generator, sources }));
    const args = ["--root", fixture.project, "status", "demo.repo", "--json"];
    const bun = runTsCli(args);
    const python = runPythonCli(args);
    const [bunReport] = JSON.parse(bun.stdout);
    const [pythonReport] = JSON.parse(python.stdout);
    expect(bun.exitCode).toBe(1);
    expect(bun.exitCode).toBe(python.exitCode);
    expect({ ...bunReport, reasons: bunReport.reasons.length }).toEqual({
      ...pythonReport,
      reasons: pythonReport.reasons.length,
    });
    expect(bunReport.state).toBe("unverifiable");
    expect(bunReport.reasons.join(" ")).toContain("checkout tree");
    expect(bunReport.reasons.join(" ")).toContain("committed bytes changed");
    expect(bunReport.reasons.join(" ")).toContain("working-tree bytes changed");
  });

  test("missing promisor objects fail closed without invoking a transport helper", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    const blob = runCommand(["git", "rev-parse", "HEAD:LICENSE"], checkout);
    const objectPath = join(checkout, ".git", "objects", blob.slice(0, 2), blob.slice(2));
    expect((await stat(objectPath)).isFile()).toBeTrue();

    const probeRoot = join(resolve(checkout, "..", "..", ".."), "transport-probe");
    const bin = join(probeRoot, "bin");
    const marker = join(probeRoot, "invoked");
    const helper = join(bin, "git-remote-custodyprobe");
    await mkdir(bin, { recursive: true });
    await writeFile(
      helper,
      `#!/bin/sh\ntouch ${JSON.stringify(marker)}\necho invoked >&2\nexit 1\n`,
    );
    await chmod(helper, 0o755);
    runCommand(["git", "remote", "set-url", "origin", "custodyprobe::missing"], checkout);
    runCommand(["git", "config", "remote.origin.promisor", "true"], checkout);
    runCommand(["git", "config", "remote.origin.partialclonefilter", "blob:none"], checkout);
    await rm(objectPath);

    const probeEnvironment: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    };
    delete probeEnvironment.GIT_NO_LAZY_FETCH;
    const positiveCanary = Bun.spawnSync({
      cmd: ["git", "-C", checkout, "cat-file", "blob", blob],
      env: probeEnvironment,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(positiveCanary.exitCode).not.toBe(0);
    expect(await readFile(marker, "utf8")).toBeDefined();
    await rm(marker);

    const result = runTsCli(
      ["--root", fixture.project, "status", "demo.repo", "--json"],
      probeEnvironment,
    );
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)[0].state).toBe("unverifiable");
    expect(await Bun.file(marker).exists()).toBeFalse();
  });

  test("a missing non-license blob fails closed without invoking a transport helper", async () => {
    const fixture = await localSiblingFixture();
    await writeFile(join(fixture.sibling, "payload.bin"), "ordinary committed payload\n");
    runCommand(["git", "add", "payload.bin"], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: add non-license payload",
      ],
      fixture.sibling,
    );
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);
    expect(runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]).exitCode).toBe(
      0,
    );
    const checkout = await installCheckout(fixture.project, fixture.sibling);
    const blob = runCommand(["git", "rev-parse", "HEAD:payload.bin"], checkout);
    const objectPath = join(checkout, ".git", "objects", blob.slice(0, 2), blob.slice(2));
    expect((await stat(objectPath)).isFile()).toBeTrue();

    const probeRoot = join(resolve(checkout, "..", "..", ".."), "payload-transport-probe");
    const bin = join(probeRoot, "bin");
    const marker = join(probeRoot, "invoked");
    const helper = join(bin, "git-remote-custodyprobe");
    await mkdir(bin, { recursive: true });
    await writeFile(
      helper,
      `#!/bin/sh\ntouch ${JSON.stringify(marker)}\necho invoked >&2\nexit 1\n`,
    );
    await chmod(helper, 0o755);
    runCommand(["git", "remote", "set-url", "origin", "custodyprobe::missing"], checkout);
    runCommand(["git", "config", "remote.origin.promisor", "true"], checkout);
    runCommand(["git", "config", "remote.origin.partialclonefilter", "blob:none"], checkout);
    await rm(objectPath);

    const probeEnvironment: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    };
    delete probeEnvironment.GIT_NO_LAZY_FETCH;
    const positiveCanary = Bun.spawnSync({
      cmd: ["git", "-C", checkout, "cat-file", "blob", blob],
      env: probeEnvironment,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(positiveCanary.exitCode).not.toBe(0);
    expect(await readFile(marker, "utf8")).toBeDefined();
    await rm(marker);

    const result = runTsCli(
      ["--root", fixture.project, "status", "demo.repo", "--json"],
      probeEnvironment,
    );
    expect(result.exitCode).toBe(1);
    const [report] = JSON.parse(result.stdout);
    expect(report.state).toBe("unverifiable");
    expect(report.reasons.join(" ")).toContain("payload.bin");
    expect(report.reasons.join(" ")).toContain("unavailable offline");
    expect(await Bun.file(marker).exists()).toBeFalse();
  });

  test("a symlinked managed checkout fails closed", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    const external = join(resolve(checkout, "..", "..", ".."), "external-checkout");
    await rm(external, { force: true, recursive: true });
    await mkdir(external);
    await rm(checkout, { recursive: true });
    await symlink(external, checkout);
    const result = runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]);
    expect(result.exitCode).toBe(1);
    const [report] = JSON.parse(result.stdout);
    expect(report.state).toBe("unverifiable");
    expect(report.reasons.join(" ")).toContain("symlink");
  });

  for (const administrationEscape of [
    "gitfile",
    "git-directory-symlink",
    "objects-symlink",
    "commondir",
    "config-worktree",
    "alternates",
  ] as const) {
    test(`checkout administration escape ${administrationEscape} is unverifiable`, async () => {
      const { fixture, checkout } = await lockedFixture();
      if (checkout === null) throw new Error("expected a materialized checkout");
      const fixtureRoot = resolve(checkout, "..", "..", "..");
      const gitDirectory = join(checkout, ".git");

      if (administrationEscape === "gitfile" || administrationEscape === "git-directory-symlink") {
        const external = join(fixtureRoot, `external-${administrationEscape}`);
        await rename(gitDirectory, external);
        if (administrationEscape === "gitfile") {
          await writeFile(gitDirectory, `gitdir: ${external}\n`);
        } else {
          await symlink(external, gitDirectory);
        }
      } else if (administrationEscape === "objects-symlink") {
        const objects = join(gitDirectory, "objects");
        const external = join(fixtureRoot, "external-objects");
        await rename(objects, external);
        await symlink(external, objects);
      } else if (administrationEscape === "commondir") {
        await writeFile(join(gitDirectory, "commondir"), "../external-common\n");
      } else if (administrationEscape === "config-worktree") {
        await writeFile(join(gitDirectory, "config.worktree"), "[core]\nworktree = /tmp\n");
      } else {
        await mkdir(join(gitDirectory, "objects", "info"), { recursive: true });
        await writeFile(join(gitDirectory, "objects", "info", "alternates"), "/tmp/objects\n");
      }

      const result = runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]);
      expect(result.exitCode).toBe(1);
      const [report] = JSON.parse(result.stdout);
      expect(report.state).toBe("unverifiable");
      expect(report.reasons.join(" ")).toMatch(
        /Git administration|Git object directory|redirection|symlink/,
      );
    });
  }

  test("a loose-object symlink cannot redirect Git outside managed custody", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    const blob = runCommand(["git", "rev-parse", "HEAD:LICENSE"], checkout);
    const objectPath = join(checkout, ".git", "objects", blob.slice(0, 2), blob.slice(2));
    const external = join(resolve(checkout, "..", "..", ".."), "external-loose-object");
    await rename(objectPath, external);
    await symlink(external, objectPath);

    expect(runCommand(["git", "cat-file", "blob", blob], checkout)).toBe(fixture.license.trim());
    const result = runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]);
    expect(result.exitCode).toBe(1);
    const [report] = JSON.parse(result.stdout);
    expect(report.state).toBe("unverifiable");
    expect(report.reasons.join(" ")).toContain("unsafe symlink");
  });

  test("a packed-object symlink cannot redirect Git outside managed custody", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    runCommand(["git", "gc", "--quiet"], checkout);
    const packDirectory = join(checkout, ".git", "objects", "pack");
    const packName = (await readdir(packDirectory)).find((name) => name.endsWith(".pack"));
    if (packName === undefined) throw new Error("expected a packed fixture");
    const packPath = join(packDirectory, packName);
    const external = join(resolve(checkout, "..", "..", ".."), "external-pack");
    await rename(packPath, external);
    await symlink(external, packPath);

    expect(runCommand(["git", "show", "HEAD:LICENSE"], checkout)).toBe(fixture.license.trim());
    const result = runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]);
    expect(result.exitCode).toBe(1);
    const [report] = JSON.parse(result.stdout);
    expect(report.state).toBe("unverifiable");
    expect(report.reasons.join(" ")).toContain("unsafe symlink");
  });

  test("a split-index symlink cannot redirect Git outside managed custody", async () => {
    const { fixture, checkout } = await lockedFixture();
    if (checkout === null) throw new Error("expected a materialized checkout");
    runCommand(["git", "update-index", "--split-index"], checkout);
    const gitDirectory = join(checkout, ".git");
    const sharedName = (await readdir(gitDirectory)).find((name) =>
      name.startsWith("sharedindex."),
    );
    if (sharedName === undefined) throw new Error("expected a split index fixture");
    const sharedPath = join(gitDirectory, sharedName);
    const external = join(resolve(checkout, "..", "..", ".."), "external-shared-index");
    await rename(sharedPath, external);
    await symlink(external, sharedPath);

    expect(runCommand(["git", "status", "--porcelain=v1"], checkout)).toBe("");
    const result = runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]);
    expect(result.exitCode).toBe(1);
    const [report] = JSON.parse(result.stdout);
    expect(report.state).toBe("unverifiable");
    expect(report.reasons.join(" ")).toContain("unsafe symlink");
  });

  test("a large blob whose valid payload does not match its OID fails integrity custody", async () => {
    const fixture = await localSiblingFixture();
    await writeFile(join(fixture.sibling, "large.bin"), "a".repeat(4096));
    runCommand(["git", "add", "large.bin"], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: add large payload",
      ],
      fixture.sibling,
    );
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);
    expect(runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]).exitCode).toBe(
      0,
    );
    const checkout = await installCheckout(fixture.project, fixture.sibling);
    expect(runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]).exitCode).toBe(0);

    const expectedOid = runCommand(["git", "rev-parse", "HEAD:large.bin"], checkout);
    const replacement = join(fixture.project, "same-size-replacement.bin");
    await writeFile(replacement, "b".repeat(4096));
    const replacementOid = runCommand(["git", "hash-object", "-w", replacement], checkout);
    expect(replacementOid).not.toBe(expectedOid);
    const objects = join(checkout, ".git", "objects");
    const expectedPath = join(objects, expectedOid.slice(0, 2), expectedOid.slice(2));
    const replacementPath = join(objects, replacementOid.slice(0, 2), replacementOid.slice(2));
    const replacementBytes = await readFile(replacementPath);
    await rm(expectedPath);
    await writeFile(expectedPath, replacementBytes);

    expect(runCommand(["git", "cat-file", "blob", expectedOid], checkout)).toBe("b".repeat(4096));
    const result = runTsCli(["--root", fixture.project, "status", "demo.repo", "--json"]);
    expect(result.exitCode).toBe(1);
    const [report] = JSON.parse(result.stdout);
    expect(report.state).toBe("unverifiable");
    expect(report.reasons.join(" ")).toContain("integrity failed");
  });

  test("LFS-like prose is ordinary content unless it is a complete pointer", async () => {
    const fixture = await localSiblingFixture();
    await writeFile(
      join(fixture.sibling, "specification.txt"),
      "version https://git-lfs.github.com/specification/v1\nordinary documentation\n",
    );
    await writeFile(
      join(fixture.sibling, "incomplete-pointer.txt"),
      "version https://git-lfs.github.com/spec/v1\nthis is not an oid line\n",
    );
    runCommand(["git", "add", "specification.txt", "incomplete-pointer.txt"], fixture.sibling);
    runCommand(
      [
        "git",
        "-c",
        "user.name=Semantic Custody Test",
        "-c",
        "user.email=custody@example.invalid",
        "commit",
        "-m",
        "test: add LFS-like prose",
      ],
      fixture.sibling,
    );
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);
    expect(runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]).exitCode).toBe(
      0,
    );
    await installCheckout(fixture.project, fixture.sibling);

    const args = ["--root", fixture.project, "status", "demo.repo", "--json"];
    const bun = runTsCli(args);
    const node = runNodeCli(args);
    expect(bun.exitCode, `${bun.stdout}\n${bun.stderr}`).toBe(0);
    expect(node.exitCode, `${node.stdout}\n${node.stderr}`).toBe(0);
    expect(JSON.parse(node.stdout)).toEqual(JSON.parse(bun.stdout));
    expect(JSON.parse(bun.stdout)[0].state).toBe("materialized_with_visible_assumption");
  });

  for (const incompleteKind of ["gitlink", "lfs-pointer"] as const) {
    test(`a non-license ${incompleteKind} remains visibly unmaterialized`, async () => {
      const fixture = await localSiblingFixture();
      if (incompleteKind === "gitlink") {
        const commit = runCommand(["git", "rev-parse", "HEAD"], fixture.sibling);
        runCommand(
          ["git", "update-index", "--add", "--cacheinfo", "160000", commit, "nested"],
          fixture.sibling,
        );
      } else {
        await writeFile(
          join(fixture.sibling, "payload.bin"),
          `version https://git-lfs.github.com/spec/v1\noid sha256:${"0".repeat(64)}\nsize 4096\n`,
        );
        runCommand(["git", "add", "payload.bin"], fixture.sibling);
      }
      runCommand(
        [
          "git",
          "-c",
          "user.name=Semantic Custody Test",
          "-c",
          "user.email=custody@example.invalid",
          "commit",
          "-m",
          `test: add ${incompleteKind}`,
        ],
        fixture.sibling,
      );
      await mkdir(join(fixture.project, "references"));
      await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);
      const locked = runTsCli(["--root", fixture.project, "lock", "demo.repo", "--offline"]);
      expect(locked.exitCode).toBe(0);
      await installCheckout(fixture.project, fixture.sibling);
      const args = ["--root", fixture.project, "status", "demo.repo", "--json"];
      const bun = runTsCli(args);
      const python = runPythonCli(args);
      expect(bun.exitCode).toBe(1);
      expect(bun.exitCode).toBe(python.exitCode);
      const [report] = JSON.parse(bun.stdout);
      expect(report.state).toBe("unverifiable");
      expect(report.reasons.join(" ")).toContain(
        incompleteKind === "gitlink" ? "submodule gitlink" : "Git LFS pointer",
      );
    });
  }
});

describe("reference custody Effect v4 slice: CLI parity with Python", () => {
  test("offline local-sibling lock publishes under Node and is byte-stable under Bun", async () => {
    const fixture = await localSiblingFixture();
    await mkdir(join(fixture.project, "references"));
    await writeFile(join(fixture.project, "references", "sources.toml"), fixture.sourceText);
    const expectedCommit = runCommand(["git", "rev-parse", "HEAD"], fixture.sibling);
    const lockPath = join(fixture.project, "references", "sources.lock.json");
    const args = ["--root", fixture.project, "lock", "demo.repo", "--offline"];

    const node = runNodeCli(args);
    if (node.exitCode !== 0) {
      throw new Error(`Node custody CLI failed (${node.exitCode}): ${node.stderr}`);
    }
    expect(node.exitCode).toBe(0);
    expect(node.stderr).toBe("");
    expect(node.stdout.trim()).toBe(`demo.repo: locked at ${expectedCommit}`);
    const firstBytes = await readFile(lockPath);
    const firstStat = await stat(lockPath);

    const bun = runTsCli(args);
    expect(bun.exitCode).toBe(0);
    expect(bun.stderr).toBe("");
    expect(bun.stdout).toBe(node.stdout);
    expect(await readFile(lockPath)).toEqual(firstBytes);
    expect((await stat(lockPath)).ino).toBe(firstStat.ino);

    const lock = await runBun(loadLock(lockPath));
    expect(lock.generator).toBe("semantic-systems/0.0.0");
    expect(lock.sources.get("demo.repo")?.commit).toBe(expectedCommit);
  });

  test("offline managed-cache lock publishes under Node and is byte-stable under Bun", async () => {
    const fixture = await localSiblingFixture();
    const expectedCommit = runCommand(["git", "rev-parse", "HEAD"], fixture.sibling);
    await installObjectCache(fixture.project, fixture.sibling);
    await mkdir(join(fixture.project, "references"));
    await writeFile(
      join(fixture.project, "references", "sources.toml"),
      fixture.sourceText.replace('local_hint = "../sibling"\n', ""),
    );
    const lockPath = join(fixture.project, "references", "sources.lock.json");
    const args = ["--root", fixture.project, "lock", "demo.repo", "--offline"];

    const node = runNodeCli(args);
    if (node.exitCode !== 0) {
      throw new Error(`Node managed-cache CLI failed (${node.exitCode}): ${node.stderr}`);
    }
    expect(node.stderr).toBe("");
    expect(node.stdout.trim()).toBe(`demo.repo: locked at ${expectedCommit}`);
    const nodeLock = await runBun(loadLock(lockPath));
    const nodeEntry = nodeLock.sources.get("demo.repo");
    if (nodeEntry === undefined) throw new Error("Node did not publish the cache lock entry");
    const distinctiveTimestamp = "2001-02-03T04:05:06Z";
    const sources = new Map(nodeLock.sources);
    sources.set("demo.repo", { ...nodeEntry, retrievedAt: distinctiveTimestamp });
    await runBun(writeLock(lockPath, { generator: nodeLock.generator, sources }));
    const firstBytes = await readFile(lockPath);
    const firstStat = await stat(lockPath);

    const bun = runTsCli(args);
    expect(bun.exitCode).toBe(0);
    expect(bun.stderr).toBe("");
    expect(bun.stdout).toBe(node.stdout);
    expect(await readFile(lockPath)).toEqual(firstBytes);
    expect((await stat(lockPath)).ino).toBe(firstStat.ino);
    const lock = await runBun(loadLock(lockPath));
    expect(lock.sources.get("demo.repo")?.acquisition).toBe("local-object-cache");
    expect(lock.sources.get("demo.repo")?.retrievedAt).toBe(distinctiveTimestamp);
  });

  test("catalog-check on the real repository catalog is byte-identical to Python", () => {
    const ts = runTsCli(["catalog-check"]);
    const py = runPythonCli(["catalog-check"]);
    expect(ts.exitCode).toBe(py.exitCode);
    expect(ts.stdout).toBe(py.stdout);
  });

  test("status --all --lock-only --json on the real repository catalog matches Python exactly", () => {
    const ts = runTsCli(["status", "--all", "--lock-only", "--json"]);
    const py = runPythonCli(["status", "--all", "--lock-only", "--json"]);
    expect(ts.exitCode).toBe(py.exitCode);
    expect(JSON.parse(ts.stdout)).toEqual(JSON.parse(py.stdout));
  });

  test("a locked, undrifted source reports locked_unmaterialized identically under --root", async () => {
    const root = await temporaryProject(BASE_CATALOG);
    const digest = pythonCanonicalDigest(root, "demo.repo");
    await writeFile(join(root, "references", "sources.lock.json"), buildLockJson(digest));

    const ts = runTsCli(["--root", root, "status", "demo.repo", "--lock-only", "--json"]);
    const py = runPythonCli(["--root", root, "status", "demo.repo", "--lock-only", "--json"]);
    expect(ts.exitCode).toBe(0);
    expect(ts.exitCode).toBe(py.exitCode);
    expect(JSON.parse(ts.stdout)).toEqual(JSON.parse(py.stdout));
    expect(JSON.parse(ts.stdout)[0].state).toBe("locked_unmaterialized");
  });

  test("catalog drift after locking (origin change) is detected identically", async () => {
    const root = await temporaryProject(BASE_CATALOG);
    const digest = pythonCanonicalDigest(root, "demo.repo");
    await writeFile(join(root, "references", "sources.lock.json"), buildLockJson(digest));
    await writeFile(
      join(root, "references", "sources.toml"),
      BASE_CATALOG.replace(
        'origin = "https://example.com/demo.git"',
        'origin = "https://example.com/drifted.git"',
      ),
    );

    const ts = runTsCli(["--root", root, "status", "demo.repo", "--lock-only", "--json"]);
    const py = runPythonCli(["--root", root, "status", "demo.repo", "--lock-only", "--json"]);
    expect(ts.exitCode).toBe(1);
    expect(ts.exitCode).toBe(py.exitCode);
    // Reason *text* legitimately differs (Python's `!r` single-quote repr vs.
    // JSON double-quote interpolation); structural fields, including the
    // reason *count*, must still match exactly.
    const [tsReport] = JSON.parse(ts.stdout);
    const [pyReport] = JSON.parse(py.stdout);
    expect({ ...tsReport, reasons: tsReport.reasons.length }).toEqual({
      ...pyReport,
      reasons: pyReport.reasons.length,
    });
    expect(tsReport.state).toBe("drifted");
  });

  test("catalog drift from an unrelated raw field change (digest-only) is detected identically", async () => {
    const root = await temporaryProject(BASE_CATALOG);
    const digest = pythonCanonicalDigest(root, "demo.repo");
    await writeFile(join(root, "references", "sources.lock.json"), buildLockJson(digest));
    await writeFile(
      join(root, "references", "sources.toml"),
      BASE_CATALOG.replace('classes = ["testing"]', 'classes = ["testing", "extra"]'),
    );

    const ts = runTsCli(["--root", root, "status", "demo.repo", "--lock-only", "--json"]);
    const py = runPythonCli(["--root", root, "status", "demo.repo", "--lock-only", "--json"]);
    expect(ts.exitCode).toBe(py.exitCode);
    expect(JSON.parse(ts.stdout)).toEqual(JSON.parse(py.stdout));
    expect(JSON.parse(ts.stdout)[0].state).toBe("drifted");
    expect(JSON.parse(ts.stdout)[0].reasons).toEqual([
      "catalog record no longer matches the digest recorded at lock time",
    ]);
  });

  test("an orphaned lock entry (removed from the catalog) is reported identically under --all", async () => {
    const root = await temporaryProject(BASE_CATALOG);
    const digest = pythonCanonicalDigest(root, "demo.repo");
    await writeFile(join(root, "references", "sources.lock.json"), buildLockJson(digest));
    await writeFile(
      join(root, "references", "sources.toml"),
      `
schema = 1
[[source]]
id = "other.repo"
kind = "git"
origin = "https://example.com/other.git"
`,
    );

    const ts = runTsCli(["--root", root, "status", "--all", "--lock-only", "--json"]);
    const py = runPythonCli(["--root", root, "status", "--all", "--lock-only", "--json"]);
    expect(ts.exitCode).toBe(py.exitCode);
    expect(JSON.parse(ts.stdout)).toEqual(JSON.parse(py.stdout));
  });

  test("an unknown source id is a usage error under both CLIs", async () => {
    const root = await temporaryProject(BASE_CATALOG);
    const ts = runTsCli(["--root", root, "status", "nonexistent", "--lock-only"]);
    const py = runPythonCli(["--root", root, "status", "nonexistent", "--lock-only"]);
    expect(ts.exitCode).toBe(2);
    expect(ts.exitCode).toBe(py.exitCode);
  });

  test("a lock file with a duplicate JSON key is a usage error under both CLIs", async () => {
    const root = await temporaryProject(BASE_CATALOG);
    const digest = pythonCanonicalDigest(root, "demo.repo");
    const good = JSON.parse(buildLockJson(digest));
    const raw = JSON.stringify(good).replace(
      '"origin":"https://example.com/demo.git"',
      '"origin":"https://example.com/demo.git","origin":"https://example.com/demo.git"',
    );
    await writeFile(join(root, "references", "sources.lock.json"), raw);

    const ts = runTsCli(["--root", root, "status", "demo.repo", "--lock-only"]);
    const py = runPythonCli(["--root", root, "status", "demo.repo", "--lock-only"]);
    expect(ts.exitCode).toBe(2);
    expect(ts.exitCode).toBe(py.exitCode);
  });
});
