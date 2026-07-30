import { Effect, FileSystem } from "effect";
import {
  isConcreteGitRef,
  isGitSafeValue,
  validateLicensePath,
  validateSourceId,
} from "./catalog.ts";
import { LockFileError } from "./errors.ts";
import { parseStrictJson } from "./strict-json.ts";

export const SCHEMA_NAME = "reference-lock-v1";

const OBJECT_FORMAT_HEX_LENGTH: Readonly<Record<string, number>> = { sha1: 40, sha256: 64 };
const HEX_PATTERN: Readonly<Record<string, RegExp>> = {
  sha1: /^[0-9a-f]{40}$/,
  sha256: /^[0-9a-f]{64}$/,
};
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const REMOTE_ACQUISITION = "remote";
const ACQUISITION_KINDS = new Set([REMOTE_ACQUISITION, "local-sibling", "local-object-cache"]);
/** Git blob modes for a regular file: excludes symlinks (120000) and gitlinks (160000). */
const REGULAR_BLOB_MODES = new Set(["100644", "100755"]);

const ENTRY_FIELDS = new Set([
  "origin",
  "track",
  "resolved_ref",
  "object_format",
  "commit",
  "tree",
  "catalog_digest",
  "retrieved_at",
  "acquisition",
  "origin_verified",
  "licenses",
]);
const LICENSE_FIELDS = new Set(["mode", "size", "sha256"]);
const TOP_LEVEL_FIELDS = new Set(["schema", "generator", "sources"]);

export interface LicenseObservation {
  readonly mode: string;
  readonly size: number;
  readonly sha256: string;
}

export interface LockEntry {
  readonly origin: string;
  readonly track: string;
  readonly resolvedRef: string;
  readonly objectFormat: string;
  readonly commit: string;
  readonly tree: string;
  readonly catalogDigest: string;
  readonly retrievedAt: string;
  readonly acquisition: string;
  readonly originVerified: boolean;
  readonly licenses: ReadonlyMap<string, LicenseObservation>;
}

export interface Lock {
  readonly generator: string;
  readonly sources: ReadonlyMap<string, LockEntry>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireExactFields = (
  label: string,
  data: Readonly<Record<string, unknown>>,
  expected: ReadonlySet<string>,
): Effect.Effect<void, LockFileError> => {
  const present = new Set(Object.keys(data));
  const missing = [...expected].filter((key) => !present.has(key)).sort();
  if (missing.length > 0) {
    return Effect.fail(
      new LockFileError({ message: `${label} is missing fields: ${JSON.stringify(missing)}` }),
    );
  }
  const extra = [...present].filter((key) => !expected.has(key)).sort();
  if (extra.length > 0) {
    return Effect.fail(
      new LockFileError({ message: `${label} has unexpected fields: ${JSON.stringify(extra)}` }),
    );
  }
  return Effect.void;
};

const requireGitSafeString = (
  label: string,
  value: unknown,
): Effect.Effect<string, LockFileError> =>
  typeof value === "string" && value.length > 0 && isGitSafeValue(value)
    ? Effect.succeed(value)
    : Effect.fail(
        new LockFileError({
          message: `${label} must be a non-empty string that is safe (option-like or has control characters)`,
        }),
      );

const requireBoolean = (label: string, value: unknown): Effect.Effect<boolean, LockFileError> =>
  typeof value === "boolean"
    ? Effect.succeed(value)
    : Effect.fail(new LockFileError({ message: `${label} must be a boolean` }));

const requireNonNegativeInteger = (
  label: string,
  value: unknown,
): Effect.Effect<number, LockFileError> =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Effect.succeed(value)
    : Effect.fail(new LockFileError({ message: `${label} must be a non-negative integer` }));

const validateLicenseObservation = (
  path: string,
  data: unknown,
): Effect.Effect<LicenseObservation, LockFileError> =>
  Effect.gen(function* () {
    if (!isPlainObject(data)) {
      return yield* Effect.fail(
        new LockFileError({ message: `license entry ${JSON.stringify(path)} must be a table` }),
      );
    }
    yield* requireExactFields(`license entry ${JSON.stringify(path)}`, data, LICENSE_FIELDS);

    const mode = data.mode;
    if (typeof mode !== "string" || !REGULAR_BLOB_MODES.has(mode)) {
      return yield* Effect.fail(
        new LockFileError({
          message:
            `license entry ${JSON.stringify(path)}: 'mode' must be a regular blob mode ` +
            `${JSON.stringify([...REGULAR_BLOB_MODES].sort())} — a symlink, gitlink, or tree cannot ` +
            "be a license artifact",
        }),
      );
    }
    const size = yield* requireNonNegativeInteger(
      `license entry ${JSON.stringify(path)}: 'size'`,
      data.size,
    );
    const sha256 = data.sha256;
    if (typeof sha256 !== "string" || !SHA256_PATTERN.test(sha256)) {
      return yield* Effect.fail(
        new LockFileError({
          message: `license entry ${JSON.stringify(path)}: 'sha256' must be a full 64-hex digest`,
        }),
      );
    }
    return { mode, size, sha256 };
  });

const validateLicensesField = (
  sourceId: string,
  data: unknown,
): Effect.Effect<ReadonlyMap<string, LicenseObservation>, LockFileError> =>
  Effect.gen(function* () {
    if (!isPlainObject(data) || Object.keys(data).length === 0) {
      return yield* Effect.fail(
        new LockFileError({
          message: `lock entry ${JSON.stringify(sourceId)}: 'licenses' must be a non-empty table`,
        }),
      );
    }
    const licenses = new Map<string, LicenseObservation>();
    for (const [path, value] of Object.entries(data)) {
      const validPath = yield* validateLicensePath(path).pipe(
        Effect.mapError(
          (cause) =>
            new LockFileError({
              message: `lock entry ${JSON.stringify(sourceId)}: unsafe license path: ${cause.message}`,
              cause,
            }),
        ),
      );
      const observation = yield* validateLicenseObservation(validPath, value);
      licenses.set(validPath, observation);
    }
    return licenses;
  });

const validateLockEntry = (
  sourceId: string,
  data: unknown,
): Effect.Effect<LockEntry, LockFileError> =>
  Effect.gen(function* () {
    if (!isPlainObject(data)) {
      return yield* Effect.fail(
        new LockFileError({ message: `lock entry ${JSON.stringify(sourceId)} must be a table` }),
      );
    }
    yield* requireExactFields(`lock entry ${JSON.stringify(sourceId)}`, data, ENTRY_FIELDS);

    const origin = yield* requireGitSafeString(
      `lock entry ${JSON.stringify(sourceId)}: 'origin'`,
      data.origin,
    );
    const track = yield* requireGitSafeString(
      `lock entry ${JSON.stringify(sourceId)}: 'track'`,
      data.track,
    );
    const resolvedRef = yield* requireGitSafeString(
      `lock entry ${JSON.stringify(sourceId)}: 'resolved_ref'`,
      data.resolved_ref,
    );
    if (!isConcreteGitRef(resolvedRef)) {
      return yield* Effect.fail(
        new LockFileError({
          message: `lock entry ${JSON.stringify(sourceId)}: 'resolved_ref' must be a concrete valid refs/... name`,
        }),
      );
    }

    const objectFormat = data.object_format;
    if (typeof objectFormat !== "string" || !(objectFormat in OBJECT_FORMAT_HEX_LENGTH)) {
      return yield* Effect.fail(
        new LockFileError({
          message: `lock entry ${JSON.stringify(sourceId)}: unsupported object_format ${JSON.stringify(objectFormat)}`,
        }),
      );
    }
    const hexPattern = HEX_PATTERN[objectFormat]!;
    const commit = data.commit;
    if (typeof commit !== "string" || !hexPattern.test(commit)) {
      return yield* Effect.fail(
        new LockFileError({
          message: `lock entry ${JSON.stringify(sourceId)}: 'commit' must be a full ${objectFormat} object id`,
        }),
      );
    }
    const tree = data.tree;
    if (typeof tree !== "string" || !hexPattern.test(tree)) {
      return yield* Effect.fail(
        new LockFileError({
          message: `lock entry ${JSON.stringify(sourceId)}: 'tree' must be a full ${objectFormat} object id`,
        }),
      );
    }

    const catalogDigest = data.catalog_digest;
    if (typeof catalogDigest !== "string" || !SHA256_PATTERN.test(catalogDigest)) {
      return yield* Effect.fail(
        new LockFileError({
          message: `lock entry ${JSON.stringify(sourceId)}: 'catalog_digest' must be a full sha256 digest`,
        }),
      );
    }

    const retrievedAt = data.retrieved_at;
    if (typeof retrievedAt !== "string" || !TIMESTAMP_PATTERN.test(retrievedAt)) {
      return yield* Effect.fail(
        new LockFileError({
          message: `lock entry ${JSON.stringify(sourceId)}: 'retrieved_at' must be an ISO-8601 UTC timestamp`,
        }),
      );
    }

    const acquisition = data.acquisition;
    if (typeof acquisition !== "string" || !ACQUISITION_KINDS.has(acquisition)) {
      return yield* Effect.fail(
        new LockFileError({
          message: `lock entry ${JSON.stringify(sourceId)}: unsupported acquisition kind ${JSON.stringify(acquisition)}`,
        }),
      );
    }
    const originVerified = yield* requireBoolean(
      `lock entry ${JSON.stringify(sourceId)}: 'origin_verified'`,
      data.origin_verified,
    );
    // Only a remote acquisition can have observed the declared origin; a
    // local sibling or object cache is an assumption about identity, never a
    // verification of it, and the converse pairing is equally impossible.
    if (originVerified !== (acquisition === REMOTE_ACQUISITION)) {
      return yield* Effect.fail(
        new LockFileError({
          message:
            `lock entry ${JSON.stringify(sourceId)}: acquisition ${JSON.stringify(acquisition)} cannot report ` +
            `'origin_verified' ${originVerified}`,
        }),
      );
    }

    const licenses = yield* validateLicensesField(sourceId, data.licenses);

    const entry: LockEntry = {
      origin,
      track,
      resolvedRef,
      objectFormat,
      commit,
      tree,
      catalogDigest,
      retrievedAt,
      acquisition,
      originVerified,
      licenses,
    };
    return entry;
  });

export const parseLockText = (text: string): Effect.Effect<Lock, LockFileError> =>
  Effect.gen(function* () {
    const parsed = yield* parseStrictJson(text).pipe(
      Effect.mapError(
        (cause) =>
          new LockFileError({ message: `lock file is not valid JSON: ${cause.message}`, cause }),
      ),
    );
    if (!isPlainObject(parsed)) {
      return yield* Effect.fail(new LockFileError({ message: "lock file must be a JSON object" }));
    }
    yield* requireExactFields("lock file", parsed, TOP_LEVEL_FIELDS);

    if (parsed.schema !== SCHEMA_NAME) {
      return yield* Effect.fail(
        new LockFileError({
          message: `unknown lock schema ${JSON.stringify(parsed.schema)} (expected ${JSON.stringify(SCHEMA_NAME)})`,
        }),
      );
    }
    const generator = parsed.generator;
    if (typeof generator !== "string" || generator.length === 0) {
      return yield* Effect.fail(
        new LockFileError({ message: "lock file 'generator' must be a non-empty string" }),
      );
    }
    if (!isPlainObject(parsed.sources)) {
      return yield* Effect.fail(
        new LockFileError({ message: "lock file 'sources' must be a JSON object" }),
      );
    }

    const sources = new Map<string, LockEntry>();
    for (const [sourceId, entryData] of Object.entries(parsed.sources)) {
      yield* validateSourceId(sourceId).pipe(
        Effect.mapError(
          (cause) =>
            new LockFileError({
              message: `lock file source id ${JSON.stringify(sourceId)} is unsafe: ${cause.message}`,
              cause,
            }),
        ),
      );
      const entry = yield* validateLockEntry(sourceId, entryData);
      sources.set(sourceId, entry);
    }
    return { generator, sources };
  });

const EMPTY_LOCK: Lock = { generator: "", sources: new Map() };

export const loadLock = (path: string): Effect.Effect<Lock, LockFileError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs
      .exists(path)
      .pipe(
        Effect.mapError(
          (cause) => new LockFileError({ message: `cannot inspect lock file at ${path}`, cause }),
        ),
      );
    if (!exists) return EMPTY_LOCK;
    const text = yield* fs
      .readFileString(path)
      .pipe(
        Effect.mapError(
          (cause) => new LockFileError({ message: `cannot read lock file at ${path}`, cause }),
        ),
      );
    return yield* parseLockText(text);
  });
