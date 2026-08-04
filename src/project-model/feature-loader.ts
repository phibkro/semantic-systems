/* oxlint-disable semantic-effect/typed-failure-boundary -- strict dossier parsing is a synchronous boundary whose thrown values are normalized to FeatureDossierLoadError by the exported Effect loaders */
/* oxlint-disable semantic-effect/schema-json-boundary -- JSON.parse here decodes one quoted YAML scalar; transition JSON uses Schema.UnknownFromJsonString */
/* oxlint-disable eslint/preserve-caught-error -- malformed quoted scalars expose a stable boundary message while the exported loader preserves the enclosing cause */
/* oxlint-disable eslint/no-underscore-dangle -- Effect Exit discriminates success with its public _tag field */
import { Crypto, Data, Effect, FileSystem, Path, Schema } from "effect";
import {
  FEATURE_ARTIFACT_FORMAT,
  FEATURE_HISTORICAL_IMPORT_FORMAT,
  FEATURE_ID_PATTERN,
  type FeatureDossierInput,
} from "./feature-dossier.ts";

const FEATURE_DIRECTORY = "features";
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_DOSSIER_FILES = 512;
const FRONTMATTER_FIELDS = new Set([
  "format",
  "feature_id",
  "kind",
  "legacy_entity_id",
  "title",
  "summary",
  "objective",
  "owner",
  "dependencies",
  "evidence_categories",
  "unsupported_claims",
]);
const LIST_FIELDS = new Set(["dependencies", "evidence_categories", "unsupported_claims"]);
const CANONICAL_ARTIFACTS = new Map([
  ["proposal.md", "proposal"],
  ["research.md", "research"],
  ["design.md", "design"],
  ["spec.md", "specification"],
  ["plan.md", "plan"],
  ["implementation-report.md", "implementation_report"],
  ["accept.ts", "acceptance"],
]);

export class FeatureDossierLoadError extends Data.TaggedError("FeatureDossierLoadError")<{
  readonly message: string;
  readonly path?: string;
  readonly cause?: unknown;
}> {}

export interface FeatureDossierLoadOptions {
  readonly git: unknown;
  readonly provider?: unknown;
  readonly closure?: unknown;
}

const loadError = (message: string, path?: string, cause?: unknown): FeatureDossierLoadError =>
  new FeatureDossierLoadError({
    message,
    ...(path === undefined ? {} : { path }),
    ...(cause === undefined ? {} : { cause }),
  });

const parseScalar = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error("empty frontmatter value");
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(trimmed);
      if (typeof decoded !== "string") throw new Error("expected string");
      return decoded;
    } catch (cause) {
      throw new Error(`invalid quoted frontmatter value: ${String(cause)}`);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'"))
    return trimmed.slice(1, -1).replaceAll("''", "'");
  return trimmed;
};

const parseList = (value: string): Array<string> => {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const body = trimmed.slice(1, -1).trim();
    if (body.length === 0) return [];
    return body.split(",").map(parseScalar);
  }
  if (trimmed.length > 0) return [parseScalar(trimmed)];
  return [];
};

const parseFrontmatter = (content: string, path: string): Record<string, unknown> => {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") throw loadError("artifact is missing YAML frontmatter", path);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) throw loadError("artifact frontmatter is not closed", path);
  const result: Record<string, unknown> = {};
  let activeList: string | undefined;
  for (let index = 1; index < end; index += 1) {
    const line = lines[index]!;
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;
    const listItem = /^\s*-\s*(.+)$/.exec(line);
    if (listItem !== null) {
      if (activeList === undefined) throw loadError("frontmatter list item has no field", path);
      const current = result[activeList];
      if (!Array.isArray(current)) throw loadError("frontmatter list field is not an array", path);
      current.push(parseScalar(listItem[1]!));
      continue;
    }
    const field = /^\s*([A-Za-z_][A-Za-z0-9_]*):(?:\s*(.*))?$/.exec(line);
    if (field === null) throw loadError(`invalid frontmatter line ${index + 1}`, path);
    const key = field[1]!;
    if (!FRONTMATTER_FIELDS.has(key)) throw loadError(`unknown frontmatter field ${key}`, path);
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      throw loadError(`duplicate frontmatter field ${key}`, path);
    }
    const raw = field[2] ?? "";
    if (LIST_FIELDS.has(key)) {
      result[key] = parseList(raw);
      activeList = key;
    } else {
      result[key] = parseScalar(raw);
      activeList = undefined;
    }
  }
  return result;
};

const parseJson = (text: string, path: string): unknown => {
  const decoded = Schema.decodeUnknownExit(Schema.UnknownFromJsonString)(text);
  if (decoded._tag === "Failure")
    throw loadError("invalid JSON transition document", path, decoded.cause);
  return decoded.value;
};

const relativeToRoot = (value: string): string => value.replaceAll("\\", "/").replace(/^\.\//, "");

const artifactKindForPath = (
  relativePath: string,
  metadata: Record<string, unknown>,
): string | undefined => {
  const basename = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  const direct = CANONICAL_ARTIFACTS.get(relativePath);
  if (direct !== undefined) return direct;
  if (relativePath.startsWith("research/")) return "research";
  if (relativePath.startsWith("design/")) return "design";
  if (relativePath.startsWith("verification/")) {
    const declared = metadata.kind;
    return typeof declared === "string" ? declared : "verification";
  }
  if (basename === "accept.ts") return "acceptance";
  return undefined;
};

const isCanonicalArtifact = (relativePath: string): boolean =>
  CANONICAL_ARTIFACTS.has(relativePath) ||
  relativePath.startsWith("research/") ||
  relativePath.startsWith("design/") ||
  relativePath.startsWith("verification/");

const readFeatureFiles = (
  root: string,
  featureId: string,
): Effect.Effect<
  ReadonlyArray<{ readonly path: string; readonly content: string }>,
  FeatureDossierLoadError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    if (!FEATURE_ID_PATTERN.test(featureId)) {
      return yield* loadError(`invalid feature ID ${featureId}`);
    }
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const featureRoot = path.join(path.resolve(root), FEATURE_DIRECTORY, featureId);
    const exists = yield* fs
      .exists(featureRoot)
      .pipe(
        Effect.mapError((cause) =>
          loadError(`cannot inspect feature directory ${featureRoot}`, featureRoot, cause),
        ),
      );
    if (!exists) return yield* loadError(`missing feature directory ${featureRoot}`, featureRoot);
    const relativeFiles = yield* fs
      .glob("**/*", { root: featureRoot })
      .pipe(
        Effect.mapError((cause) =>
          loadError(`cannot list feature dossier ${featureRoot}`, featureRoot, cause),
        ),
      );
    if (relativeFiles.length > MAX_DOSSIER_FILES) {
      return yield* loadError(`feature dossier exceeds ${MAX_DOSSIER_FILES} files`, featureRoot);
    }
    const files: Array<{ readonly path: string; readonly content: string }> = [];
    for (const rawRelative of relativeFiles.map(relativeToRoot).sort()) {
      const absolute = path.join(featureRoot, rawRelative);
      const info = yield* fs
        .stat(absolute)
        .pipe(
          Effect.mapError((cause) =>
            loadError(`cannot inspect dossier path ${absolute}`, absolute, cause),
          ),
        );
      if (info.type !== "File") continue;
      if (!isCanonicalArtifact(rawRelative) && !rawRelative.startsWith("transitions/")) {
        return yield* loadError(`unsupported feature dossier path ${rawRelative}`, rawRelative);
      }
      if (info.size > MAX_ARTIFACT_BYTES) {
        return yield* loadError(`dossier file exceeds ${MAX_ARTIFACT_BYTES} bytes`, rawRelative);
      }
      const content = yield* fs
        .readFileString(absolute)
        .pipe(
          Effect.mapError((cause) =>
            loadError(`cannot read dossier file ${absolute}`, absolute, cause),
          ),
        );
      files.push({ path: rawRelative, content });
    }
    return files;
  });

const artifactFromFile = (
  featureId: string,
  directory: string,
  file: { readonly path: string; readonly content: string },
): {
  readonly kind: string;
  readonly path: string;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
} => {
  const isAcceptance = file.path === "accept.ts";
  const metadata = isAcceptance
    ? {
        format: FEATURE_ARTIFACT_FORMAT,
        feature_id: featureId,
        kind: "acceptance",
      }
    : parseFrontmatter(file.content, `${directory}/${file.path}`);
  const kind = artifactKindForPath(file.path, metadata);
  if (kind === undefined) throw loadError(`unsupported artifact path ${file.path}`, file.path);
  if (metadata.format !== FEATURE_ARTIFACT_FORMAT) {
    throw loadError(`artifact has invalid format ${JSON.stringify(metadata.format)}`, file.path);
  }
  if (metadata.feature_id !== featureId) {
    throw loadError(`artifact feature ID does not match directory ${featureId}`, file.path);
  }
  if (metadata.kind !== kind) {
    throw loadError(
      `artifact kind ${JSON.stringify(metadata.kind)} does not match ${kind}`,
      file.path,
    );
  }
  return { kind, path: `${directory}/${file.path}`, content: file.content, metadata };
};

const digestContent = (
  content: string,
): Effect.Effect<string, FeatureDossierLoadError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const bytes = yield* crypto
      .digest("SHA-256", new TextEncoder().encode(content))
      .pipe(
        Effect.mapError((cause) => loadError("cannot digest dossier artifact", undefined, cause)),
      );
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  });

const decodeTransitionDocument = (
  value: unknown,
  path: string,
): { readonly kind: "receipt" | "historical"; readonly value: unknown } => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw loadError("transition document must be an object", path);
  }
  const format = (value as Record<string, unknown>).format;
  if (format === FEATURE_HISTORICAL_IMPORT_FORMAT) return { kind: "historical", value };
  if (format === "semantic.feature-transition/v1") return { kind: "receipt", value };
  throw loadError(`unsupported transition format ${JSON.stringify(format)}`, path);
};

export const loadFeatureDossier = (
  root: string,
  featureId: string,
  options: FeatureDossierLoadOptions = {
    git: { format: "semantic.feature-git-observation/v1", head: "unobserved", clean: false },
  },
): Effect.Effect<
  FeatureDossierInput,
  FeatureDossierLoadError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const files = yield* readFeatureFiles(root, featureId);
    const path = yield* Path.Path;
    const directory = relativeToRoot(path.join(FEATURE_DIRECTORY, featureId));
    const artifacts: Array<unknown> = [];
    const receipts: Array<unknown> = [];
    const historicalImports: Array<unknown> = [];
    for (const file of files) {
      if (file.path.startsWith("transitions/")) {
        const transition = decodeTransitionDocument(
          parseJson(file.content, `${directory}/${file.path}`),
          `${directory}/${file.path}`,
        );
        (transition.kind === "receipt" ? receipts : historicalImports).push(transition.value);
        continue;
      }
      const artifact = artifactFromFile(featureId, directory, file);
      artifacts.push({ ...artifact, sha256: yield* digestContent(file.content) });
    }
    return {
      feature_id: featureId,
      directory,
      artifacts,
      receipts,
      observations: {
        git: options.git,
        ...(options.provider === undefined ? {} : { provider: options.provider }),
        ...(options.closure === undefined ? {} : { closure: options.closure }),
      },
      ...(historicalImports.length === 0 ? {} : { historical_imports: historicalImports }),
    } satisfies FeatureDossierInput;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof FeatureDossierLoadError
        ? cause
        : loadError(`cannot load feature dossier ${featureId}`, undefined, cause),
    ),
  );

export const loadFeatureDossiers = (
  root: string,
  options: FeatureDossierLoadOptions = {
    git: { format: "semantic.feature-git-observation/v1", head: "unobserved", clean: false },
  },
): Effect.Effect<
  ReadonlyArray<FeatureDossierInput>,
  FeatureDossierLoadError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const featuresRoot = path.join(path.resolve(root), FEATURE_DIRECTORY);
    const exists = yield* fs
      .exists(featuresRoot)
      .pipe(
        Effect.mapError((cause) =>
          loadError(`cannot inspect features directory ${featuresRoot}`, featuresRoot, cause),
        ),
      );
    if (!exists) return [];
    const files = yield* fs
      .glob("*/spec.md", { root: featuresRoot })
      .pipe(
        Effect.mapError((cause) =>
          loadError(`cannot list feature dossiers ${featuresRoot}`, featuresRoot, cause),
        ),
      );
    const ids = [
      ...new Set(files.map((entry) => relativeToRoot(entry).split("/")[0]).filter(Boolean)),
    ].sort();
    const dossiers: Array<FeatureDossierInput> = [];
    for (const featureId of ids)
      dossiers.push(yield* loadFeatureDossier(root, featureId!, options));
    return dossiers;
  });
