import { Data, Effect, Schema } from "effect";
import type { Crypto, FileSystem, Path } from "effect";
import {
  compileFeatureDossier,
  type FeatureDossierArtifact,
  type FeatureDossierDiagnostic,
  type FeatureDossierInput,
} from "./feature-dossier.ts";
import { loadFeatureDossiers } from "./feature-loader.ts";
import type { Entity, ProjectGraph } from "./types.ts";

/** Canonical feature identity and repository-relative dossier path types. */
export type FeatureId = string;
export type RepositoryRelativePath = string;
export type RepositoryRoot = string;
export const FEATURE_ID_PATTERN = /^[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * These schemas remain vocabulary declarations for project-document tooling.
 * Lifecycle state is never decoded from a model entity; it is derived from a
 * compiled feature dossier instead.
 */
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
export const EvidenceSourceSchema = Schema.Unknown;
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
  implementation_head: Schema.optionalKey(Schema.String),
  integration_head: Schema.optionalKey(Schema.String),
  evidence: Schema.NonEmptyArray(EvidenceSchema),
});
export type Completion = typeof CompletionSchema.Type;
export const ReplacementSchema = Schema.Struct({
  target: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
});
export type Replacement = typeof ReplacementSchema.Type;
export const FeatureMetadataSchema = Schema.Struct({
  feature_id: Schema.optionalKey(Schema.String),
  feature_loop: Schema.optionalKey(FeatureLoopSchema),
  completion: Schema.optionalKey(CompletionSchema),
  replacement: Schema.optionalKey(ReplacementSchema),
});
export type FeatureMetadata = typeof FeatureMetadataSchema.Type;

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
  readonly featureLoop: FeatureLoop;
  readonly modelSource: RepositoryRelativePath;
  readonly designSpecPath: RepositoryRelativePath;
  readonly planPath: RepositoryRelativePath;
  readonly acceptance: FeatureAcceptance;
  readonly featureDossier: FeatureDossierArtifact;
  readonly lifecycle: FeatureDossierArtifact["lifecycle"];
  readonly queues: FeatureDossierArtifact["queues"];
  readonly diagnostics: ReadonlyArray<FeatureDossierDiagnostic>;
  readonly dossier: FeatureDossierArtifact;
}

export class FeatureDiagnostic extends Data.TaggedError("FeatureDiagnostic")<{
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly featureId?: string;
  readonly path?: string;
  readonly source?: string;
}> {}

export const isFeatureDiagnostic = (value: unknown): value is FeatureDiagnostic =>
  value instanceof FeatureDiagnostic;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sourceText = (
  sources: ReadonlyArray<{ readonly kind: string; readonly id: string }>,
): string =>
  sources
    .map((source) => `${source.kind}:${source.id}`)
    .sort(compareText)
    .join(", ");

const lifecycleRow = (feature: FeatureDossierArtifact): string => {
  const lifecycle = feature.lifecycle;
  return `| ${feature.feature_id} | ${lifecycle.phase.value} | ${lifecycle.readiness.value} | ${lifecycle.condition.value} | ${lifecycle.delivery.value} | ${lifecycle.closure.value} |`;
};

const dossierFrom = (value: FeatureDossierArtifact | FeatureArtifacts): FeatureDossierArtifact =>
  "dossier" in value ? value.dossier : value;

/** Render the lifecycle view from compiler output only. */
export const renderFeatureLifecycle = (
  dossiers: ReadonlyArray<FeatureDossierArtifact | FeatureArtifacts> | ProjectGraph,
): string => {
  const values = Array.isArray(dossiers)
    ? dossiers
        .map(dossierFrom)
        .sort((left, right) => compareText(left.feature_id, right.feature_id))
    : [];
  const rows = [
    "| Feature | Phase | Readiness | Condition | Delivery | Closure |",
    "|---|---|---|---|---|---|",
    ...values.map(lifecycleRow),
  ];
  const details = values.flatMap((feature) => {
    const dimensions = [
      ["phase", feature.lifecycle.phase],
      ["readiness", feature.lifecycle.readiness],
      ["condition", feature.lifecycle.condition],
      ["delivery", feature.lifecycle.delivery],
      ["closure", feature.lifecycle.closure],
    ] as const;
    const detail = [`### ${feature.feature_id}`, ""];
    for (const [name, dimension] of dimensions) {
      detail.push(
        `- **${name}**: ${dimension.value} (source: ${sourceText(dimension.sources) || "none"})`,
      );
    }
    detail.push("");
    return detail;
  });
  return `# Feature lifecycle\n\n<!-- Generated from canonical features/* dossiers. -->\n\n${rows.join("\n")}\n\n${details.join("\n")}`;
};

const bytesAsText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes).trimEnd();

/** Deterministic checked-in projection for generated/project-model/work-features.json. */
export const renderWorkFeatures = (
  dossiers: ReadonlyArray<FeatureDossierArtifact | FeatureArtifacts>,
): string => {
  const features = dossiers
    .map(dossierFrom)
    .sort((left, right) => compareText(left.feature_id, right.feature_id))
    .map((dossier) => ({
      feature_id: dossier.feature_id,
      directory: dossier.directory,
      facts: dossier.facts,
      receipts: dossier.receipts,
      historical_imports: dossier.historical_imports,
      lifecycle: dossier.lifecycle,
      invalidations: dossier.invalidations,
      queues: dossier.queues,
      ir: bytesAsText(dossier.work_ir_bytes),
      diagnostics: dossier.diagnostics,
    }));
  return `${JSON.stringify({ format: "semantic.feature-work-ir/v1", features }, null, 2)}\n`;
};

const emptyGitObservation = {
  format: "semantic.feature-git-observation/v1",
  head: "unobserved",
  clean: false,
};

const diagnosticFor = (featureId: string | undefined, error: unknown): FeatureDiagnostic => {
  const message = error instanceof Error ? error.message : String(error);
  return new FeatureDiagnostic({
    severity: "error",
    code: "feature.dossier",
    message,
    ...(featureId === undefined ? {} : { featureId }),
  });
};

const compileInputs = (
  inputs: ReadonlyArray<FeatureDossierInput>,
): Effect.Effect<ReadonlyArray<FeatureDossierArtifact>, FeatureDiagnostic, Crypto.Crypto> =>
  Effect.gen(function* () {
    const result: Array<FeatureDossierArtifact> = [];
    for (const input of inputs) {
      const compiled = yield* compileFeatureDossier(input).pipe(
        Effect.mapError((error) => diagnosticFor(input.feature_id, error)),
      );
      result.push(compiled);
    }
    return result;
  });

/** Load and compile every canonical dossier. The project graph is not consulted. */
export const compileFeatureDossiers = (
  root: RepositoryRoot,
  git: unknown = emptyGitObservation,
): Effect.Effect<
  ReadonlyArray<FeatureDossierArtifact>,
  FeatureDiagnostic,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const inputs = yield* loadFeatureDossiers(root, { git }).pipe(
      Effect.mapError((error) => diagnosticFor(undefined, error)),
    );
    return yield* compileInputs(inputs);
  });
const projectedStatus = (dossier: FeatureDossierArtifact): WorkStatus => {
  if (dossier.lifecycle.delivery.value === "done") return "complete";
  if (dossier.lifecycle.condition.value === "superseded") return "superseded";
  if (dossier.lifecycle.condition.value === "blocked") return "blocked";
  if (
    dossier.lifecycle.readiness.value === "accepted" ||
    dossier.lifecycle.readiness.value === "merge_ready"
  )
    return "ready";
  if (
    dossier.lifecycle.phase.value === "implementation" ||
    dossier.lifecycle.phase.value === "verification"
  )
    return "in_progress";
  return "planned";
};

const projectEntity = (dossier: FeatureDossierArtifact): Entity | undefined => {
  const identity = dossier.facts.find((fact) => fact.metadata.legacy_entity_id !== undefined);
  if (identity === undefined || identity.metadata.legacy_entity_id === undefined) return undefined;
  const entityId = identity.metadata.legacy_entity_id;
  return {
    id: entityId,
    kind: "work_item",
    name: identity.metadata.title ?? dossier.feature_id,
    summary: identity.metadata.summary ?? `Canonical feature dossier ${dossier.feature_id}`,
    status: projectedStatus(dossier),
    tags: ["feature", "dossier"],
    attributes: {
      feature_id: dossier.feature_id,
      feature_loop: "managed",
      phase: dossier.lifecycle.phase.value,
      readiness: dossier.lifecycle.readiness.value,
      condition: dossier.lifecycle.condition.value,
      delivery: dossier.lifecycle.delivery.value,
      closure: dossier.lifecycle.closure.value,
    },
    source: identity.path,
  };
};

/** Project canonical dossier work entities into the structural graph without authoring lifecycle state there. */
export const withFeatureDossiers = (
  project: ProjectGraph,
  dossiers: ReadonlyArray<FeatureDossierArtifact>,
): ProjectGraph => {
  const entities = new Map(project.entities);
  for (const dossier of dossiers) {
    const entity = projectEntity(dossier);
    if (entity !== undefined) entities.set(entity.id, entity);
  }
  return { ...project, entities };
};

/**
 * Validate canonical dossiers without treating a model graph as lifecycle
 * authority. The graph argument is intentionally ignored for compatibility
 * with callers that still validate structural model documents.
 */
export const validateFeatureRepository = (
  _project: ProjectGraph,
  repositoryRoot: RepositoryRoot,
): Effect.Effect<
  ReadonlyArray<FeatureDiagnostic>,
  never,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  compileFeatureDossiers(repositoryRoot).pipe(
    Effect.map(() => [] as ReadonlyArray<FeatureDiagnostic>),
    Effect.catch((error) =>
      Effect.succeed([
        error instanceof FeatureDiagnostic ? error : diagnosticFor(undefined, error),
      ]),
    ),
  );

/** Canonical changed-path ownership; old lifecycle roots are deliberately inert. */
export const featuresForChangedPaths = (
  _project: ProjectGraph,
  changedPaths: ReadonlyArray<RepositoryRelativePath>,
): ReadonlyArray<FeatureId> => {
  const ids = new Set<string>();
  for (const path of changedPaths) {
    const match = /^features\/([^/]+)(?:\/|$)/.exec(path);
    if (match !== null && FEATURE_ID_PATTERN.test(match[1]!)) ids.add(match[1]!);
  }
  return [...ids].sort(compareText);
};

export const resolveFeature = (
  _project: ProjectGraph,
  featureId: FeatureId,
): FeatureArtifacts | FeatureDiagnostic =>
  new FeatureDiagnostic({
    severity: "error",
    code: "feature.dossier_required",
    featureId,
    message: "feature lifecycle must be resolved from a canonical features/<id> dossier",
  });

export const resolveFeatures = (
  _project: ProjectGraph,
): ReadonlyArray<FeatureArtifacts | FeatureDiagnostic> => [];
