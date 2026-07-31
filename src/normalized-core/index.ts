/**
 * Portable entry point for the frozen semantic.normalized-core version 1 artifact.
 *
 * The module emits inert, immutable data from privately custodied 0018 programs.
 * Digest authority remains an explicit Effect Crypto requirement.
 */
export {
  canonicalNormalizedCoreJson,
  decodeEmissionMetadata,
  decodeNormalizedCore,
  decodeNormalizedCoreBytes,
  emitNormalizedCore,
  encodeNormalizedCore,
  validateNormalizedCore,
  validateNormalizedCoreBytes,
} from "./normalize.ts";
export { defaultNormalizedCoreBounds, isIdentity } from "./schema.ts";
export { NormalizedCoreDigestFailure } from "./identity.ts";
export type {
  DecodeResult,
  EmissionMetadataInput,
  EmissionResult,
  Identity,
  ImportedAssumption,
  ImportedAssumptionInput,
  NormalizedComputationTerm,
  NormalizedComputationType,
  NormalizedCoreArtifact,
  NormalizedCoreBounds,
  NormalizedCoreDiagnostic,
  NormalizedOperation,
  NormalizedValueTerm,
  NormalizedValueType,
  SourceCorrespondence,
  SourceCorrespondenceInput,
  SourceRole,
  SourceUnit,
  SourceUnitInput,
  ValidationResult,
} from "./schema.ts";
