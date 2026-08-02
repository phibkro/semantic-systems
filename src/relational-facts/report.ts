import { stringifyCanonicalJson } from "../references/canonical-json.ts";
import type { EvidenceQueryResult, ReachabilityResult, RelationalFactBundle } from "./types.ts";

export const RELATIONAL_FACT_REPORT_FORMAT = "semantic.relational-facts/report-v1" as const;

export interface RelationalFactBundleSummary {
  readonly format: RelationalFactBundle["format"];
  readonly schema_revision: 1;
  readonly source_documents: number;
  readonly entities: number;
  readonly relations: number;
  readonly tags: number;
  readonly attributes: number;
  readonly source_keys: ReadonlyArray<string>;
}

export interface RelationalFactsReport {
  readonly format: typeof RELATIONAL_FACT_REPORT_FORMAT;
  readonly bundle_summary: RelationalFactBundleSummary;
  readonly incoming: ReachabilityResult;
  readonly evidence: EvidenceQueryResult;
}

const deepFreeze = <Value>(value: Value, seen = new WeakSet<object>()): Value => {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object as Record<string, unknown>)) deepFreeze(child, seen);
  Object.freeze(object);
  return value;
};

export const makeRelationalFactsReport = (
  bundle: RelationalFactBundle,
  incoming: ReachabilityResult,
  evidence: EvidenceQueryResult,
): RelationalFactsReport =>
  deepFreeze({
    format: RELATIONAL_FACT_REPORT_FORMAT,
    bundle_summary: {
      format: bundle.format,
      schema_revision: bundle.schema.revision,
      source_documents: bundle.source_documents.length,
      entities: bundle.entities.length,
      relations: bundle.relations.length,
      tags: bundle.tags.length,
      attributes: bundle.attributes.length,
      source_keys: bundle.source_documents.map((document) => document.source_key),
    },
    incoming,
    evidence,
  });

export const encodeRelationalFactsReport = (report: RelationalFactsReport): Uint8Array =>
  new TextEncoder().encode(`${stringifyCanonicalJson(report)}\n`);
