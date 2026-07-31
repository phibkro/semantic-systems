import { Data, Effect } from "effect";
import type {
  PortfolioDocument,
  SavedView,
  WorkDefinition,
  WorkRelation,
  WorkStatus,
} from "./decode.ts";
import { queryWork, resolveWorkField, type QueryDiagnostics } from "./query.ts";

const HORIZON = [
  "candidate",
  "planned",
  "ready",
  "active",
  "blocked",
  "review",
] as const satisfies ReadonlyArray<WorkStatus>;
const HORIZON_STATUSES = new Set<WorkStatus>(HORIZON);

export interface ProjectionBase {
  readonly presentation: SavedView["presentation"];
  readonly identities: ReadonlyArray<string>;
  readonly diagnostics: QueryDiagnostics;
}

export interface ListProjection extends ProjectionBase {
  readonly presentation: "list";
  readonly items: ReadonlyArray<WorkDefinition>;
}

export interface GridProjection extends ProjectionBase {
  readonly presentation: "grid";
  readonly groups: ReadonlyArray<{
    readonly key: string;
    readonly identities: ReadonlyArray<string>;
  }>;
}

export interface GraphProjection extends ProjectionBase {
  readonly presentation: "graph" | "dag";
  readonly nodes: ReadonlyArray<WorkDefinition & { readonly depth: number }>;
  readonly edges: ReadonlyArray<WorkRelation>;
}

export interface MosaicProjection extends ProjectionBase {
  readonly presentation: "mosaic";
  readonly projects: ReadonlyArray<{
    readonly project_id: string;
    readonly identities: ReadonlyArray<string>;
  }>;
}

export type WorkProjection = ListProjection | GridProjection | GraphProjection | MosaicProjection;

export class PortfolioProjectionFailure extends Data.TaggedError("PortfolioProjectionFailure")<{
  readonly message: string;
}> {}

const compareFieldValues = (left: unknown, right: unknown): number => {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
};

const sortItems = (
  document: PortfolioDocument,
  items: ReadonlyArray<WorkDefinition>,
  view: SavedView,
): ReadonlyArray<WorkDefinition> =>
  [...items].sort((left, right) => {
    for (const sort of view.sort) {
      const compared = compareFieldValues(
        resolveWorkField(document, left, sort.field),
        resolveWorkField(document, right, sort.field),
      );
      if (compared !== 0) return sort.direction === "ascending" ? compared : -compared;
    }
    return left.id.localeCompare(right.id);
  });

const selectedRelations = (
  document: PortfolioDocument,
  selected: ReadonlySet<string>,
  view: SavedView,
): ReadonlyArray<WorkRelation> => {
  const kinds = new Set(view.traverse);
  return document.relations
    .filter(
      (relation) =>
        kinds.has(relation.kind) &&
        selected.has(relation.source_id) &&
        selected.has(relation.target_id),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
};

const dependencyDepths = (
  identities: ReadonlyArray<string>,
  edges: ReadonlyArray<WorkRelation>,
): ReadonlyMap<string, number> => {
  const incoming = new Map(identities.map((id) => [id, new Array<string>()]));
  for (const edge of edges) {
    if (edge.kind === "requires") incoming.get(edge.source_id)?.push(edge.target_id);
  }
  const memo = new Map<string, number>();
  const depth = (id: string): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    const value = Math.max(0, ...(incoming.get(id) ?? []).map((target) => depth(target) + 1));
    memo.set(id, value);
    return value;
  };
  for (const id of identities) depth(id);
  return memo;
};

const cyclic = (identities: ReadonlyArray<string>, edges: ReadonlyArray<WorkRelation>): boolean => {
  const outgoing = new Map(identities.map((id) => [id, new Array<string>()]));
  for (const edge of edges) outgoing.get(edge.source_id)?.push(edge.target_id);
  const active = new Set<string>();
  const settled = new Set<string>();
  const visit = (id: string): boolean => {
    if (active.has(id)) return true;
    if (settled.has(id)) return false;
    active.add(id);
    if ((outgoing.get(id) ?? []).some(visit)) return true;
    active.delete(id);
    settled.add(id);
    return false;
  };
  return identities.some(visit);
};

export const projectWork = (
  document: PortfolioDocument,
  view: SavedView,
): Effect.Effect<WorkProjection, PortfolioProjectionFailure> => {
  const selection = queryWork(document, view.query);
  const byId = new Map(document.work.map((item) => [item.id, item]));
  const items = sortItems(
    document,
    selection.identities.map((id) => byId.get(id)!),
    view,
  );
  const base = { identities: items.map(({ id }) => id), diagnostics: selection.diagnostics };
  if (view.presentation === "list") {
    return Effect.succeed({ ...base, presentation: "list", items });
  }
  if (view.presentation === "grid") {
    const grouped = new Map<string, Array<string>>();
    for (const item of items) {
      const key =
        view.group_by.length === 0
          ? "all"
          : view.group_by
              .map(
                (field) =>
                  `${field}=${String(resolveWorkField(document, item, field) ?? "absent")}`,
              )
              .join(" | ");
      const identities = grouped.get(key) ?? [];
      identities.push(item.id);
      grouped.set(key, identities);
    }
    return Effect.succeed({
      ...base,
      presentation: "grid",
      groups: [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, identities]) => ({ key, identities })),
    });
  }
  if (view.presentation === "mosaic") {
    const projects = new Map<string, Array<string>>();
    for (const item of items) {
      const identities = projects.get(item.project_id) ?? [];
      identities.push(item.id);
      projects.set(item.project_id, identities);
    }
    return Effect.succeed({
      ...base,
      presentation: "mosaic",
      projects: [...projects.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([project_id, identities]) => ({ project_id, identities })),
    });
  }
  const selected = new Set(selection.identities);
  const edges = selectedRelations(document, selected, view);
  if (view.presentation === "dag" && cyclic(selection.identities, edges)) {
    return Effect.fail(
      new PortfolioProjectionFailure({
        message: `view ${view.id} selects a cyclic relation family`,
      }),
    );
  }
  const depths = dependencyDepths(
    selection.identities,
    edges.filter(({ kind }) => kind === "requires"),
  );
  return Effect.succeed({
    ...base,
    presentation: view.presentation,
    nodes: items.map((item) => Object.assign({}, item, { depth: depths.get(item.id) ?? 0 })),
    edges,
  });
};

export const projectPortfolio = (document: PortfolioDocument) => {
  const byStatus = Object.fromEntries(
    HORIZON.map((status) => [
      status,
      document.work.filter((item) => item.status === status).map(({ id }) => id),
    ]),
  );
  const receiptOrder = [...document.receipts].sort(
    (left, right) =>
      right.observed_at.localeCompare(left.observed_at) || left.id.localeCompare(right.id),
  );
  return {
    overview: {
      studio: document.studio,
      project_count: document.projects.length,
      horizon_count: document.work.filter(({ status }) => HORIZON_STATUSES.has(status)).length,
      accepted_receipt_count: document.receipts.filter(({ outcome }) => outcome === "accepted")
        .length,
    },
    board: byStatus,
    features: [...document.work].sort((left, right) => left.id.localeCompare(right.id)),
    roadmap: {
      projects: document.projects,
      work: document.work,
      relations: document.relations,
    },
    history: { receipts: receiptOrder, snapshots: document.snapshots },
    detail: (id: string) => ({
      work: document.work.find((item) => item.id === id) ?? null,
      artifacts: document.artifacts.filter(({ work_id }) => work_id === id),
      relations: document.relations.filter(
        ({ source_id, target_id }) => source_id === id || target_id === id,
      ),
      receipts: document.receipts.filter(({ work_id }) => work_id === id),
      snapshots: document.snapshots.filter(({ work_id }) => work_id === id),
    }),
  };
};

const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) => left.localeCompare(right)),
        )
      : item,
  );

export const acceptPortfolioUpdate = (
  previous: PortfolioDocument,
  candidate: PortfolioDocument,
): Effect.Effect<PortfolioDocument, PortfolioProjectionFailure> => {
  for (const [family, oldRows, newRows] of [
    ["priority", previous.priorities, candidate.priorities],
    ["receipt", previous.receipts, candidate.receipts],
    ["snapshot", previous.snapshots, candidate.snapshots],
  ] as const) {
    const next = new Map(newRows.map((row) => [row.id, row]));
    for (const row of oldRows) {
      const retained = next.get(row.id);
      if (retained === undefined || stableJson(retained) !== stableJson(row)) {
        return Effect.fail(
          new PortfolioProjectionFailure({
            message: `${family} history ${row.id} was removed or changed`,
          }),
        );
      }
    }
  }
  return Effect.succeed(candidate);
};
