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
import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect, Exit, type Crypto, type FileSystem, type Path } from "effect";
import {
  catalogDigest,
  isConcreteGitRef,
  isGitSafeValue,
  isLockable,
  isValidLicensePath,
  isValidSourceId,
  parseCatalogText,
} from "../src/references/catalog.ts";
import { loadLock, parseLockText } from "../src/references/lockfile.ts";
import {
  catalogBindingReasons,
  computeLockOnlyStatus,
  isStrictOk,
  orphanedLockReport,
} from "../src/references/status.ts";
import { layer as BunTomlParser } from "../src/references/toml-bun.ts";
import type { TomlParser } from "../src/references/toml.ts";

type TestCapabilities = FileSystem.FileSystem | Path.Path | Crypto.Crypto | TomlParser;

const ROOT = resolve(import.meta.dir, "..");
const PYTHONPATH = join(ROOT, "src");
const MAIN_BUN = join(ROOT, "src", "references", "main-bun.ts");
const temporaryRoots: Array<string> = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })));
});

const runBun = <A, E>(effect: Effect.Effect<A, E, TestCapabilities>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide([BunFileSystem.layer, BunPath.layer, BunCrypto.layer, BunTomlParser]),
    ),
  );

const runBunExit = <A, E>(effect: Effect.Effect<A, E, TestCapabilities>) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide([BunFileSystem.layer, BunPath.layer, BunCrypto.layer, BunTomlParser]),
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

const runTsCli = (args: ReadonlyArray<string>): ProcResult => {
  const result = Bun.spawnSync({
    cmd: ["bun", MAIN_BUN, ...args],
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

describe("reference custody Effect v4 slice: CLI parity with Python", () => {
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
