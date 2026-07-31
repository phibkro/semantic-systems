import { Match } from "effect";
import type {
  AttributeValue,
  FieldPredicate,
  LabelRule,
  PortfolioDocument,
  WorkDefinition,
  WorkQuery,
} from "./decode.ts";

export interface QueryDiagnostics {
  readonly unknown_label_ids: ReadonlyArray<string>;
  readonly contradictory_label_ids: ReadonlyArray<string>;
  readonly contradictory_unlabeled: boolean;
  readonly is_unsatisfiable: boolean;
}

export interface NormalizedLabelRule {
  readonly rule: LabelRule;
  readonly diagnostics: QueryDiagnostics;
}

export interface WorkSelection {
  readonly identities: ReadonlyArray<string>;
  readonly diagnostics: QueryDiagnostics;
}

const uniqueSorted = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(values)].sort();

export const normalizeLabelRule = (
  document: PortfolioDocument,
  rule: LabelRule,
): NormalizedLabelRule => {
  const known = new Set(document.labels.map(({ id }) => id));
  const requested = uniqueSorted([...rule.include_label_ids, ...rule.exclude_label_ids]);
  const unknown = requested.filter((id) => !known.has(id));
  const excluded = uniqueSorted(rule.exclude_label_ids.filter((id) => known.has(id)));
  const excludedSet = new Set(excluded);
  const includedCandidates = uniqueSorted(rule.include_label_ids.filter((id) => known.has(id)));
  const contradictory = includedCandidates.filter((id) => excludedSet.has(id));
  const include = includedCandidates.filter((id) => !excludedSet.has(id));
  const contradictoryUnlabeled = rule.include_unlabeled && rule.exclude_unlabeled;
  const includeUnlabeled = rule.include_unlabeled && !rule.exclude_unlabeled;
  return {
    rule: {
      include_label_ids: include,
      include_unlabeled: includeUnlabeled,
      include_mode: rule.include_mode,
      exclude_label_ids: excluded,
      exclude_unlabeled: rule.exclude_unlabeled,
    },
    diagnostics: {
      unknown_label_ids: unknown,
      contradictory_label_ids: contradictory,
      contradictory_unlabeled: contradictoryUnlabeled,
      is_unsatisfiable: rule.include_mode === "all" && includeUnlabeled && include.length > 0,
    },
  };
};

const labelsByWork = (document: PortfolioDocument): ReadonlyMap<string, ReadonlySet<string>> => {
  const labels = new Map<string, Set<string>>();
  for (const item of document.work) labels.set(item.id, new Set());
  for (const membership of document.memberships)
    labels.get(membership.work_id)?.add(membership.label_id);
  return labels;
};

const currentPriority = (document: PortfolioDocument, workId: string): number | undefined =>
  document.priorities
    .filter(({ work_id }) => work_id === workId)
    .sort(
      (left, right) =>
        right.asserted_at.localeCompare(left.asserted_at) || right.id.localeCompare(left.id),
    )[0]?.rank;

const fieldValue = (
  document: PortfolioDocument,
  item: WorkDefinition,
  field: string,
): AttributeValue | undefined => {
  if (field === "id") return item.id;
  if (field === "project_id") return item.project_id;
  if (field === "kind") return item.kind;
  if (field === "status") return item.status;
  if (field === "title") return item.title;
  if (field === "priority_rank") return currentPriority(document, item.id);
  if (field.startsWith("attributes.")) return item.attributes[field.slice("attributes.".length)];
  return undefined;
};

const equal = (left: AttributeValue | undefined, right: AttributeValue): boolean =>
  Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;

const matches = (
  document: PortfolioDocument,
  item: WorkDefinition,
  predicate: FieldPredicate,
): boolean => {
  const current = fieldValue(document, item, predicate.field);
  return Match.value(predicate).pipe(
    Match.when({ operator: "equals" }, ({ value }) => equal(current, value)),
    Match.when({ operator: "not-equals" }, ({ value }) => !equal(current, value)),
    Match.when({ operator: "exists" }, ({ value }) => (current !== undefined) === value),
    Match.when(
      { operator: "in" },
      ({ value }) => typeof current === "string" && Array.isArray(value) && value.includes(current),
    ),
    Match.when(
      { operator: "contains" },
      ({ value }) =>
        typeof value === "string" &&
        (typeof current === "string"
          ? current.includes(value)
          : Array.isArray(current) && current.includes(value)),
    ),
    Match.when({ operator: "greater-than-or-equal" }, ({ value }) =>
      typeof current === "number" && typeof value === "number"
        ? current >= value
        : typeof current === "string" && typeof value === "string"
          ? current.localeCompare(value) >= 0
          : false,
    ),
    Match.when({ operator: "less-than-or-equal" }, ({ value }) =>
      typeof current === "number" && typeof value === "number"
        ? current <= value
        : typeof current === "string" && typeof value === "string"
          ? current.localeCompare(value) <= 0
          : false,
    ),
    Match.exhaustive,
  );
};

export const queryWork = (document: PortfolioDocument, query: WorkQuery): WorkSelection => {
  const normalized = normalizeLabelRule(document, query.labels);
  const labels = labelsByWork(document);
  const selected = document.work
    .filter((item) => {
      const attached = labels.get(item.id) ?? new Set<string>();
      const unlabeled = attached.size === 0;
      if (normalized.rule.exclude_label_ids.some((id) => attached.has(id))) return false;
      if (normalized.rule.exclude_unlabeled && unlabeled) return false;
      const predicates = [
        ...normalized.rule.include_label_ids.map((id) => attached.has(id)),
        ...(normalized.rule.include_unlabeled ? [unlabeled] : []),
      ];
      const labelMatch =
        predicates.length === 0 ||
        (normalized.rule.include_mode === "all"
          ? predicates.every(Boolean)
          : predicates.some(Boolean));
      return labelMatch && query.where.every((predicate) => matches(document, item, predicate));
    })
    .map(({ id }) => id)
    .sort();
  return { identities: selected, diagnostics: normalized.diagnostics };
};

export const resolveWorkField = fieldValue;
