export { exportRelationalFacts } from "./export.ts";
export { canonicalRelationalFactsJson, encodeRelationalFacts } from "./canonical.ts";
export { queryEvidence, queryReachability } from "./query.ts";
export {
  RELATIONAL_FACT_FORMAT,
  RELATIONAL_FACT_KINDS,
  RelationalExportError,
  RelationalQueryError,
} from "./types.ts";
export type {
  AttributeFact,
  EntityFact,
  EvidenceAssumption,
  EvidenceQueryResult,
  EvidenceRecord,
  ReachabilityNode,
  ReachabilityPath,
  ReachabilityQuery,
  ReachabilityResult,
  RelationDirection,
  RelationFact,
  RelationalExportErrorCode,
  RelationalFactBundle,
  RelationalQueryErrorCode,
  SourceDocumentFact,
  TagFact,
} from "./types.ts";
