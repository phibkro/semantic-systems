import { Crypto, Data, Effect } from "effect";
import { assessWork } from "./schedule.ts";
import {
  ENTITY_KINDS,
  RELATION_KINDS,
  type Entity,
  type JsonValue,
  type ProjectGraph,
  type Relation,
} from "./types.ts";

export const PUBLIC_SNAPSHOT_SCHEMA = "semantic-public-snapshot-v1" as const;
export const PUBLIC_VERSION_SCHEMA = "semantic-public-version-v1" as const;
export const DEFAULT_REPOSITORY_URL = "https://github.com/phibkro/semantic-systems";

const EXACT_COMMIT = /^[0-9a-f]{40}$/;
const WHOLE_SECOND_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
const COMPLETE_WORK_STATUSES = new Set(["complete", "accepted", "superseded"]);

export type DeployedCheckStatus = "not_checked" | "passed" | "failed";
export type ObservationSource = "local_preview" | "main_ci_assertion" | "pr_ci_assertion";

export interface ExportObservation {
  readonly commit: string;
  readonly observedAt: string;
  readonly freshnessSeconds: number;
  readonly deployedCheckStatus: DeployedCheckStatus;
  readonly observationSource: ObservationSource;
  readonly repositoryUrl?: string;
}

export interface PublicEntity {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly summary: string;
  readonly status: string | null;
  readonly tags: ReadonlyArray<string>;
  readonly source_url: string;
  readonly evidence_category: string | null;
  readonly assumptions: ReadonlyArray<string>;
}

export interface PublicRelation {
  readonly source_id: string;
  readonly target_id: string;
  readonly kind: string;
  readonly summary: string;
  readonly source_url: string;
}

export interface PublicSnapshot {
  readonly schema_version: typeof PUBLIC_SNAPSHOT_SCHEMA;
  readonly metadata: {
    readonly commit: string;
    readonly digest: string;
    readonly generated_at: string;
    readonly observed_at: string;
    readonly freshness_seconds: number;
    readonly deployed_check_status: DeployedCheckStatus;
    readonly observation_source: ObservationSource;
    readonly repository_url: string;
  };
  readonly counts_by_kind: Readonly<Record<string, number>>;
  readonly ready_work_ids: ReadonlyArray<string>;
  readonly active_work_ids: ReadonlyArray<string>;
  readonly blocked_work_ids: ReadonlyArray<string>;
  readonly completed_work_ids: ReadonlyArray<string>;
  readonly unsupported_claim_ids: ReadonlyArray<string>;
  readonly entities: ReadonlyArray<PublicEntity>;
  readonly relations: ReadonlyArray<PublicRelation>;
}

export interface PublicVersion {
  readonly schema_version: typeof PUBLIC_VERSION_SCHEMA;
  readonly commit: string;
  readonly digest: string;
  readonly observed_at: string;
  readonly snapshot: string;
}

export interface PublicArtifact {
  readonly digest: string;
  readonly snapshotName: string;
  readonly snapshot: PublicSnapshot;
  readonly version: PublicVersion;
  readonly snapshotBytes: string;
  readonly versionBytes: string;
}

export class PublicExportError extends Data.TaggedError("PublicExportError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const compareCodeUnits = (left: string, right: string): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
};

const canonicalize = (value: JsonValue): Effect.Effect<JsonValue, PublicExportError> => {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return Effect.fail(
      new PublicExportError({ message: "canonical JSON rejects non-finite numbers" }),
    );
  }
  if (Array.isArray(value)) return Effect.forEach(value, canonicalize);
  if (value !== null && typeof value === "object") {
    return Effect.map(
      Effect.forEach(
        Object.entries(value).sort(([left], [right]) => compareCodeUnits(left, right)),
        ([key, item]) => Effect.map(canonicalize(item), (canonical) => [key, canonical] as const),
      ),
      (entries) => Object.fromEntries(entries),
    );
  }
  return Effect.succeed(value);
};

export const stringifyPublicJson = (value: JsonValue): Effect.Effect<string, PublicExportError> =>
  Effect.flatMap(canonicalize(value), (canonical) =>
    Effect.try({
      try: () => `${JSON.stringify(canonical)}\n`,
      catch: (cause) =>
        new PublicExportError({ message: "cannot encode canonical public JSON", cause }),
    }),
  );

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const digestBytes = (value: string): Effect.Effect<string, PublicExportError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode(value)).pipe(
      Effect.mapError(
        (cause) =>
          new PublicExportError({
            message: "cannot compute public snapshot SHA-256 digest",
            cause,
          }),
      ),
    );
    return toHex(digest);
  });

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const validateTimestamp = (value: string): Effect.Effect<void, PublicExportError> =>
  Effect.gen(function* () {
    const match = WHOLE_SECOND_UTC.exec(value);
    if (match === null) {
      return yield* new PublicExportError({
        message: "observedAt must be a canonical whole-second UTC timestamp",
      });
    }
    const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (
      year < 1 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > days[month - 1]! ||
      hour > 23 ||
      minute > 59 ||
      second > 59
    ) {
      return yield* new PublicExportError({
        message: "observedAt must be a valid whole-second UTC timestamp",
      });
    }
  });

const normalizeAbsolutePath = (value: string): Effect.Effect<string, PublicExportError> =>
  Effect.gen(function* () {
    if (!value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
      return yield* new PublicExportError({
        message: "canonical source must be an absolute POSIX path",
      });
    }
    const segments: Array<string> = [];
    for (const segment of value.split("/")) {
      if (segment === "" || segment === ".") continue;
      if (segment === "..") {
        segments.pop();
        continue;
      }
      segments.push(segment);
    }
    return `/${segments.join("/")}`;
  });

const sourceUrl = (
  source: string,
  identity: string,
  project: ProjectGraph,
  observation: ExportObservation,
  repositoryUrl: string,
): Effect.Effect<string, PublicExportError> =>
  Effect.gen(function* () {
    const root = yield* normalizeAbsolutePath(project.root);
    const normalized = source.startsWith("/")
      ? yield* normalizeAbsolutePath(source)
      : yield* normalizeAbsolutePath(`${root}/${source}`);
    if (!normalized.startsWith(`${root}/`)) {
      return yield* new PublicExportError({
        message: `canonical source is outside repository: ${identity}`,
      });
    }
    const relative = normalized.slice(root.length + 1);
    const encodedPath = relative.split("/").map(encodeURIComponent).join("/");
    return `${repositoryUrl}/blob/${observation.commit}/${encodedPath}`;
  });

const stringAttribute = (entity: Entity, key: string): ReadonlyArray<string> => {
  const value = entity.attributes[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return [];
  return [...value].sort(compareCodeUnits);
};

const evidenceCategory = (entity: Entity): string | null => {
  if (entity.kind !== "evidence") return null;
  const value = entity.attributes.evidence_type;
  return typeof value === "string" ? value : null;
};

const validateInput = (
  project: ProjectGraph,
  observation: ExportObservation,
): Effect.Effect<string, PublicExportError> =>
  Effect.gen(function* () {
    if (!EXACT_COMMIT.test(observation.commit)) {
      return yield* new PublicExportError({
        message: "commit must be an exact lowercase 40-character Git object ID",
      });
    }
    yield* validateTimestamp(observation.observedAt);
    if (!Number.isSafeInteger(observation.freshnessSeconds) || observation.freshnessSeconds <= 0) {
      return yield* new PublicExportError({
        message: "freshnessSeconds must be a positive safe integer",
      });
    }
    if (
      !["not_checked", "passed", "failed"].includes(observation.deployedCheckStatus) ||
      !["local_preview", "main_ci_assertion", "pr_ci_assertion"].includes(
        observation.observationSource,
      )
    ) {
      return yield* new PublicExportError({ message: "observation metadata is invalid" });
    }
    const repositoryUrl = (observation.repositoryUrl ?? DEFAULT_REPOSITORY_URL).replace(/\/+$/, "");
    if (!/^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~-]+)+$/.test(repositoryUrl)) {
      return yield* new PublicExportError({
        message: "repositoryUrl must be an absolute HTTPS URL",
      });
    }
    for (const [identity, entity] of project.entities) {
      if (entity.id !== identity) {
        return yield* new PublicExportError({
          message: `entity mapping identity mismatch: ${identity}`,
        });
      }
      if (!ENTITY_KINDS.has(entity.kind)) {
        return yield* new PublicExportError({
          message: `unsupported entity kind: ${entity.kind}`,
        });
      }
    }
    for (const relation of project.relations) {
      if (!RELATION_KINDS.has(relation.kind)) {
        return yield* new PublicExportError({
          message: `unsupported relation kind: ${relation.kind}`,
        });
      }
      if (!project.entities.has(relation.sourceId)) {
        return yield* new PublicExportError({
          message: `missing source identity: ${relation.sourceId}`,
        });
      }
      if (!project.entities.has(relation.targetId)) {
        return yield* new PublicExportError({
          message: `missing target identity: ${relation.targetId}`,
        });
      }
    }
    return repositoryUrl;
  });

const relationOrder = (left: Relation, right: Relation): number => {
  for (const [a, b] of [
    [left.sourceId, right.sourceId],
    [left.targetId, right.targetId],
    [left.kind, right.kind],
    [left.summary, right.summary],
    [left.source, right.source],
  ] as const) {
    const order = compareCodeUnits(a, b);
    if (order !== 0) return order;
  }
  return 0;
};

const deepFreeze = <A>(value: A): A => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const asJson = (value: PublicSnapshot | PublicVersion): JsonValue => value as unknown as JsonValue;

export const buildPublicArtifact = (
  project: ProjectGraph,
  observation: ExportObservation,
): Effect.Effect<PublicArtifact, PublicExportError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const repositoryUrl = yield* validateInput(project, observation);
    const entities = yield* Effect.forEach(
      [...project.entities.values()].sort((left, right) => compareCodeUnits(left.id, right.id)),
      (entity) =>
        Effect.map(
          sourceUrl(entity.source, entity.id, project, observation, repositoryUrl),
          (publicSource): PublicEntity => ({
            id: entity.id,
            kind: entity.kind,
            name: entity.name,
            summary: entity.summary,
            status: entity.status,
            tags: [...entity.tags].sort(compareCodeUnits),
            source_url: publicSource,
            evidence_category: evidenceCategory(entity),
            assumptions: stringAttribute(entity, "assumptions"),
          }),
        ),
    );
    const relations = yield* Effect.forEach(
      [...project.relations].sort(relationOrder),
      (relation) =>
        Effect.map(
          sourceUrl(
            relation.source,
            `${relation.sourceId}->${relation.targetId}`,
            project,
            observation,
            repositoryUrl,
          ),
          (publicSource): PublicRelation => ({
            source_id: relation.sourceId,
            target_id: relation.targetId,
            kind: relation.kind,
            summary: relation.summary,
            source_url: publicSource,
          }),
        ),
    );
    const counts = Object.fromEntries(
      [...new Set(entities.map((entity) => entity.kind))]
        .sort(compareCodeUnits)
        .map((kind) => [kind, entities.filter((entity) => entity.kind === kind).length]),
    );
    const assessments = assessWork(project);
    const work = entities.filter((entity) => entity.kind === "work_item");
    const unsupportedClaims = entities
      .filter(
        (entity) =>
          entity.kind === "claim" &&
          !relations.some(
            (relation) =>
              relation.target_id === entity.id &&
              (relation.kind === "supports" || relation.kind === "discharges"),
          ),
      )
      .map((entity) => entity.id)
      .sort(compareCodeUnits);
    const snapshotWithoutDigest: PublicSnapshot = {
      schema_version: PUBLIC_SNAPSHOT_SCHEMA,
      metadata: {
        commit: observation.commit,
        digest: "",
        generated_at: observation.observedAt,
        observed_at: observation.observedAt,
        freshness_seconds: observation.freshnessSeconds,
        deployed_check_status: observation.deployedCheckStatus,
        observation_source: observation.observationSource,
        repository_url: repositoryUrl,
      },
      counts_by_kind: counts,
      ready_work_ids: assessments
        .filter((assessment) => assessment.ready)
        .map((assessment) => assessment.entity.id)
        .sort(compareCodeUnits),
      active_work_ids: work
        .filter((entity) => entity.status === "active" || entity.status === "in_progress")
        .map((entity) => entity.id)
        .sort(compareCodeUnits),
      blocked_work_ids: assessments
        .filter(
          (assessment) => assessment.blockers.length > 0 || assessment.entity.status === "blocked",
        )
        .map((assessment) => assessment.entity.id)
        .sort(compareCodeUnits),
      completed_work_ids: work
        .filter((entity) => COMPLETE_WORK_STATUSES.has(entity.status ?? ""))
        .map((entity) => entity.id)
        .sort(compareCodeUnits),
      unsupported_claim_ids: unsupportedClaims,
      entities,
      relations,
    };
    const digestInput = yield* stringifyPublicJson(asJson(snapshotWithoutDigest));
    const digest = yield* digestBytes(digestInput);
    const snapshot: PublicSnapshot = {
      ...snapshotWithoutDigest,
      metadata: { ...snapshotWithoutDigest.metadata, digest },
    };
    const snapshotName = `snapshot.${digest}.json`;
    const version: PublicVersion = {
      schema_version: PUBLIC_VERSION_SCHEMA,
      commit: observation.commit,
      digest,
      observed_at: observation.observedAt,
      snapshot: snapshotName,
    };
    const snapshotBytes = yield* stringifyPublicJson(asJson(snapshot));
    const versionBytes = yield* stringifyPublicJson(asJson(version));
    return deepFreeze({
      digest,
      snapshotName,
      snapshot,
      version,
      snapshotBytes,
      versionBytes,
    });
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof PublicExportError
        ? cause
        : new PublicExportError({ message: "cannot derive public snapshot", cause }),
    ),
  );
