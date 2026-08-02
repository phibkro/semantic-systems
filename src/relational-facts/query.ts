import {
  RelationalQueryError,
  type EntityFact,
  type EvidenceAssumption,
  type EvidenceQueryResult,
  type EvidenceRecord,
  type ReachabilityNode,
  type ReachabilityPath,
  type ReachabilityQuery,
  type ReachabilityResult,
  type RelationDirection,
  type RelationFact,
  type RelationalQueryErrorCode,
  type RelationalFactBundle,
} from "./types.ts";

const MAXIMUM_DEPTH = 64;
const MAXIMUM_ROWS = 10_000;

const EVIDENCE_RELATION_KINDS: Record<
  "supports" | "covers" | "discharges" | "validates" | "invalidates",
  true
> = {
  supports: true,
  covers: true,
  discharges: true,
  validates: true,
  invalidates: true,
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareRelations = (
  left: RelationFact,
  right: RelationFact,
  direction: RelationDirection,
): number => {
  const ordinal = left.relation_ordinal - right.relation_ordinal;
  if (ordinal !== 0) return ordinal;
  const leftNeighbor = direction === "outgoing" ? left.target_id : left.source_id;
  const rightNeighbor = direction === "outgoing" ? right.target_id : right.source_id;
  return compareText(leftNeighbor, rightNeighbor);
};

const queryError = (
  code: RelationalQueryErrorCode,
  message: string,
  context: { readonly path?: string; readonly value?: unknown; readonly cause?: unknown } = {},
): RelationalQueryError =>
  new RelationalQueryError({
    code,
    message,
    ...(context.path === undefined ? {} : { path: context.path }),
    ...(context.value === undefined ? {} : { value: context.value }),
    ...(context.cause === undefined ? {} : { cause: context.cause }),
  });

const deepFreeze = <Value>(value: Value, seen = new WeakSet<object>()): Value => {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object as Record<string, unknown>)) deepFreeze(child, seen);
  Object.freeze(object);
  return value;
};

const isBundleShape = (bundle: RelationalFactBundle): boolean =>
  bundle !== null &&
  typeof bundle === "object" &&
  Array.isArray(bundle.entities) &&
  Array.isArray(bundle.relations) &&
  Array.isArray(bundle.source_documents);

const entityMap = (bundle: RelationalFactBundle): Map<string, EntityFact> =>
  new Map(bundle.entities.map((entity) => [entity.entity_id, entity]));

const validatePositiveBound = (
  value: unknown,
  maximum: number,
  code: "query.maximum-depth" | "query.maximum-rows",
  name: string,
): RelationalQueryError | undefined => {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    return queryError(code, `${name} must be an integer in the range 1..${maximum}`, {
      path: `/${name}`,
      value,
    });
  }
  return undefined;
};

const normalizeQuery = (
  bundle: RelationalFactBundle,
  input: ReachabilityQuery,
): ReachabilityQuery | RelationalQueryError => {
  if (!isBundleShape(bundle))
    return queryError("query.bundle", "relational fact bundle is malformed");
  if (input === null || typeof input !== "object") {
    return queryError("query.roots", "reachability query must be an object", {
      path: "/",
      value: input,
    });
  }
  const query = input as unknown as {
    readonly roots?: unknown;
    readonly direction?: unknown;
    readonly relationKinds?: unknown;
    readonly maximumDepth?: unknown;
    readonly maximumRows?: unknown;
  };
  if (!Array.isArray(query.roots) || query.roots.length === 0) {
    return queryError("query.roots", "reachability query requires at least one root", {
      path: "/roots",
      value: query.roots,
    });
  }
  if (!query.roots.every((root): root is string => typeof root === "string" && root.length > 0)) {
    return queryError("query.root", "reachability roots must be non-empty entity IDs", {
      path: "/roots",
      value: query.roots,
    });
  }
  if (query.direction !== "incoming" && query.direction !== "outgoing") {
    return queryError("query.direction", "direction must be exactly incoming or outgoing", {
      path: "/direction",
      value: query.direction,
    });
  }
  if (
    !Array.isArray(query.relationKinds) ||
    !query.relationKinds.every(
      (kind): kind is string => typeof kind === "string" && kind.length > 0,
    )
  ) {
    return queryError(
      "query.relation-kind",
      "relationKinds must be an array of non-empty strings",
      {
        path: "/relationKinds",
        value: query.relationKinds,
      },
    );
  }
  const depthError = validatePositiveBound(
    query.maximumDepth,
    MAXIMUM_DEPTH,
    "query.maximum-depth",
    "maximumDepth",
  );
  if (depthError !== undefined) return depthError;
  const rowsError = validatePositiveBound(
    query.maximumRows,
    MAXIMUM_ROWS,
    "query.maximum-rows",
    "maximumRows",
  );
  if (rowsError !== undefined) return rowsError;

  const entities = entityMap(bundle);
  for (const root of query.roots) {
    if (!entities.has(root)) {
      return queryError("query.root", `unknown reachability root: ${root}`, {
        path: "/roots",
        value: root,
      });
    }
  }
  const availableKinds = new Set(bundle.relations.map((relation) => relation.kind));
  for (const relationKind of query.relationKinds) {
    if (!availableKinds.has(relationKind)) {
      return queryError("query.relation-kind", `unknown relation kind: ${relationKind}`, {
        path: "/relationKinds",
        value: relationKind,
      });
    }
  }
  return {
    roots: [...query.roots],
    direction: query.direction,
    relationKinds: [...query.relationKinds],
    maximumDepth: query.maximumDepth as number,
    maximumRows: query.maximumRows as number,
  };
};

interface VisitRecord {
  readonly entity_id: string;
  readonly depth: number;
  readonly entity_ids: ReadonlyArray<string>;
  readonly relation_ordinals: ReadonlyArray<number>;
}

export const queryReachability = (
  bundle: RelationalFactBundle,
  input: ReachabilityQuery,
): ReachabilityResult | RelationalQueryError => {
  const query = normalizeQuery(bundle, input);
  if (query instanceof RelationalQueryError) return query;
  try {
    const entities = entityMap(bundle);
    const relationKinds = new Set(query.relationKinds);
    const visited = new Map<string, VisitRecord>();
    const queue: Array<string> = [];
    const nodes: Array<ReachabilityNode> = [];
    const traversed = new Map<number, RelationFact>();
    let truncated = false;

    for (const root of query.roots) {
      if (visited.has(root)) continue;
      if (visited.size >= query.maximumRows) {
        truncated = true;
        break;
      }
      const visit: VisitRecord = {
        entity_id: root,
        depth: 0,
        entity_ids: [root],
        relation_ordinals: [],
      };
      visited.set(root, visit);
      queue.push(root);
      nodes.push({ entity_id: root, depth: 0, source_key: entities.get(root)!.source_key });
    }
    if (visited.size < new Set(query.roots).size && visited.size >= query.maximumRows)
      truncated = true;

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const currentId = queue[queueIndex]!;
      const current = visited.get(currentId)!;
      const candidates = bundle.relations
        .filter((relation) => {
          if (!relationKinds.has(relation.kind)) return false;
          return query.direction === "outgoing"
            ? relation.source_id === currentId
            : relation.target_id === currentId;
        })
        .sort((left, right) => compareRelations(left, right, query.direction));
      if (current.depth >= query.maximumDepth) {
        if (
          candidates.some((relation) => {
            const neighbor =
              query.direction === "outgoing" ? relation.target_id : relation.source_id;
            return !visited.has(neighbor);
          })
        ) {
          truncated = true;
        }
        continue;
      }
      for (const relation of candidates) {
        const neighbor = query.direction === "outgoing" ? relation.target_id : relation.source_id;
        if (visited.has(neighbor)) {
          traversed.set(relation.relation_ordinal, relation);
          continue;
        }
        if (visited.size >= query.maximumRows) {
          truncated = true;
          continue;
        }
        const path = {
          entity_id: neighbor,
          depth: current.depth + 1,
          entity_ids: [...current.entity_ids, neighbor],
          relation_ordinals: [...current.relation_ordinals, relation.relation_ordinal],
        } satisfies VisitRecord;
        visited.set(neighbor, path);
        queue.push(neighbor);
        traversed.set(relation.relation_ordinal, relation);
        const entity = entities.get(neighbor);
        if (entity === undefined) {
          return queryError("query.bundle", `relation points to unknown entity: ${neighbor}`, {
            path: `/relations/${relation.relation_ordinal}`,
            value: neighbor,
          });
        }
        nodes.push({
          entity_id: neighbor,
          depth: path.depth,
          source_key: entity.source_key,
        });
      }
    }

    const paths: Array<ReachabilityPath> = [];
    for (const node of nodes) {
      const visit = visited.get(node.entity_id)!;
      paths.push({
        entity_id: node.entity_id,
        entity_ids: [...visit.entity_ids],
        relation_ordinals: [...visit.relation_ordinals],
      });
    }
    const result: ReachabilityResult = {
      kind: "reachability",
      query,
      nodes,
      relations: [...traversed.values()].sort(
        (left, right) => left.relation_ordinal - right.relation_ordinal,
      ),
      paths,
      truncated,
    };
    return deepFreeze(result);
  } catch (cause) {
    return cause instanceof RelationalQueryError
      ? cause
      : queryError("query.bundle", "cannot traverse relational fact bundle", { cause });
  }
};

const outgoingAssumptions = (
  bundle: RelationalFactBundle,
  entities: ReadonlyMap<string, EntityFact>,
  evidenceId: string,
):
  | {
      readonly assumptions: ReadonlyArray<EvidenceAssumption>;
      readonly relations: ReadonlyArray<RelationFact>;
    }
  | RelationalQueryError => {
  const assumptions: Array<EvidenceAssumption> = [];
  const relations = new Map<number, RelationFact>();
  const visited = new Set<string>([evidenceId]);
  const queue: Array<string> = [evidenceId];
  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index]!;
    const candidates = bundle.relations
      .filter((relation) => relation.source_id === currentId && relation.kind === "assumes")
      .sort((left, right) => compareRelations(left, right, "outgoing"));
    for (const relation of candidates) {
      relations.set(relation.relation_ordinal, relation);
      const target = entities.get(relation.target_id);
      if (target === undefined) {
        return queryError(
          "query.bundle",
          `assumes relation points to unknown entity: ${relation.target_id}`,
          {
            path: `/relations/${relation.relation_ordinal}`,
            value: relation.target_id,
          },
        );
      }
      if (visited.has(target.entity_id)) continue;
      visited.add(target.entity_id);
      queue.push(target.entity_id);
      assumptions.push({ entity: target, relation });
    }
  }
  return {
    assumptions,
    relations: [...relations.values()].sort(
      (left, right) => left.relation_ordinal - right.relation_ordinal,
    ),
  };
};

export const queryEvidence = (
  bundle: RelationalFactBundle,
  targetId: string,
): EvidenceQueryResult | RelationalQueryError => {
  if (!isBundleShape(bundle))
    return queryError("query.bundle", "relational fact bundle is malformed");
  const entities = entityMap(bundle);
  if (typeof targetId !== "string" || targetId.length === 0 || !entities.has(targetId)) {
    return queryError("query.target", `unknown evidence query target: ${String(targetId)}`, {
      path: "/targetId",
      value: targetId,
    });
  }
  try {
    const target = entities.get(targetId)!;
    const directRelations = bundle.relations
      .filter(
        (relation) =>
          relation.target_id === targetId &&
          EVIDENCE_RELATION_KINDS[relation.kind as keyof typeof EVIDENCE_RELATION_KINDS] === true,
      )
      .sort((left, right) => left.relation_ordinal - right.relation_ordinal);
    const evidence: Array<EvidenceRecord> = [];
    for (const relation of directRelations) {
      const entity = entities.get(relation.source_id);
      if (entity === undefined) {
        return queryError(
          "query.bundle",
          `evidence relation points to unknown entity: ${relation.source_id}`,
          {
            path: `/relations/${relation.relation_ordinal}`,
            value: relation.source_id,
          },
        );
      }
      const assumptions = outgoingAssumptions(bundle, entities, entity.entity_id);
      if (assumptions instanceof RelationalQueryError) return assumptions;
      evidence.push({
        entity,
        relation,
        assumptions: assumptions.assumptions,
        assumption_relations: assumptions.relations,
      });
    }
    return deepFreeze({ kind: "evidence", target, evidence });
  } catch (cause) {
    return cause instanceof RelationalQueryError
      ? cause
      : queryError("query.bundle", "cannot inspect evidence relations", { cause });
  }
};
