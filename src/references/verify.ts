import { Crypto, Effect, type FileSystem, type Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { AcquisitionError } from "./errors.ts";
import {
  blobSha256,
  headCommit,
  hiddenIndexReasons,
  isCleanWorktree,
  isDetachedHead,
  lsTreeEntry,
  lsTreeRecursive,
  repositoryProgramReasons,
  treeOfCommit,
  type GitEnvironment,
} from "./git.ts";
import type { LicenseObservation, LockEntry } from "./lockfile.ts";
import { readWorktreeBlobBytes, readWorktreeFilePrefix } from "./paths.ts";

const REGULAR_BLOB_MODES: ReadonlySet<string> = new Set(["100644", "100755"]);
const LFS_POINTER_PREFIX = new TextEncoder().encode("version https://git-lfs.github.com/spec");

export interface CheckoutVerification {
  readonly headMismatch: string | null;
  readonly reasons: ReadonlyArray<string>;
}

type VerificationCapabilities =
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | GitEnvironment
  | Path.Path;

const bytesStartWith = (content: Uint8Array, prefix: Uint8Array): boolean =>
  content.length >= prefix.length && prefix.every((byte, index) => content[index] === byte);

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
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
    if (bytesStartWith(worktreeBytes.bytes, LFS_POINTER_PREFIX)) {
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

const completeTreeReasons = (
  worktree: string,
  head: string,
): Effect.Effect<ReadonlyArray<string>, AcquisitionError, VerificationCapabilities> =>
  Effect.gen(function* () {
    const treeEntries = yield* lsTreeRecursive(worktree, head);

    const reasons: Array<string> = [];
    for (const entry of treeEntries) {
      if (entry.mode === "160000" || entry.objectType === "commit") {
        reasons.push(
          `tracked path ${JSON.stringify(entry.path)} is an unmaterialized submodule gitlink`,
        );
        continue;
      }
      if (!REGULAR_BLOB_MODES.has(entry.mode)) continue;
      const prefix = yield* readWorktreeFilePrefix(
        worktree,
        entry.path,
        LFS_POINTER_PREFIX.length,
      ).pipe(
        Effect.map((bytes) => ({ kind: "success" as const, bytes })),
        Effect.catch((error) => Effect.succeed({ kind: "failure" as const, error })),
      );
      if (prefix.kind === "failure") {
        reasons.push(prefix.error.message);
      } else if (bytesStartWith(prefix.bytes, LFS_POINTER_PREFIX)) {
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
    const programReasons = yield* repositoryProgramReasons(worktree);
    if (programReasons.length > 0) return { headMismatch: null, reasons: programReasons };
    const hiddenReasons = yield* hiddenIndexReasons(worktree);
    if (hiddenReasons.length > 0) return { headMismatch: null, reasons: hiddenReasons };
    if (!(yield* isCleanWorktree(worktree))) {
      return { headMismatch: null, reasons: ["checkout has uncommitted changes"] };
    }

    const reasons: Array<string> = [];
    const tree = yield* treeOfCommit(worktree, head);
    if (tree !== entry.tree) {
      reasons.push(`checkout tree ${tree} does not match locked tree ${entry.tree}`);
    }
    for (const [path, expected] of entry.licenses) {
      reasons.push(...(yield* licenseReasons(worktree, head, path, expected)));
    }
    reasons.push(...(yield* completeTreeReasons(worktree, head)));
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
