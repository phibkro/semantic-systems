import { lstat, readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { Console, Effect } from "effect";
import { isPublicVersion, verifyCandidate } from "../src/snapshot.ts";

const EXACT_COMMIT = /^[0-9a-f]{40}$/;
const MAX_FILES = 64;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const ALLOWED_DIRECTORIES = new Set(["assets", "data"]);
const ALLOWED_FILES = [
  /^index\.html$/,
  /^icon\.svg$/,
  /^manifest\.webmanifest$/,
  /^sw\.js$/,
  /^workbox-[0-9a-f]+\.js$/,
  /^assets\/index-[A-Za-z0-9_-]+\.css$/,
  /^assets\/index-[A-Za-z0-9_-]+\.js$/,
  /^assets\/workbox-window\.prod\.es5-[A-Za-z0-9_-]+\.js$/,
  /^data\/version\.json$/,
  /^data\/snapshot\.[0-9a-f]{64}\.json$/,
] as const;

const FORBIDDEN = [
  { label: "absolute home path", pattern: /(?:\/home\/|\/Users\/|[A-Za-z]:\\Users\\)/ },
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9_]{12,}/ },
  {
    label: "secret sentinel",
    pattern:
      /(?:SECRET_SHAPED_SENTINEL|CI_CONTEXT_SENTINEL|PRIVATE_TRANSCRIPT_SENTINEL|INJECTION_SENTINEL)/,
  },
  { label: "agent transcript", pattern: /(?:<system>|<developer>|tool_call_id|agent transcript)/ },
] as const;

export interface StaticArtifactObservation {
  readonly commit: string;
  readonly fileCount: number;
  readonly snapshotDigest: string;
  readonly treeDigest: string;
}

const sha256 = async (value: Uint8Array | string): Promise<string> => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const walkArtifact = async (root: string): Promise<ReadonlyArray<string>> => {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("static artifact root must be one real directory");
  }
  const found: Array<string> = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const relativePath = directory === "" ? entry.name : `${directory}/${entry.name}`;
      const absolutePath = join(root, ...relativePath.split("/"));
      const info = await lstat(absolutePath);
      if (info.isSymbolicLink()) {
        throw new Error(`static artifact contains symbolic link ${relativePath}`);
      }
      if (info.isDirectory()) {
        if (!ALLOWED_DIRECTORIES.has(relativePath)) {
          throw new Error(`static artifact contains unexpected directory ${relativePath}`);
        }
        await walk(relativePath);
        continue;
      }
      if (!info.isFile()) {
        throw new Error(`static artifact contains non-regular entry ${relativePath}`);
      }
      if (!ALLOWED_FILES.some((pattern) => pattern.test(relativePath))) {
        throw new Error(`static artifact contains unexpected file ${relativePath}`);
      }
      if (info.size > MAX_FILE_BYTES) {
        throw new Error(`static artifact file ${relativePath} exceeds the bounded size`);
      }
      found.push(relativePath);
    }
  };
  await walk("");
  if (found.length === 0 || found.length > MAX_FILES) {
    throw new Error(`static artifact file count ${found.length} is outside the bounded range`);
  }
  return found.sort();
};

export const resolveStaticArtifactRoot = (input: string): string => {
  if (!isAbsolute(input)) throw new Error("static artifact root must be absolute");
  const root = resolve(input);
  const fromRoot = relative(root, input);
  if (input !== root || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new Error("static artifact root must be normalized");
  }
  return root;
};

/**
 * Treats the downloaded artifact only as bounded data. No module, HTML,
 * service worker, package metadata, or executable bit from this directory is
 * invoked by the trusted deployment process.
 */
export const validateStaticArtifact = async (
  rootInput: string,
  expectedCommit?: string,
): Promise<StaticArtifactObservation> => {
  const root = resolveStaticArtifactRoot(rootInput);
  if (expectedCommit !== undefined && !EXACT_COMMIT.test(expectedCommit)) {
    throw new Error("expected artifact commit must be an exact lowercase commit");
  }
  const files = await walkArtifact(root);
  const versions = files.filter((file) => file === "data/version.json");
  const snapshots = files.filter((file) => /^data\/snapshot\.[0-9a-f]{64}\.json$/.test(file));
  if (versions.length !== 1 || snapshots.length !== 1) {
    throw new Error(
      `expected one version and one snapshot, found ${versions.length} and ${snapshots.length}`,
    );
  }

  const fileBytes = new Map<string, Uint8Array>();
  let totalBytes = 0;
  for (const relativePath of files) {
    const bytes = new Uint8Array(await readFile(join(root, ...relativePath.split("/"))));
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("static artifact exceeds the bounded total size");
    }
    fileBytes.set(relativePath, bytes);
  }

  const decode = (relativePath: string): string =>
    new TextDecoder("utf-8", { fatal: true }).decode(fileBytes.get(relativePath)!);
  const versionValue: unknown = JSON.parse(decode(versions[0]!));
  if (!isPublicVersion(versionValue)) {
    throw new Error("built version document is invalid");
  }
  if (expectedCommit !== undefined && versionValue.commit !== expectedCommit) {
    throw new Error("static artifact commit does not match the triggering workflow head");
  }
  if (`data/${versionValue.snapshot}` !== snapshots[0]) {
    throw new Error("static artifact snapshot filename is not bound to version.json");
  }
  const snapshotValue: unknown = JSON.parse(decode(snapshots[0]!));
  await verifyCandidate(versionValue, snapshotValue);

  if (!files.includes("sw.js")) {
    throw new Error("built PWA is missing sw.js");
  }
  const worker = decode("sw.js");
  if (worker.includes("data/version.json") || worker.includes(versionValue.snapshot)) {
    throw new Error("service worker must not precache mutable public snapshot data");
  }
  for (const relativePath of files) {
    const text = decode(relativePath);
    for (const { label, pattern } of FORBIDDEN) {
      if (pattern.test(text)) {
        throw new Error(`${relativePath} contains forbidden ${label}`);
      }
    }
  }

  const treeEntries = await Promise.all(
    files.map(async (relativePath) => {
      const bytes = fileBytes.get(relativePath)!;
      return `${relativePath}\0${bytes.byteLength}\0${await sha256(bytes)}\n`;
    }),
  );
  return {
    commit: versionValue.commit,
    fileCount: files.length,
    snapshotDigest: versionValue.digest,
    treeDigest: await sha256(treeEntries.join("")),
  };
};

const program = Effect.gen(function* () {
  const root = process.argv[2] ?? resolve(import.meta.dirname, "../dist");
  const expectedCommit = process.argv[3];
  const observation = yield* Effect.tryPromise({
    try: () => validateStaticArtifact(root, expectedCommit),
    catch: (cause) => new Error("public static artifact validation failed", { cause }),
  });
  yield* Console.log(
    `verified ${observation.fileCount} public payload files at tree ${observation.treeDigest}`,
  );
});

if (import.meta.main) {
  Effect.runPromise(program).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
