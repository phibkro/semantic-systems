import { Schema } from "effect";
import { PublicPortfolioSnapshotSchema } from "../portfolio-model/public-export.ts";

const boundedString = (maximum: number) =>
  Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(maximum)));
const optionalBoundedString = (maximum: number) => Schema.optionalKey(boundedString(maximum));
const timestamp = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(
      /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/,
    ),
  ),
);
const attributes = Schema.Record(boundedString(256), Schema.Unknown).pipe(
  Schema.check(Schema.isMaxProperties(64)),
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
      Schema.isLessThanOrEqualTo(1000),
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
  data: Schema.Array(LangfuseObservationSchema).pipe(Schema.check(Schema.isMaxLength(1000))),

  meta: Schema.Struct({ cursor: Schema.optionalKey(Schema.NullOr(boundedString(8192))) }),
});
export type LangfuseCapture = typeof LangfuseCaptureSchema.Type;
const traceId = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{32}$/)));
const spanId = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{16}$/)));
const clickAttributes = Schema.Record(
  boundedString(256),
  Schema.String.pipe(Schema.check(Schema.isMaxLength(4096))),
).pipe(Schema.check(Schema.isMaxProperties(64)));

export const ClickStackSpanSchema = Schema.Struct({
  TraceId: traceId,
  SpanId: spanId,
  ParentSpanId: Schema.String.pipe(Schema.check(Schema.isPattern(/^(?:[0-9a-f]{16})?$/))),
  Timestamp: timestamp,
  Duration: Schema.Union([
    Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
    Schema.String.pipe(Schema.check(Schema.isPattern(/^(?:0|[1-9][0-9]*)$/))),
  ]),
  SpanName: boundedString(512),
  ServiceName: boundedString(512),
  StatusCode: boundedString(128),
  SpanAttributes: clickAttributes,
  ResourceAttributes: clickAttributes.pipe(Schema.check(Schema.isMaxProperties(32))),
});
export type ClickStackSpan = typeof ClickStackSpanSchema.Type;

export const SemanticAttributeKeys = Object.freeze({
  project: "pbk.project.id",
  work: "semantic.work.id",
  attempt: "semantic.attempt.id",
  revision: "semantic.project.revision",
  evidence: "semantic.evidence.refs",
} as const);
