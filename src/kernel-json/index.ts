/**
 * Documented host-neutral entry point for the frozen agent-facing kernel
 * JSON contract (design spec 0020): the raw `semantic.kernel-json` document,
 * the `semantic.kernel-check` checked observation, canonical encoding, and
 * the JSON Schema description. The strict decoders and the existing 0018
 * checker remain the sole authorities; this module mints no semantic
 * judgment of its own.
 */
export {
  decodeKernelCheckObservationBytes,
  decodeKernelCheckObservationValue,
  decodeKernelDocumentBytes,
  decodeKernelDocumentValue,
} from "./decode.ts";
export type { KernelJsonDecodeResult, KernelJsonDiagnostic } from "./decode.ts";
export {
  canonicalKernelCheckObservationJson,
  canonicalKernelDocumentJson,
  encodeCanonicalKernelCheckObservation,
  encodeCanonicalKernelDocument,
} from "./canonical.ts";
export { kernelJsonSchema } from "./schema.ts";
export { checkKernelDocument, projectKernelProgram } from "./observe.ts";
export type {
  KernelJsonProjectionDiagnostic,
  KernelProjection,
  ProjectionResult,
} from "./observe.ts";
export {
  defaultKernelCheckEnvelopeBounds,
  defaultKernelJsonBounds,
  defaultKernelJsonRawBounds,
} from "./bounds.ts";
export type { KernelCheckEnvelopeBounds, KernelJsonBounds, KernelJsonRawBounds } from "./bounds.ts";
export type {
  BinderOriginKind,
  CheckAccepted,
  CheckDiagnostic,
  CheckRejected,
  ComputationJudgment,
  DiagnosticFact,
  InferredSummary,
  Judgment,
  KernelCheckObservation,
  KernelComputationTerm,
  KernelComputationType,
  KernelDocument,
  KernelOperationClause,
  KernelReturnClause,
  KernelSignatureOperation,
  KernelTypeNode,
  KernelValueTerm,
  KernelValueType,
  LabelIndex,
  OccurrencePath,
  ResumptionBinderEntry,
  TypeIndex,
  ValueBinderEntry,
  ValueJudgment,
} from "./types.ts";
