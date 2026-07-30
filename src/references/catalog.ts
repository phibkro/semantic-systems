import { Crypto, Effect, FileSystem, Schema } from "effect";
import { CatalogError } from "./errors.ts";
import { TomlParser } from "./toml.ts";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/;
const CONTROL_CHAR_MAX = 0x1f;
const DEL_CHAR = 0x7f;

/**
 * Reject values that could be misread as a CLI option or carry control
 * bytes. Applied to every catalog/lock field that is ever passed as a bare
 * positional argument to `git` (origin URLs, refs, aliases): a leading `-`
 * risks being parsed as an option, and control characters (including ANSI
 * escapes) have no legitimate place in a Git ref or URL.
 */
export const isGitSafeValue = (value: string): boolean => {
  if (value.length === 0 || value.startsWith("-")) return false;
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code <= CONTROL_CHAR_MAX || code === DEL_CHAR) return false;
  }
  return true;
};

const REF_FORBIDDEN = new Set([" ", "~", "^", ":", "?", "*", "[", "\\"]);

/**
 * Whether `value` is a concrete, syntactically valid `refs/...` name: the
 * validation subset of `git check-ref-format` needed at the pure
 * catalog/lock boundary. Selectors such as `HEAD` and short branch names are
 * intentionally excluded — a persisted resolution must name the concrete
 * advertised ref.
 */
export const isConcreteGitRef = (value: string): boolean => {
  if (!value.startsWith("refs/") || !isGitSafeValue(value)) return false;
  if (
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.includes("//") ||
    value.includes("..") ||
    value.includes("@{")
  ) {
    return false;
  }
  for (const ch of value) if (REF_FORBIDDEN.has(ch)) return false;
  const components = value.split("/");
  return components.every(
    (component) =>
      component.length > 0 && !component.startsWith(".") && !component.endsWith(".lock"),
  );
};

export const isValidSourceId = (sourceId: string): boolean => ID_PATTERN.test(sourceId);

export const validateSourceId = (sourceId: string): Effect.Effect<string, CatalogError> =>
  isValidSourceId(sourceId)
    ? Effect.succeed(sourceId)
    : Effect.fail(
        new CatalogError({
          message:
            `source id ${JSON.stringify(sourceId)} is not a path-safe dotted identifier ` +
            "(expected lowercase alphanumeric/hyphen segments joined by single dots)",
        }),
      );

/**
 * Normalized, relative, `.`/`..`-free, forward-slash license artifact path
 * (mirrors the validation subset of Python's `PurePosixPath` normalization
 * check: reject anything whose reconstruction from its segments differs from
 * the original text).
 */
export const isValidLicensePath = (rawPath: string): boolean => {
  if (rawPath.length === 0 || rawPath !== rawPath.trim()) return false;
  if (rawPath.includes("\\")) return false;
  if (rawPath.startsWith("/") || rawPath.endsWith("/")) return false;
  const parts = rawPath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return false;
  return parts.join("/") === rawPath;
};

export const validateLicensePath = (rawPath: string): Effect.Effect<string, CatalogError> =>
  isValidLicensePath(rawPath)
    ? Effect.succeed(rawPath)
    : Effect.fail(
        new CatalogError({ message: `license path ${JSON.stringify(rawPath)} is not normalized` }),
      );

export interface CatalogSource {
  readonly id: string;
  readonly kind: string;
  readonly origin: string;
  readonly localHint: string | null;
  readonly originAliases: ReadonlyArray<string>;
  readonly track: string | null;
  readonly licensePaths: ReadonlyArray<string>;
  readonly classes: ReadonlyArray<string>;
  readonly questions: ReadonlyArray<string>;
  /** The untouched TOML record, used verbatim as the canonical-digest input. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/** A source is lockable once both custody fields are declared. */
export const isLockable = (source: CatalogSource): boolean =>
  source.track !== null && source.licensePaths.length > 0;

const escapeJsonString = (value: string): string => {
  let out = '"';
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index]!;
    const code = value.charCodeAt(index);
    switch (ch) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      case "\b":
        out += "\\b";
        break;
      case "\f":
        out += "\\f";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default:
        out += code < 0x20 || code > 0x7e ? `\\u${code.toString(16).padStart(4, "0")}` : ch;
    }
  }
  return out + '"';
};

/**
 * `JSON.stringify(value, Object.keys(value).sort())`-shaped output but
 * matching Python's `json.dumps(value, sort_keys=True, separators=(",",
 * ":"), ensure_ascii=True)` byte-for-byte: compact separators, keys sorted
 * recursively, and every non-ASCII/control character escaped as `\uXXXX`
 * (explicitly iterating UTF-16 code units makes astral characters produce
 * the same surrogate-pair escape sequence Python emits).
 */
const canonicalizeForDigest = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonical digest rejects non-finite numbers");
    }
    return String(value);
  }
  if (typeof value === "string") return escapeJsonString(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeForDigest).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${escapeJsonString(key)}:${canonicalizeForDigest(item)}`).join(",")}}`;
  }
  throw new Error(`canonical digest cannot encode a value of type ${typeof value}`);
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** SHA-256 of the complete canonical catalog record (`reference-lock-v1`). */
export const catalogDigest = (
  raw: Readonly<Record<string, unknown>>,
): Effect.Effect<string, CatalogError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const canonical = yield* Effect.try({
      try: () => canonicalizeForDigest(raw),
      catch: (cause) =>
        new CatalogError({ message: "cannot canonicalize catalog record for digest", cause }),
    });
    const digest = yield* crypto
      .digest("SHA-256", new TextEncoder().encode(canonical))
      .pipe(
        Effect.mapError(
          (cause) => new CatalogError({ message: "cannot compute catalog digest", cause }),
        ),
      );
    return toHex(digest);
  });

export interface Catalog {
  readonly sources: ReadonlyMap<string, CatalogSource>;
}

const SourceRecordSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  kind: Schema.NonEmptyString,
  origin: Schema.NonEmptyString,
  local_hint: Schema.optionalKey(Schema.NonEmptyString),
  origin_aliases: Schema.optionalKey(Schema.NonEmptyArray(Schema.String)),
  track: Schema.optionalKey(Schema.NonEmptyString),
  license_paths: Schema.optionalKey(Schema.NonEmptyArray(Schema.String)),
  classes: Schema.optionalKey(Schema.NonEmptyArray(Schema.String)),
  questions: Schema.optionalKey(Schema.NonEmptyArray(Schema.String)),
});

const validateRecord = (
  record: Record<string, unknown>,
): Effect.Effect<CatalogSource, CatalogError> =>
  Effect.gen(function* () {
    const fields = yield* Schema.decodeUnknownEffect(SourceRecordSchema)(record).pipe(
      Effect.mapError(
        (cause) => new CatalogError({ message: `invalid source record: ${cause.message}`, cause }),
      ),
    );

    if (!isValidSourceId(fields.id)) {
      return yield* new CatalogError({
        message:
          `source id ${JSON.stringify(fields.id)} is not a path-safe dotted identifier ` +
          "(expected lowercase alphanumeric/hyphen segments joined by single dots)",
      });
    }
    if (!isGitSafeValue(fields.origin)) {
      return yield* new CatalogError({
        message: `source ${JSON.stringify(fields.id)}: 'origin' is not safe (option-like or has control characters)`,
      });
    }
    const originAliases = fields.origin_aliases ?? [];
    for (const alias of originAliases) {
      if (!isGitSafeValue(alias)) {
        return yield* new CatalogError({
          message: `source ${JSON.stringify(fields.id)}: origin_aliases entry ${JSON.stringify(alias)} is not safe`,
        });
      }
    }
    const track = fields.track ?? null;
    if (track !== null && !isGitSafeValue(track)) {
      return yield* new CatalogError({
        message: `source ${JSON.stringify(fields.id)}: 'track' is not safe (option-like or has control characters)`,
      });
    }
    const licensePathsRaw = fields.license_paths ?? [];
    for (const path of licensePathsRaw) {
      if (!isValidLicensePath(path)) {
        return yield* new CatalogError({
          message: `source ${JSON.stringify(fields.id)}: license path ${JSON.stringify(path)} is not a normalized relative path`,
        });
      }
    }
    if (new Set(licensePathsRaw).size !== licensePathsRaw.length) {
      return yield* new CatalogError({
        message: `source ${JSON.stringify(fields.id)}: license_paths contains duplicates`,
      });
    }
    if ((track === null) !== (licensePathsRaw.length === 0)) {
      return yield* new CatalogError({
        message:
          `source ${JSON.stringify(fields.id)}: 'track' and 'license_paths' must be declared ` +
          "together (a source is either fully lockable or fully unlocked)",
      });
    }

    const source: CatalogSource = {
      id: fields.id,
      kind: fields.kind,
      origin: fields.origin,
      localHint: fields.local_hint ?? null,
      originAliases,
      track,
      licensePaths: licensePathsRaw,
      classes: fields.classes ?? [],
      questions: fields.questions ?? [],
      raw: record,
    };
    return source;
  });

const DocumentSchema = Schema.Struct({
  schema: Schema.Unknown,
  source: Schema.optionalKey(Schema.Array(Schema.Unknown)),
});

export const parseCatalogText = (text: string): Effect.Effect<Catalog, CatalogError, TomlParser> =>
  Effect.gen(function* () {
    const parser = yield* TomlParser;
    const parsed = yield* parser
      .parse(text)
      .pipe(
        Effect.mapError(
          (cause) =>
            new CatalogError({ message: `catalog is not valid TOML: ${cause.message}`, cause }),
        ),
      );
    const document = yield* Schema.decodeUnknownEffect(DocumentSchema)(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new CatalogError({
            message: `catalog document has an invalid shape: ${cause.message}`,
            cause,
          }),
      ),
    );
    if (document.schema !== 1) {
      return yield* new CatalogError({
        message: `catalog schema ${JSON.stringify(document.schema)} is not the supported value (1)`,
      });
    }

    const sources = new Map<string, CatalogSource>();
    for (const record of document.source ?? []) {
      if (typeof record !== "object" || record === null || Array.isArray(record)) {
        return yield* new CatalogError({ message: "each [[source]] entry must be a table" });
      }
      const source = yield* validateRecord(record as Record<string, unknown>);
      if (sources.has(source.id)) {
        return yield* new CatalogError({
          message: `duplicate source id ${JSON.stringify(source.id)}`,
        });
      }
      sources.set(source.id, source);
    }
    return { sources };
  });

export const loadCatalog = (
  path: string,
): Effect.Effect<Catalog, CatalogError, TomlParser | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(path)
      .pipe(
        Effect.mapError(
          (cause) => new CatalogError({ message: `cannot read catalog at ${path}`, cause }),
        ),
      );
    return yield* parseCatalogText(text);
  });
