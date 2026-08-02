export {
  canonicalWitMappingManifestJson,
  canonicalWitMappingSummaryJson,
  encodeWitMappingManifest,
  encodeWitMappingSummary,
} from "./canonical.ts";
export { decodePortableBoundary } from "./decode.ts";
export { generateWitMapping, renderCanonicalWit } from "./generate.ts";
export { generateWitMappingSummary, mapJsonFixture } from "./report.ts";
export {
  WIT_MAPPING_FORMAT,
  WIT_MAPPING_INPUT_FORMAT,
  WIT_PRIMITIVES,
  UNSUPPORTED_CLAIMS,
  WitMappingDecodeError,
  WitMappingError,
  defaultWitMappingBounds,
} from "./schema.ts";
export type {
  PortableBoundaryInput,
  SemanticDimensionKind,
  SemanticDimensionRow,
  SemanticWitMappingManifestV1,
  TheoryDeclaration,
  WitConstructor,
  WitInterface,
  WitMappingArtifact,
  WitMappingBounds,
  WitMappingDecodeResult,
  WitMappingDiagnostic,
  WitMappingIdentity,
  WitMappingProjection,
  WitMappingRow,
  WitMappingSummary,
  WitOperation,
  WitParameter,
  WitPrimitive,
  WitType,
  WitTypeDeclaration,
  WitWorld,
} from "./schema.ts";
