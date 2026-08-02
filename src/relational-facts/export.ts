import { stringifyCanonicalJson } from "../references/canonical-json.ts";
import type { Entity, JsonValue, ProjectGraph, Relation } from "../project-model/types.ts";
import {
  RELATIONAL_FACT_FORMAT,
  RELATIONAL_FACT_KINDS,
  RelationalExportError,
  type AttributeFact,
  type EntityFact,
  type RelationFact,
  type RelationalExportErrorCode,
  type RelationalFactBundle,
  type SourceDocumentFact,
  type TagFact,
} from "./types.ts";

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareNumber = (left: number, right: number): number => left - right;

const compareMany = (
  left: ReadonlyArray<string | number | null>,
  right: ReadonlyArray<string | number | null>,
): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;
    const order =
      typeof leftValue === "number" && typeof rightValue === "number"
        ? compareNumber(leftValue, rightValue)
        : typeof leftValue === "string" && typeof rightValue === "string"
          ? compareText(leftValue, rightValue)
          : leftValue === null && rightValue === null
            ? 0
            : leftValue === null
              ? -1
              : rightValue === null
                ? 1
                : compareText(String(leftValue), String(rightValue));
    if (order !== 0) return order;
  }
  return left.length - right.length;
};

const exportError = (
  code: RelationalExportErrorCode,
  message: string,
  context: { readonly path?: string; readonly source?: string; readonly cause?: unknown } = {},
): RelationalExportError =>
  new RelationalExportError({
    code,
    message,
    ...(context.path === undefined ? {} : { path: context.path }),
    ...(context.source === undefined ? {} : { source: context.source }),
    ...(context.cause === undefined ? {} : { cause: context.cause }),
  });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const snapshotJson = (
  value: unknown,
  path: string,
  ancestors: ReadonlySet<object> = new Set(),
): JsonValue => {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw exportError("export.json-value", "JSON values must contain finite numbers", { path });
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw exportError("export.json-value", "JSON values must not contain cycles", { path });
    }
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(value);
    return value.map((item, index) => snapshotJson(item, `${path}/${index}`, nextAncestors));
  }
  if (isObject(value)) {
    if (ancestors.has(value)) {
      throw exportError("export.json-value", "JSON values must not contain cycles", { path });
    }
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(value);
    const copy: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    for (const [key, item] of Object.entries(value)) {
      copy[key] = snapshotJson(item, `${path}/${key}`, nextAncestors);
    }
    return copy;
  }
  throw exportError("export.json-value", `unsupported JSON value at ${path}`, { path });
};

const snapshotAttributes = (
  attributes: unknown,
  path: string,
  code: "export.entity-shape" | "export.relation-shape",
): Readonly<Record<string, JsonValue>> => {
  if (!isObject(attributes)) {
    throw exportError(code, "attributes must be a JSON object", { path });
  }
  return snapshotJson(attributes, path) as Readonly<Record<string, JsonValue>>;
};

const deepFreeze = <Value>(value: Value, seen = new WeakSet<object>()): Value => {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object as Record<string, unknown>)) deepFreeze(child, seen);
  Object.freeze(object);
  return value;
};

const validAbsoluteRoot = (root: string): boolean =>
  root.length > 0 && root.startsWith("/") && !root.includes("\\") && !root.includes("//");

const sourceKey = (root: string, source: string): string => {
  if (!validAbsoluteRoot(root)) {
    throw exportError(
      "export.project-root",
      `project root must be a normalized absolute path: ${root}`,
    );
  }
  if (source.length === 0 || source.includes("\\") || !source.startsWith("/")) {
    throw exportError(
      "export.source-custody",
      `source must be a normalized absolute POSIX path: ${source}`,
      {
        source,
      },
    );
  }
  const sourceSegments = source.split("/");
  if (sourceSegments.slice(1).some((segment) => segment.length === 0)) {
    throw exportError("export.source-custody", `source contains an empty path segment: ${source}`, {
      source,
    });
  }
  if (sourceSegments.some((segment) => segment === "." || segment === "..")) {
    throw exportError(
      "export.source-custody",
      `source is not normalized or escapes model: ${source}`,
      {
        source,
      },
    );
  }
  const normalizedRoot = root.endsWith("/") && root !== "/" ? root.slice(0, -1) : root;
  const modelPrefix = normalizedRoot === "/" ? "/model/" : `${normalizedRoot}/model/`;
  if (!source.startsWith(modelPrefix)) {
    throw exportError("export.source-custody", `source is outside the project model: ${source}`, {
      source,
    });
  }
  const key = source.slice(modelPrefix.length);
  const keySegments = key.split("/");
  if (
    key.length === 0 ||
    keySegments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw exportError(
      "export.source-custody",
      `source has an invalid model-relative key: ${source}`,
      {
        source,
      },
    );
  }
  return key;
};

const entityRow = (entity: Entity, source_key: string): EntityFact => ({
  entity_id: entity.id,
  kind: entity.kind,
  name: entity.name,
  summary: entity.summary,
  status: entity.status,
  source_key,
});

const relationRow = (
  relation: Relation,
  relation_ordinal: number,
  source_key: string,
  attributes: Readonly<Record<string, JsonValue>>,
): RelationFact => ({
  relation_ordinal,
  source_id: relation.sourceId,
  target_id: relation.targetId,
  kind: relation.kind,
  summary: relation.summary,
  attributes,
  source_key,
});

const tagRows = (entity: Entity, source_key: string): ReadonlyArray<TagFact> =>
  entity.tags.map((tag) => ({ entity_id: entity.id, tag, source_key }));

const attributeRows = (
  entity: Entity,
  source_key: string,
  attributes: Readonly<Record<string, JsonValue>>,
): ReadonlyArray<AttributeFact> =>
  Object.entries(attributes).map(([key, value]) => ({
    entity_id: entity.id,
    key,
    value,
    source_key,
  }));

const sortSourceDocuments = (
  rows: ReadonlyArray<SourceDocumentFact>,
): ReadonlyArray<SourceDocumentFact> =>
  [...rows].sort((left, right) => compareText(left.source_key, right.source_key));

const sortEntities = (rows: ReadonlyArray<EntityFact>): ReadonlyArray<EntityFact> =>
  [...rows].sort((left, right) =>
    compareMany(
      [left.entity_id, left.kind, left.name, left.summary, left.status, left.source_key],
      [right.entity_id, right.kind, right.name, right.summary, right.status, right.source_key],
    ),
  );

const sortRelations = (rows: ReadonlyArray<RelationFact>): ReadonlyArray<RelationFact> =>
  [...rows].sort((left, right) =>
    compareMany(
      [
        left.relation_ordinal,
        left.source_id,
        left.target_id,
        left.kind,
        left.summary,
        left.source_key,
        stringifyCanonicalJson(left.attributes),
      ],
      [
        right.relation_ordinal,
        right.source_id,
        right.target_id,
        right.kind,
        right.summary,
        right.source_key,
        stringifyCanonicalJson(right.attributes),
      ],
    ),
  );

const sortTags = (rows: ReadonlyArray<TagFact>): ReadonlyArray<TagFact> =>
  [...rows].sort((left, right) =>
    compareMany(
      [left.entity_id, left.tag, left.source_key],
      [right.entity_id, right.tag, right.source_key],
    ),
  );

const sortAttributes = (rows: ReadonlyArray<AttributeFact>): ReadonlyArray<AttributeFact> =>
  [...rows].sort((left, right) =>
    compareMany(
      [left.entity_id, left.key, left.source_key, stringifyCanonicalJson(left.value)],
      [right.entity_id, right.key, right.source_key, stringifyCanonicalJson(right.value)],
    ),
  );

export const exportRelationalFacts = (
  project: ProjectGraph,
): RelationalFactBundle | RelationalExportError => {
  try {
    const entityRows: Array<EntityFact> = [];
    const relationRows: Array<RelationFact> = [];
    const tags: Array<TagFact> = [];
    const attributes: Array<AttributeFact> = [];
    const sourceKeys = new Set<string>();
    const entityEntries = [...project.entities.values()];

    for (const entity of entityEntries) {
      const key = sourceKey(project.root, entity.source);
      sourceKeys.add(key);
      const entityAttributes = snapshotAttributes(
        entity.attributes,
        `/entities/${entity.id}/attributes`,
        "export.entity-shape",
      );
      entityRows.push(entityRow(entity, key));
      tags.push(...tagRows(entity, key));
      attributes.push(...attributeRows(entity, key, entityAttributes));
    }

    for (const [relation_ordinal, relation] of project.relations.entries()) {
      const key = sourceKey(project.root, relation.source);
      sourceKeys.add(key);
      const relationAttributes = snapshotAttributes(
        relation.attributes,
        `/relations/${relation_ordinal}/attributes`,
        "export.relation-shape",
      );
      relationRows.push(relationRow(relation, relation_ordinal, key, relationAttributes));
    }

    const bundle: RelationalFactBundle = {
      format: RELATIONAL_FACT_FORMAT,
      schema: {
        revision: 1,
        fact_kinds: RELATIONAL_FACT_KINDS,
      },
      source_documents: sortSourceDocuments([...sourceKeys].map((source_key) => ({ source_key }))),
      entities: sortEntities(entityRows),
      relations: sortRelations(relationRows),
      tags: sortTags(tags),
      attributes: sortAttributes(attributes),
    };
    return deepFreeze(bundle);
  } catch (cause) {
    return cause instanceof RelationalExportError
      ? cause
      : exportError("export.json-value", "cannot snapshot relational facts", { cause });
  }
};
