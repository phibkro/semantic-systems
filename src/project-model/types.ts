export type JsonScalar = string | number | boolean | null;
export type JsonValue =
  | JsonScalar
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };
export type Attributes = Readonly<Record<string, JsonValue>>;
export const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const ENTITY_KIND_VALUES = [
  "agent",
  "artifact",
  "assumption",
  "claim",
  "component",
  "decision",
  "deployment",
  "domain_machine",
  "effect",
  "environment",
  "evidence",
  "gate",
  "handler",
  "human",
  "invariant",
  "law",
  "milestone",
  "obligation",
  "operation",
  "package",
  "protocol",
  "question",
  "realization",
  "responsibility",
  "runtime",
  "theory",
  "type",
  "work_item",
] as const;

export type EntityKind = (typeof ENTITY_KIND_VALUES)[number];
export const ENTITY_KINDS: ReadonlySet<string> = new Set(ENTITY_KIND_VALUES);

export const RELATION_KIND_VALUES = [
  "accountable_for",
  "assigned_to",
  "assumes",
  "blocks",
  "changes",
  "conflicts_with",
  "contains",
  "covers",
  "derives",
  "discharges",
  "extends",
  "handles",
  "hosts",
  "implements",
  "informs",
  "invalidates",
  "preserves",
  "provides",
  "publishes",
  "reads",
  "realizes",
  "refines",
  "requires",
  "reviewed_by",
  "selects",
  "sends",
  "supports",
  "validates",
  "writes",
] as const;

export type RelationKind = (typeof RELATION_KIND_VALUES)[number];
export const RELATION_KINDS: ReadonlySet<string> = new Set(RELATION_KIND_VALUES);

export interface Entity {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly summary: string;
  readonly status: string | null;
  readonly tags: ReadonlyArray<string>;
  readonly attributes: Attributes;
  readonly source: string;
}

export interface Relation {
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: string;
  readonly summary: string;
  readonly attributes: Attributes;
  readonly source: string;
}

export interface ProjectGraph {
  readonly entities: ReadonlyMap<string, Entity>;
  readonly relations: ReadonlyArray<Relation>;
  readonly root: string;
}

export const byKind = (project: ProjectGraph, kind: string): ReadonlyArray<Entity> =>
  [...project.entities.values()]
    .filter((entity) => entity.kind === kind)
    .sort((left, right) => left.id.localeCompare(right.id));

export const outgoing = (
  project: ProjectGraph,
  entityId: string,
  kinds?: ReadonlySet<string>,
): ReadonlyArray<Relation> =>
  project.relations.filter(
    (relation) =>
      relation.sourceId === entityId && (kinds === undefined || kinds.has(relation.kind)),
  );

export const incoming = (
  project: ProjectGraph,
  entityId: string,
  kinds?: ReadonlySet<string>,
): ReadonlyArray<Relation> =>
  project.relations.filter(
    (relation) =>
      relation.targetId === entityId && (kinds === undefined || kinds.has(relation.kind)),
  );
