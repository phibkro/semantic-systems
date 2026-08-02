import { Data } from "effect";
import type { JsonValue } from "../project-model/types.ts";

export const RELATIONAL_FACT_FORMAT = "semantic.relational-facts/v1" as const;
export const RELATIONAL_FACT_KINDS = Object.freeze([
  "entity",
  "relation",
  "tag",
  "attribute",
  "source_document",
] as const);

export type RelationalFactKind = (typeof RELATIONAL_FACT_KINDS)[number];

export interface SourceDocumentFact {
  readonly source_key: string;
}

export interface EntityFact {
  readonly entity_id: string;
  readonly kind: string;
  readonly name: string;
  readonly summary: string;
  readonly status: string | null;
  readonly source_key: string;
}

export interface RelationFact {
  readonly relation_ordinal: number;
  readonly source_id: string;
  readonly target_id: string;
  readonly kind: string;
  readonly summary: string;
  readonly attributes: Readonly<Record<string, JsonValue>>;
  readonly source_key: string;
}

export interface TagFact {
  readonly entity_id: string;
  readonly tag: string;
  readonly source_key: string;
}

export interface AttributeFact {
  readonly entity_id: string;
  readonly key: string;
  readonly value: JsonValue;
  readonly source_key: string;
}

export interface RelationalFactBundle {
  readonly format: typeof RELATIONAL_FACT_FORMAT;
  readonly schema: {
    readonly revision: 1;
    readonly fact_kinds: readonly ["entity", "relation", "tag", "attribute", "source_document"];
  };
  readonly source_documents: ReadonlyArray<SourceDocumentFact>;
  readonly entities: ReadonlyArray<EntityFact>;
  readonly relations: ReadonlyArray<RelationFact>;
  readonly tags: ReadonlyArray<TagFact>;
  readonly attributes: ReadonlyArray<AttributeFact>;
}

export type RelationalExportErrorCode =
  | "export.project-root"
  | "export.source-custody"
  | "export.json-value"
  | "export.entity-shape"
  | "export.relation-shape";

export class RelationalExportError extends Data.TaggedError("RelationalExportError")<{
  readonly code: RelationalExportErrorCode;
  readonly message: string;
  readonly path?: string;
  readonly source?: string;
  readonly cause?: unknown;
}> {}

export type RelationDirection = "incoming" | "outgoing";

export interface ReachabilityQuery {
  readonly roots: ReadonlyArray<string>;
  readonly direction: RelationDirection;
  readonly relationKinds: ReadonlyArray<string>;
  readonly maximumDepth: number;
  readonly maximumRows: number;
}

export interface ReachabilityNode {
  readonly entity_id: string;
  readonly depth: number;
  readonly source_key: string;
}

export interface ReachabilityPath {
  readonly entity_id: string;
  readonly entity_ids: ReadonlyArray<string>;
  readonly relation_ordinals: ReadonlyArray<number>;
}

export interface ReachabilityResult {
  readonly kind: "reachability";
  readonly query: ReachabilityQuery;
  readonly nodes: ReadonlyArray<ReachabilityNode>;
  readonly relations: ReadonlyArray<RelationFact>;
  readonly paths: ReadonlyArray<ReachabilityPath>;
  readonly truncated: boolean;
}

export interface EvidenceAssumption {
  readonly entity: EntityFact;
  readonly relation: RelationFact;
}

export interface EvidenceRecord {
  readonly entity: EntityFact;
  readonly relation: RelationFact;
  readonly assumptions: ReadonlyArray<EvidenceAssumption>;
  readonly assumption_relations: ReadonlyArray<RelationFact>;
}

export interface EvidenceQueryResult {
  readonly kind: "evidence";
  readonly target: EntityFact;
  readonly evidence: ReadonlyArray<EvidenceRecord>;
}

export type RelationalQueryErrorCode =
  | "query.bundle"
  | "query.roots"
  | "query.root"
  | "query.direction"
  | "query.relation-kind"
  | "query.maximum-depth"
  | "query.maximum-rows"
  | "query.target";

export class RelationalQueryError extends Data.TaggedError("RelationalQueryError")<{
  readonly code: RelationalQueryErrorCode;
  readonly message: string;
  readonly path?: string;
  readonly value?: unknown;
  readonly cause?: unknown;
}> {}
