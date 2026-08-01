/**
 * Storage-independent read projection of the canonical project graph.
 *
 * This module is a schema/effect library. It owns validation, canonical
 * projection, content identity, and bounded read queries. It owns no storage
 * and cannot mutate project state.
 */
import { Crypto, Data, Effect, Encoding, Match, Path, Schema } from "effect";
import {
  canonicalBytes,
  canonicalJson,
  compareCodePoints,
  hasUnicodeScalarsOnly,
  scanJson,
  type CanonicalJsonValue,
} from "../normalized-core/canonical.ts";
import { PROJECT_DOCUMENT_SCHEMA_ID } from "./loader.ts";
import type { ProjectGraph, Relation } from "./types.ts";
import { validateProject } from "./validate.ts";

export const RELATIONAL_FACT_SCHEMA_ID = "semantic.project-model/relational-facts/v1" as const;
export const RELATIONAL_FACT_PROCEDURE_ID =
  "semantic.project-model/relational-fact-export/0034/v1" as const;
export const RELATIONAL_FACT_IDENTITY_DOMAIN =
  "semantic.project-model/relational-fact-export/v1" as const;

export const relationalFactBounds = Object.freeze({
  maximumEntities: 16_384,
  maximumRelations: 65_536,
  maximumFacts: 81_920,
  maximumInputCodeUnits: 4_194_304,
  maximumBytes: 16_777_216,
  maximumJsonDepth: 64,
  maximumJsonValues: 524_288,
  maximumQueryRoots: 128,
  maximumQueryDepth: 64,
  maximumQueryNodes: 4_096,
} as const);

export const RelationalFactFamilySchema = Schema.Literals([
  "dependency",
  "effect",
  "ownership",
  "derivation",
  "causality",
  "observation",
  "evidence",
  "other",
]);
export type RelationalFactFamily = typeof RelationalFactFamilySchema.Type;

const NonEmptyStringSchema = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));
const IdentitySchema = NonEmptyStringSchema;
const DigestIdentitySchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^sha256:[0-9a-f]{64}$/)),
);
const CountSchema = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);
const SourceDocumentSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^model\/(?!.*(?:^|\/)\.\.(?:\/|$))[^\\]+\.json$/)),
);

export const RelationalFactProvenanceSchema = Schema.Struct({
  source_schema: Schema.Literal(PROJECT_DOCUMENT_SCHEMA_ID),
  source_document: SourceDocumentSchema,
  source_record_kind: Schema.Literals(["entity", "relation"]),
  source_record_key: NonEmptyStringSchema,
});
export type RelationalFactProvenance = typeof RelationalFactProvenanceSchema.Type;

export const EntityFactSchema = Schema.TaggedStruct("EntityFact", {
  fact_key: NonEmptyStringSchema,
  subject_id: IdentitySchema,
  entity_kind: NonEmptyStringSchema,
  name: Schema.String,
  status: Schema.NullOr(Schema.String),
  provenance: RelationalFactProvenanceSchema,
});

export const RelationFactSchema = Schema.TaggedStruct("RelationFact", {
  fact_key: NonEmptyStringSchema,
  family: RelationalFactFamilySchema,
  subject_id: IdentitySchema,
  object_id: IdentitySchema,
  relation_kind: NonEmptyStringSchema,
  provenance: RelationalFactProvenanceSchema,
});

export const RelationalFactSchema = Schema.Union([EntityFactSchema, RelationFactSchema]);

export const RelationalFactExportSchema = Schema.Struct({
  format: Schema.Literal("semantic.project-relational-facts"),
  version: Schema.Literal(1),
  schema_identity: Schema.Literal(RELATIONAL_FACT_SCHEMA_ID),
  procedure_identity: Schema.Literal(RELATIONAL_FACT_PROCEDURE_ID),
  authority: Schema.Literal("derived-non-authoritative"),
  facts: Schema.Array(RelationalFactSchema),
  entity_count: CountSchema,
  relation_count: CountSchema,
  fact_count: CountSchema,
  export_identity: DigestIdentitySchema,
});

export type EntityFact = typeof EntityFactSchema.Type;
export type RelationFact = typeof RelationFactSchema.Type;
export type RelationalFact = typeof RelationalFactSchema.Type;
export type RelationalFactExport = typeof RelationalFactExportSchema.Type;

export interface RelationalFactArtifact {
  readonly export: RelationalFactExport;
  readonly bytes: Uint8Array;
}

export const RelationalQueryRequestSchema = Schema.Struct({
  format: Schema.Literals(["semantic.impact-query", "semantic.evidence-query"]),
  version: Schema.Literal(1),
  subject_ids: Schema.Array(IdentitySchema),
  max_depth: CountSchema,
  max_nodes: CountSchema,
});
export type RelationalQueryRequest = typeof RelationalQueryRequestSchema.Type;

export const RelationalQueryMatchSchema = Schema.Struct({
  subject_id: IdentitySchema,
  entity_kind: NonEmptyStringSchema,
  minimum_depth: CountSchema,
  path_fact_keys: Schema.Array(NonEmptyStringSchema),
});

export const ImpactQueryResultSchema = Schema.Struct({
  format: Schema.Literal("semantic.impact-query-result"),
  version: Schema.Literal(1),
  source_export_identity: DigestIdentitySchema,
  subject_ids: Schema.Array(IdentitySchema),
  affected: Schema.Array(RelationalQueryMatchSchema),
  depth_limited: Schema.Boolean,
});

export const EvidenceQueryResultSchema = Schema.Struct({
  format: Schema.Literal("semantic.evidence-query-result"),
  version: Schema.Literal(1),
  source_export_identity: DigestIdentitySchema,
  subject_ids: Schema.Array(IdentitySchema),
  matches: Schema.Array(RelationalQueryMatchSchema),
  depth_limited: Schema.Boolean,
});

export type RelationalQueryMatch = typeof RelationalQueryMatchSchema.Type;
export type ImpactQueryResult = typeof ImpactQueryResultSchema.Type;
export type EvidenceQueryResult = typeof EvidenceQueryResultSchema.Type;

export class RelationalFactExportRejected extends Data.TaggedError("RelationalFactExportRejected")<{
  readonly reason: string;
}> {}

export class RelationalFactDigestFailure extends Data.TaggedError("RelationalFactDigestFailure")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class RelationalFactQueryRejected extends Data.TaggedError("RelationalFactQueryRejected")<{
  readonly reason: string;
}> {}

export type RelationalFactFailure =
  | RelationalFactExportRejected
  | RelationalFactDigestFailure
  | RelationalFactQueryRejected;

const relationFamilies = new Map<string, RelationalFactFamily>([
  ["blocks", "dependency"],
  ["requires", "dependency"],
  ["handles", "effect"],
  ["accountable_for", "ownership"],
  ["assigned_to", "ownership"],
  ["derives", "derivation"],
  ["changes", "causality"],
  ["invalidates", "causality"],
  ["publishes", "observation"],
  ["reads", "observation"],
  ["writes", "observation"],
  ["assumes", "evidence"],
  ["covers", "evidence"],
  ["discharges", "evidence"],
  ["reviewed_by", "evidence"],
  ["supports", "evidence"],
  ["validates", "evidence"],
]);

export const relationFactFamily = (relationKind: string): RelationalFactFamily =>
  relationFamilies.get(relationKind) ?? "other";

const immutable = <Value extends object>(value: Value): Readonly<Value> => Object.freeze(value);

const deepFreeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get;
const typedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")?.get;

const snapshotExportBytes = (
  input: unknown,
): Effect.Effect<Uint8Array, RelationalFactExportRejected> =>
  Effect.gen(function* () {
    const observation = yield* Effect.try({
      try: () => {
        const genuine =
          typedArrayTag !== undefined &&
          typedArrayLength !== undefined &&
          typedArrayTag.call(input) === "Uint8Array";
        return {
          genuine,
          length: genuine ? (typedArrayLength!.call(input) as number) : undefined,
        };
      },
      catch: (cause) =>
        new RelationalFactExportRejected({
          reason: `export bytes could not be inspected: ${String(cause)}`,
        }),
    });
    const length = observation.length;
    if (!observation.genuine || length === undefined) {
      return yield* new RelationalFactExportRejected({
        reason: "export input must be a Uint8Array",
      });
    }
    if (length > relationalFactBounds.maximumBytes) {
      return yield* new RelationalFactExportRejected({
        reason: `export exceeds ${relationalFactBounds.maximumBytes} bytes`,
      });
    }
    return yield* Effect.try({
      try: () => {
        const output = new Uint8Array(length);
        Uint8Array.prototype.set.call(output, input as Uint8Array);
        return output;
      },
      catch: (cause) =>
        new RelationalFactExportRejected({
          reason: `export bytes could not be captured: ${String(cause)}`,
        }),
    });
  });

const snapshotSha256Digest = (
  input: unknown,
): Effect.Effect<Uint8Array, RelationalFactDigestFailure> =>
  Effect.gen(function* () {
    const observation = yield* Effect.try({
      try: () => {
        const genuine =
          typedArrayTag !== undefined &&
          typedArrayLength !== undefined &&
          typedArrayTag.call(input) === "Uint8Array";
        return {
          genuine,
          length: genuine ? (typedArrayLength!.call(input) as number) : undefined,
        };
      },
      catch: (cause) =>
        new RelationalFactDigestFailure({
          message: "cannot inspect relational fact SHA-256 digest observation",
          cause,
        }),
    });
    const length = observation.length;
    if (!observation.genuine || length !== 32) {
      return yield* new RelationalFactDigestFailure({
        message: "invalid relational fact SHA-256 digest observation",
        cause: { expected_bytes: 32, actual_bytes: length },
      });
    }
    return yield* Effect.try({
      try: () => {
        const output = new Uint8Array(32);
        Uint8Array.prototype.set.call(output, input as Uint8Array);
        return output;
      },
      catch: (cause) =>
        new RelationalFactDigestFailure({
          message: "cannot capture relational fact SHA-256 digest observation",
          cause,
        }),
    });
  });

const asCanonical = (value: RelationalFactExport | Omit<RelationalFactExport, "export_identity">) =>
  value as unknown as CanonicalJsonValue;

const exportPayload = (
  facts: ReadonlyArray<RelationalFact>,
  entityCount: number,
  relationCount: number,
): Omit<RelationalFactExport, "export_identity"> => ({
  format: "semantic.project-relational-facts",
  version: 1,
  schema_identity: RELATIONAL_FACT_SCHEMA_ID,
  procedure_identity: RELATIONAL_FACT_PROCEDURE_ID,
  authority: "derived-non-authoritative",
  facts,
  entity_count: entityCount,
  relation_count: relationCount,
  fact_count: facts.length,
});

const deriveExportIdentity = (
  payload: Omit<RelationalFactExport, "export_identity">,
): Effect.Effect<string, RelationalFactDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const domain = new TextEncoder().encode(RELATIONAL_FACT_IDENTITY_DOMAIN);
    const payloadBytes = yield* Effect.try({
      try: () => canonicalBytes(asCanonical(payload), false),
      catch: (cause) =>
        new RelationalFactDigestFailure({
          message: "cannot encode relational fact identity payload",
          cause,
        }),
    });
    const preimage = new Uint8Array(domain.length + 1 + payloadBytes.length);
    preimage.set(domain);
    preimage[domain.length] = 0;
    preimage.set(payloadBytes, domain.length + 1);
    const digest = yield* crypto.digest("SHA-256", preimage).pipe(
      Effect.mapError(
        (cause) =>
          new RelationalFactDigestFailure({
            message: "cannot compute relational fact export identity",
            cause,
          }),
      ),
    );
    const bytes = yield* snapshotSha256Digest(digest);
    return `sha256:${Encoding.encodeHex(bytes)}`;
  });

const sourceDocument = (
  source: string,
  projectRoot: string,
): Effect.Effect<string, RelationalFactExportRejected, Path.Path> =>
  Effect.gen(function* () {
    const paths = yield* Path.Path;
    const root = paths.resolve(projectRoot);
    const resolved = paths.resolve(source);
    const relative = paths.relative(root, resolved).replaceAll("\\", "/");
    if (
      !relative.startsWith("model/") ||
      relative.includes("\0") ||
      relative
        .split("/")
        .some((segment) => segment === "" || segment === "." || segment === "..") ||
      !relative.endsWith(".json")
    ) {
      return yield* new RelationalFactExportRejected({
        reason: `canonical source is outside model JSON custody: ${source}`,
      });
    }
    return relative;
  });

const entitySourceKey = (subjectId: string): string => canonicalJson(["entity", subjectId]);

const relationSourceKey = (relation: Relation): string =>
  canonicalJson(["relation", relation.sourceId, relation.kind, relation.targetId]);

const entityFactKey = (source: string, subjectId: string): string =>
  canonicalJson(["entity", source, subjectId]);

const relationFactKey = (source: string, relation: Relation): string =>
  canonicalJson(["relation", source, relation.sourceId, relation.kind, relation.targetId]);

const projectValidation = (
  project: ProjectGraph,
): Effect.Effect<void, RelationalFactExportRejected> =>
  Effect.try({
    try: () => validateProject(project).filter(({ severity }) => severity === "error"),
    catch: (cause) =>
      new RelationalFactExportRejected({
        reason: `project validation could not inspect the supplied graph: ${String(cause)}`,
      }),
  }).pipe(
    Effect.flatMap((issues) =>
      issues.length === 0
        ? Effect.void
        : Effect.fail(
            new RelationalFactExportRejected({
              reason: `project graph has validation errors: ${issues
                .map(
                  ({ code, entityId }) => `${code}${entityId === undefined ? "" : `:${entityId}`}`,
                )
                .join(", ")}`,
            }),
          ),
    ),
  );

const preflightProjectStrings = (
  project: ProjectGraph,
): Effect.Effect<void, RelationalFactExportRejected> =>
  Effect.gen(function* () {
    let codeUnits = 0;
    const inspect = (value: string): RelationalFactExportRejected | undefined => {
      if (!hasUnicodeScalarsOnly(value)) {
        return new RelationalFactExportRejected({
          reason: "project relational fields must contain only Unicode scalar values",
        });
      }
      codeUnits += value.length;
      return codeUnits > relationalFactBounds.maximumInputCodeUnits
        ? new RelationalFactExportRejected({
            reason: `project relational fields exceed ${relationalFactBounds.maximumInputCodeUnits} UTF-16 code units`,
          })
        : undefined;
    };
    const rootIssue = inspect(project.root);
    if (rootIssue !== undefined) return yield* rootIssue;
    for (const entity of project.entities.values()) {
      for (const value of [
        entity.id,
        entity.kind,
        entity.name,
        entity.status ?? "",
        entity.source,
      ]) {
        const issue = inspect(value);
        if (issue !== undefined) return yield* issue;
      }
    }
    for (const relation of project.relations) {
      for (const value of [relation.sourceId, relation.targetId, relation.kind, relation.source]) {
        const issue = inspect(value);
        if (issue !== undefined) return yield* issue;
      }
    }
  });

export const buildRelationalFactExport = (
  project: ProjectGraph,
): Effect.Effect<
  RelationalFactArtifact,
  RelationalFactExportRejected | RelationalFactDigestFailure,
  Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    if (project.entities.size > relationalFactBounds.maximumEntities) {
      return yield* new RelationalFactExportRejected({
        reason: `project exceeds ${relationalFactBounds.maximumEntities} entities`,
      });
    }
    if (project.relations.length > relationalFactBounds.maximumRelations) {
      return yield* new RelationalFactExportRejected({
        reason: `project exceeds ${relationalFactBounds.maximumRelations} relations`,
      });
    }
    yield* preflightProjectStrings(project);
    yield* projectValidation(project);
    const facts: Array<RelationalFact> = [];
    for (const entity of project.entities.values()) {
      const document = yield* sourceDocument(entity.source, project.root);
      facts.push({
        _tag: "EntityFact",
        fact_key: entityFactKey(document, entity.id),
        subject_id: entity.id,
        entity_kind: entity.kind,
        name: entity.name,
        status: entity.status,
        provenance: {
          source_schema: PROJECT_DOCUMENT_SCHEMA_ID,
          source_document: document,
          source_record_kind: "entity",
          source_record_key: entitySourceKey(entity.id),
        },
      });
    }
    for (const relation of project.relations) {
      const document = yield* sourceDocument(relation.source, project.root);
      facts.push({
        _tag: "RelationFact",
        fact_key: relationFactKey(document, relation),
        family: relationFactFamily(relation.kind),
        subject_id: relation.sourceId,
        object_id: relation.targetId,
        relation_kind: relation.kind,
        provenance: {
          source_schema: PROJECT_DOCUMENT_SCHEMA_ID,
          source_document: document,
          source_record_kind: "relation",
          source_record_key: relationSourceKey(relation),
        },
      });
    }
    if (facts.length > relationalFactBounds.maximumFacts) {
      return yield* new RelationalFactExportRejected({
        reason: `projection exceeds ${relationalFactBounds.maximumFacts} facts`,
      });
    }
    facts.sort((left, right) => compareCodePoints(left.fact_key, right.fact_key));
    for (let index = 1; index < facts.length; index += 1) {
      if (facts[index - 1]!.fact_key === facts[index]!.fact_key) {
        return yield* new RelationalFactExportRejected({
          reason: `duplicate canonical fact ${facts[index]!.fact_key}`,
        });
      }
    }
    const frozenFacts = Object.freeze(facts.map((fact) => deepFreeze(fact)));
    const payload = exportPayload(frozenFacts, project.entities.size, project.relations.length);
    const exportIdentity = yield* deriveExportIdentity(payload);
    const exportValue = deepFreeze({ ...payload, export_identity: exportIdentity });
    const decoded = yield* Schema.decodeUnknownEffect(RelationalFactExportSchema, {
      onExcessProperty: "error",
    })(exportValue).pipe(
      Effect.mapError(
        (cause) =>
          new RelationalFactExportRejected({ reason: `invalid projection: ${cause.message}` }),
      ),
    );
    const bytes = yield* Effect.try({
      try: () => canonicalBytes(asCanonical(decoded)),
      catch: (cause) =>
        new RelationalFactExportRejected({
          reason: `cannot encode relational fact export: ${String(cause)}`,
        }),
    });
    if (bytes.byteLength > relationalFactBounds.maximumBytes) {
      return yield* new RelationalFactExportRejected({
        reason: `export exceeds ${relationalFactBounds.maximumBytes} UTF-8 bytes`,
      });
    }
    const immutableExport = deepFreeze(decoded);
    const custodiedBytes = new Uint8Array(bytes);
    return immutable({
      export: immutableExport,
      get bytes(): Uint8Array {
        return new Uint8Array(custodiedBytes);
      },
    });
  });

const decodeExport = (
  bytes: Uint8Array,
): Effect.Effect<RelationalFactExport, RelationalFactExportRejected> =>
  Effect.gen(function* () {
    const text = yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      catch: () => new RelationalFactExportRejected({ reason: "export is not valid UTF-8" }),
    });
    const issue = scanJson(
      text,
      relationalFactBounds.maximumJsonDepth,
      relationalFactBounds.maximumJsonValues,
    );
    if (issue !== undefined)
      return yield* new RelationalFactExportRejected({ reason: issue.message });
    const parsed = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
      Effect.mapError((cause) => new RelationalFactExportRejected({ reason: cause.message })),
      Effect.catchDefect(() =>
        Effect.fail(
          new RelationalFactExportRejected({ reason: "export JSON could not be decoded" }),
        ),
      ),
    );
    return yield* Schema.decodeUnknownEffect(RelationalFactExportSchema, {
      onExcessProperty: "error",
    })(parsed).pipe(
      Effect.mapError((cause) => new RelationalFactExportRejected({ reason: cause.message })),
      Effect.catchDefect(() =>
        Effect.fail(
          new RelationalFactExportRejected({ reason: "export value could not be decoded" }),
        ),
      ),
    );
  });

const validateFactInvariants = (
  value: RelationalFactExport,
): Effect.Effect<void, RelationalFactExportRejected> =>
  Effect.gen(function* () {
    if (
      value.entity_count > relationalFactBounds.maximumEntities ||
      value.relation_count > relationalFactBounds.maximumRelations ||
      value.fact_count > relationalFactBounds.maximumFacts ||
      value.fact_count !== value.facts.length
    ) {
      return yield* new RelationalFactExportRejected({ reason: "export count bounds are invalid" });
    }
    const entities = value.facts.filter((fact): fact is EntityFact => "entity_kind" in fact);
    const relations = value.facts.filter((fact): fact is RelationFact => "relation_kind" in fact);
    if (entities.length !== value.entity_count || relations.length !== value.relation_count) {
      return yield* new RelationalFactExportRejected({
        reason: "export counts do not match facts",
      });
    }
    const entityIds = new Set<string>();
    const factKeys = new Set<string>();
    let previous: string | undefined;
    for (const fact of value.facts) {
      const sourceSegments = fact.provenance.source_document.split("/");
      if (
        sourceSegments[0] !== "model" ||
        fact.provenance.source_document.includes("\0") ||
        sourceSegments.some((segment) => segment === "" || segment === "." || segment === "..")
      ) {
        return yield* new RelationalFactExportRejected({
          reason: `invalid source document ${fact.provenance.source_document}`,
        });
      }
      if (factKeys.has(fact.fact_key)) {
        return yield* new RelationalFactExportRejected({
          reason: `duplicate fact ${fact.fact_key}`,
        });
      }
      if (previous !== undefined && compareCodePoints(previous, fact.fact_key) >= 0) {
        return yield* new RelationalFactExportRejected({
          reason: "facts are not canonically ordered",
        });
      }
      previous = fact.fact_key;
      factKeys.add(fact.fact_key);
      if ("entity_kind" in fact) {
        if (entityIds.has(fact.subject_id)) {
          return yield* new RelationalFactExportRejected({
            reason: `duplicate entity fact ${fact.subject_id}`,
          });
        }
        entityIds.add(fact.subject_id);
        const expectedSource = entitySourceKey(fact.subject_id);
        const expectedFact = entityFactKey(fact.provenance.source_document, fact.subject_id);
        if (
          fact.provenance.source_record_kind !== "entity" ||
          fact.provenance.source_record_key !== expectedSource ||
          fact.fact_key !== expectedFact
        ) {
          return yield* new RelationalFactExportRejected({
            reason: `invalid entity provenance ${fact.subject_id}`,
          });
        }
      }
    }
    for (const fact of relations) {
      if (!entityIds.has(fact.subject_id) || !entityIds.has(fact.object_id)) {
        return yield* new RelationalFactExportRejected({
          reason: `relation fact has a foreign endpoint ${fact.fact_key}`,
        });
      }
      const relation: Relation = {
        sourceId: fact.subject_id,
        targetId: fact.object_id,
        kind: fact.relation_kind,
        summary: "",
        attributes: {},
        source: fact.provenance.source_document,
      };
      if (
        fact.family !== relationFactFamily(fact.relation_kind) ||
        fact.provenance.source_record_kind !== "relation" ||
        fact.provenance.source_record_key !== relationSourceKey(relation) ||
        fact.fact_key !== relationFactKey(fact.provenance.source_document, relation)
      ) {
        return yield* new RelationalFactExportRejected({
          reason: `invalid relation provenance ${fact.fact_key}`,
        });
      }
    }
  });

export const validateRelationalFactExportBytes = (
  input: unknown,
): Effect.Effect<
  RelationalFactExport,
  RelationalFactExportRejected | RelationalFactDigestFailure,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    const bytes = yield* snapshotExportBytes(input);
    const decoded = yield* decodeExport(bytes);
    yield* validateFactInvariants(decoded);
    const payload = exportPayload(decoded.facts, decoded.entity_count, decoded.relation_count);
    const identity = yield* deriveExportIdentity(payload);
    if (identity !== decoded.export_identity) {
      return yield* new RelationalFactExportRejected({
        reason: "export identity does not match facts",
      });
    }
    const expected = yield* Effect.try({
      try: () => canonicalBytes(asCanonical(decoded)),
      catch: (cause) =>
        new RelationalFactExportRejected({
          reason: `cannot recompute canonical export bytes: ${String(cause)}`,
        }),
    });
    if (!bytesEqual(bytes, expected)) {
      return yield* new RelationalFactExportRejected({
        reason: "export bytes are not the canonical recomputed representation",
      });
    }
    return deepFreeze(decoded);
  });

interface CapturedQueryInput {
  readonly kind: "Captured";
  readonly value: unknown;
}

interface RejectedQueryInput {
  readonly kind: "Rejected";
  readonly reason: string;
}

type QueryInputCapture = CapturedQueryInput | RejectedQueryInput;

const captureQueryRoots = (input: unknown): QueryInputCapture => {
  if (!Array.isArray(input)) return { kind: "Captured", value: input };
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
  if (typeof lengthDescriptor?.value !== "number") {
    return { kind: "Rejected", reason: "query subject_ids length is not observable" };
  }
  const length = lengthDescriptor.value;
  if (length > relationalFactBounds.maximumQueryRoots) {
    return {
      kind: "Rejected",
      reason: `query exceeds ${relationalFactBounds.maximumQueryRoots} roots`,
    };
  }
  const snapshot: Array<unknown> = [];
  snapshot.length = length;
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (descriptor === undefined) continue;
    if (!("value" in descriptor)) {
      return { kind: "Rejected", reason: `query root ${index} must be a data property` };
    }
    snapshot[index] = descriptor.value;
  }
  return { kind: "Captured", value: snapshot };
};

const captureQueryInput = (input: unknown): Effect.Effect<unknown, RelationalFactQueryRejected> =>
  Effect.gen(function* () {
    const capture = yield* Effect.try({
      try: () => {
        if (input === null || typeof input !== "object" || Array.isArray(input)) {
          return { kind: "Captured", value: input } as const;
        }
        const snapshot = Object.create(null) as Record<string, unknown>;
        for (const key of Reflect.ownKeys(input)) {
          if (typeof key !== "string") {
            return { kind: "Rejected", reason: "query contains a symbol property" } as const;
          }
          const descriptor = Object.getOwnPropertyDescriptor(input, key);
          if (descriptor === undefined || !("value" in descriptor)) {
            return {
              kind: "Rejected",
              reason: `query field ${key} must be an own data property`,
            } as const;
          }
          const field = key === "subject_ids" ? captureQueryRoots(descriptor.value) : undefined;
          if (field?.kind === "Rejected") return field;
          Object.defineProperty(snapshot, key, {
            configurable: true,
            enumerable: descriptor.enumerable === true,
            writable: true,
            value: field?.value ?? descriptor.value,
          });
        }
        return { kind: "Captured", value: snapshot } as const;
      },
      catch: (cause) =>
        new RelationalFactQueryRejected({
          reason: `query value could not be captured: ${String(cause)}`,
        }),
    });
    return capture.kind === "Captured"
      ? capture.value
      : yield* new RelationalFactQueryRejected({ reason: capture.reason });
  });

const decodeRequest = (
  input: unknown,
  expectedFormat: RelationalQueryRequest["format"],
): Effect.Effect<RelationalQueryRequest, RelationalFactQueryRejected> =>
  Effect.gen(function* () {
    const snapshot = yield* captureQueryInput(input);
    const request = yield* Schema.decodeUnknownEffect(RelationalQueryRequestSchema, {
      onExcessProperty: "error",
    })(snapshot).pipe(
      Effect.mapError(
        (cause) => new RelationalFactQueryRejected({ reason: `invalid query: ${cause.message}` }),
      ),
      Effect.catchDefect(() =>
        Effect.fail(
          new RelationalFactQueryRejected({ reason: "query value could not be decoded" }),
        ),
      ),
    );
    if (request.format !== expectedFormat) {
      return yield* new RelationalFactQueryRejected({ reason: `expected ${expectedFormat}` });
    }
    if (request.subject_ids.length > relationalFactBounds.maximumQueryRoots) {
      return yield* new RelationalFactQueryRejected({
        reason: `query exceeds ${relationalFactBounds.maximumQueryRoots} roots`,
      });
    }
    if (new Set(request.subject_ids).size !== request.subject_ids.length) {
      return yield* new RelationalFactQueryRejected({ reason: "query roots must be unique" });
    }
    if (request.max_depth > relationalFactBounds.maximumQueryDepth) {
      return yield* new RelationalFactQueryRejected({
        reason: `query depth exceeds ${relationalFactBounds.maximumQueryDepth}`,
      });
    }
    if (request.max_nodes <= 0 || request.max_nodes > relationalFactBounds.maximumQueryNodes) {
      return yield* new RelationalFactQueryRejected({
        reason: `query max_nodes must be between 1 and ${relationalFactBounds.maximumQueryNodes}`,
      });
    }
    return {
      ...request,
      subject_ids: [...request.subject_ids].sort(compareCodePoints),
    };
  });

interface TraversalEdge {
  readonly target: string;
  readonly factKey: string;
}

interface TraversalObservation {
  readonly visited: ReadonlyMap<
    string,
    { readonly depth: number; readonly path: ReadonlyArray<string> }
  >;
  readonly depthLimited: boolean;
}

const traverse = (
  roots: ReadonlyArray<string>,
  adjacency: ReadonlyMap<string, ReadonlyArray<TraversalEdge>>,
  maxDepth: number,
  maxNodes: number,
): Effect.Effect<TraversalObservation, RelationalFactQueryRejected> =>
  Effect.gen(function* () {
    if (roots.length > maxNodes) {
      return yield* new RelationalFactQueryRejected({ reason: "query roots exceed max_nodes" });
    }
    const visited = new Map<string, { depth: number; path: ReadonlyArray<string> }>();
    const queue: Array<string> = [];
    for (const root of roots) {
      visited.set(root, { depth: 0, path: Object.freeze([]) });
      queue.push(root);
    }
    let depthLimited = false;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const subject = queue[cursor]!;
      const observation = visited.get(subject)!;
      for (const edge of adjacency.get(subject) ?? []) {
        if (visited.has(edge.target)) continue;
        if (observation.depth >= maxDepth) {
          depthLimited = true;
          continue;
        }
        if (visited.size >= maxNodes) {
          return yield* new RelationalFactQueryRejected({
            reason: `query traversal exceeds max_nodes ${maxNodes}`,
          });
        }
        visited.set(edge.target, {
          depth: observation.depth + 1,
          path: Object.freeze([...observation.path, edge.factKey]),
        });
        queue.push(edge.target);
      }
    }
    return { visited, depthLimited };
  });

const entityFacts = (value: RelationalFactExport): ReadonlyMap<string, EntityFact> =>
  new Map(
    value.facts
      .filter((fact): fact is EntityFact => "entity_kind" in fact)
      .map((fact) => [fact.subject_id, fact]),
  );

const relationFacts = (value: RelationalFactExport): ReadonlyArray<RelationFact> =>
  value.facts.filter((fact): fact is RelationFact => "relation_kind" in fact);

const requireKnownRoots = (
  roots: ReadonlyArray<string>,
  entities: ReadonlyMap<string, EntityFact>,
): Effect.Effect<void, RelationalFactQueryRejected> => {
  const unknown = roots.filter((root) => !entities.has(root));
  return unknown.length === 0
    ? Effect.void
    : Effect.fail(
        new RelationalFactQueryRejected({
          reason: `unknown query subjects: ${unknown.join(", ")}`,
        }),
      );
};

const addEdge = (
  graph: Map<string, Array<TraversalEdge>>,
  source: string,
  target: string,
  factKey: string,
): void => {
  const edges = graph.get(source) ?? [];
  edges.push({ target, factKey });
  graph.set(source, edges);
};

const finalizeAdjacency = (
  graph: Map<string, Array<TraversalEdge>>,
): ReadonlyMap<string, ReadonlyArray<TraversalEdge>> => {
  for (const [subject, edges] of graph) {
    graph.set(
      subject,
      edges.sort(
        (left, right) =>
          compareCodePoints(left.target, right.target) ||
          compareCodePoints(left.factKey, right.factKey),
      ),
    );
  }
  return graph;
};

const matchesFrom = (
  observation: TraversalObservation,
  roots: ReadonlySet<string>,
  entities: ReadonlyMap<string, EntityFact>,
  include: (entity: EntityFact) => boolean,
): ReadonlyArray<RelationalQueryMatch> =>
  [...observation.visited]
    .filter(([subject]) => !roots.has(subject))
    .flatMap(([subject, path]) => {
      const entity = entities.get(subject);
      return entity !== undefined && include(entity)
        ? [
            immutable({
              subject_id: subject,
              entity_kind: entity.entity_kind,
              minimum_depth: path.depth,
              path_fact_keys: Object.freeze([...path.path]),
            }),
          ]
        : [];
    })
    .sort(
      (left, right) =>
        left.minimum_depth - right.minimum_depth ||
        compareCodePoints(left.subject_id, right.subject_id),
    );

export const queryImpact = (
  exportBytes: unknown,
  input: unknown,
): Effect.Effect<ImpactQueryResult, RelationalFactFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const value = yield* validateRelationalFactExportBytes(exportBytes);
    const request = yield* decodeRequest(input, "semantic.impact-query");
    const entities = entityFacts(value);
    yield* requireKnownRoots(request.subject_ids, entities);
    const graph = new Map<string, Array<TraversalEdge>>();
    for (const fact of relationFacts(value)) {
      if (fact.family !== "dependency") continue;
      Match.value(fact.relation_kind).pipe(
        Match.when("requires", () =>
          addEdge(graph, fact.object_id, fact.subject_id, fact.fact_key),
        ),
        Match.when("blocks", () => addEdge(graph, fact.subject_id, fact.object_id, fact.fact_key)),
        Match.orElse(() => undefined),
      );
    }
    const observation = yield* traverse(
      request.subject_ids,
      finalizeAdjacency(graph),
      request.max_depth,
      request.max_nodes,
    );
    return deepFreeze({
      format: "semantic.impact-query-result" as const,
      version: 1 as const,
      source_export_identity: value.export_identity,
      subject_ids: Object.freeze([...request.subject_ids]),
      affected: Object.freeze(
        matchesFrom(observation, new Set(request.subject_ids), entities, () => true),
      ),
      depth_limited: observation.depthLimited,
    });
  });

const evidenceKinds = new Set(["evidence", "obligation", "assumption", "human"]);

export const queryEvidence = (
  exportBytes: unknown,
  input: unknown,
): Effect.Effect<EvidenceQueryResult, RelationalFactFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const value = yield* validateRelationalFactExportBytes(exportBytes);
    const request = yield* decodeRequest(input, "semantic.evidence-query");
    const entities = entityFacts(value);
    yield* requireKnownRoots(request.subject_ids, entities);
    const graph = new Map<string, Array<TraversalEdge>>();
    for (const fact of relationFacts(value)) {
      if (fact.family !== "evidence") continue;
      Match.value(fact.relation_kind).pipe(
        Match.when("supports", () =>
          addEdge(graph, fact.object_id, fact.subject_id, fact.fact_key),
        ),
        Match.when("discharges", () =>
          addEdge(graph, fact.object_id, fact.subject_id, fact.fact_key),
        ),
        Match.when("covers", () => addEdge(graph, fact.object_id, fact.subject_id, fact.fact_key)),
        Match.when("assumes", () => addEdge(graph, fact.subject_id, fact.object_id, fact.fact_key)),
        Match.when("reviewed_by", () =>
          addEdge(graph, fact.subject_id, fact.object_id, fact.fact_key),
        ),
        Match.orElse(() => undefined),
      );
    }
    const observation = yield* traverse(
      request.subject_ids,
      finalizeAdjacency(graph),
      request.max_depth,
      request.max_nodes,
    );
    return deepFreeze({
      format: "semantic.evidence-query-result" as const,
      version: 1 as const,
      source_export_identity: value.export_identity,
      subject_ids: Object.freeze([...request.subject_ids]),
      matches: Object.freeze(
        matchesFrom(observation, new Set(request.subject_ids), entities, (entity) =>
          evidenceKinds.has(entity.entity_kind),
        ),
      ),
      depth_limited: observation.depthLimited,
    });
  });
