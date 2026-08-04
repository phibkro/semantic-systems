import { Crypto, Data, Effect, Exit, Schema } from "effect";
import { stringifyCanonicalJson } from "../references/canonical-json.ts";

/**
 * Pure schema boundary and lifecycle derivation for one feature dossier.
 *
 * The caller supplies already-read artifacts, receipts, and observations. The
 * digest on an artifact is therefore an explicit caller-verified identity; the
 * compiler compares that identity to every receipt but does not read files or
 * select a runtime capability.
 */

export const FEATURE_ARTIFACT_FORMAT = "semantic.feature-artifact/v1" as const;
export const FEATURE_TRANSITION_FORMAT = "semantic.feature-transition/v1" as const;
export const FEATURE_HISTORICAL_IMPORT_FORMAT = "semantic.feature-historical-import/v1" as const;
export const FEATURE_GIT_OBSERVATION_FORMAT = "semantic.feature-git-observation/v1" as const;
export const FEATURE_PROVIDER_OBSERVATION_FORMAT =
  "semantic.feature-provider-observation/v1" as const;
export const FEATURE_CLOSURE_OBSERVATION_FORMAT =
  "semantic.feature-closure-observation/v1" as const;
export const FEATURE_WORK_IR_FORMAT = "semantic.feature-work-ir/v1" as const;

export const FEATURE_ID_PATTERN = /^[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^(?:sha256:)?[0-9a-f]{64}$/;
const RELATIVE_PATH_PATTERN = /^(?![\\/])(?!.*(?:^|[\\/])\.{1,2}(?:[\\/]|$))(?!.*\\).+$/;
const NON_EMPTY = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));
const FEATURE_ID = Schema.String.pipe(Schema.check(Schema.isPattern(FEATURE_ID_PATTERN)));
const RELATIVE_PATH = Schema.String.pipe(Schema.check(Schema.isPattern(RELATIVE_PATH_PATTERN)));
const SHA256 = Schema.String.pipe(Schema.check(Schema.isPattern(SHA256_PATTERN)));

export const ARTIFACT_KIND_VALUES = [
  "proposal",
  "research",
  "design",
  "specification",
  "plan",
  "implementation_report",
  "acceptance",
  "verification",
  "review",
] as const;
export const ArtifactKindSchema = Schema.Literals(ARTIFACT_KIND_VALUES);
export type ArtifactKind = typeof ArtifactKindSchema.Type;

export const EVIDENCE_CATEGORY_VALUES = [
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
] as const;
export const EvidenceCategorySchema = Schema.Literals(EVIDENCE_CATEGORY_VALUES);
export type EvidenceCategory = typeof EvidenceCategorySchema.Type;

export const AUTHORITY_ROLE_VALUES = [
  "feature_owner",
  "research_author",
  "design_authority",
  "specification_authority",
  "implementation_agent",
  "implementation_authority",
  "verification_authority",
  "independent_reviewer",
  "review_authority",
  "protected_checks",
  "ci",
  "integration",
  "merge_authority",
  "closure_authority",
  "migration_operator",
  "operator",
] as const;
export const AuthorityRoleSchema = Schema.Literals(AUTHORITY_ROLE_VALUES);
export type AuthorityRole = typeof AuthorityRoleSchema.Type;

export const TRANSITION_KIND_VALUES = [
  "proposal_accepted",
  "research_accepted",
  "design_accepted",
  "specification_accepted",
  "candidate_nominated",
  "verification_accepted",
  "review_accepted",
  "checks_accepted",
  "merge_ready",
  "merge_observed",
  "feature_blocked",
  "feature_unblocked",
  "feature_withdrawn",
  "feature_superseded",
  "closure_observed",
] as const;
export const TransitionKindSchema = Schema.Literals(TRANSITION_KIND_VALUES);
export type TransitionKind = typeof TransitionKindSchema.Type;

export const PROVIDER_ACTION_VALUES = ["check", "review", "merge", "message", "cleanup"] as const;
export const ProviderActionSchema = Schema.Literals(PROVIDER_ACTION_VALUES);
export type ProviderAction = typeof ProviderActionSchema.Type;

export const CLOSURE_KIND_VALUES = ["feedback", "cleanup"] as const;
export const ClosureKindSchema = Schema.Literals(CLOSURE_KIND_VALUES);
export type ClosureKind = typeof ClosureKindSchema.Type;

export const FeaturePhaseSchema = Schema.Literals([
  "proposal",
  "research",
  "design",
  "implementation",
  "verification",
]);
export type FeaturePhase = typeof FeaturePhaseSchema.Type;

export const ReviewReadinessSchema = Schema.Literals([
  "drafting",
  "proposal_review_ready",
  "design_review_ready",
  "implementation_review_ready",
  "accepted",
  "merge_ready",
]);
export type ReviewReadiness = typeof ReviewReadinessSchema.Type;

export const FeatureConditionSchema = Schema.Literals([
  "active",
  "blocked",
  "withdrawn",
  "superseded",
]);
export type FeatureCondition = typeof FeatureConditionSchema.Type;

export const DeliveryStateSchema = Schema.Literals(["unmerged", "done"]);
export type DeliveryState = typeof DeliveryStateSchema.Type;

export const ClosureStateSchema = Schema.Literals(["open", "closed"]);
export type ClosureState = typeof ClosureStateSchema.Type;

const optionalString = Schema.optionalKey(NON_EMPTY);
const optionalFeatureId = Schema.optionalKey(FEATURE_ID);
const optionalHash = Schema.optionalKey(SHA256);
const optionalPath = Schema.optionalKey(RELATIVE_PATH);
const optionalCategories = Schema.optionalKey(Schema.Array(EvidenceCategorySchema));
const optionalClaims = Schema.optionalKey(Schema.Array(NON_EMPTY));

/** Strict frontmatter owned by one dossier artifact. Lifecycle status is not a field. */
export const ArtifactMetadataSchema = Schema.Struct({
  format: Schema.Literal(FEATURE_ARTIFACT_FORMAT),
  feature_id: FEATURE_ID,
  kind: ArtifactKindSchema,
  legacy_entity_id: optionalString,
  title: optionalString,
  summary: optionalString,
  objective: optionalString,
  owner: optionalString,
  dependencies: Schema.optionalKey(Schema.Array(FEATURE_ID)),
  evidence_categories: optionalCategories,
  unsupported_claims: optionalClaims,
}).annotate({ identifier: "FeatureDossierArtifactMetadata" });
export type ArtifactMetadata = typeof ArtifactMetadataSchema.Type;

/** An already-read dossier artifact and its caller-verified blob identity. */
export const DossierArtifactSchema = Schema.Struct({
  kind: ArtifactKindSchema,
  path: RELATIVE_PATH,
  content: Schema.String,
  sha256: SHA256,
  metadata: ArtifactMetadataSchema,
}).annotate({ identifier: "FeatureDossierArtifactInput" });
export type DossierArtifact = typeof DossierArtifactSchema.Type;
export const FeatureArtifactSchema = DossierArtifactSchema;
export type FeatureArtifact = DossierArtifact;

export const AuthorityIdentitySchema = Schema.Struct({
  identity: NON_EMPTY,
  role: AuthorityRoleSchema,
}).annotate({ identifier: "FeatureTransitionAuthority" });
export type AuthorityIdentity = typeof AuthorityIdentitySchema.Type;

/** A receipt is bound to the exact artifact hash when the transition is artifact-backed. */
export const TransitionReceiptSchema = Schema.Struct({
  format: Schema.Literal(FEATURE_TRANSITION_FORMAT),
  receipt_id: NON_EMPTY,
  feature_id: FEATURE_ID,
  transition: TransitionKindSchema,
  artifact_kind: Schema.optionalKey(ArtifactKindSchema),
  artifact_path: optionalPath,
  artifact_sha256: optionalHash,
  candidate_revision: optionalString,
  revision: optionalString,
  issuer: AuthorityIdentitySchema,
  observed_at: NON_EMPTY,
  evidence_category: EvidenceCategorySchema,
  reason: optionalString,
  replacement_feature_id: optionalFeatureId,
}).annotate({ identifier: "FeatureTransitionReceipt" });
export type TransitionReceipt = typeof TransitionReceiptSchema.Type;

export const HistoricalArtifactSchema = Schema.Struct({
  path: RELATIVE_PATH,
  sha256: SHA256,
  status: NON_EMPTY,
  evidence_categories: Schema.Array(EvidenceCategorySchema),
  completion_evidence: Schema.optionalKey(Schema.Array(NON_EMPTY)),
}).annotate({ identifier: "FeatureHistoricalArtifact" });
export type HistoricalArtifact = typeof HistoricalArtifactSchema.Type;

export const HistoricalImportSchema = Schema.Struct({
  format: Schema.Literal(FEATURE_HISTORICAL_IMPORT_FORMAT),
  import_id: NON_EMPTY,
  feature_id: FEATURE_ID,
  artifacts: Schema.NonEmptyArray(HistoricalArtifactSchema),
  integration_revision: NON_EMPTY,
  evidence_categories: Schema.Array(EvidenceCategorySchema),
  unsupported_claims: Schema.Array(NON_EMPTY),
  approved_by: AuthorityIdentitySchema,
}).annotate({ identifier: "FeatureHistoricalImport" });
export type HistoricalImport = typeof HistoricalImportSchema.Type;

export const GitObservationSchema = Schema.Struct({
  format: Schema.Literal(FEATURE_GIT_OBSERVATION_FORMAT),
  observation_id: optionalString,
  feature_id: optionalFeatureId,
  repository: optionalString,
  head: NON_EMPTY,
  canonical_main: optionalString,
  clean: Schema.Boolean,
  candidate_revision: optionalString,
  candidate_reachable: Schema.optionalKey(Schema.Boolean),
  reachable_from_main: Schema.optionalKey(Schema.Boolean),
  observed_at: optionalString,
}).annotate({ identifier: "FeatureGitObservation" });
export type GitObservation = typeof GitObservationSchema.Type;

export const ProviderRequestSchema = Schema.Struct({
  request_id: NON_EMPTY,
  feature_id: FEATURE_ID,
  action: ProviderActionSchema,
  revision: optionalString,
  requested_at: optionalString,
}).annotate({ identifier: "FeatureProviderRequest" });
export type ProviderRequest = typeof ProviderRequestSchema.Type;

export const ProviderObservationSchema = Schema.Struct({
  format: Schema.Literal(FEATURE_PROVIDER_OBSERVATION_FORMAT),
  observation_id: NON_EMPTY,
  request_id: optionalString,
  feature_id: FEATURE_ID,
  action: ProviderActionSchema,
  outcome: Schema.Literals(["success", "failure", "unknown"]),
  revision: optionalString,
  source: NON_EMPTY,
  observed_at: NON_EMPTY,
  evidence_category: EvidenceCategorySchema,
}).annotate({ identifier: "FeatureProviderObservation" });
export type ProviderObservation = typeof ProviderObservationSchema.Type;

export const ProviderObservationSetSchema = Schema.Struct({
  requests: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  observations: Schema.optionalKey(Schema.Array(Schema.Unknown)),
}).annotate({ identifier: "FeatureProviderObservationSet" });
export type ProviderObservationSet = typeof ProviderObservationSetSchema.Type;

export const ClosureObservationSchema = Schema.Struct({
  format: Schema.Literal(FEATURE_CLOSURE_OBSERVATION_FORMAT),
  observation_id: NON_EMPTY,
  feature_id: FEATURE_ID,
  kind: ClosureKindSchema,
  status: Schema.Literals(["accepted", "rejected", "unknown"]),
  source: NON_EMPTY,
  observed_at: NON_EMPTY,
  evidence_category: EvidenceCategorySchema,
}).annotate({ identifier: "FeatureClosureObservation" });
export type ClosureObservation = typeof ClosureObservationSchema.Type;

export const FeatureDossierObservationsSchema = Schema.Struct({
  git: Schema.Unknown,
  provider: Schema.optionalKey(Schema.Unknown),
  closure: Schema.optionalKey(Schema.Unknown),
}).annotate({ identifier: "FeatureDossierObservations" });
export type FeatureDossierObservations = typeof FeatureDossierObservationsSchema.Type;

/** The encoded boundary deliberately keeps artifact/receipt elements unknown until their own strict schema. */
export const FeatureDossierInputSchema = Schema.Struct({
  feature_id: FEATURE_ID,
  directory: RELATIVE_PATH,
  artifacts: Schema.Array(Schema.Unknown),
  receipts: Schema.Array(Schema.Unknown),
  observations: FeatureDossierObservationsSchema,
  historical_imports: Schema.optionalKey(Schema.Array(Schema.Unknown)),
}).annotate({ identifier: "FeatureDossierInput" });
export type FeatureDossierInput = typeof FeatureDossierInputSchema.Type;

export type SourceIdentityKind =
  | "artifact"
  | "transition_receipt"
  | "git_observation"
  | "provider_observation"
  | "closure_observation"
  | "historical_import";

export interface SourceIdentity {
  readonly kind: SourceIdentityKind;
  readonly id: string;
  readonly path?: string;
  readonly hash?: string;
}

export interface LifecycleDimension<Value extends string> {
  readonly value: Value;
  readonly sources: ReadonlyArray<SourceIdentity>;
}

export interface NormalizedArtifactFact {
  readonly feature_id: string;
  readonly kind: ArtifactKind;
  readonly path: string;
  readonly sha256: string;
  readonly metadata: ArtifactMetadata;
}

export interface NormalizedReceiptFact {
  readonly receipt_id: string;
  readonly feature_id: string;
  readonly transition: TransitionKind;
  readonly artifact_kind?: ArtifactKind;
  readonly artifact_path?: string;
  readonly artifact_sha256?: string;
  readonly candidate_revision?: string;
  readonly revision?: string;
  readonly issuer: AuthorityIdentity;
  readonly observed_at: string;
  readonly evidence_category: EvidenceCategory;
  readonly status: "accepted" | "rejected";
  readonly reason?: string;
  readonly source: SourceIdentity;
}

export interface HistoricalImportFact {
  readonly import_id: string;
  readonly feature_id: string;
  readonly integration_revision: string;
  readonly artifacts: ReadonlyArray<HistoricalArtifact>;
  readonly evidence_categories: ReadonlyArray<EvidenceCategory>;
  readonly unsupported_claims: ReadonlyArray<string>;
  readonly source: SourceIdentity;
}

export interface Invalidation {
  readonly code: "accepted_artifact_changed";
  readonly artifact_kind: ArtifactKind;
  readonly artifact_path: string;
  readonly accepted_hash: string;
  readonly current_hash: string;
  readonly invalidates: ReadonlyArray<"candidate" | "review" | "check" | "verification">;
  readonly sources: ReadonlyArray<SourceIdentity>;
}

export interface FeatureDossierDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly source?: SourceIdentity;
}

export interface ObservationOverlay {
  readonly git: GitObservation;
  readonly provider: {
    readonly requests: ReadonlyArray<ProviderRequest>;
    readonly observations: ReadonlyArray<ProviderObservation>;
  };
  readonly closure: ReadonlyArray<ClosureObservation>;
}

export interface FeatureDossierArtifact {
  readonly feature_id: string;
  readonly directory: string;
  readonly facts: ReadonlyArray<NormalizedArtifactFact>;
  readonly receipts: ReadonlyArray<NormalizedReceiptFact>;
  readonly historical_imports: ReadonlyArray<HistoricalImportFact>;
  readonly lifecycle: {
    readonly phase: LifecycleDimension<FeaturePhase>;
    readonly readiness: LifecycleDimension<ReviewReadiness>;
    readonly condition: LifecycleDimension<FeatureCondition>;
    readonly delivery: LifecycleDimension<DeliveryState>;
    readonly closure: LifecycleDimension<ClosureState>;
  };
  readonly invalidations: ReadonlyArray<Invalidation>;
  readonly queues: {
    readonly active: ReadonlyArray<string>;
    readonly review: ReadonlyArray<string>;
    readonly merge: ReadonlyArray<string>;
    readonly closure: ReadonlyArray<string>;
  };
  readonly work_ir_bytes: Uint8Array;
  readonly ir_bytes: Uint8Array;
  readonly observation_overlay: ObservationOverlay;
  readonly diagnostics: ReadonlyArray<FeatureDossierDiagnostic>;
}

export type FeatureDossierErrorCode =
  | "invalid_input"
  | "invalid_artifact"
  | "invalid_receipt"
  | "invalid_observation"
  | "invalid_historical_import"
  | "feature_id_mismatch"
  | "directory_identity_mismatch"
  | "conflicting_receipt"
  | "conflicting_artifact"
  | "canonical_encoding_failed";

export class FeatureDossierError extends Data.TaggedError("FeatureDossierError")<{
  readonly code: FeatureDossierErrorCode;
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const isFeatureDossierError = (value: unknown): value is FeatureDossierError =>
  value instanceof FeatureDossierError;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareSource = (left: SourceIdentity, right: SourceIdentity): number =>
  compareText(`${left.kind}\u0000${left.id}`, `${right.kind}\u0000${right.id}`);

const deepFreeze = <A>(value: A): A => {
  if (value !== null && typeof value === "object" && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const freezeArray = <A>(values: ReadonlyArray<A>): ReadonlyArray<A> => Object.freeze([...values]);

const hashValue = (value: string): string =>
  value.startsWith("sha256:") ? value.slice("sha256:".length) : value;

const sourceArtifact = (artifact: DossierArtifact): SourceIdentity => ({
  kind: "artifact",
  id: `${artifact.path}#${hashValue(artifact.sha256)}`,
  path: artifact.path,
  hash: artifact.sha256,
});

const sourceReceipt = (receipt: TransitionReceipt): SourceIdentity => ({
  kind: "transition_receipt",
  id: receipt.receipt_id,
  ...(receipt.artifact_path === undefined ? {} : { path: receipt.artifact_path }),
  ...(receipt.artifact_sha256 === undefined ? {} : { hash: receipt.artifact_sha256 }),
});

const sourceGit = (observation: GitObservation): SourceIdentity => ({
  kind: "git_observation",
  id: observation.observation_id ?? observation.head,
});

const sourceProvider = (observation: ProviderObservation): SourceIdentity => ({
  kind: "provider_observation",
  id: observation.observation_id,
});

const sourceClosure = (observation: ClosureObservation): SourceIdentity => ({
  kind: "closure_observation",
  id: observation.observation_id,
});

const sourceHistorical = (value: HistoricalImport): SourceIdentity => ({
  kind: "historical_import",
  id: value.import_id,
});

const error = (
  code: FeatureDossierErrorCode,
  path: string,
  message: string,
  cause?: unknown,
): FeatureDossierError =>
  new FeatureDossierError({
    code,
    path,
    message,
    ...(cause === undefined ? {} : { cause }),
  });

const decodeStrict = <A>(
  schema: Schema.ConstraintDecoder<A>,
  value: unknown,
): { readonly ok: true; readonly value: A } | { readonly ok: false; readonly message: string } => {
  const result = Schema.decodeUnknownExit(schema, { onExcessProperty: "error" })(value);
  return Exit.isSuccess(result)
    ? { ok: true, value: result.value }
    : { ok: false, message: String(result.cause) };
};
const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const verifyArtifactContentHashes = (
  input: unknown,
): Effect.Effect<void, FeatureDossierError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const decodedInput = decodeOne(FeatureDossierInputSchema, input, "invalid_input", "/");
    if (decodedInput.error !== undefined || decodedInput.value === undefined) {
      return yield* decodedInput.error!;
    }
    const crypto = yield* Crypto.Crypto;
    for (let index = 0; index < decodedInput.value.artifacts.length; index += 1) {
      const decodedArtifact = decodeOne(
        DossierArtifactSchema,
        decodedInput.value.artifacts[index],
        "invalid_artifact",
        `/artifacts/${index}`,
      );
      if (decodedArtifact.error !== undefined || decodedArtifact.value === undefined) {
        return yield* decodedArtifact.error!;
      }
      const actual = toHex(
        yield* crypto
          .digest("SHA-256", new TextEncoder().encode(decodedArtifact.value.content))
          .pipe(
            Effect.mapError((cause) =>
              error(
                "invalid_artifact",
                `/artifacts/${index}/sha256`,
                "cannot compute artifact content SHA-256",
                cause,
              ),
            ),
          ),
      );
      if (actual !== hashValue(decodedArtifact.value.sha256)) {
        return yield* error(
          "invalid_artifact",
          `/artifacts/${index}/sha256`,
          "artifact SHA-256 does not match its content",
        );
      }
    }
  });

const artifactPathBelongsToDirectory = (path: string, directory: string): boolean =>
  path.startsWith(`${directory}/`) && path.length > directory.length + 1;

const artifactKey = (kind: ArtifactKind, path: string): string => `${kind}\u0000${path}`;

const transitionRequiresArtifact = (transition: TransitionKind): boolean =>
  transition !== "merge_ready" &&
  transition !== "merge_observed" &&
  transition !== "feature_blocked" &&
  transition !== "feature_unblocked" &&
  transition !== "feature_withdrawn" &&
  transition !== "feature_superseded" &&
  transition !== "closure_observed";

const expectedArtifactKind = (transition: TransitionKind): ArtifactKind | undefined => {
  switch (transition) {
    case "proposal_accepted":
      return "proposal";
    case "research_accepted":
      return "research";
    case "design_accepted":
      return "design";
    case "specification_accepted":
      return "specification";
    case "candidate_nominated":
      return "implementation_report";
    case "verification_accepted":
      return "verification";
    case "review_accepted":
      return "review";
    case "checks_accepted":
      return "verification";
    default:
      return undefined;
  }
};

const roleAllowed = (transition: TransitionKind, role: AuthorityRole): boolean => {
  switch (transition) {
    case "proposal_accepted":
    case "research_accepted":
      return role === "feature_owner" || role === "research_author";
    case "design_accepted":
      return role === "feature_owner" || role === "design_authority";
    case "specification_accepted":
      return (
        role === "feature_owner" || role === "specification_authority" || role === "integration"
      );
    case "candidate_nominated":
      return role === "implementation_agent" || role === "implementation_authority";
    case "verification_accepted":
      return role === "verification_authority" || role === "integration";
    case "review_accepted":
      return role === "independent_reviewer" || role === "review_authority";
    case "checks_accepted":
      return role === "protected_checks" || role === "ci";
    case "merge_ready":
    case "merge_observed":
      return role === "merge_authority" || role === "integration";
    case "feature_blocked":
    case "feature_unblocked":
    case "feature_withdrawn":
    case "feature_superseded":
      return role === "feature_owner" || role === "integration";
    case "closure_observed":
      return role === "closure_authority" || role === "integration";
  }
};

const acceptedTransitionForArtifact = (
  receipt: TransitionReceipt,
  artifact: DossierArtifact | undefined,
): { readonly accepted: boolean; readonly reason?: string } => {
  if (!roleAllowed(receipt.transition, receipt.issuer.role)) {
    return { accepted: false, reason: "unauthorized authority role" };
  }
  if (receipt.transition === "feature_superseded" && receipt.replacement_feature_id === undefined) {
    return { accepted: false, reason: "supersession requires a replacement feature ID" };
  }
  if (receipt.transition === "feature_withdrawn" && receipt.reason === undefined) {
    return { accepted: false, reason: "withdrawal requires a reason" };
  }
  if (transitionRequiresArtifact(receipt.transition)) {
    const expected = expectedArtifactKind(receipt.transition);
    if (artifact === undefined) return { accepted: false, reason: "receipt artifact is missing" };
    if (
      receipt.artifact_kind === undefined ||
      receipt.artifact_path === undefined ||
      receipt.artifact_sha256 === undefined
    ) {
      return { accepted: false, reason: "artifact-backed receipt must bind kind, path, and hash" };
    }
    if (receipt.artifact_kind !== expected) {
      return { accepted: false, reason: `receipt expects artifact kind ${expected}` };
    }
    if (receipt.artifact_path !== artifact.path) {
      return {
        accepted: false,
        reason: "receipt artifact path does not match the current artifact",
      };
    }
    if (hashValue(receipt.artifact_sha256) !== hashValue(artifact.sha256)) {
      return {
        accepted: false,
        reason: "receipt artifact hash does not match the current artifact",
      };
    }
  }
  return { accepted: true };
};

const diagnosticSortKey = (diagnostic: FeatureDossierDiagnostic): string =>
  `${diagnostic.path}\u0000${diagnostic.code}\u0000${diagnostic.message}`;

const sortDiagnostics = (
  values: ReadonlyArray<FeatureDossierDiagnostic>,
): ReadonlyArray<FeatureDossierDiagnostic> =>
  freezeArray(
    [...values].sort((left, right) =>
      compareText(diagnosticSortKey(left), diagnosticSortKey(right)),
    ),
  );

const sortSources = (values: ReadonlyArray<SourceIdentity>): ReadonlyArray<SourceIdentity> =>
  freezeArray([...values].sort(compareSource));

const decodeOne = <A>(
  schema: Schema.ConstraintDecoder<A>,
  value: unknown,
  code: FeatureDossierErrorCode,
  path: string,
): { readonly value?: A; readonly error?: FeatureDossierError } => {
  const decoded = decodeStrict(schema, value);
  return decoded.ok ? { value: decoded.value } : { error: error(code, path, decoded.message) };
};

interface DecodedProvider {
  readonly requests: ReadonlyArray<ProviderRequest>;
  readonly observations: ReadonlyArray<ProviderObservation>;
  readonly error?: FeatureDossierError;
}

interface DecodedClosure {
  readonly observations: ReadonlyArray<ClosureObservation>;
  readonly error?: FeatureDossierError;
}

const decodeProvider = (value: unknown): DecodedProvider => {
  const envelope = decodeOne(
    ProviderObservationSetSchema,
    value,
    "invalid_observation",
    "/observations/provider",
  );
  if (envelope.error !== undefined)
    return { requests: [], observations: [], error: envelope.error };
  if (envelope.value === undefined) {
    return {
      requests: [],
      observations: [],
      error: error(
        "invalid_observation",
        "/observations/provider",
        "provider schema decoder returned no value",
      ),
    };
  }
  const requests: ProviderRequest[] = [];
  for (let index = 0; index < (envelope.value.requests ?? []).length; index += 1) {
    const decoded = decodeOne(
      ProviderRequestSchema,
      envelope.value.requests?.[index],
      "invalid_observation",
      `/observations/provider/requests/${index}`,
    );
    if (decoded.error !== undefined)
      return { requests: [], observations: [], error: decoded.error };
    if (decoded.value === undefined) {
      return {
        requests: [],
        observations: [],
        error: error(
          "invalid_observation",
          `/observations/provider/requests/${index}`,
          "provider request schema decoder returned no value",
        ),
      };
    }
    requests.push(decoded.value);
  }
  const observations: ProviderObservation[] = [];
  for (let index = 0; index < (envelope.value.observations ?? []).length; index += 1) {
    const decoded = decodeOne(
      ProviderObservationSchema,
      envelope.value.observations?.[index],
      "invalid_observation",
      `/observations/provider/observations/${index}`,
    );
    if (decoded.error !== undefined)
      return { requests: [], observations: [], error: decoded.error };
    if (decoded.value === undefined) {
      return {
        requests: [],
        observations: [],
        error: error(
          "invalid_observation",
          `/observations/provider/observations/${index}`,
          "provider observation schema decoder returned no value",
        ),
      };
    }
    observations.push(decoded.value);
  }
  requests.sort((left, right) => compareText(left.request_id, right.request_id));
  observations.sort((left, right) => compareText(left.observation_id, right.observation_id));
  return { requests: freezeArray(requests), observations: freezeArray(observations) };
};

const decodeClosure = (value: unknown): DecodedClosure => {
  const decoded = decodeOne(
    Schema.Array(Schema.Unknown),
    value,
    "invalid_observation",
    "/observations/closure",
  );
  if (decoded.error !== undefined) return { observations: [], error: decoded.error };
  if (decoded.value === undefined) {
    return {
      observations: [],
      error: error(
        "invalid_observation",
        "/observations/closure",
        "closure schema decoder returned no value",
      ),
    };
  }
  const observations: ClosureObservation[] = [];
  for (let index = 0; index < decoded.value.length; index += 1) {
    const item = decodeOne(
      ClosureObservationSchema,
      decoded.value[index],
      "invalid_observation",
      `/observations/closure/${index}`,
    );
    if (item.error !== undefined) return { observations: [], error: item.error };
    if (item.value === undefined) {
      return {
        observations: [],
        error: error(
          "invalid_observation",
          `/observations/closure/${index}`,
          "closure observation schema decoder returned no value",
        ),
      };
    }
    observations.push(item.value);
  }
  observations.sort((left, right) => compareText(left.observation_id, right.observation_id));
  return { observations: freezeArray(observations) };
};

const normalizedArtifact = (artifact: DossierArtifact): NormalizedArtifactFact =>
  deepFreeze({
    feature_id: artifact.metadata.feature_id,
    kind: artifact.kind,
    path: artifact.path,
    sha256: artifact.sha256,
    metadata: artifact.metadata,
  });

const normalizedHistorical = (value: HistoricalImport): HistoricalImportFact =>
  deepFreeze({
    import_id: value.import_id,
    feature_id: value.feature_id,
    integration_revision: value.integration_revision,
    artifacts: freezeArray(value.artifacts),
    evidence_categories: freezeArray(value.evidence_categories),
    unsupported_claims: freezeArray(value.unsupported_claims),
    source: sourceHistorical(value),
  });

const lifecycleDimension = <A extends string>(
  value: A,
  sources: ReadonlyArray<SourceIdentity>,
): LifecycleDimension<A> => deepFreeze({ value, sources: sortSources(sources) });

const transitionSources = (
  receipts: ReadonlyArray<NormalizedReceiptFact>,
  transition: TransitionKind,
): ReadonlyArray<SourceIdentity> =>
  sortSources(
    receipts
      .filter((receipt) => receipt.status === "accepted" && receipt.transition === transition)
      .map((receipt) => receipt.source),
  );

const hasAccepted = (
  receipts: ReadonlyArray<NormalizedReceiptFact>,
  transition: TransitionKind,
): boolean =>
  receipts.some((receipt) => receipt.status === "accepted" && receipt.transition === transition);

const sourceForArtifactKind = (
  artifacts: ReadonlyArray<DossierArtifact>,
  kind: ArtifactKind,
): ReadonlyArray<SourceIdentity> =>
  sortSources(artifacts.filter((artifact) => artifact.kind === kind).map(sourceArtifact));
const providerObservationMatchesRequest = (
  request: ProviderRequest,
  observation: ProviderObservation,
  candidateRevision: string | undefined,
): boolean => {
  if (
    observation.outcome !== "success" ||
    observation.request_id !== request.request_id ||
    observation.feature_id !== request.feature_id ||
    observation.action !== request.action
  ) {
    return false;
  }
  if (
    request.revision !== undefined &&
    candidateRevision !== undefined &&
    request.revision !== candidateRevision
  ) {
    return false;
  }
  const expectedRevision = request.revision ?? candidateRevision;
  return expectedRevision === undefined || observation.revision === expectedRevision;
};

const deriveLifecycle = (
  artifacts: ReadonlyArray<DossierArtifact>,
  receipts: ReadonlyArray<NormalizedReceiptFact>,
  git: GitObservation,
  providerRequests: ReadonlyArray<ProviderRequest>,
  providerObservations: ReadonlyArray<ProviderObservation>,
  closure: ReadonlyArray<ClosureObservation>,
  diagnostics: FeatureDossierDiagnostic[],
): FeatureDossierArtifact["lifecycle"] => {
  const proposalAccepted = hasAccepted(receipts, "proposal_accepted");
  const researchAccepted = hasAccepted(receipts, "research_accepted");
  const designAccepted = hasAccepted(receipts, "design_accepted");
  const specificationAccepted = hasAccepted(receipts, "specification_accepted");
  const candidateNominated = hasAccepted(receipts, "candidate_nominated");
  const verificationAccepted = hasAccepted(receipts, "verification_accepted");
  const reviewAccepted = hasAccepted(receipts, "review_accepted");
  const checksAccepted = hasAccepted(receipts, "checks_accepted");

  let phase: FeaturePhase = "proposal";
  let phaseSources: ReadonlyArray<SourceIdentity> = sourceForArtifactKind(artifacts, "proposal");
  if (verificationAccepted) {
    phase = "verification";
    phaseSources = transitionSources(receipts, "verification_accepted");
  } else if (candidateNominated) {
    phase = "implementation";
    phaseSources = transitionSources(receipts, "candidate_nominated");
  } else if (specificationAccepted) {
    phase = "implementation";
    phaseSources = transitionSources(receipts, "specification_accepted");
  } else if (designAccepted) {
    phase = "implementation";
    phaseSources = transitionSources(receipts, "design_accepted");
  } else if (researchAccepted) {
    phase = "design";
    phaseSources = transitionSources(receipts, "research_accepted");
  } else if (proposalAccepted) {
    phase = artifacts.some((artifact) => artifact.kind === "research") ? "research" : "design";
    phaseSources = transitionSources(receipts, "proposal_accepted");
  }

  let readiness: ReviewReadiness = "drafting";
  let readinessSources: ReadonlyArray<SourceIdentity> = sourceForArtifactKind(
    artifacts,
    "proposal",
  );
  if (proposalAccepted && !designAccepted) {
    readiness = "design_review_ready";
    readinessSources = transitionSources(receipts, "proposal_accepted");
  } else if (designAccepted && !specificationAccepted) {
    readiness = "implementation_review_ready";
    readinessSources = transitionSources(receipts, "design_accepted");
  } else if (specificationAccepted && !candidateNominated) {
    readiness = "accepted";
    readinessSources = transitionSources(receipts, "specification_accepted");
  } else if (candidateNominated || verificationAccepted) {
    readiness = "implementation_review_ready";
    readinessSources = candidateNominated
      ? transitionSources(receipts, "candidate_nominated")
      : transitionSources(receipts, "verification_accepted");
  }
  if (
    specificationAccepted &&
    candidateNominated &&
    verificationAccepted &&
    reviewAccepted &&
    checksAccepted
  ) {
    readiness = "merge_ready";
    readinessSources = sortSources([
      ...transitionSources(receipts, "review_accepted"),
      ...transitionSources(receipts, "checks_accepted"),
    ]);
  }

  let condition: FeatureCondition = "active";
  let conditionSources: ReadonlyArray<SourceIdentity> = transitionSources(
    receipts,
    "proposal_accepted",
  );
  if (conditionSources.length === 0)
    conditionSources = sourceForArtifactKind(artifacts, "proposal");
  if (hasAccepted(receipts, "feature_withdrawn")) {
    condition = "withdrawn";
    conditionSources = transitionSources(receipts, "feature_withdrawn");
  } else if (hasAccepted(receipts, "feature_superseded")) {
    condition = "superseded";
    conditionSources = transitionSources(receipts, "feature_superseded");
  } else if (
    hasAccepted(receipts, "feature_blocked") &&
    !hasAccepted(receipts, "feature_unblocked")
  ) {
    condition = "blocked";
    conditionSources = transitionSources(receipts, "feature_blocked");
  } else if (hasAccepted(receipts, "feature_unblocked")) {
    conditionSources = transitionSources(receipts, "feature_unblocked");
  }

  const candidateReceipt = receipts.find(
    (receipt) => receipt.status === "accepted" && receipt.transition === "candidate_nominated",
  );
  const gitReachable = git.candidate_reachable ?? git.reachable_from_main ?? false;
  const candidateRevision = candidateReceipt?.candidate_revision ?? candidateReceipt?.revision;
  const candidateMatches =
    candidateReceipt === undefined ||
    git.candidate_revision === undefined ||
    candidateRevision === undefined ||
    git.candidate_revision === candidateRevision;
  const providerObservationByRequest = new Map<string, ProviderObservation>();
  for (const request of providerRequests) {
    const matchingObservation = providerObservations.find((observation) =>
      providerObservationMatchesRequest(request, observation, candidateRevision),
    );
    if (matchingObservation !== undefined) {
      providerObservationByRequest.set(request.request_id, matchingObservation);
    }
  }
  for (const observation of providerObservations) {
    if (
      observation.outcome === "success" &&
      !providerRequests.some((request) =>
        providerObservationMatchesRequest(request, observation, candidateRevision),
      )
    ) {
      diagnostics.push({
        code: "provider.invalid_observation",
        path: "/observations/provider/observations",
        message:
          "successful provider observation does not match a request by request ID, feature ID, action, and revision",
        source: sourceProvider(observation),
      });
    }
  }
  const providerRequestsComplete = providerRequests.every((request) =>
    providerObservationByRequest.has(request.request_id),
  );
  const done = gitReachable && candidateNominated && candidateMatches && providerRequestsComplete;
  const deliverySources = done
    ? [
        sourceGit(git),
        ...providerRequests.flatMap((request) => {
          const observation = providerObservationByRequest.get(request.request_id);
          return observation === undefined ? [] : [sourceProvider(observation)];
        }),
      ]
    : [];

  const feedback = closure.find(
    (observation) => observation.kind === "feedback" && observation.status === "accepted",
  );
  const cleanup = closure.find(
    (observation) => observation.kind === "cleanup" && observation.status === "accepted",
  );
  const closed = feedback !== undefined && cleanup !== undefined;
  const closureSources =
    feedback !== undefined && cleanup !== undefined
      ? [sourceClosure(feedback), sourceClosure(cleanup)]
      : [];

  if (providerRequests.length > 0 && !providerRequestsComplete) {
    diagnostics.push({
      code: "provider.request_without_observation",
      path: "/observations/provider",
      message:
        "a provider request has no successful matching observation and cannot establish delivery",
    });
  }
  if (condition === "blocked") {
    diagnostics.push({
      code: "feature.blocked",
      path: "/receipts",
      message: "blocked condition preserves the derived phase and delivery state",
      ...(conditionSources[0] === undefined ? {} : { source: conditionSources[0] }),
    });
  }
  if (done && closed) {
    diagnostics.push({
      code: "closure.accepted",
      path: "/observations/closure",
      message: "feedback and cleanup observations both accepted",
      ...(closureSources[0] === undefined ? {} : { source: closureSources[0] }),
    });
  }

  return deepFreeze({
    phase: lifecycleDimension(phase, phaseSources),
    readiness: lifecycleDimension(readiness, readinessSources),
    condition: lifecycleDimension(condition, conditionSources),
    delivery: lifecycleDimension(done ? "done" : "unmerged", deliverySources),
    closure: lifecycleDimension(closed ? "closed" : "open", closureSources),
  });
};
const makeIrBytes = (
  featureId: string,
  directory: string,
  artifacts: ReadonlyArray<NormalizedArtifactFact>,
  receipts: ReadonlyArray<NormalizedReceiptFact>,
  historicalImports: ReadonlyArray<HistoricalImportFact>,
): Uint8Array => {
  const tree = {
    format: FEATURE_WORK_IR_FORMAT,
    feature_id: featureId,
    directory,
    artifacts: artifacts.map((artifact) => ({
      feature_id: artifact.feature_id,
      kind: artifact.kind,
      path: artifact.path,
      sha256: artifact.sha256,
      metadata: artifact.metadata,
    })),
    receipts: receipts.map((receipt) => ({
      receipt_id: receipt.receipt_id,
      feature_id: receipt.feature_id,
      transition: receipt.transition,
      ...(receipt.artifact_kind === undefined ? {} : { artifact_kind: receipt.artifact_kind }),
      ...(receipt.artifact_path === undefined ? {} : { artifact_path: receipt.artifact_path }),
      ...(receipt.artifact_sha256 === undefined
        ? {}
        : { artifact_sha256: receipt.artifact_sha256 }),
      ...(receipt.candidate_revision === undefined
        ? {}
        : { candidate_revision: receipt.candidate_revision }),
      ...(receipt.revision === undefined ? {} : { revision: receipt.revision }),
      issuer: receipt.issuer,
      observed_at: receipt.observed_at,
      evidence_category: receipt.evidence_category,
      status: receipt.status,
      ...(receipt.reason === undefined ? {} : { reason: receipt.reason }),
    })),
    historical_imports: historicalImports.map((value) => ({
      import_id: value.import_id,
      feature_id: value.feature_id,
      integration_revision: value.integration_revision,
      artifacts: value.artifacts,
      evidence_categories: value.evidence_categories,
      unsupported_claims: value.unsupported_claims,
    })),
  };
  return new TextEncoder().encode(`${stringifyCanonicalJson(tree)}\n`);
};

const compileUnknown = (input: unknown): FeatureDossierArtifact | FeatureDossierError => {
  const decodedInput = decodeOne(FeatureDossierInputSchema, input, "invalid_input", "/");
  if (decodedInput.error !== undefined || decodedInput.value === undefined)
    return decodedInput.error!;
  const value = decodedInput.value;
  const expectedDirectory = `features/${value.feature_id}`;
  if (value.directory !== expectedDirectory) {
    return error(
      "directory_identity_mismatch",
      "/directory",
      `dossier directory must be exactly ${expectedDirectory}`,
    );
  }

  const artifacts: DossierArtifact[] = [];
  const artifactByKey = new Map<string, DossierArtifact>();
  for (let index = 0; index < value.artifacts.length; index += 1) {
    const decoded = decodeOne(
      DossierArtifactSchema,
      value.artifacts[index],
      "invalid_artifact",
      `/artifacts/${index}`,
    );
    if (decoded.error !== undefined || decoded.value === undefined) return decoded.error!;
    const artifact = decoded.value;
    if (!artifactPathBelongsToDirectory(artifact.path, expectedDirectory)) {
      return error(
        "invalid_artifact",
        `/artifacts/${index}/path`,
        `artifact path must remain under dossier directory ${expectedDirectory}`,
      );
    }
    if (artifact.metadata.feature_id !== value.feature_id) {
      return error(
        "feature_id_mismatch",
        `/artifacts/${index}/metadata/feature_id`,
        "artifact metadata feature ID does not match the dossier feature ID",
      );
    }
    if (artifact.metadata.kind !== artifact.kind) {
      return error(
        "invalid_artifact",
        `/artifacts/${index}/metadata/kind`,
        "artifact metadata kind does not match the artifact kind",
      );
    }
    const key = artifactKey(artifact.kind, artifact.path);
    const previous = artifactByKey.get(key);
    if (previous !== undefined) {
      if (
        hashValue(previous.sha256) !== hashValue(artifact.sha256) ||
        previous.content !== artifact.content
      ) {
        return error(
          "conflicting_artifact",
          `/artifacts/${index}`,
          "two artifacts claim one path with different content or hash",
        );
      }
      continue;
    }
    artifactByKey.set(key, artifact);
    artifacts.push(artifact);
  }
  artifacts.sort((left, right) =>
    compareText(artifactKey(left.kind, left.path), artifactKey(right.kind, right.path)),
  );

  const historicalImports: HistoricalImport[] = [];
  const historicalById = new Set<string>();
  for (let index = 0; index < (value.historical_imports ?? []).length; index += 1) {
    const decoded = decodeOne(
      HistoricalImportSchema,
      value.historical_imports?.[index],
      "invalid_historical_import",
      `/historical_imports/${index}`,
    );
    if (decoded.error !== undefined || decoded.value === undefined) return decoded.error!;
    const historical = decoded.value;
    if (historical.feature_id !== value.feature_id) {
      return error(
        "feature_id_mismatch",
        `/historical_imports/${index}/feature_id`,
        "historical import feature ID does not match the dossier feature ID",
      );
    }
    if (historical.approved_by.role !== "migration_operator") {
      return error(
        "invalid_historical_import",
        `/historical_imports/${index}/approved_by/role`,
        "historical import requires the migration operator role",
      );
    }
    if (historicalById.has(historical.import_id)) {
      return error(
        "conflicting_artifact",
        `/historical_imports/${index}/import_id`,
        "duplicate historical import identity",
      );
    }
    historicalById.add(historical.import_id);
    historicalImports.push(historical);
  }
  historicalImports.sort((left, right) => compareText(left.import_id, right.import_id));

  const receipts: TransitionReceipt[] = [];
  const receiptsById = new Map<string, TransitionReceipt>();
  const receiptsByTransitionKey = new Map<string, TransitionReceipt>();
  const diagnostics: FeatureDossierDiagnostic[] = [];
  const invalidations: Invalidation[] = [];
  for (let index = 0; index < value.receipts.length; index += 1) {
    const decoded = decodeOne(
      TransitionReceiptSchema,
      value.receipts[index],
      "invalid_receipt",
      `/receipts/${index}`,
    );
    if (decoded.error !== undefined || decoded.value === undefined) return decoded.error!;
    const receipt = decoded.value;
    if (receipt.feature_id !== value.feature_id) {
      return error(
        "feature_id_mismatch",
        `/receipts/${index}/feature_id`,
        "receipt feature ID does not match the dossier feature ID",
      );
    }
    const priorIdentity = receiptsById.get(receipt.receipt_id);
    if (priorIdentity !== undefined) {
      if (stringifyCanonicalJson(priorIdentity) !== stringifyCanonicalJson(receipt)) {
        return error(
          "conflicting_receipt",
          `/receipts/${index}`,
          "receipt identity is reused with different content",
        );
      }
      continue;
    }
    const transitionKey = `${receipt.transition}\u0000${receipt.artifact_kind ?? ""}\u0000${receipt.artifact_path ?? ""}`;
    const priorTransition = receiptsByTransitionKey.get(transitionKey);
    if (
      priorTransition !== undefined &&
      stringifyCanonicalJson(priorTransition) !== stringifyCanonicalJson(receipt)
    ) {
      return error(
        "conflicting_receipt",
        `/receipts/${index}`,
        "conflicting receipts claim one transition target",
      );
    }
    receiptsById.set(receipt.receipt_id, receipt);
    receiptsByTransitionKey.set(transitionKey, receipt);
    receipts.push(receipt);
  }
  receipts.sort((left, right) => compareText(left.receipt_id, right.receipt_id));

  const acceptedCandidate = receipts.find(
    (receipt) =>
      receipt.transition === "candidate_nominated" &&
      roleAllowed(receipt.transition, receipt.issuer.role),
  );
  const normalizedById = new Map<string, NormalizedReceiptFact>();
  for (const receipt of receipts) {
    const artifact =
      receipt.artifact_kind !== undefined && receipt.artifact_path !== undefined
        ? artifactByKey.get(artifactKey(receipt.artifact_kind, receipt.artifact_path))
        : undefined;
    const decision = acceptedTransitionForArtifact(receipt, artifact);
    let accepted = decision.accepted;
    let reason = decision.reason;
    if (
      accepted &&
      acceptedCandidate !== undefined &&
      (receipt.transition === "specification_accepted" ||
        receipt.transition === "review_accepted") &&
      receipt.issuer.identity === acceptedCandidate.issuer.identity
    ) {
      accepted = false;
      reason = "implementation agent cannot accept its own specification or independent review";
    }
    if (
      !accepted &&
      reason === "receipt artifact hash does not match the current artifact" &&
      artifact !== undefined
    ) {
      invalidations.push({
        code: "accepted_artifact_changed",
        artifact_kind: artifact.kind,
        artifact_path: artifact.path,
        accepted_hash: receipt.artifact_sha256 ?? "",
        current_hash: artifact.sha256,
        invalidates: ["candidate", "review", "check", "verification"],
        sources: sortSources([sourceReceipt(receipt), sourceArtifact(artifact)]),
      });
    }
    if (!accepted) {
      diagnostics.push({
        code:
          reason === "unauthorized authority role"
            ? "receipt.unauthorized_role"
            : reason === "receipt artifact hash does not match the current artifact"
              ? "receipt.hash_mismatch"
              : reason ===
                  "implementation agent cannot accept its own specification or independent review"
                ? "receipt.self_attestation"
                : reason === "supersession requires a replacement feature ID"
                  ? "receipt.supersession_missing_replacement"
                  : reason === "receipt artifact is missing"
                    ? "receipt.artifact_missing"
                    : "receipt.rejected",
        path: `/receipts/${receipt.receipt_id}`,
        message: reason ?? "receipt rejected",
        source: sourceReceipt(receipt),
      });
    }
    normalizedById.set(receipt.receipt_id, {
      receipt_id: receipt.receipt_id,
      feature_id: receipt.feature_id,
      transition: receipt.transition,
      ...(receipt.artifact_kind === undefined ? {} : { artifact_kind: receipt.artifact_kind }),
      ...(receipt.artifact_path === undefined ? {} : { artifact_path: receipt.artifact_path }),
      ...(receipt.artifact_sha256 === undefined
        ? {}
        : { artifact_sha256: receipt.artifact_sha256 }),
      ...(receipt.candidate_revision === undefined
        ? {}
        : { candidate_revision: receipt.candidate_revision }),
      ...(receipt.revision === undefined ? {} : { revision: receipt.revision }),
      issuer: receipt.issuer,
      observed_at: receipt.observed_at,
      evidence_category: receipt.evidence_category,
      status: accepted ? "accepted" : "rejected",
      ...(reason === undefined ? {} : { reason }),
      source: sourceReceipt(receipt),
    });
  }
  const changedAcceptedPaths = new Set(invalidations.map((item) => item.artifact_path));
  if (changedAcceptedPaths.size > 0) {
    for (const receipt of receipts) {
      const normalized = normalizedById.get(receipt.receipt_id);
      if (
        normalized !== undefined &&
        normalized.status === "accepted" &&
        (normalized.transition === "candidate_nominated" ||
          normalized.transition === "review_accepted" ||
          normalized.transition === "checks_accepted" ||
          normalized.transition === "verification_accepted")
      ) {
        normalizedById.set(receipt.receipt_id, {
          ...normalized,
          status: "rejected",
          reason: "dependent accepted facts invalidated by an accepted artifact change",
        });
        diagnostics.push({
          code: "receipt.dependent_fact_invalidated",
          path: `/receipts/${receipt.receipt_id}`,
          message:
            "candidate, review, check, and verification facts are invalidated by an accepted artifact change",
          source: sourceReceipt(receipt),
        });
      }
    }
  }
  const normalizedReceipts = freezeArray(
    receipts
      .map((receipt) => deepFreeze(normalizedById.get(receipt.receipt_id)!))
      .sort((left, right) => compareText(left.receipt_id, right.receipt_id)),
  );

  const gitDecoded = decodeOne(
    GitObservationSchema,
    value.observations.git,
    "invalid_observation",
    "/observations/git",
  );
  if (gitDecoded.error !== undefined || gitDecoded.value === undefined) return gitDecoded.error!;
  const git = gitDecoded.value;
  if (git.feature_id !== undefined && git.feature_id !== value.feature_id) {
    return error(
      "feature_id_mismatch",
      "/observations/git/feature_id",
      "Git observation feature ID does not match the dossier feature ID",
    );
  }

  const provider: DecodedProvider =
    value.observations.provider === undefined
      ? {
          requests: freezeArray<ProviderRequest>([]),
          observations: freezeArray<ProviderObservation>([]),
        }
      : decodeProvider(value.observations.provider);
  if (provider.error !== undefined) return provider.error;

  const closure: DecodedClosure =
    value.observations.closure === undefined
      ? { observations: freezeArray<ClosureObservation>([]) }
      : decodeClosure(value.observations.closure);
  if (closure.error !== undefined) return closure.error;
  for (const observation of closure.observations) {
    if (observation.feature_id !== value.feature_id) {
      return error(
        "feature_id_mismatch",
        "/observations/closure",
        "closure observation feature ID does not match the dossier feature ID",
      );
    }
  }
  for (const observation of provider.observations) {
    if (observation.feature_id !== value.feature_id) {
      return error(
        "feature_id_mismatch",
        "/observations/provider/observations",
        "provider observation feature ID does not match the dossier feature ID",
      );
    }
  }
  for (const request of provider.requests) {
    if (request.feature_id !== value.feature_id) {
      return error(
        "feature_id_mismatch",
        "/observations/provider/requests",
        "provider request feature ID does not match the dossier feature ID",
      );
    }
  }

  const artifactFacts = freezeArray(artifacts.map(normalizedArtifact));
  const historicalFacts = freezeArray(historicalImports.map(normalizedHistorical));
  const lifecycle = deriveLifecycle(
    artifacts,
    normalizedReceipts,
    git,
    provider.requests,
    provider.observations,
    closure.observations,
    diagnostics,
  );
  const irBytes = makeIrBytes(
    value.feature_id,
    value.directory,
    artifactFacts,
    normalizedReceipts,
    historicalFacts,
  );
  const observationOverlay = deepFreeze({
    git,
    provider: deepFreeze({ requests: provider.requests, observations: provider.observations }),
    closure: closure.observations,
  });

  const queues = deepFreeze({
    active:
      lifecycle.condition.value === "active" && lifecycle.delivery.value === "unmerged"
        ? freezeArray([value.feature_id])
        : freezeArray<string>([]),
    review:
      lifecycle.readiness.value === "implementation_review_ready" ||
      lifecycle.readiness.value === "merge_ready"
        ? freezeArray([value.feature_id])
        : freezeArray<string>([]),
    merge:
      lifecycle.readiness.value === "merge_ready" && lifecycle.delivery.value === "unmerged"
        ? freezeArray([value.feature_id])
        : freezeArray<string>([]),
    closure:
      lifecycle.closure.value === "open" && lifecycle.delivery.value === "done"
        ? freezeArray([value.feature_id])
        : freezeArray<string>([]),
  });

  invalidations.sort((left, right) =>
    compareText(
      `${left.artifact_path}\u0000${left.artifact_kind}`,
      `${right.artifact_path}\u0000${right.artifact_kind}`,
    ),
  );
  const result: FeatureDossierArtifact = {
    feature_id: value.feature_id,
    directory: value.directory,
    facts: artifactFacts,
    receipts: normalizedReceipts,
    historical_imports: historicalFacts,
    lifecycle,
    invalidations: freezeArray(invalidations.map((item) => deepFreeze(item))),
    queues,
    work_ir_bytes: irBytes,
    ir_bytes: irBytes,
    observation_overlay: observationOverlay,
    diagnostics: sortDiagnostics(diagnostics),
  };
  return deepFreeze(result);
};

/** Decode, validate, and derive one dossier without reading files or running commands. */
export const compileFeatureDossier = (
  input: unknown,
): Effect.Effect<FeatureDossierArtifact, FeatureDossierError, Crypto.Crypto> =>
  verifyArtifactContentHashes(input).pipe(
    Effect.flatMap(() =>
      Effect.sync(() => {
        try {
          const value = compileUnknown(input);
          return value instanceof FeatureDossierError
            ? { ok: false as const, error: value }
            : { ok: true as const, value };
        } catch (cause) {
          return {
            ok: false as const,
            error: error("canonical_encoding_failed", "/", "dossier compilation failed", cause),
          };
        }
      }),
    ),
    Effect.flatMap((result) =>
      result.ok ? Effect.succeed(result.value) : Effect.fail(result.error),
    ),
  );

export const PhaseSchema = FeaturePhaseSchema;
export const ReadinessSchema = ReviewReadinessSchema;
export const ConditionSchema = FeatureConditionSchema;
export const DeliverySchema = DeliveryStateSchema;
export const ClosureSchema = ClosureStateSchema;
