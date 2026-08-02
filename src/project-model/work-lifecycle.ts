import { Data, Effect, Exit, FileSystem, Path, Schema } from "effect";
import type { Entity, ProjectGraph } from "./types.ts";

/** Stable feature identity used by all lifecycle-derived artifact paths. */
export type FeatureId = string;
export type RepositoryRelativePath = string;
export type RepositoryRoot = string;

export const FEATURE_ID_PATTERN = /^[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const WorkStatusSchema = Schema.Literals([
  "planned",
  "ready",
  "in_progress",
  "blocked",
  "complete",
  "superseded",
]);
export type WorkStatus = typeof WorkStatusSchema.Type;

export const FeatureLoopSchema = Schema.Literals(["managed", "pre_loop"]);
export type FeatureLoop = typeof FeatureLoopSchema.Type;

export const EvidenceRoleSchema = Schema.Literals([
  "feature_acceptance",
  "integration_test",
  "integration_analysis",
  "equivalence",
  "independent_review",
  "status_basis",
]);
export type EvidenceRole = typeof EvidenceRoleSchema.Type;

export const EvidenceCategorySchema = Schema.Literals([
  "proof",
  "derived",
  "analysis",
  "model_check",
  "test",
  "example_test",
  "property_test",
  "benchmark",
  "runtime_check",
  "assertion",
  "assumption",
]);
export type EvidenceCategory = typeof EvidenceCategorySchema.Type;

const GitShaSchema = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{40}$/)));
const AbsoluteUriSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/)),
);
const RepositoryRelativePathSchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^(?![\\/])(?![A-Za-z]:[\\/])(?!.*(?:^|[\\/])\.{1,2}(?:[\\/]|$)).+$/),
  ),
);
const FeatureIdSchema = Schema.String.pipe(Schema.check(Schema.isPattern(FEATURE_ID_PATTERN)));

export const EvidenceSourceSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("repository_artifact"),
    path: RepositoryRelativePathSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("git_commit"),
    object_id: GitShaSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("external_observation"),
    uri: AbsoluteUriSchema,
  }),
  Schema.Struct({ kind: Schema.Literal("authored_assertion") }),
]);
export type EvidenceSource = typeof EvidenceSourceSchema.Type;

export const EvidenceSchema = Schema.Struct({
  role: EvidenceRoleSchema,
  category: EvidenceCategorySchema,
  method: Schema.NonEmptyString,
  source: EvidenceSourceSchema,
  claim: Schema.NonEmptyString,
});
export type CompletionEvidence = typeof EvidenceSchema.Type;

export const CompletionSchema = Schema.Struct({
  outcome: Schema.Literals(["positive", "negative"]),
  implementation_head: Schema.optionalKey(GitShaSchema),
  integration_head: Schema.optionalKey(GitShaSchema),
  evidence: Schema.NonEmptyArray(EvidenceSchema),
});
export type Completion = typeof CompletionSchema.Type;

export const ReplacementSchema = Schema.Struct({
  target: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
});
export type Replacement = typeof ReplacementSchema.Type;

/**
 * This schema describes only lifecycle-owned attributes. Other work attributes
 * remain available to the graph scheduler and are intentionally not decoded by
 * this module.
 */
export const FeatureMetadataSchema = Schema.Struct({
  feature_id: Schema.optionalKey(FeatureIdSchema),
  feature_loop: Schema.optionalKey(FeatureLoopSchema),
  completion: Schema.optionalKey(CompletionSchema),
  replacement: Schema.optionalKey(ReplacementSchema),
});
export type FeatureMetadata = typeof FeatureMetadataSchema.Type;

type MetadataInput = {
  readonly feature_id?: unknown;
  readonly feature_loop?: unknown;
  readonly completion?: unknown;
  readonly replacement?: unknown;
};

export type FeatureLifecycle = "active" | "completed" | "superseded";

export type FeatureAcceptance =
  | { readonly kind: "runnable"; readonly path: RepositoryRelativePath }
  | { readonly kind: "pre_loop" }
  | { readonly kind: "superseded"; readonly replacement: Replacement };

export interface FeatureArtifacts {
  readonly featureId: FeatureId;
  readonly entityId: string;
  readonly name: string;
  readonly summary: string;
  readonly status: WorkStatus;
  readonly lifecycle: FeatureLifecycle;
  readonly featureLoop: FeatureLoop;
  readonly modelSource: RepositoryRelativePath;
  readonly designSpecPath: RepositoryRelativePath;
  readonly planPath: RepositoryRelativePath;
  readonly acceptance: FeatureAcceptance;
  readonly completion?: Completion;
  readonly replacement?: Replacement;
}

export class FeatureDiagnostic extends Data.TaggedError("FeatureDiagnostic")<{
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly entityId?: string;
  readonly featureId?: string;
  readonly source?: string;
  readonly path?: string;
}> {}

export const isFeatureDiagnostic = (value: unknown): value is FeatureDiagnostic =>
  value instanceof FeatureDiagnostic;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareEntity = (left: Entity, right: Entity): number => {
  const byId = compareText(left.id, right.id);
  return byId !== 0 ? byId : compareText(left.source, right.source);
};

const PRE_LOOP_FEATURES: Readonly<Record<string, true>> = {
  "0001-inventory-resolution-tracer": true,
  "0002-reference-baselines-deep-research": true,
  "0003-independent-resolution-checker": true,
  "0004-reference-source-custody": true,
};

const DERIVED_PATH_FIELDS: Readonly<Record<string, true>> = {
  plan: true,
  design_spec: true,
  model_source: true,
  acceptance_script: true,
};

const hasOwn = (record: Readonly<Record<string, unknown>>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const metadataInput = (entity: Entity): MetadataInput => {
  const attributes = entity.attributes;
  const input: {
    feature_id?: unknown;
    feature_loop?: unknown;
    completion?: unknown;
    replacement?: unknown;
  } = {};
  if (hasOwn(attributes, "feature_id")) input.feature_id = attributes.feature_id;
  if (hasOwn(attributes, "feature_loop")) input.feature_loop = attributes.feature_loop;
  if (hasOwn(attributes, "completion")) input.completion = attributes.completion;
  if (hasOwn(attributes, "replacement")) input.replacement = attributes.replacement;
  return input;
};

interface DecodedWorkRecord {
  readonly entity: Entity;
  readonly claimedAsFeature: boolean;
  readonly status: WorkStatus | undefined;
  readonly metadata: FeatureMetadata | undefined;
  readonly statusValid: boolean;
  readonly metadataValid: boolean;
}

const decodeStatus = (entity: Entity): Pick<DecodedWorkRecord, "status" | "statusValid"> => {
  const decoded = Schema.decodeUnknownExit(WorkStatusSchema)(entity.status);
  return Exit.isSuccess(decoded)
    ? { status: decoded.value, statusValid: true }
    : { status: undefined, statusValid: false };
};

const decodeMetadata = (entity: Entity): Pick<DecodedWorkRecord, "metadata" | "metadataValid"> => {
  const decoded = Schema.decodeUnknownExit(FeatureMetadataSchema, {
    onExcessProperty: "error",
  })(metadataInput(entity));
  return Exit.isSuccess(decoded)
    ? { metadata: decoded.value, metadataValid: true }
    : { metadata: undefined, metadataValid: false };
};

const decodeWorkRecord = (entity: Entity): DecodedWorkRecord => {
  const status = decodeStatus(entity);
  const metadata = decodeMetadata(entity);
  return {
    entity,
    claimedAsFeature:
      hasOwn(entity.attributes, "feature_id") || hasOwn(entity.attributes, "feature_loop"),
    ...status,
    ...metadata,
  };
};

const workRecords = (project: ProjectGraph): ReadonlyArray<DecodedWorkRecord> =>
  [...project.entities.values()]
    .filter((entity) => entity.kind === "work_item")
    .sort(compareEntity)
    .map(decodeWorkRecord);

const featureRecords = (project: ProjectGraph): ReadonlyArray<DecodedWorkRecord> =>
  workRecords(project).filter((record) => record.claimedAsFeature);
const issue = (
  code: string,
  message: string,
  context: {
    readonly entity?: Entity | undefined;
    readonly featureId?: string | undefined;
    readonly path?: string | undefined;
  } = {},
): FeatureDiagnostic => {
  const fields: {
    severity: "error";
    code: string;
    message: string;
    entityId?: string;
    featureId?: string;
    source?: string;
    path?: string;
  } = { severity: "error", code, message };
  if (context.entity !== undefined) {
    fields.entityId = context.entity.id;
    fields.source = context.entity.source;
  }
  if (context.featureId !== undefined) fields.featureId = context.featureId;
  if (context.path !== undefined) fields.path = context.path;
  return new FeatureDiagnostic(fields);
};

const metadataIssue = (record: DecodedWorkRecord): FeatureDiagnostic =>
  issue("work.metadata", "lifecycle metadata does not match the canonical feature schema", {
    entity: record.entity,
  });

const statusIssue = (record: DecodedWorkRecord): FeatureDiagnostic =>
  issue("work.status", `invalid work status ${JSON.stringify(record.entity.status)}`, {
    entity: record.entity,
  });

const featureIdIssue = (record: DecodedWorkRecord, message: string): FeatureDiagnostic =>
  issue("feature.id", message, {
    entity: record.entity,
    featureId: record.metadata?.feature_id,
  });

const featureLoopIssue = (record: DecodedWorkRecord, message: string): FeatureDiagnostic =>
  issue("feature.loop", message, {
    entity: record.entity,
    featureId: record.metadata?.feature_id,
  });

const completionIssue = (record: DecodedWorkRecord, code: string, message: string) =>
  issue(code, message, {
    entity: record.entity,
    featureId: record.metadata?.feature_id,
  });

const replacementIssue = (record: DecodedWorkRecord, code: string, message: string) =>
  issue(code, message, {
    entity: record.entity,
    featureId: record.metadata?.feature_id,
  });

const featureIdFromRecord = (record: DecodedWorkRecord): FeatureId | undefined => {
  const metadataFeatureId = record.metadata?.feature_id;
  if (metadataFeatureId !== undefined) return metadataFeatureId;
  const rawFeatureId = record.entity.attributes.feature_id;
  return typeof rawFeatureId === "string" && FEATURE_ID_PATTERN.test(rawFeatureId)
    ? rawFeatureId
    : undefined;
};

const featureCandidates = (
  records: ReadonlyArray<DecodedWorkRecord>,
): ReadonlyMap<FeatureId, ReadonlyArray<DecodedWorkRecord>> => {
  const grouped = new Map<FeatureId, Array<DecodedWorkRecord>>();
  for (const record of records) {
    const featureId = featureIdFromRecord(record);
    if (featureId === undefined) continue;
    const owners = grouped.get(featureId);
    if (owners === undefined) grouped.set(featureId, [record]);
    else owners.push(record);
  }
  return grouped;
};

const targetResolves = (
  project: ProjectGraph,
  featureCandidatesById: ReadonlyMap<FeatureId, ReadonlyArray<DecodedWorkRecord>>,
  target: string,
): boolean => {
  if (project.entities.has(target)) return true;
  return (featureCandidatesById.get(target)?.length ?? 0) === 1;
};

const recordIssues = (
  project: ProjectGraph,
  record: DecodedWorkRecord,
  candidates: ReadonlyMap<FeatureId, ReadonlyArray<DecodedWorkRecord>>,
): ReadonlyArray<FeatureDiagnostic> => {
  const issues: Array<FeatureDiagnostic> = [];
  if (!record.statusValid) issues.push(statusIssue(record));
  if (!record.metadataValid) issues.push(metadataIssue(record));
  if (!record.metadataValid || record.metadata === undefined || record.status === undefined) {
    return issues;
  }
  const metadata = record.metadata;
  if (record.claimedAsFeature) {
    if (metadata.feature_id === undefined) {
      issues.push(featureIdIssue(record, "feature-owning work item is missing feature_id"));
    }
    if (metadata.feature_loop === undefined) {
      issues.push(featureLoopIssue(record, "feature-owning work item is missing feature_loop"));
    } else if (
      metadata.feature_loop === "pre_loop" &&
      metadata.feature_id !== undefined &&
      PRE_LOOP_FEATURES[metadata.feature_id] !== true
    ) {
      issues.push(
        featureLoopIssue(record, `pre_loop is not permitted for feature ${metadata.feature_id}`),
      );
    }
  }
  if (record.claimedAsFeature) {
    for (const field of Object.keys(DERIVED_PATH_FIELDS)) {
      if (hasOwn(record.entity.attributes, field)) {
        issues.push(
          issue(
            "feature.path",
            `feature metadata must derive ${field}; authored path field is forbidden`,
            { entity: record.entity, featureId: metadata.feature_id },
          ),
        );
      }
    }
  }
  if (
    metadata.feature_id === "0012-minimal-actor-runtime" &&
    record.entity.id !== "work.actor-runtime"
  ) {
    issues.push(
      featureIdIssue(record, "feature 0012 is canonically owned only by work.actor-runtime"),
    );
  }

  const completion = metadata.completion;
  if (record.status === "complete" && completion === undefined) {
    issues.push(
      completionIssue(
        record,
        "work.completion.missing",
        "complete work requires completion evidence",
      ),
    );
  }
  if (record.status !== "complete" && completion !== undefined) {
    issues.push(
      completionIssue(
        record,
        "work.completion.unexpected",
        "completion evidence is only valid for complete work",
      ),
    );
  }
  if (record.status === "complete" && completion !== undefined) {
    if (metadata.feature_loop === "managed" && completion.implementation_head === undefined) {
      issues.push(
        completionIssue(
          record,
          "work.completion.implementation_head",
          "complete managed work requires implementation_head",
        ),
      );
    }
    if (
      metadata.feature_loop !== "managed" &&
      !completion.evidence.some(
        (evidence) => evidence.role === "status_basis" && evidence.category === "assertion",
      )
    ) {
      issues.push(
        completionIssue(
          record,
          "work.completion.status_basis",
          "complete pre_loop and non-feature work requires status_basis assertion evidence",
        ),
      );
    }
  }
  if (completion !== undefined) {
    for (const evidence of completion.evidence) {
      if (evidence.source.kind !== "repository_artifact") continue;
      if (normalizeRepositoryPath(evidence.source.path) !== evidence.source.path) {
        issues.push(
          completionIssue(
            record,
            "work.evidence.path",
            `repository artifact evidence path is not normalized and relative: ${evidence.source.path}`,
          ),
        );
      }
    }
  }

  const replacement = metadata.replacement;
  if (record.status === "superseded" && replacement === undefined) {
    issues.push(
      replacementIssue(
        record,
        "work.replacement.missing",
        "superseded work requires a named replacement",
      ),
    );
  }
  if (record.status !== "superseded" && replacement !== undefined) {
    issues.push(
      replacementIssue(
        record,
        "work.replacement.unexpected",
        "replacement metadata is only valid for superseded work",
      ),
    );
  }
  if (replacement !== undefined && !targetResolves(project, candidates, replacement.target)) {
    issues.push(
      replacementIssue(
        record,
        "work.replacement.target",
        `replacement target does not resolve: ${replacement.target}`,
      ),
    );
  }
  if (
    replacement !== undefined &&
    (replacement.target === record.entity.id || replacement.target === metadata.feature_id)
  ) {
    issues.push(
      replacementIssue(
        record,
        "work.replacement.target",
        "replacement target must name another canonical entity",
      ),
    );
  }
  return issues;
};

const lifecycleForStatus: Readonly<Record<WorkStatus, FeatureLifecycle>> = {
  planned: "active",
  ready: "active",
  in_progress: "active",
  blocked: "active",
  complete: "completed",
  superseded: "superseded",
};

export const classifyWorkStatus = (status: WorkStatus): FeatureLifecycle =>
  lifecycleForStatus[status];

const derivedPaths = (featureId: FeatureId) => ({
  modelSource: `model/work/features/${featureId}.json`,
  designSpecPath: `design-specs/${featureId}.md`,
  planPath: `plans/${featureId}.md`,
  acceptancePath: `scripts/accept/${featureId}.ts`,
});

const duplicateIssue = (
  featureId: FeatureId,
  records: ReadonlyArray<DecodedWorkRecord>,
): FeatureDiagnostic =>
  issue(
    "feature.duplicate",
    `feature ID is claimed by multiple work entities: ${records.map((record) => record.entity.id).join(", ")}`,
    { entity: records[0]?.entity, featureId },
  );

const artifactFromRecord = (
  project: ProjectGraph,
  record: DecodedWorkRecord,
  candidates: ReadonlyMap<FeatureId, ReadonlyArray<DecodedWorkRecord>>,
): FeatureArtifacts | FeatureDiagnostic => {
  const diagnostics = recordIssues(project, record, candidates);
  const firstDiagnostic = diagnostics[0];
  if (firstDiagnostic !== undefined) return firstDiagnostic;
  const metadata = record.metadata;
  const status = record.status;
  if (metadata === undefined || status === undefined || metadata.feature_id === undefined) {
    return featureIdIssue(record, "feature-owning work item has no valid feature_id");
  }
  if (metadata.feature_loop === undefined) {
    return featureLoopIssue(record, "feature-owning work item has no valid feature_loop");
  }
  const owners = candidates.get(metadata.feature_id) ?? [];
  if (owners.length !== 1) return duplicateIssue(metadata.feature_id, owners);

  const paths = derivedPaths(metadata.feature_id);
  let acceptance: FeatureAcceptance;
  if (metadata.feature_loop === "pre_loop") {
    acceptance = { kind: "pre_loop" };
  } else if (status === "superseded") {
    const replacement = metadata.replacement;
    if (replacement === undefined) {
      return replacementIssue(
        record,
        "work.replacement.missing",
        "superseded work requires a named replacement",
      );
    }
    acceptance = { kind: "superseded", replacement };
  } else {
    acceptance = { kind: "runnable", path: paths.acceptancePath };
  }
  const fields: {
    featureId: FeatureId;
    entityId: string;
    name: string;
    summary: string;
    status: WorkStatus;
    lifecycle: FeatureLifecycle;
    featureLoop: FeatureLoop;
    modelSource: RepositoryRelativePath;
    designSpecPath: RepositoryRelativePath;
    planPath: RepositoryRelativePath;
    acceptance: FeatureAcceptance;
    completion?: Completion;
    replacement?: Replacement;
  } = {
    featureId: metadata.feature_id,
    entityId: record.entity.id,
    name: record.entity.name,
    summary: record.entity.summary,
    status,
    lifecycle: classifyWorkStatus(status),
    featureLoop: metadata.feature_loop,
    modelSource: paths.modelSource,
    designSpecPath: paths.designSpecPath,
    planPath: paths.planPath,
    acceptance,
  };
  if (metadata.completion !== undefined) fields.completion = metadata.completion;
  if (metadata.replacement !== undefined) fields.replacement = metadata.replacement;
  return fields;
};

export const resolveFeature = (
  project: ProjectGraph,
  featureId: FeatureId,
): FeatureArtifacts | FeatureDiagnostic => {
  if (!FEATURE_ID_PATTERN.test(featureId)) {
    return issue("feature.id", `invalid feature ID ${JSON.stringify(featureId)}`, { featureId });
  }
  const records = featureRecords(project);
  const candidates = featureCandidates(records);
  const owners = candidates.get(featureId) ?? [];
  if (owners.length === 0) {
    return issue("feature.unknown", `no canonical feature owner for ${featureId}`, { featureId });
  }
  if (owners.length > 1) return duplicateIssue(featureId, owners);
  const owner = owners[0];
  if (owner === undefined) {
    return issue("feature.unknown", `no canonical feature owner for ${featureId}`, { featureId });
  }
  return artifactFromRecord(project, owner, candidates);
};

const diagnosticSortKey = (diagnostic: FeatureDiagnostic): string =>
  [
    diagnostic.featureId ?? "",
    diagnostic.entityId ?? "",
    diagnostic.path ?? "",
    diagnostic.code,
    diagnostic.message,
  ].join("\u0000");

const sortDiagnostics = (diagnostics: Iterable<FeatureDiagnostic>): Array<FeatureDiagnostic> =>
  [...diagnostics].sort((left, right) =>
    compareText(diagnosticSortKey(left), diagnosticSortKey(right)),
  );

export const resolveFeatures = (
  project: ProjectGraph,
): ReadonlyArray<FeatureArtifacts | FeatureDiagnostic> => {
  const records = featureRecords(project);
  const candidates = featureCandidates(records);
  const ids = [...candidates.keys()].sort(compareText);
  const results: Array<FeatureArtifacts | FeatureDiagnostic> = [];
  for (const featureId of ids) {
    results.push(resolveFeature(project, featureId));
  }
  for (const record of records) {
    if (featureIdFromRecord(record) !== undefined) continue;
    if (!record.metadataValid) results.push(metadataIssue(record));
    else results.push(featureIdIssue(record, "feature-owning work item is missing feature_id"));
  }
  return results.sort((left, right) => {
    const leftKey = isFeatureDiagnostic(left)
      ? diagnosticSortKey(left)
      : `${left.featureId}\u0000${left.entityId}`;
    const rightKey = isFeatureDiagnostic(right)
      ? diagnosticSortKey(right)
      : `${right.featureId}\u0000${right.entityId}`;
    return compareText(leftKey, rightKey);
  });
};

const normalizeRepositoryPath = (value: string): RepositoryRelativePath | undefined => {
  const replaced = value.replaceAll("\\", "/");
  if (replaced.startsWith("/") || /^[A-Za-z]:\//.test(replaced)) return undefined;
  const segments: Array<string> = [];
  for (const segment of replaced.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.length === 0 ? undefined : segments.join("/");
};

const isFeatureArtifact = (
  value: FeatureArtifacts | FeatureDiagnostic,
): value is FeatureArtifacts => !isFeatureDiagnostic(value);

export const featuresForChangedPaths = (
  project: ProjectGraph,
  changedPaths: ReadonlyArray<RepositoryRelativePath>,
): ReadonlyArray<FeatureId> => {
  const owners = new Map<RepositoryRelativePath, Set<FeatureId>>();
  for (const result of resolveFeatures(project)) {
    if (!isFeatureArtifact(result)) continue;
    const paths = [result.modelSource, result.designSpecPath, result.planPath];
    if (result.acceptance.kind === "runnable" || result.acceptance.kind === "superseded") {
      paths.push(derivedPaths(result.featureId).acceptancePath);
    }
    for (const artifactPath of paths) {
      const existing = owners.get(artifactPath);
      if (existing === undefined) owners.set(artifactPath, new Set([result.featureId]));
      else existing.add(result.featureId);
    }
  }
  const selected = new Set<FeatureId>();
  for (const changedPath of changedPaths) {
    const normalized = normalizeRepositoryPath(changedPath);
    if (normalized === undefined) continue;
    for (const featureId of owners.get(normalized) ?? []) selected.add(featureId);
  }
  return [...selected].sort(compareText);
};

const sourceRelativePath = (path: Path.Path, root: string, source: string) => {
  const absolute = path.isAbsolute(source) ? path.normalize(source) : path.resolve(root, source);
  return normalizeRepositoryPath(path.relative(root, absolute));
};

const absoluteRepositoryPath = (
  path: Path.Path,
  root: string,
  relative: RepositoryRelativePath,
): string => path.resolve(root, ...relative.split("/"));
const planContentIssues = (
  content: string,
  feature: FeatureArtifacts,
): ReadonlyArray<FeatureDiagnostic> => {
  const issues: Array<FeatureDiagnostic> = [];
  const lines = content.split(/\r?\n/u);
  let heading: string | undefined;
  let inFence = false;
  const leading: Array<string> = [];
  for (const line of lines) {
    if (heading === undefined) {
      if (/^\s{0,3}#\s+/.test(line)) heading = line;
      continue;
    }
    if (/^\s{0,3}```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) {
      leading.push(line);
      if (/^\s{0,3}##\s+/.test(line)) break;
    }
  }
  const expectedHeadingPrefix = `# Plan ${feature.featureId}: `;
  if (
    heading === undefined ||
    !heading.startsWith(expectedHeadingPrefix) ||
    heading.slice(expectedHeadingPrefix.length).trim().length === 0 ||
    /\b(active|completed|superseded)\b/i.test(heading)
  ) {
    issues.push(
      issue("feature.plan.heading", "plan heading is not lifecycle-neutral canonical form", {
        featureId: feature.featureId,
        path: feature.planPath,
      }),
    );
  }
  for (const line of leading) {
    if (
      /^\s{0,3}(?:#{1,6}\s+)?[*_]{0,3}Status(?:[*_]{0,3}\s*:|:[*_]{0,3}|[*_]{0,3}\s*$)/i.test(line)
    ) {
      issues.push(
        issue("feature.plan.status", "plan leading block contains a current Status label", {
          featureId: feature.featureId,
          path: feature.planPath,
        }),
      );
      break;
    }
  }
  return issues;
};

const checkRegularFile = (
  fs: FileSystem.FileSystem,
  absolute: string,
  relative: RepositoryRelativePath,
  issues: Array<FeatureDiagnostic>,
  context: {
    readonly featureId?: FeatureId | undefined;
    readonly executable?: boolean | undefined;
    readonly missingCode?: string | undefined;
    readonly typeCode?: string | undefined;
  },
) =>
  Effect.gen(function* () {
    const inspected = yield* fs.stat(absolute).pipe(Effect.exit);
    if (Exit.isFailure(inspected)) {
      issues.push(
        issue(
          context.missingCode ?? "feature.artifact.missing",
          `required artifact is missing: ${relative}`,
          { featureId: context.featureId, path: relative },
        ),
      );
      return;
    }
    if (inspected.value.type !== "File") {
      issues.push(
        issue(
          context.typeCode ?? "feature.artifact.type",
          `required artifact is not a regular file: ${relative}`,
          { featureId: context.featureId, path: relative },
        ),
      );
      return;
    }
    if (context.executable === true && (inspected.value.mode & 0o111) === 0) {
      issues.push(
        issue(
          "feature.acceptance.executable",
          `managed acceptance program is not executable: ${relative}`,
          { featureId: context.featureId, path: relative },
        ),
      );
    }
  });

const globRelative = (
  fs: FileSystem.FileSystem,
  root: string,
  pattern: string,
  issues: Array<FeatureDiagnostic>,
) =>
  Effect.gen(function* () {
    const rootInfo = yield* fs.stat(root).pipe(Effect.exit);
    if (Exit.isFailure(rootInfo)) {
      const empty: Array<string> = [];
      return empty;
    }
    if (rootInfo.value.type !== "Directory") {
      issues.push(
        issue("repository.scan", `repository path is not a directory: ${root}`, { path: root }),
      );
      const empty: Array<string> = [];
      return empty;
    }
    const listed = yield* fs.glob(pattern, { root }).pipe(Effect.exit);
    if (Exit.isFailure(listed)) {
      issues.push(
        issue("repository.scan", `cannot inspect repository path: ${root}`, { path: root }),
      );
      const empty: Array<string> = [];
      return empty;
    }
    return [...listed.value].sort(compareText);
  });

const inspectLifecycleDirectories = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  issues: Array<FeatureDiagnostic>,
) =>
  Effect.gen(function* () {
    const directories = [
      ["plans", "active"],
      ["plans", "completed"],
      ["plans", "superseded"],
      ["design-specs", "superseded"],
    ] as const;
    for (const segments of directories) {
      const relative = segments.join("/");
      const absolute = path.resolve(root, ...segments);
      const inspected = yield* fs.stat(absolute).pipe(Effect.exit);
      if (Exit.isFailure(inspected)) continue;
      issues.push(
        issue(
          "feature.lifecycle.path",
          `lifecycle-dependent path exists; use the stable artifact path: ${relative}`,
          { path: relative },
        ),
      );
      const children = yield* globRelative(fs, absolute, "**/*", issues);
      for (const child of children) {
        const childRelative = normalizeRepositoryPath(
          path.relative(root, path.join(absolute, child)),
        );
        if (childRelative !== undefined) {
          issues.push(
            issue(
              "feature.lifecycle.path",
              `lifecycle-dependent artifact exists: ${childRelative}`,
              { path: childRelative },
            ),
          );
        }
      }
    }
  });

const featureIdFromPath = (
  path: Path.Path,
  value: string,
  extension: string,
): string | undefined => {
  const basename = path.basename(value);
  if (!basename.endsWith(extension)) return undefined;
  const featureId = basename.slice(0, -extension.length);
  return FEATURE_ID_PATTERN.test(featureId) ? featureId : undefined;
};

const inspectStableOrphans = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  candidates: ReadonlyMap<FeatureId, ReadonlyArray<DecodedWorkRecord>>,
  issues: Array<FeatureDiagnostic>,
) =>
  Effect.gen(function* () {
    const modelRoot = absoluteRepositoryPath(path, root, "model/work/features");
    const planRoot = absoluteRepositoryPath(path, root, "plans");
    const acceptanceRoot = absoluteRepositoryPath(path, root, "scripts/accept");

    const modelFiles = yield* globRelative(fs, modelRoot, "*.json", issues);
    for (const file of modelFiles) {
      const featureId = featureIdFromPath(path, file, ".json");
      if (featureId === undefined || !candidates.has(featureId)) {
        const relative = normalizeRepositoryPath(path.relative(root, path.join(modelRoot, file)));
        if (relative !== undefined) {
          issues.push(
            issue("feature.orphan.model", `canonical feature model has no owner: ${relative}`, {
              path: relative,
            }),
          );
        }
      }
    }

    const plans = yield* globRelative(fs, planRoot, "*.md", issues);
    for (const file of plans) {
      const featureId = featureIdFromPath(path, file, ".md");
      const relative = normalizeRepositoryPath(path.join("plans", file));
      if (relative === undefined) continue;
      if (featureId === undefined || !candidates.has(featureId)) {
        issues.push(
          issue("feature.orphan.plan", `plan has no canonical feature owner: ${relative}`, {
            path: relative,
          }),
        );
      }
    }

    const acceptance = yield* globRelative(fs, acceptanceRoot, "*.ts", issues);
    for (const file of acceptance) {
      const featureId = featureIdFromPath(path, file, ".ts");
      const relative = normalizeRepositoryPath(path.join("scripts/accept", file));
      if (relative === undefined) continue;
      if (featureId === undefined || !candidates.has(featureId)) {
        issues.push(
          issue(
            "feature.orphan.acceptance",
            `acceptance program has no canonical feature owner: ${relative}`,
            { path: relative },
          ),
        );
      }
    }
  });

export const validateFeatureRepository = (
  project: ProjectGraph,
  repositoryRoot: RepositoryRoot,
): Effect.Effect<ReadonlyArray<FeatureDiagnostic>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(repositoryRoot);
    const records = workRecords(project);
    const candidates = featureCandidates(records);
    const issues: Array<FeatureDiagnostic> = [];

    for (const record of records) {
      issues.push(...recordIssues(project, record, candidates));
      const completion = record.metadata?.completion;
      const featureId = featureIdFromRecord(record);
      if (completion !== undefined) {
        for (const evidence of completion.evidence) {
          if (evidence.source.kind !== "repository_artifact") continue;
          const normalized = normalizeRepositoryPath(evidence.source.path);
          if (normalized === undefined || normalized !== evidence.source.path) continue;
          yield* checkRegularFile(
            fs,
            absoluteRepositoryPath(path, root, normalized),
            normalized,
            issues,
            {
              featureId,
              missingCode: "work.evidence.artifact.missing",
              typeCode: "work.evidence.artifact.type",
            },
          );
        }
      }
    }

    const rootInfo = yield* fs.stat(root).pipe(Effect.exit);
    if (Exit.isFailure(rootInfo)) {
      issues.push(
        issue("repository.root", `repository root is not a directory: ${root}`, { path: root }),
      );
    } else if (rootInfo.value.type !== "Directory") {
      issues.push(
        issue("repository.root", `repository root is not a directory: ${root}`, { path: root }),
      );
    }

    const validFeatures: Array<FeatureArtifacts> = [];
    for (const [featureId, owners] of candidates) {
      if (owners.length !== 1) {
        issues.push(duplicateIssue(featureId, owners));
        continue;
      }
      const owner = owners[0];
      if (owner === undefined) continue;
      const result = artifactFromRecord(project, owner, candidates);
      if (isFeatureArtifact(result)) validFeatures.push(result);
    }
    validFeatures.sort((left, right) => {
      const byFeature = compareText(left.featureId, right.featureId);
      return byFeature !== 0 ? byFeature : compareText(left.entityId, right.entityId);
    });

    const entitiesBySource = new Map<RepositoryRelativePath, Array<Entity>>();
    for (const entity of project.entities.values()) {
      const relativeSource = sourceRelativePath(path, root, entity.source);
      if (relativeSource === undefined) continue;
      const sourceEntities = entitiesBySource.get(relativeSource);
      if (sourceEntities === undefined) entitiesBySource.set(relativeSource, [entity]);
      else sourceEntities.push(entity);
    }

    for (const feature of validFeatures) {
      const expectedSource = feature.modelSource;
      const owner = project.entities.get(feature.entityId);
      if (owner !== undefined) {
        const relativeSource = sourceRelativePath(path, root, owner.source);
        if (relativeSource !== expectedSource) {
          issues.push(
            issue("feature.source.path", `feature owner must be sourced from ${expectedSource}`, {
              entity: owner,
              featureId: feature.featureId,
              path: relativeSource ?? owner.source,
            }),
          );
        }
      }
      const sourceEntities = entitiesBySource.get(expectedSource) ?? [];
      if (sourceEntities.length !== 1 || sourceEntities[0]?.id !== feature.entityId) {
        issues.push(
          issue(
            "feature.source.contents",
            `feature model source must contain only ${feature.entityId}`,
            {
              entity: owner,
              featureId: feature.featureId,
              path: expectedSource,
            },
          ),
        );
      }
      const paths = [feature.modelSource, feature.designSpecPath, feature.planPath];
      for (const artifactPath of paths) {
        yield* checkRegularFile(
          fs,
          absoluteRepositoryPath(path, root, artifactPath),
          artifactPath,
          issues,
          { featureId: feature.featureId },
        );
      }
      const planAbsolute = absoluteRepositoryPath(path, root, feature.planPath);
      const planInfo = yield* fs.stat(planAbsolute).pipe(Effect.exit);
      if (Exit.isSuccess(planInfo) && planInfo.value.type === "File") {
        const planText = yield* fs.readFileString(planAbsolute).pipe(Effect.exit);
        if (Exit.isSuccess(planText)) {
          issues.push(...planContentIssues(planText.value, feature));
        } else {
          issues.push(
            issue("feature.plan.read", `cannot read plan: ${feature.planPath}`, {
              featureId: feature.featureId,
              path: feature.planPath,
            }),
          );
        }
      }
      if (feature.acceptance.kind === "runnable") {
        yield* checkRegularFile(
          fs,
          absoluteRepositoryPath(path, root, feature.acceptance.path),
          feature.acceptance.path,
          issues,
          { featureId: feature.featureId, executable: true },
        );
      }
    }

    yield* inspectLifecycleDirectories(fs, path, root, issues);
    yield* inspectStableOrphans(fs, path, root, candidates, issues);
    return sortDiagnostics(issues);
  });

const markdownLink = (label: string, target: string): string => `[${label}](../${target})`;

const lifecycleSection = (
  title: string,
  features: ReadonlyArray<FeatureArtifacts>,
): ReadonlyArray<string> => {
  const lines = [`## ${title}`, ""];
  if (features.length === 0) {
    lines.push("_None._", "");
    return lines;
  }
  for (const feature of features) {
    lines.push(`### \`${feature.featureId}\` — ${feature.name}`, "");
    lines.push(`- Status: \`${feature.status}\``);
    lines.push(`- Feature loop: \`${feature.featureLoop}\``);
    lines.push(`- Model: ${markdownLink("canonical record", feature.modelSource)}`);
    lines.push(`- Design: ${markdownLink("design contract", feature.designSpecPath)}`);
    lines.push(`- Plan: ${markdownLink("execution ledger", feature.planPath)}`);
    if (feature.acceptance.kind === "runnable") {
      lines.push(`- Acceptance: ${markdownLink("runnable program", feature.acceptance.path)}`);
    } else if (feature.acceptance.kind === "pre_loop") {
      lines.push("- Acceptance: non-runnable (`pre_loop`; no feature-loop program)");
    } else {
      lines.push(
        `- Acceptance: non-runnable (\`superseded\`; replacement \`${feature.acceptance.replacement.target}\`)`,
      );
    }
    lines.push("");
  }
  return lines;
};

export const renderFeatureLifecycle = (project: ProjectGraph): string => {
  const artifacts = resolveFeatures(project)
    .filter(isFeatureArtifact)
    .sort((left, right) => {
      const byFeature = compareText(left.featureId, right.featureId);
      return byFeature !== 0 ? byFeature : compareText(left.entityId, right.entityId);
    });
  const sections: Array<string> = [
    "# Feature lifecycle",
    "",
    "<!-- Generated. Edit canonical model sources, not this file. -->",
    "",
  ];
  const groups: ReadonlyArray<readonly [string, FeatureLifecycle]> = [
    ["Active", "active"],
    ["Completed", "completed"],
    ["Superseded", "superseded"],
  ];
  for (const [title, lifecycle] of groups) {
    sections.push(
      ...lifecycleSection(
        title,
        artifacts.filter((feature) => feature.lifecycle === lifecycle),
      ),
    );
  }
  return `${sections.join("\n").trimEnd()}\n`;
};
