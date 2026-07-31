import { Data, Effect, Schema } from "effect";

const boundedString = (maximum: number) =>
  Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(maximum)));
const boundedArray = <S extends Schema.Constraint>(schema: S, maximum: number) =>
  Schema.Array(schema).pipe(Schema.check(Schema.isMaxLength(maximum)));

const IdSchema = boundedString(128).pipe(
  Schema.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/)),
);
const AttributeKeySchema = boundedString(96).pipe(
  Schema.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9._-]{0,63}$/)),
);
const CommitSchema = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{40}$/)));
const DigestSchema = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/)));
const TimestampSchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(
      /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/,
    ),
  ),
);
const HttpsUrlSchema = boundedString(2048).pipe(
  Schema.check(Schema.isPattern(/^https:\/\/[A-Za-z0-9.-]+(?:[/:?#][^\s]*)?$/)),
);
const NullableHttpsUrlSchema = Schema.NullOr(HttpsUrlSchema);
const TextSchema = boundedString(4096);
const ShortTextSchema = boundedString(256);
const StringListSchema = boundedArray(boundedString(256), 64);

export const AttributeValueSchema = Schema.Union([
  boundedString(1024),
  Schema.Finite,
  Schema.Boolean,
  Schema.Null,
  StringListSchema,
]);
export type AttributeValue = typeof AttributeValueSchema.Type;
const AttributesSchema = Schema.Record(AttributeKeySchema, AttributeValueSchema).pipe(
  Schema.check(Schema.isMaxProperties(64)),
);

export const StudioSchema = Schema.Struct({
  id: IdSchema,
  name: ShortTextSchema,
  summary: TextSchema,
});
export type Studio = typeof StudioSchema.Type;

export const ProjectSchema = Schema.Struct({
  id: IdSchema,
  name: ShortTextSchema,
  summary: TextSchema,
  repository_url: Schema.NullOr(HttpsUrlSchema),
  head: CommitSchema,
  observed_at: TimestampSchema,
  status: Schema.Literals(["active", "paused", "incubating", "archived"]),
  preview_url: NullableHttpsUrlSchema,
});
export type PortfolioProject = typeof ProjectSchema.Type;

export const WorkStatusSchema = Schema.Literals([
  "candidate",
  "planned",
  "ready",
  "active",
  "blocked",
  "review",
  "accepted",
  "superseded",
  "abandoned",
]);
export type WorkStatus = typeof WorkStatusSchema.Type;

export const WorkSchema = Schema.Struct({
  id: IdSchema,
  project_id: IdSchema,
  kind: Schema.Literals(["milestone", "feature"]),
  title: ShortTextSchema,
  summary: TextSchema,
  status: WorkStatusSchema,
  definition_of_done: boundedArray(TextSchema, 32),
  attributes: AttributesSchema,
});
export type WorkDefinition = typeof WorkSchema.Type;

export const RelationSchema = Schema.Struct({
  id: IdSchema,
  source_id: IdSchema,
  target_id: IdSchema,
  kind: Schema.Literals(["contains", "requires"]),
  summary: TextSchema,
});
export type WorkRelation = typeof RelationSchema.Type;

export const LabelSchema = Schema.Struct({
  id: IdSchema,
  name: ShortTextSchema,
  color: Schema.Literals(["sky", "moss", "fjord", "heather", "amber", "slate"]),
  derivation: Schema.NullOr(TextSchema),
});
export type WorkLabel = typeof LabelSchema.Type;

export const MembershipSchema = Schema.Struct({
  id: IdSchema,
  work_id: IdSchema,
  label_id: IdSchema,
});
export type LabelMembership = typeof MembershipSchema.Type;

export const LabelRuleSchema = Schema.Struct({
  include_label_ids: boundedArray(IdSchema, 64),
  include_unlabeled: Schema.Boolean,
  include_mode: Schema.Literals(["any", "all"]),
  exclude_label_ids: boundedArray(IdSchema, 64),
  exclude_unlabeled: Schema.Boolean,
});
export type LabelRule = typeof LabelRuleSchema.Type;

const FieldPredicateSchema = Schema.Struct({
  field: boundedString(128),
  operator: Schema.Literals([
    "equals",
    "not-equals",
    "in",
    "contains",
    "exists",
    "greater-than-or-equal",
    "less-than-or-equal",
  ]),
  value: AttributeValueSchema,
});
export type FieldPredicate = typeof FieldPredicateSchema.Type;

const ViewSortSchema = Schema.Struct({
  field: boundedString(128),
  direction: Schema.Literals(["ascending", "descending"]),
});

export const WorkQuerySchema = Schema.Struct({
  labels: LabelRuleSchema,
  where: boundedArray(FieldPredicateSchema, 64),
});
export type WorkQuery = typeof WorkQuerySchema.Type;

export const SavedViewSchema = Schema.Struct({
  id: IdSchema,
  name: ShortTextSchema,
  query: WorkQuerySchema,
  traverse: boundedArray(Schema.Literals(["contains", "requires"]), 16),
  group_by: boundedArray(boundedString(128), 8),
  sort: boundedArray(ViewSortSchema, 8),
  fields: boundedArray(boundedString(128), 32),
  presentation: Schema.Literals(["list", "grid", "graph", "dag", "mosaic"]),
});
export type SavedView = typeof SavedViewSchema.Type;

export const ArtifactSchema = Schema.Struct({
  id: IdSchema,
  work_id: IdSchema,
  kind: Schema.Literals(["research", "design", "journey", "evidence", "preview"]),
  title: ShortTextSchema,
  href: HttpsUrlSchema,
  revision: CommitSchema,
});
export type ArtifactReference = typeof ArtifactSchema.Type;

export const PrioritySchema = Schema.Struct({
  id: IdSchema,
  work_id: IdSchema,
  rank: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  asserted_at: TimestampSchema,
  reason: TextSchema,
});
export type PriorityAssertion = typeof PrioritySchema.Type;

export const ReceiptSchema = Schema.Struct({
  id: IdSchema,
  work_id: IdSchema,
  outcome: Schema.Literals(["accepted", "superseded"]),
  commit: CommitSchema,
  observed_at: TimestampSchema,
  evidence_refs: boundedArray(IdSchema, 64),
  snapshot_id: Schema.NullOr(IdSchema),
});
export type WorkReceipt = typeof ReceiptSchema.Type;

export const SnapshotSchema = Schema.Struct({
  id: IdSchema,
  project_id: IdSchema,
  work_id: Schema.NullOr(IdSchema),
  commit: CommitSchema,
  digest: DigestSchema,
  observed_at: TimestampSchema,
  preview_url: NullableHttpsUrlSchema,
});
export type ProductSnapshot = typeof SnapshotSchema.Type;

export const PortfolioDocumentSchema = Schema.Struct({
  schema_version: Schema.Literal("pbk.portfolio/v1"),
  studio: StudioSchema,
  projects: boundedArray(ProjectSchema, 64),
  work: boundedArray(WorkSchema, 2048),
  relations: boundedArray(RelationSchema, 8192),
  labels: boundedArray(LabelSchema, 512),
  memberships: boundedArray(MembershipSchema, 16384),
  views: boundedArray(SavedViewSchema, 512),
  artifacts: boundedArray(ArtifactSchema, 8192),
  priorities: boundedArray(PrioritySchema, 8192),
  receipts: boundedArray(ReceiptSchema, 8192),
  snapshots: boundedArray(SnapshotSchema, 4096),
});
export type PortfolioDocument = typeof PortfolioDocumentSchema.Type;

export class PortfolioDecodeFailure extends Data.TaggedError("PortfolioDecodeFailure")<{
  readonly message: string;
}> {}

const duplicates = (values: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
};

const cycleIn = (
  workIds: ReadonlySet<string>,
  relations: ReadonlyArray<WorkRelation>,
): string | undefined => {
  const edges = new Map<string, Array<string>>([...workIds].map((id) => [id, []]));
  for (const relation of relations) {
    if (relation.kind === "requires") edges.get(relation.source_id)?.push(relation.target_id);
  }
  const active = new Set<string>();
  const settled = new Set<string>();
  const visit = (id: string): string | undefined => {
    if (active.has(id)) return id;
    if (settled.has(id)) return undefined;
    active.add(id);
    for (const target of edges.get(id) ?? []) {
      const cycle = visit(target);
      if (cycle !== undefined) return cycle;
    }
    active.delete(id);
    settled.add(id);
    return undefined;
  };
  for (const id of workIds) {
    const cycle = visit(id);
    if (cycle !== undefined) return cycle;
  }
  return undefined;
};

const validateDocument = (document: PortfolioDocument): string | undefined => {
  const families: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
    ["project", document.projects.map(({ id }) => id)],
    ["work", document.work.map(({ id }) => id)],
    ["relation", document.relations.map(({ id }) => id)],
    ["label", document.labels.map(({ id }) => id)],
    ["membership", document.memberships.map(({ id }) => id)],
    ["view", document.views.map(({ id }) => id)],
    ["artifact", document.artifacts.map(({ id }) => id)],
    ["priority", document.priorities.map(({ id }) => id)],
    ["receipt", document.receipts.map(({ id }) => id)],
    ["snapshot", document.snapshots.map(({ id }) => id)],
  ];
  for (const [family, ids] of families) {
    const duplicate = duplicates(ids)[0];
    if (duplicate !== undefined) return `duplicate ${family} identity ${duplicate}`;
  }

  const projectIds = new Set(document.projects.map(({ id }) => id));
  const work = new Map(document.work.map((item) => [item.id, item]));
  const labelIds = new Set(document.labels.map(({ id }) => id));
  const artifactIds = new Set(document.artifacts.map(({ id }) => id));
  const snapshotIds = new Set(document.snapshots.map(({ id }) => id));

  for (const item of document.work) {
    if (!projectIds.has(item.project_id)) return `work ${item.id} references missing project`;
  }
  for (const relation of document.relations) {
    const source = work.get(relation.source_id);
    const target = work.get(relation.target_id);
    if (source === undefined || target === undefined)
      return `relation ${relation.id} has missing endpoint`;
    if (source.id === target.id) return `relation ${relation.id} is self-referential`;
    if (relation.kind === "contains" && source.project_id !== target.project_id) {
      return `containment ${relation.id} crosses project ownership`;
    }
  }
  const cycle = cycleIn(new Set(work.keys()), document.relations);
  if (cycle !== undefined) return `requires cycle reaches ${cycle}`;
  for (const membership of document.memberships) {
    if (!work.has(membership.work_id) || !labelIds.has(membership.label_id)) {
      return `membership ${membership.id} has missing endpoint`;
    }
  }
  for (const artifact of document.artifacts) {
    if (!work.has(artifact.work_id)) return `artifact ${artifact.id} references missing work`;
  }
  for (const priority of document.priorities) {
    if (!work.has(priority.work_id)) return `priority ${priority.id} references missing work`;
  }
  for (const receipt of document.receipts) {
    if (!work.has(receipt.work_id)) return `receipt ${receipt.id} references missing work`;
    if (receipt.evidence_refs.some((id) => !artifactIds.has(id))) {
      return `receipt ${receipt.id} references missing evidence`;
    }
    if (receipt.snapshot_id !== null && !snapshotIds.has(receipt.snapshot_id)) {
      return `receipt ${receipt.id} references missing snapshot`;
    }
  }
  for (const snapshot of document.snapshots) {
    if (!projectIds.has(snapshot.project_id))
      return `snapshot ${snapshot.id} references missing project`;
    if (snapshot.work_id !== null && !work.has(snapshot.work_id)) {
      return `snapshot ${snapshot.id} references missing work`;
    }
  }
  for (const item of document.work) {
    for (const key of Object.keys(item.attributes)) {
      if (["id", "project_id", "kind", "status", "title", "priority_rank"].includes(key)) {
        return `metadata ${key} shadows a canonical work field`;
      }
    }
  }
  for (const view of document.views) {
    for (const predicate of view.query.where) {
      if (predicate.operator === "exists" && typeof predicate.value !== "boolean") {
        return `view ${view.id} exists predicate requires a boolean value`;
      }
      if (predicate.operator === "in" && !Array.isArray(predicate.value)) {
        return `view ${view.id} in predicate requires a string array`;
      }
      if (predicate.operator === "contains" && typeof predicate.value !== "string") {
        return `view ${view.id} contains predicate requires a string value`;
      }
    }
  }
  return undefined;
};

const deepFreeze = <A>(value: A): A => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const decodePortfolioDocument = (
  input: unknown,
): Effect.Effect<PortfolioDocument, PortfolioDecodeFailure> =>
  Schema.decodeUnknownEffect(PortfolioDocumentSchema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(
      (cause) =>
        new PortfolioDecodeFailure({
          message: `portfolio schema rejected input: ${cause.message}`,
        }),
    ),
    Effect.flatMap((document) => {
      const issue = validateDocument(document);
      return issue === undefined
        ? Effect.succeed(deepFreeze(document))
        : Effect.fail(new PortfolioDecodeFailure({ message: issue }));
    }),
  );
