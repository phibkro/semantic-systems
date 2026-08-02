import { Schema } from "effect";
import { PublicPortfolioSnapshotSchema } from "../portfolio-model/public-export.ts";

export const AgentObservationBounds = Object.freeze({
  maximum_traces: 1,
  maximum_rows: 1000,
  maximum_trace_depth: 128,
  maximum_capture_bytes: 8 * 1024 * 1024,
  maximum_interval_milliseconds: 24 * 60 * 60 * 1000,
  maximum_attributes_per_observation: 64,
  maximum_resource_attributes_per_observation: 32,
  maximum_evidence_references: 64,
  maximum_metadata_depth: 8,
  maximum_metadata_collection_entries: 64,
  maximum_json_nesting_depth: 16,
  maximum_json_structural_tokens: 262_144,
  maximum_metadata_string_length: 4096,
  maximum_semantic_attribute_length: 512,
  maximum_metadata_key_length: 256,
  maximum_duration_nanoseconds: "18446744073709551615",
} as const);

const boundedString = (maximum: number) =>
  Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(maximum)));
const optionalBoundedString = (maximum: number) => Schema.optionalKey(boundedString(maximum));
export const ObservationTimestampPattern =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,9}))?Z$/;
const timestamp = Schema.String.pipe(Schema.check(Schema.isPattern(ObservationTimestampPattern)));
const attributes = Schema.Record(
  boundedString(AgentObservationBounds.maximum_metadata_key_length),
  Schema.Unknown,
).pipe(
  Schema.check(Schema.isMaxProperties(AgentObservationBounds.maximum_attributes_per_observation)),
);

export const ObservationCaptureInputSchema = Schema.Struct({
  format: Schema.Literal("semantic.agent-observation-capture/v1"),
  vendor: Schema.Literals(["langfuse", "clickstack"]),
  vendor_project_id: boundedString(256),
  capture_bytes: Schema.String,
  source_digest: Schema.String.pipe(Schema.check(Schema.isPattern(/^sha256:[0-9a-f]{64}$/))),
  captured_at: timestamp,
  interval: Schema.Struct({ start: timestamp, end: timestamp }),
  row_limit: Schema.Finite.pipe(
    Schema.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(1),
      Schema.isLessThanOrEqualTo(AgentObservationBounds.maximum_rows),
    ),
  ),
  complete: Schema.Boolean,
  truncated: Schema.Boolean,
  portfolio: PublicPortfolioSnapshotSchema,
});
export type ObservationCaptureInput = typeof ObservationCaptureInputSchema.Type;

export const LangfuseObservationSchema = Schema.Struct({
  id: boundedString(256),
  traceId: boundedString(256),
  startTime: timestamp,
  endTime: timestamp,
  projectId: boundedString(256),
  parentObservationId: Schema.NullOr(boundedString(256)),
  type: Schema.Literals(["SPAN", "GENERATION", "EVENT"]),
  name: boundedString(512),
  level: boundedString(64),
  statusMessage: Schema.String.pipe(Schema.check(Schema.isMaxLength(4096))),
  version: optionalBoundedString(256),
  environment: optionalBoundedString(256),
  bookmarked: Schema.optionalKey(Schema.Boolean),
  public: Schema.optionalKey(Schema.Boolean),
  userId: optionalBoundedString(512),
  sessionId: optionalBoundedString(512),
  isRootObservation: Schema.Boolean,
  metadata: attributes,
});
export type LangfuseObservation = typeof LangfuseObservationSchema.Type;

export const LangfuseCaptureSchema = Schema.Struct({
  data: Schema.Array(LangfuseObservationSchema).pipe(
    Schema.check(Schema.isMaxLength(AgentObservationBounds.maximum_rows)),
  ),

  meta: Schema.Struct({ cursor: Schema.optionalKey(Schema.NullOr(boundedString(8192))) }),
});
export type LangfuseCapture = typeof LangfuseCaptureSchema.Type;
const traceId = Schema.String.pipe(Schema.check(Schema.isPattern(/^(?!0{32}$)[0-9a-f]{32}$/)));
const spanId = Schema.String.pipe(Schema.check(Schema.isPattern(/^(?!0{16}$)[0-9a-f]{16}$/)));
const clickAttributes = Schema.Record(
  boundedString(AgentObservationBounds.maximum_metadata_key_length),
  Schema.String.pipe(
    Schema.check(Schema.isMaxLength(AgentObservationBounds.maximum_metadata_string_length)),
  ),
).pipe(
  Schema.check(Schema.isMaxProperties(AgentObservationBounds.maximum_attributes_per_observation)),
);

export const ClickStackSpanSchema = Schema.Struct({
  TraceId: traceId,
  SpanId: spanId,
  ParentSpanId: Schema.String.pipe(Schema.check(Schema.isPattern(/^(?:|(?!0{16}$)[0-9a-f]{16})$/))),
  Timestamp: timestamp,
  Duration: Schema.Union([
    Schema.Finite.pipe(
      Schema.check(
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(0),
        Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
      ),
    ),
    Schema.String.pipe(
      Schema.check(Schema.isPattern(/^(?:0|[1-9][0-9]*)$/), Schema.isMaxLength(20)),
    ),
  ]),
  SpanName: boundedString(512),
  ServiceName: boundedString(512),
  StatusCode: boundedString(128),
  SpanAttributes: clickAttributes,
  ResourceAttributes: clickAttributes.pipe(
    Schema.check(
      Schema.isMaxProperties(AgentObservationBounds.maximum_resource_attributes_per_observation),
    ),
  ),
});
export type ClickStackSpan = typeof ClickStackSpanSchema.Type;

export const SemanticAttributeKeys = Object.freeze({
  project: "pbk.project.id",
  work: "semantic.work.id",
  attempt: "semantic.attempt.id",
  revision: "semantic.project.revision",
  evidence: "semantic.evidence.refs",
} as const);
