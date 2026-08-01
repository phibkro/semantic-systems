/**
 * Storage-independent read-only explorer query boundary. Schema owns admission;
 * the normalized graph traversal below is a total, bounded pure transformation.
 */
import { Data, Effect, Match, Schema } from "effect";

const boundedString = (maximum: number) =>
  Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(maximum)));
const boundedArray = <S extends Schema.Constraint>(schema: S, maximum: number) =>
  Schema.Array(schema).pipe(Schema.check(Schema.isMaxLength(maximum)));

const IdentitySchema = boundedString(256).pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/)),
);
const FactKeySchema = boundedString(512);
const KindSchema = boundedString(128);
const SourceDocumentSchema = boundedString(1024);

export const relationFamilies = [
  "dependency",
  "effect",
  "ownership",
  "derivation",
  "causality",
  "observation",
  "evidence",
  "other",
] as const;

export const explorerBounds = Object.freeze({
  maximumEntities: 16_384,
  maximumRelations: 65_536,
  maximumRoots: 128,
  maximumDepth: 64,
  maximumSelectedNodes: 4_096,
  maximumExpansionOverrides: 16_384,
  maximumRelationKinds: 256,
} as const);

export const ExplorerProvenanceSchema = Schema.Struct({
  source_schema: boundedString(256),
  source_document: SourceDocumentSchema,
  source_record_kind: Schema.Literals(["entity", "relation"]),
  source_record_key: boundedString(512),
});
export type ExplorerProvenance = typeof ExplorerProvenanceSchema.Type;

export const ExplorerEntityFactSchema = Schema.Struct({
  fact_type: Schema.Literal("entity"),
  fact_key: FactKeySchema,
  subject_id: IdentitySchema,
  entity_kind: KindSchema,
  status: Schema.NullOr(boundedString(128)),
  name: boundedString(1024),
  provenance: ExplorerProvenanceSchema,
});
export type ExplorerEntityFact = typeof ExplorerEntityFactSchema.Type;

export const ExplorerRelationFactSchema = Schema.Struct({
  fact_type: Schema.Literal("relation"),
  fact_key: FactKeySchema,
  subject_id: IdentitySchema,
  object_id: IdentitySchema,
  relation_kind: KindSchema,
  family: Schema.Literals(relationFamilies),
  provenance: ExplorerProvenanceSchema,
});
export type ExplorerRelationFact = typeof ExplorerRelationFactSchema.Type;

export const ExplorerFactSourceSchema = Schema.Struct({
  format: Schema.Literal("semantic.explorer-fact-source"),
  version: Schema.Literal(1),
  facts: boundedArray(
    Schema.Union([ExplorerEntityFactSchema, ExplorerRelationFactSchema]),
    explorerBounds.maximumEntities + explorerBounds.maximumRelations,
  ),
});
export type ExplorerFactSource = typeof ExplorerFactSourceSchema.Type;

const BoundedDepthSchema = Schema.Finite.pipe(
  Schema.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(explorerBounds.maximumDepth),
  ),
);
const BoundedNodeCountSchema = Schema.Finite.pipe(
  Schema.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
    Schema.isLessThanOrEqualTo(explorerBounds.maximumSelectedNodes),
  ),
);

export const ExplorerQuerySchema = Schema.Struct({
  format: Schema.Literal("semantic.explorer-query"),
  version: Schema.Literal(1),
  roots: boundedArray(IdentitySchema, explorerBounds.maximumRoots),
  direction: Schema.Literals(["outgoing", "incoming", "both"]),
  relation_families: boundedArray(Schema.Literals(relationFamilies), relationFamilies.length),
  relation_kinds: boundedArray(KindSchema, explorerBounds.maximumRelationKinds),
  expansion: Schema.Struct({
    default: Schema.Literals(["expanded", "collapsed"]),
    expanded_ids: boundedArray(IdentitySchema, explorerBounds.maximumExpansionOverrides),
    collapsed_ids: boundedArray(IdentitySchema, explorerBounds.maximumExpansionOverrides),
  }),
  max_depth: BoundedDepthSchema,
  max_nodes: BoundedNodeCountSchema,
  view: Schema.Literals(["list", "tree", "mosaic"]),
});
export type ExplorerQuery = typeof ExplorerQuerySchema.Type;

export interface ExplorerNodeProjection {
  readonly canonical_identity: string;
  readonly fact_key: string;
  readonly entity_kind: string;
  readonly status: string | null;
  readonly name: string;
  readonly provenance: ExplorerProvenance;
}

export interface ExplorerRelationProjection {
  readonly fact_key: string;
  readonly canonical_subject_identity: string;
  readonly canonical_object_identity: string;
  readonly relation_kind: string;
  readonly family: (typeof relationFamilies)[number];
  readonly provenance: ExplorerProvenance;
}

export interface ExplorerListView {
  readonly kind: "list";
  readonly rows: ReadonlyArray<{
    readonly canonical_identity: string;
    readonly depth: number;
    readonly provenance: ExplorerProvenance;
  }>;
}

export interface ExplorerTreeView {
  readonly kind: "tree";
  readonly rows: ReadonlyArray<{
    readonly canonical_identity: string;
    readonly depth: number;
    readonly parent_identity: string | null;
    readonly parent_relation_fact_key: string | null;
    readonly child_identities: ReadonlyArray<string>;
    readonly provenance: ExplorerProvenance;
  }>;
}

export interface ExplorerMosaicView {
  readonly kind: "mosaic";
  readonly tiles: ReadonlyArray<{
    readonly canonical_identity: string;
    readonly depth: number;
    readonly direct_visible_relation_count: number;
    readonly provenance: ExplorerProvenance;
  }>;
}

export interface ExplorerQueryResult {
  readonly format: "semantic.explorer-query-result";
  readonly version: 1;
  readonly roots: ReadonlyArray<string>;
  readonly nodes: ReadonlyArray<ExplorerNodeProjection>;
  readonly relations: ReadonlyArray<ExplorerRelationProjection>;
  readonly available_relation_families: ReadonlyArray<(typeof relationFamilies)[number]>;
  readonly available_relation_kinds: ReadonlyArray<string>;
  readonly frontier: ReadonlyArray<{
    readonly canonical_identity: string;
    readonly reason: "collapsed" | "depth-limit";
    readonly hidden_relation_count: number;
  }>;
  readonly projection: ExplorerListView | ExplorerTreeView | ExplorerMosaicView;
}

const ProjectionProvenanceSchema = ExplorerProvenanceSchema;
const NodeProjectionSchema = Schema.Struct({
  canonical_identity: IdentitySchema,
  fact_key: FactKeySchema,
  entity_kind: KindSchema,
  status: Schema.NullOr(boundedString(128)),
  name: boundedString(1024),
  provenance: ProjectionProvenanceSchema,
});
const RelationProjectionSchema = Schema.Struct({
  fact_key: FactKeySchema,
  canonical_subject_identity: IdentitySchema,
  canonical_object_identity: IdentitySchema,
  relation_kind: KindSchema,
  family: Schema.Literals(relationFamilies),
  provenance: ProjectionProvenanceSchema,
});
const ViewDepthSchema = BoundedDepthSchema;
const ListProjectionSchema = Schema.Struct({
  kind: Schema.Literal("list"),
  rows: boundedArray(
    Schema.Struct({
      canonical_identity: IdentitySchema,
      depth: ViewDepthSchema,
      provenance: ProjectionProvenanceSchema,
    }),
    explorerBounds.maximumSelectedNodes,
  ),
});
const TreeProjectionSchema = Schema.Struct({
  kind: Schema.Literal("tree"),
  rows: boundedArray(
    Schema.Struct({
      canonical_identity: IdentitySchema,
      depth: ViewDepthSchema,
      parent_identity: Schema.NullOr(IdentitySchema),
      parent_relation_fact_key: Schema.NullOr(FactKeySchema),
      child_identities: boundedArray(IdentitySchema, explorerBounds.maximumSelectedNodes),
      provenance: ProjectionProvenanceSchema,
    }),
    explorerBounds.maximumSelectedNodes,
  ),
});
const MosaicProjectionSchema = Schema.Struct({
  kind: Schema.Literal("mosaic"),
  tiles: boundedArray(
    Schema.Struct({
      canonical_identity: IdentitySchema,
      depth: ViewDepthSchema,
      direct_visible_relation_count: Schema.Finite.pipe(
        Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
      ),
      provenance: ProjectionProvenanceSchema,
    }),
    explorerBounds.maximumSelectedNodes,
  ),
});

export const ExplorerQueryResultSchema = Schema.Struct({
  format: Schema.Literal("semantic.explorer-query-result"),
  version: Schema.Literal(1),
  roots: boundedArray(IdentitySchema, explorerBounds.maximumRoots),
  nodes: boundedArray(NodeProjectionSchema, explorerBounds.maximumSelectedNodes),
  relations: boundedArray(RelationProjectionSchema, explorerBounds.maximumRelations),
  available_relation_families: boundedArray(
    Schema.Literals(relationFamilies),
    relationFamilies.length,
  ),
  available_relation_kinds: boundedArray(KindSchema, explorerBounds.maximumRelationKinds),
  frontier: boundedArray(
    Schema.Struct({
      canonical_identity: IdentitySchema,
      reason: Schema.Literals(["collapsed", "depth-limit"]),
      hidden_relation_count: Schema.Finite.pipe(
        Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
      ),
    }),
    explorerBounds.maximumSelectedNodes,
  ),
  projection: Schema.Union([ListProjectionSchema, TreeProjectionSchema, MosaicProjectionSchema]),
});

export class ExplorerQueryRejected extends Data.TaggedError("ExplorerQueryRejected")<{
  readonly phase: "source" | "query" | "graph" | "traversal";
  readonly reason: string;
}> {}

interface Discovery {
  readonly canonicalIdentity: string;
  readonly depth: number;
  readonly parentIdentity: string | null;
  readonly parentRelationFactKey: string | null;
}

interface Step {
  readonly neighborIdentity: string;
  readonly relation: ExplorerRelationFact;
}

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const uniqueSorted = <Value extends string>(values: ReadonlyArray<Value>): ReadonlyArray<Value> =>
  [...new Set(values)].sort(compareStrings);

const duplicates = (values: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) (seen.has(value) ? duplicate : seen).add(value);
  return [...duplicate].sort(compareStrings);
};

const reject = (phase: ExplorerQueryRejected["phase"], reason: string): ExplorerQueryRejected =>
  new ExplorerQueryRejected({ phase, reason });

const decode = <S extends Schema.Constraint>(
  schema: S,
  input: unknown,
  phase: "source" | "query",
): Effect.Effect<S["Type"], ExplorerQueryRejected, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError((cause) => reject(phase, cause.message)),
    Effect.catchDefect(() => Effect.fail(reject(phase, `${phase} could not be decoded`))),
  );

const immutableProvenance = (value: ExplorerProvenance): ExplorerProvenance =>
  Object.freeze({ ...value });

const validateAndNormalize = (
  source: ExplorerFactSource,
  query: ExplorerQuery,
): Effect.Effect<
  {
    readonly entities: ReadonlyMap<string, ExplorerEntityFact>;
    readonly relations: ReadonlyArray<ExplorerRelationFact>;
    readonly query: ExplorerQuery;
  },
  ExplorerQueryRejected
> =>
  Effect.gen(function* () {
    const entityFacts = source.facts.filter(
      (fact): fact is ExplorerEntityFact => fact.fact_type === "entity",
    );
    const relationFacts = source.facts.filter(
      (fact): fact is ExplorerRelationFact => fact.fact_type === "relation",
    );
    if (entityFacts.length === 0) return yield* reject("graph", "source has no entities");
    if (entityFacts.length > explorerBounds.maximumEntities)
      return yield* reject(
        "graph",
        `source exceeds ${explorerBounds.maximumEntities} entity facts`,
      );
    if (relationFacts.length > explorerBounds.maximumRelations)
      return yield* reject(
        "graph",
        `source exceeds ${explorerBounds.maximumRelations} relation facts`,
      );
    if (query.roots.length === 0) return yield* reject("query", "query has no roots");

    const duplicateFactKeys = duplicates([
      ...entityFacts.map(({ fact_key }) => fact_key),
      ...relationFacts.map(({ fact_key }) => fact_key),
    ]);
    if (duplicateFactKeys.length > 0)
      return yield* reject("graph", `duplicate fact_key ${duplicateFactKeys[0]}`);

    const duplicateSubjects = duplicates(entityFacts.map(({ subject_id }) => subject_id));
    if (duplicateSubjects.length > 0)
      return yield* reject("graph", `duplicate entity subject_id ${duplicateSubjects[0]}`);

    for (const fact of entityFacts)
      if (fact.provenance.source_record_kind !== "entity")
        return yield* reject("graph", `entity fact ${fact.fact_key} has non-entity provenance`);
    for (const fact of relationFacts)
      if (fact.provenance.source_record_kind !== "relation")
        return yield* reject("graph", `relation fact ${fact.fact_key} has non-relation provenance`);

    const entities = new Map(
      entityFacts.map((fact) => [
        fact.subject_id,
        Object.freeze({ ...fact, provenance: immutableProvenance(fact.provenance) }),
      ]),
    );
    const relations = relationFacts
      .map((fact) => Object.freeze({ ...fact, provenance: immutableProvenance(fact.provenance) }))
      .sort((left, right) => compareStrings(left.fact_key, right.fact_key));

    for (const relation of relations) {
      if (!entities.has(relation.subject_id))
        return yield* reject(
          "graph",
          `relation ${relation.fact_key} has unknown subject ${relation.subject_id}`,
        );
      if (!entities.has(relation.object_id))
        return yield* reject(
          "graph",
          `relation ${relation.fact_key} has unknown object ${relation.object_id}`,
        );
    }

    const queryLists: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
      ["roots", query.roots],
      ["relation_families", query.relation_families],
      ["relation_kinds", query.relation_kinds],
      ["expanded_ids", query.expansion.expanded_ids],
      ["collapsed_ids", query.expansion.collapsed_ids],
    ];
    for (const [label, values] of queryLists) {
      const found = duplicates(values);
      if (found.length > 0) return yield* reject("query", `duplicate ${label} value ${found[0]}`);
    }

    const collapsed = new Set(query.expansion.collapsed_ids);
    const conflict = query.expansion.expanded_ids.find((identity) => collapsed.has(identity));
    if (conflict !== undefined)
      return yield* reject("query", `expansion override conflicts for ${conflict}`);

    for (const identity of [
      ...query.roots,
      ...query.expansion.expanded_ids,
      ...query.expansion.collapsed_ids,
    ])
      if (!entities.has(identity)) return yield* reject("query", `unknown identity ${identity}`);

    return {
      entities,
      relations: Object.freeze(relations),
      query: Object.freeze({
        ...query,
        roots: Object.freeze(uniqueSorted(query.roots)),
        relation_families: Object.freeze(uniqueSorted(query.relation_families)),
        relation_kinds: Object.freeze(uniqueSorted(query.relation_kinds)),
        expansion: Object.freeze({
          default: query.expansion.default,
          expanded_ids: Object.freeze(uniqueSorted(query.expansion.expanded_ids)),
          collapsed_ids: Object.freeze(uniqueSorted(query.expansion.collapsed_ids)),
        }),
      }),
    };
  });

const project = (
  entities: ReadonlyMap<string, ExplorerEntityFact>,
  allRelations: ReadonlyArray<ExplorerRelationFact>,
  query: ExplorerQuery,
): Effect.Effect<ExplorerQueryResult, ExplorerQueryRejected> =>
  Effect.gen(function* () {
    if (query.roots.length > query.max_nodes)
      return yield* reject(
        "traversal",
        `root count ${query.roots.length} exceeds max_nodes ${query.max_nodes}`,
      );
    const selectedFamilies = new Set(query.relation_families);
    const selectedKinds = new Set(query.relation_kinds);
    const relations = allRelations.filter(
      ({ family, relation_kind }) =>
        selectedFamilies.has(family) &&
        (selectedKinds.size === 0 || selectedKinds.has(relation_kind)),
    );

    const adjacency = new Map<string, Array<Step>>();
    for (const identity of entities.keys()) adjacency.set(identity, []);
    const append = (identity: string, step: Step): void => {
      adjacency.get(identity)!.push(step);
    };
    for (const relation of relations) {
      if (query.direction !== "incoming")
        append(relation.subject_id, { neighborIdentity: relation.object_id, relation });
      if (query.direction !== "outgoing")
        append(relation.object_id, { neighborIdentity: relation.subject_id, relation });
    }
    for (const steps of adjacency.values())
      steps.sort(
        (left, right) =>
          compareStrings(left.relation.fact_key, right.relation.fact_key) ||
          compareStrings(left.neighborIdentity, right.neighborIdentity),
      );

    const expandedOverrides = new Set(query.expansion.expanded_ids);
    const collapsedOverrides = new Set(query.expansion.collapsed_ids);
    const isExpanded = (identity: string): boolean =>
      expandedOverrides.has(identity) ||
      (!collapsedOverrides.has(identity) && query.expansion.default === "expanded");

    const discovered = new Map<string, Discovery>();
    const queue: Array<Discovery> = query.roots.map((canonicalIdentity) => ({
      canonicalIdentity,
      depth: 0,
      parentIdentity: null,
      parentRelationFactKey: null,
    }));
    for (const root of queue) discovered.set(root.canonicalIdentity, root);

    let cursor = 0;
    while (cursor < queue.length) {
      const current = queue[cursor++]!;
      if (!isExpanded(current.canonicalIdentity) || current.depth === query.max_depth) continue;
      for (const step of adjacency.get(current.canonicalIdentity)!) {
        if (discovered.has(step.neighborIdentity)) continue;
        if (discovered.size >= query.max_nodes)
          return yield* reject(
            "traversal",
            `selection exceeds max_nodes ${query.max_nodes} while expanding ${current.canonicalIdentity}`,
          );
        const child: Discovery = Object.freeze({
          canonicalIdentity: step.neighborIdentity,
          depth: current.depth + 1,
          parentIdentity: current.canonicalIdentity,
          parentRelationFactKey: step.relation.fact_key,
        });
        discovered.set(child.canonicalIdentity, child);
        queue.push(child);
      }
    }

    const selectedIds = new Set(discovered.keys());
    const selectedRelations = relations.filter(
      ({ subject_id, object_id }) => selectedIds.has(subject_id) && selectedIds.has(object_id),
    );
    const nodes: ReadonlyArray<ExplorerNodeProjection> = Object.freeze(
      [...selectedIds].sort(compareStrings).map((identity) => {
        const fact = entities.get(identity)!;
        return Object.freeze({
          canonical_identity: identity,
          fact_key: fact.fact_key,
          entity_kind: fact.entity_kind,
          status: fact.status,
          name: fact.name,
          provenance: fact.provenance,
        });
      }),
    );
    const relationProjection: ReadonlyArray<ExplorerRelationProjection> = Object.freeze(
      selectedRelations.map((fact) =>
        Object.freeze({
          fact_key: fact.fact_key,
          canonical_subject_identity: fact.subject_id,
          canonical_object_identity: fact.object_id,
          relation_kind: fact.relation_kind,
          family: fact.family,
          provenance: fact.provenance,
        }),
      ),
    );

    const frontier = Object.freeze(
      queue.flatMap((item) => {
        const hidden = adjacency
          .get(item.canonicalIdentity)!
          .filter(({ neighborIdentity }) => !selectedIds.has(neighborIdentity)).length;
        if (hidden === 0) return [];
        const reason = !isExpanded(item.canonicalIdentity) ? "collapsed" : "depth-limit";
        return [
          Object.freeze({
            canonical_identity: item.canonicalIdentity,
            reason,
            hidden_relation_count: hidden,
          }),
        ];
      }),
    );

    const projection = Match.value(query.view).pipe(
      Match.when(
        "list",
        (): ExplorerListView => ({
          kind: "list",
          rows: Object.freeze(
            nodes.map((node) =>
              Object.freeze({
                canonical_identity: node.canonical_identity,
                depth: discovered.get(node.canonical_identity)!.depth,
                provenance: node.provenance,
              }),
            ),
          ),
        }),
      ),
      Match.when("tree", (): ExplorerTreeView => {
        const children = new Map<string, Array<string>>();
        for (const identity of selectedIds) children.set(identity, []);
        for (const item of queue)
          if (item.parentIdentity !== null)
            children.get(item.parentIdentity)!.push(item.canonicalIdentity);
        return {
          kind: "tree",
          rows: Object.freeze(
            queue.map((item) =>
              Object.freeze({
                canonical_identity: item.canonicalIdentity,
                depth: item.depth,
                parent_identity: item.parentIdentity,
                parent_relation_fact_key: item.parentRelationFactKey,
                child_identities: Object.freeze(
                  children.get(item.canonicalIdentity)!.sort(compareStrings),
                ),
                provenance: entities.get(item.canonicalIdentity)!.provenance,
              }),
            ),
          ),
        };
      }),
      Match.when(
        "mosaic",
        (): ExplorerMosaicView => ({
          kind: "mosaic",
          tiles: Object.freeze(
            [...queue]
              .sort(
                (left, right) =>
                  left.depth - right.depth ||
                  compareStrings(left.canonicalIdentity, right.canonicalIdentity),
              )
              .map((item) =>
                Object.freeze({
                  canonical_identity: item.canonicalIdentity,
                  depth: item.depth,
                  direct_visible_relation_count: adjacency
                    .get(item.canonicalIdentity)!
                    .filter(({ neighborIdentity }) => selectedIds.has(neighborIdentity)).length,
                  provenance: entities.get(item.canonicalIdentity)!.provenance,
                }),
              ),
          ),
        }),
      ),
      Match.exhaustive,
    );

    return Object.freeze({
      format: "semantic.explorer-query-result",
      version: 1,
      roots: query.roots,
      nodes,
      relations: relationProjection,
      available_relation_families: Object.freeze(
        uniqueSorted(allRelations.map(({ family }) => family)),
      ),
      available_relation_kinds: Object.freeze(
        uniqueSorted(allRelations.map(({ relation_kind }) => relation_kind)),
      ),
      frontier,
      projection: Object.freeze(projection),
    });
  });

export const queryExplorer = (
  sourceInput: unknown,
  queryInput: unknown,
): Effect.Effect<ExplorerQueryResult, ExplorerQueryRejected> =>
  Effect.gen(function* () {
    const source = yield* decode(ExplorerFactSourceSchema, sourceInput, "source");
    const query = yield* decode(ExplorerQuerySchema, queryInput, "query");
    const normalized = yield* validateAndNormalize(source, query);
    return yield* project(normalized.entities, normalized.relations, normalized.query);
  });
