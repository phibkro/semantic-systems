import { Crypto, Effect, Encoding, type FileSystem, type Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { AcquisitionError } from "./errors.ts";
import {
  blobSha256,
  headCommit,
  hiddenIndexReasons,
  inspectLocalBlobs,
  isCleanWorktree,
  isDetachedHead,
  lsTreeDirectory,
  lsTreeEntry,
  recomputeObjectId,
  repositoryProgramReasons,
  treeOfCommit,
  type GitObjectType,
  type GitEnvironment,
  type LocalBlobInspection,
  type TreePathEntry,
} from "./git.ts";
import type { LicenseObservation, LockEntry } from "./lockfile.ts";
import {
  inspectCheckoutAdministration,
  inspectRepositoryObjectPaths,
  readWorktreeBlobBytes,
  readWorktreeFilePrefix,
} from "./paths.ts";

const REGULAR_BLOB_MODES: ReadonlySet<string> = new Set(["100644", "100755"]);
const LFS_POINTER_MAX_BYTES = 1024;
const LFS_VERSION_LINE = "version https://git-lfs.github.com/spec/v1";
const LFS_OID_LINE = /^oid sha256:[0-9a-f]{64}$/;
const LFS_SIZE_LINE = /^size (?:0|[1-9][0-9]*)$/;
const LFS_EXTENSION_LINE = /^ext-[0-9]+-[A-Za-z0-9][A-Za-z0-9.-]* .+$/;

export interface CheckoutVerification {
  readonly headMismatch: string | null;
  readonly reasons: ReadonlyArray<string>;
}

const isVisibleIndirectionReason = (reason: string): boolean =>
  (reason.startsWith("tracked path ") &&
    (reason.endsWith(" is an unmaterialized submodule gitlink") ||
      reason.endsWith(" is a committed Git LFS pointer") ||
      reason.endsWith(" is a Git LFS pointer, not hydrated content"))) ||
  (reason.startsWith("license path ") &&
    reason.endsWith(" is a Git LFS pointer, not real content"));

/** Findings that may be published only as an explicitly incomplete checkout. */
export const publicationBlockingReasons = (
  verification: CheckoutVerification,
): ReadonlyArray<string> =>
  verification.reasons.filter((reason) => !isVisibleIndirectionReason(reason));

type VerificationCapabilities =
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | GitEnvironment
  | Path.Path;

type ObjectVerificationCapabilities =
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | GitEnvironment
  | Path.Path;

/**
 * Recognize only a complete Git LFS v1 pointer. A shared textual prefix is not
 * evidence of an indirection, and arbitrary binary or oversized content is
 * ordinary payload.
 */
const isGitLfsPointer = (content: Uint8Array): boolean => {
  if (content.length === 0 || content.length > LFS_POINTER_MAX_BYTES) return false;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return false;
  }
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.some((line) => line.includes("\r"))) return false;
  if (lines[0] !== LFS_VERSION_LINE) return false;

  let index = 1;
  while (index < lines.length && LFS_EXTENSION_LINE.test(lines[index]!)) index += 1;
  return (
    index + 2 === lines.length &&
    LFS_OID_LINE.test(lines[index] ?? "") &&
    LFS_SIZE_LINE.test(lines[index + 1] ?? "")
  );
};

const digestSha256 = (
  content: Uint8Array,
): Effect.Effect<string, AcquisitionError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const digest = yield* crypto
      .digest("SHA-256", content)
      .pipe(
        Effect.mapError(
          (cause) => new AcquisitionError({ message: "cannot hash working-tree bytes", cause }),
        ),
      );
    return Encoding.encodeHex(digest);
  });

const licenseReasons = (
  worktree: string,
  head: string,
  path: string,
  expected: LicenseObservation,
): Effect.Effect<ReadonlyArray<string>, AcquisitionError, VerificationCapabilities> =>
  Effect.gen(function* () {
    const reasons: Array<string> = [];
    const treeEntry = yield* lsTreeEntry(worktree, head, path);
    if (treeEntry === null) {
      return [`license path ${JSON.stringify(path)} is missing from the committed tree`];
    }
    if (treeEntry.objectType !== "blob" || !REGULAR_BLOB_MODES.has(treeEntry.mode)) {
      return [`license path ${JSON.stringify(path)} is not a regular committed blob`];
    }

    const expectedSize = BigInt(expected.size);
    if (treeEntry.mode !== expected.mode || treeEntry.size !== expectedSize) {
      reasons.push(`license path ${JSON.stringify(path)} committed metadata changed`);
    } else {
      const committedDigest = yield* blobSha256(worktree, treeEntry.oid);
      if (committedDigest !== expected.sha256) {
        reasons.push(`license path ${JSON.stringify(path)} committed bytes changed`);
      }
    }

    const worktreeBytes = yield* readWorktreeBlobBytes(worktree, path).pipe(
      Effect.map((bytes) => ({ kind: "success" as const, bytes })),
      Effect.catch((error) => Effect.succeed({ kind: "failure" as const, error })),
    );
    if (worktreeBytes.kind === "failure") {
      reasons.push(worktreeBytes.error.message);
      return reasons;
    }
    if (isGitLfsPointer(worktreeBytes.bytes)) {
      reasons.push(`license path ${JSON.stringify(path)} is a Git LFS pointer, not real content`);
      return reasons;
    }
    if (BigInt(worktreeBytes.bytes.length) !== expectedSize) {
      reasons.push(`license path ${JSON.stringify(path)} working-tree size changed`);
    } else {
      const workingDigest = yield* digestSha256(worktreeBytes.bytes);
      if (workingDigest !== expected.sha256) {
        reasons.push(`license path ${JSON.stringify(path)} working-tree bytes changed`);
      }
    }
    return reasons;
  });

const requireObjectIdentity = (
  worktree: string,
  oid: string,
  objectType: GitObjectType,
): Effect.Effect<void, AcquisitionError, ObjectVerificationCapabilities> =>
  Effect.gen(function* () {
    yield* inspectRepositoryObjectPaths(worktree, [oid]);
    const recomputed = yield* recomputeObjectId(worktree, oid, objectType);
    if (recomputed !== oid) {
      return yield* new AcquisitionError({
        message: `selected ${objectType} integrity failed: expected ${oid}, recomputed ${recomputed}`,
      });
    }
  });

interface CompleteTreeInspection {
  readonly entries: ReadonlyArray<TreePathEntry>;
  readonly localBlobs: LocalBlobInspection;
}

/**
 * Walk the locked tree one directory at a time. Every tree object is
 * path-checked and rehashed before Git may open it; blob paths are then
 * checked and all selected blob identities are recomputed independently.
 */
const inspectCompleteTree = (
  worktree: string,
  rootTree: string,
  smallBlobLimit = LFS_POINTER_MAX_BYTES,
): Effect.Effect<CompleteTreeInspection, AcquisitionError, ObjectVerificationCapabilities> =>
  Effect.gen(function* () {
    const entries: Array<TreePathEntry> = [];
    const pending: Array<readonly [string, string]> = [[rootTree, ""]];
    const verifiedTrees = new Set<string>();

    for (let index = 0; index < pending.length; index += 1) {
      const [tree, prefix] = pending[index]!;
      if (!verifiedTrees.has(tree)) {
        yield* requireObjectIdentity(worktree, tree, "tree");
        verifiedTrees.add(tree);
      }
      const direct = yield* lsTreeDirectory(worktree, tree, prefix);
      entries.push(...direct);
      for (const entry of direct) {
        if (entry.objectType === "tree") {
          pending.push([entry.oid, entry.path]);
        } else if (entry.objectType !== "blob" && entry.objectType !== "commit") {
          return yield* new AcquisitionError({
            message:
              `tracked path ${JSON.stringify(entry.path)} has unsupported Git object type ` +
              JSON.stringify(entry.objectType),
          });
        }
      }
    }

    const blobs = entries
      .filter((entry) => entry.objectType === "blob")
      .map(({ oid, path, size }) => ({ oid, path, size }));
    yield* inspectRepositoryObjectPaths(
      worktree,
      blobs.map(({ oid }) => oid),
    );
    const localBlobs = yield* inspectLocalBlobs(worktree, blobs, smallBlobLimit);
    return { entries, localBlobs };
  });

/**
 * Prove the exact selected commit/tree/blob closure before cloning from a
 * local cache or sibling. No working-tree bytes are consulted.
 */
export const verifyRepositoryObjectClosure = (
  repository: string,
  commit: string,
): Effect.Effect<string, AcquisitionError, ObjectVerificationCapabilities> =>
  Effect.gen(function* () {
    yield* requireObjectIdentity(repository, commit, "commit");
    const tree = yield* treeOfCommit(repository, commit);
    yield* inspectCompleteTree(repository, tree, -1);
    return tree;
  });

const completeTreeReasons = (
  worktree: string,
  inspection: CompleteTreeInspection,
): Effect.Effect<ReadonlyArray<string>, AcquisitionError, VerificationCapabilities> =>
  Effect.gen(function* () {
    const reasons: Array<string> = [];
    for (const entry of inspection.entries) {
      if (entry.mode === "160000" || entry.objectType === "commit") {
        reasons.push(
          `tracked path ${JSON.stringify(entry.path)} is an unmaterialized submodule gitlink`,
        );
        continue;
      }
      const committed = inspection.localBlobs.smallContents.get(entry.oid);
      const committedPointer = committed !== undefined && isGitLfsPointer(committed);
      if (committedPointer) {
        reasons.push(`tracked path ${JSON.stringify(entry.path)} is a committed Git LFS pointer`);
      }
      if (!REGULAR_BLOB_MODES.has(entry.mode)) continue;
      const prefix = yield* readWorktreeFilePrefix(
        worktree,
        entry.path,
        LFS_POINTER_MAX_BYTES + 1,
      ).pipe(
        Effect.map((bytes) => ({ kind: "success" as const, bytes })),
        Effect.catch((error) => Effect.succeed({ kind: "failure" as const, error })),
      );
      if (prefix.kind === "failure") {
        reasons.push(prefix.error.message);
      } else if (!committedPointer && isGitLfsPointer(prefix.bytes)) {
        reasons.push(
          `tracked path ${JSON.stringify(entry.path)} is a Git LFS pointer, not hydrated content`,
        );
      }
    }
    return reasons;
  });

const verifyCheckoutEffect = (
  worktree: string,
  entry: LockEntry,
): Effect.Effect<CheckoutVerification, AcquisitionError, VerificationCapabilities> =>
  Effect.gen(function* () {
    yield* inspectCheckoutAdministration(worktree);
    const programReasons = yield* repositoryProgramReasons(worktree);
    if (programReasons.length > 0) return { headMismatch: null, reasons: programReasons };
    if (!(yield* isDetachedHead(worktree))) {
      return { headMismatch: null, reasons: ["checkout HEAD is not detached"] };
    }
    const head = yield* headCommit(worktree);
    if (head !== entry.commit) {
      return {
        headMismatch: head,
        reasons: [`checkout is at ${head}, locked commit is ${entry.commit}`],
      };
    }
    yield* requireObjectIdentity(worktree, head, "commit");
    const tree = yield* treeOfCommit(worktree, head);
    const completeTree = yield* inspectCompleteTree(worktree, tree);

    const hiddenReasons = yield* hiddenIndexReasons(worktree);
    if (hiddenReasons.length > 0) return { headMismatch: null, reasons: hiddenReasons };
    if (!(yield* isCleanWorktree(worktree))) {
      return { headMismatch: null, reasons: ["checkout has uncommitted changes"] };
    }

    const reasons: Array<string> = [];
    if (tree !== entry.tree) {
      reasons.push(`checkout tree ${tree} does not match locked tree ${entry.tree}`);
    }
    for (const [path, expected] of entry.licenses) {
      reasons.push(...(yield* licenseReasons(worktree, head, path, expected)));
    }
    reasons.push(...(yield* completeTreeReasons(worktree, completeTree)));
    return { headMismatch: null, reasons };
  });

/** Verify a checkout without fetching or mutating, returning findings as data. */
export const verifyCheckout = (
  worktree: string,
  entry: LockEntry,
): Effect.Effect<CheckoutVerification, never, VerificationCapabilities> =>
  verifyCheckoutEffect(worktree, entry).pipe(
    Effect.catch((error) =>
      Effect.succeed({ headMismatch: null, reasons: [error.message] } as const),
    ),
  );
