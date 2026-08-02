import { Crypto, Data, Effect, Schema } from "effect";
import { canonicalJson } from "../tracer/canonical.ts";
import type { JsonObject } from "../tracer/json.ts";
import type { PublicPortfolioSnapshot } from "../portfolio-model/public-export.ts";
import {
  AgentObservationBounds,
  ClickStackSpanSchema,
  LangfuseCaptureSchema,
  LangfuseObservationSchema,
  ObservationTimestampPattern,
  ObservationCaptureInputSchema,
  SemanticAttributeKeys,
  type ClickStackSpan,
  type LangfuseObservation,
  type ObservationCaptureInput,
} from "./schema.ts";

export type CorrelationState =
  | "matched"
  | "unbound"
  | "observed_only"
  | "unknown_project"
  | "unknown_work"
  | "revision_mismatch"
  | "invalid_reference";

export interface CorrelationReference {
  readonly value: string | null;
  readonly state: CorrelationState;
}

export interface ObservationCorrelation {
  readonly project: CorrelationReference;
  readonly work: CorrelationReference;
  readonly attempt: CorrelationReference;
  readonly revision: CorrelationReference;
  readonly evidence: ReadonlyArray<CorrelationReference>;
}

export interface AgentObservationNode {
  readonly observation_id: string;
  readonly parent_observation_id: string | null;
  readonly name: string;
  readonly kind: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly duration_ns: string | null;
  readonly service_name: string | null;
  readonly status: {
    readonly level: string;
    readonly message: string;
  };
  readonly correlation: ObservationCorrelation;
  readonly children: ReadonlyArray<AgentObservationNode>;
}

export interface AgentObservationDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface AgentObservationReport {
  readonly format: "semantic.agent-observation-report/v1";
  readonly source: {
    readonly vendor: "langfuse" | "clickstack";
    readonly vendor_project_id: string;
    readonly trace_id: string;
    readonly source_digest: string;
    readonly captured_at: string;
    readonly interval: { readonly start: string; readonly end: string };
    readonly row_limit: number;
    readonly observed_rows: number;
  };
  readonly capture_state: "complete" | "incomplete";
  readonly trace: { readonly roots: ReadonlyArray<AgentObservationNode> };
  readonly diagnostics: ReadonlyArray<AgentObservationDiagnostic>;
  readonly unsupported_claims: ReadonlyArray<string>;
}

export interface AgentObservationArtifact {
  readonly report: AgentObservationReport;
  readonly canonical_json: string;
}

export class AgentObservationError extends Data.TaggedError("AgentObservationError")<{
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

interface NormalizedObservation {
  readonly id: string;
  readonly traceId: string;
  readonly projectId: string;
  readonly parentObservationId: string | null;
  readonly type: string;
  readonly startTime: string;
  readonly startOrder: string;
  readonly endTime: string;
  readonly durationNs: string | null;
  readonly serviceName: string | null;
  readonly name: string;
  readonly level: string;
  readonly statusMessage: string;
  readonly metadata: Readonly<Record<string, string | ReadonlyArray<string>>>;
}

const UNSUPPORTED_CLAIMS = Object.freeze([
  "capture completeness beyond declared and checked bounds",
  "causal truth from parent observation links",
  "cross-vendor execution identity",
  "semantic correctness of an agent action",
  "evidence authenticity or sufficiency",
  "work readiness, completion, or acceptance",
  "project health or agent quality",
  "retention history or freshness after captured_at",
]);

const deepFreeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const failure = (code: string, path: string, message: string, cause?: unknown) =>
  new AgentObservationError({ code, path, message, ...(cause === undefined ? {} : { cause }) });

const decodeEnvelope = (
  input: unknown,
): Effect.Effect<ObservationCaptureInput, AgentObservationError> =>
  Schema.decodeUnknownEffect(ObservationCaptureInputSchema, { onExcessProperty: "error" })(
    input,
  ).pipe(
    Effect.mapError((cause) =>
      failure(
        "input.invalid",
        "/",
        `invalid observation capture envelope: ${cause.message}`,
        cause,
      ),
    ),
  );

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const verifyDigest = (
  source: string,
  expected: string,
): Effect.Effect<void, AgentObservationError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const bytes = yield* crypto
      .digest("SHA-256", new TextEncoder().encode(source))
      .pipe(
        Effect.mapError((cause) =>
          failure("digest.unavailable", "/source_digest", "cannot compute capture digest", cause),
        ),
      );
    if (`sha256:${toHex(bytes)}` !== expected) {
      return yield* failure(
        "digest.mismatch",
        "/source_digest",
        "source_digest does not identify capture_bytes",
      );
    }
  });

const parseTimestamp = (value: string, path: string): bigint => {
  const match = ObservationTimestampPattern.exec(value);
  if (match === null) throw failure("time.invalid", path, `invalid timestamp ${value}`);
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  date.setUTCHours(Number(hour), Number(minute), Number(second), 0);
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second)
  ) {
    throw failure("time.invalid", path, `invalid calendar timestamp ${value}`);
  }
  return BigInt(date.getTime()) * 1_000_000n + BigInt(fraction.padEnd(9, "0").slice(0, 9) || "0");
};

const timestampOrder = (value: string): string => {
  const dot = value.indexOf(".", 19);
  const fraction = dot === -1 ? "" : value.slice(dot + 1, -1);
  return `${value.slice(0, 19)}.${fraction.padEnd(9, "0")}Z`;
};

const validateJsonStructure = (source: string): void => {
  let depth = 0;
  let structuralTokens = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (inString) {
      if (character === "\n" || character === "\r") {
        inString = false;
        escaped = false;
        depth = 0;
        continue;
      }
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === "{" || character === "[" || character === "," || character === ":") {
      structuralTokens += 1;
      if (structuralTokens > AgentObservationBounds.maximum_json_structural_tokens) {
        throw failure(
          "bounds.json-structural-tokens-exceeded",
          "/capture_bytes",
          `JSON structural tokens exceed ${AgentObservationBounds.maximum_json_structural_tokens}`,
        );
      }
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > AgentObservationBounds.maximum_json_nesting_depth) {
        throw failure(
          "bounds.json-depth-exceeded",
          "/capture_bytes",
          `JSON nesting exceeds ${AgentObservationBounds.maximum_json_nesting_depth}`,
        );
      }
    } else if (character === "}" || character === "]") {
      depth = Math.max(0, depth - 1);
    }
  }
};

const validateEnvelopeBounds = (
  input: ObservationCaptureInput,
): Effect.Effect<void, AgentObservationError> =>
  Effect.try({
    try: () => {
      if (input.capture_bytes.length > AgentObservationBounds.maximum_capture_bytes) {
        throw failure(
          "bounds.capture-too-large",
          "/capture_bytes",
          `capture exceeds ${AgentObservationBounds.maximum_capture_bytes} UTF-16 code units`,
        );
      }
      validateJsonStructure(input.capture_bytes);
      const encoded = new TextEncoder().encode(input.capture_bytes);
      if (new TextDecoder().decode(encoded) !== input.capture_bytes) {
        throw failure(
          "capture.invalid-utf8",
          "/capture_bytes",
          "capture_bytes contains an unpaired Unicode surrogate",
        );
      }
      if (encoded.byteLength > AgentObservationBounds.maximum_capture_bytes) {
        throw failure(
          "bounds.capture-too-large",
          "/capture_bytes",
          `capture is ${encoded.byteLength} bytes; maximum is ${AgentObservationBounds.maximum_capture_bytes}`,
        );
      }
      parseTimestamp(input.captured_at, "/captured_at");
      const start = parseTimestamp(input.interval.start, "/interval/start");
      const end = parseTimestamp(input.interval.end, "/interval/end");
      if (
        end <= start ||
        end - start > BigInt(AgentObservationBounds.maximum_interval_milliseconds) * 1_000_000n
      ) {
        throw failure(
          "bounds.interval-invalid",
          "/interval",
          `interval must be positive and no longer than ${AgentObservationBounds.maximum_interval_milliseconds} milliseconds`,
        );
      }
    },
    catch: (cause) =>
      cause instanceof AgentObservationError
        ? cause
        : failure("input.invalid", "/", "cannot validate capture bounds", cause),
  });

const boundedCaptureLines = (
  input: ObservationCaptureInput,
): Effect.Effect<ReadonlyArray<string>, AgentObservationError> =>
  Effect.try({
    try: () => {
      const lines: string[] = [];
      let start = 0;
      while (start < input.capture_bytes.length) {
        const newline = input.capture_bytes.indexOf("\n", start);
        const end = newline === -1 ? input.capture_bytes.length : newline;
        const line = input.capture_bytes.slice(start, end).trim();
        if (line.length > 0) {
          lines.push(line);
          if (lines.length > input.row_limit) {
            throw failure(
              "bounds.rows-exceeded",
              "/capture_bytes",
              `capture has more than row_limit ${input.row_limit}`,
            );
          }
        }
        if (newline === -1) break;
        start = newline + 1;
      }
      return lines;
    },
    catch: (cause) =>
      cause instanceof AgentObservationError
        ? cause
        : failure("capture.invalid-lines", "/capture_bytes", "cannot scan capture lines", cause),
  });

const assertOwnPropertyLimit = (value: unknown, maximum: number, path: string): void => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const object = value as Readonly<Record<string, unknown>>;
  let count = 0;
  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
    count += 1;
    if (count > maximum) {
      throw failure(
        "bounds.attribute-count-exceeded",
        path,
        `${path} contains more than ${maximum} properties`,
      );
    }
  }
};

const preflightLangfuseRow = (value: unknown, path: string): void => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const row = value as Readonly<Record<string, unknown>>;
  assertOwnPropertyLimit(
    row["metadata"],
    AgentObservationBounds.maximum_attributes_per_observation,
    `${path}/metadata`,
  );
};

const preflightLangfuseApi = (value: unknown, input: ObservationCaptureInput): void => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const data = (value as Readonly<Record<string, unknown>>)["data"];
  if (!Array.isArray(data)) return;
  if (data.length > input.row_limit) {
    throw failure(
      "bounds.rows-exceeded",
      "/capture_bytes/data",
      `capture has ${data.length} rows; row_limit is ${input.row_limit}`,
    );
  }
  for (const [index, row] of data.entries()) {
    preflightLangfuseRow(row, `/capture_bytes/data/${index}`);
  }
};

const preflightClickStackRow = (value: unknown, path: string): void => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const row = value as Readonly<Record<string, unknown>>;
  assertOwnPropertyLimit(
    row["SpanAttributes"],
    AgentObservationBounds.maximum_attributes_per_observation,
    `${path}/SpanAttributes`,
  );
  assertOwnPropertyLimit(
    row["ResourceAttributes"],
    AgentObservationBounds.maximum_resource_attributes_per_observation,
    `${path}/ResourceAttributes`,
  );
};

const preflight = <A>(
  value: A,
  inspect: () => void,
  path: string,
): Effect.Effect<A, AgentObservationError> =>
  Effect.try({
    try: () => {
      inspect();
      return value;
    },
    catch: (cause) =>
      cause instanceof AgentObservationError
        ? cause
        : failure("capture.preflight-failed", path, "cannot preflight capture shape", cause),
  });

const validateMetadataValue = (value: unknown, depth: number, path: string): void => {
  if (depth > AgentObservationBounds.maximum_metadata_depth) {
    throw failure(
      "bounds.metadata-depth-exceeded",
      path,
      `Langfuse metadata nesting exceeds ${AgentObservationBounds.maximum_metadata_depth} levels`,
    );
  }
  if (typeof value === "string") {
    if (value.length > AgentObservationBounds.maximum_metadata_string_length) {
      throw failure(
        "bounds.metadata-string-too-long",
        path,
        `Langfuse metadata string exceeds ${AgentObservationBounds.maximum_metadata_string_length} characters`,
      );
    }
    return;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (Array.isArray(value)) {
    if (value.length > AgentObservationBounds.maximum_metadata_collection_entries) {
      throw failure(
        "bounds.metadata-array-too-large",
        path,
        `Langfuse metadata array exceeds ${AgentObservationBounds.maximum_metadata_collection_entries} values`,
      );
    }
    for (const [index, item] of value.entries()) {
      validateMetadataValue(item, depth + 1, `${path}/${index}`);
    }
    return;
  }
  if (typeof value === "object") {
    let count = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      count += 1;
      if (count > AgentObservationBounds.maximum_metadata_collection_entries) {
        throw failure(
          "bounds.metadata-object-too-large",
          path,
          `Langfuse metadata object exceeds ${AgentObservationBounds.maximum_metadata_collection_entries} fields`,
        );
      }
      if (key.length === 0 || key.length > AgentObservationBounds.maximum_metadata_key_length) {
        throw failure(
          "bounds.metadata-key-invalid",
          `${path}/${key}`,
          `Langfuse metadata key must contain 1 through ${AgentObservationBounds.maximum_metadata_key_length} characters`,
        );
      }
      validateMetadataValue(
        (value as Readonly<Record<string, unknown>>)[key],
        depth + 1,
        `${path}/${key}`,
      );
    }
    return;
  }
  throw failure("capture.invalid-metadata", path, "Langfuse metadata must contain JSON values");
};

const normalizeLangfuse = (
  row: LangfuseObservation,
  path: string,
): Effect.Effect<NormalizedObservation, AgentObservationError> =>
  Effect.try({
    try: () => {
      for (const [key, value] of Object.entries(row.metadata)) {
        validateMetadataValue(value, 1, `${path}/metadata/${key}`);
      }
      const metadata: Record<string, string | ReadonlyArray<string>> = {};
      for (const key of Object.values(SemanticAttributeKeys)) {
        const value = row.metadata[key];
        if (value === undefined) continue;
        if (key === SemanticAttributeKeys.evidence) {
          if (
            !Array.isArray(value) ||
            value.length > AgentObservationBounds.maximum_evidence_references ||
            value.some(
              (item) =>
                typeof item !== "string" ||
                item.length === 0 ||
                item.length > AgentObservationBounds.maximum_semantic_attribute_length,
            )
          ) {
            throw failure(
              "capture.invalid-semantic-attribute",
              `${path}/metadata/${key}`,
              `${key} must be an array of at most ${AgentObservationBounds.maximum_evidence_references} non-empty strings`,
            );
          }
          metadata[key] = value;
        } else if (
          typeof value === "string" &&
          value.length > 0 &&
          value.length <= AgentObservationBounds.maximum_semantic_attribute_length
        ) {
          metadata[key] = value;
        } else {
          throw failure(
            "capture.invalid-semantic-attribute",
            `${path}/metadata/${key}`,
            `${key} must be a non-empty string of at most ${AgentObservationBounds.maximum_semantic_attribute_length} characters`,
          );
        }
      }
      return {
        id: row.id,
        traceId: row.traceId,
        projectId: row.projectId,
        parentObservationId: row.parentObservationId,
        type: row.type,
        startTime: row.startTime,
        startOrder: timestampOrder(row.startTime),
        endTime: row.endTime,
        durationNs: null,
        serviceName: null,
        name: row.name,
        level: row.level,
        statusMessage: row.statusMessage,
        metadata,
      };
    },
    catch: (cause) =>
      cause instanceof AgentObservationError
        ? cause
        : failure("capture.invalid-langfuse", path, "cannot normalize Langfuse metadata", cause),
  });

const decodeLangfuseRow = (
  value: unknown,
  path: string,
): Effect.Effect<NormalizedObservation, AgentObservationError> =>
  preflight(value, () => preflightLangfuseRow(value, path), path).pipe(
    Effect.flatMap((preflighted) =>
      Schema.decodeUnknownEffect(LangfuseObservationSchema, {
        onExcessProperty: "error",
      })(preflighted),
    ),
    Effect.mapError((cause) =>
      cause instanceof AgentObservationError
        ? cause
        : failure(
            "capture.invalid-langfuse",
            path,
            `invalid Langfuse observations_v2 row: ${cause.message}`,
            cause,
          ),
    ),
    Effect.flatMap((row) => normalizeLangfuse(row, path)),
  );

const decodeLangfuseApi = (
  value: unknown,
  input: ObservationCaptureInput,
): Effect.Effect<
  {
    readonly rows: ReadonlyArray<NormalizedObservation>;
    readonly cursor: string | null;
  },
  AgentObservationError
> =>
  preflight(value, () => preflightLangfuseApi(value, input), "/capture_bytes").pipe(
    Effect.flatMap((preflighted) =>
      Schema.decodeUnknownEffect(LangfuseCaptureSchema, { onExcessProperty: "error" })(preflighted),
    ),
    Effect.mapError((cause) =>
      cause instanceof AgentObservationError
        ? cause
        : failure(
            "capture.invalid-langfuse",
            "/capture_bytes",
            `invalid Langfuse v2 capture: ${cause.message}`,
            cause,
          ),
    ),
    Effect.flatMap((capture) =>
      Effect.forEach(capture.data, (row, index) =>
        normalizeLangfuse(row, `/capture_bytes/data/${index}`),
      ).pipe(Effect.map((rows) => ({ rows, cursor: capture.meta.cursor ?? null }))),
    ),
  );

const decodeLangfuseJsonl = (
  input: ObservationCaptureInput,
): Effect.Effect<
  {
    readonly rows: ReadonlyArray<NormalizedObservation>;
    readonly cursor: null;
  },
  AgentObservationError
> =>
  boundedCaptureLines(input).pipe(
    Effect.flatMap((lines) =>
      Effect.forEach(lines, (line, index) =>
        Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(line).pipe(
          Effect.mapError((cause) =>
            failure(
              "capture.invalid-json",
              `/capture_bytes/${index + 1}`,
              `invalid Langfuse JSONL: ${cause.message}`,
              cause,
            ),
          ),
          Effect.flatMap((value) => decodeLangfuseRow(value, `/capture_bytes/${index + 1}`)),
        ),
      ),
    ),
    Effect.map((rows) => ({ rows, cursor: null })),
  );

const decodeLangfuse = (
  input: ObservationCaptureInput,
): Effect.Effect<
  {
    readonly rows: ReadonlyArray<NormalizedObservation>;
    readonly cursor: string | null;
  },
  AgentObservationError
> =>
  Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(input.capture_bytes).pipe(
    Effect.mapError((cause) =>
      failure(
        "capture.invalid-json",
        "/capture_bytes",
        `invalid Langfuse JSON: ${cause.message}`,
        cause,
      ),
    ),
    Effect.flatMap((value) =>
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, "data")
        ? decodeLangfuseApi(value, input)
        : decodeLangfuseRow(value, "/capture_bytes/1").pipe(
            Effect.map((row) => ({ rows: [row], cursor: null })),
          ),
    ),
    Effect.catchIf(
      (error) => error.code === "capture.invalid-json",
      () => decodeLangfuseJsonl(input),
    ),
  );

const isValidEvidenceReference = (reference: unknown): reference is string =>
  typeof reference === "string" &&
  reference.length > 0 &&
  reference.length <= AgentObservationBounds.maximum_semantic_attribute_length;

const parseEvidenceReferences = (value: string, path: string): ReadonlyArray<string> => {
  if (!value.trimStart().startsWith("[")) {
    if (!isValidEvidenceReference(value)) {
      throw failure(
        "capture.invalid-semantic-attribute",
        path,
        `evidence reference must contain 1 through ${AgentObservationBounds.maximum_semantic_attribute_length} characters`,
      );
    }
    return [value];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (cause) {
    throw failure(
      "capture.invalid-semantic-attribute",
      path,
      "evidence references must be a JSON array or one non-empty string",
      cause,
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > AgentObservationBounds.maximum_evidence_references ||
    parsed.some((reference) => !isValidEvidenceReference(reference))
  ) {
    throw failure(
      "capture.invalid-semantic-attribute",
      path,
      `evidence references must contain at most ${AgentObservationBounds.maximum_evidence_references} bounded strings`,
    );
  }
  return [...new Set(parsed as ReadonlyArray<string>)].sort();
};

const normalizeClickStack = (
  row: ClickStackSpan,
  vendorProjectId: string,
  path: string,
): Effect.Effect<NormalizedObservation, AgentObservationError> =>
  Effect.try({
    try: () => {
      const metadata: Record<string, string | ReadonlyArray<string>> = {};
      for (const key of Object.values(SemanticAttributeKeys)) {
        const spanValue = row.SpanAttributes[key];
        const resourceValue = row.ResourceAttributes[key];
        if (spanValue !== undefined && resourceValue !== undefined && spanValue !== resourceValue) {
          throw failure(
            "capture.attribute-conflict",
            `${path}/SpanAttributes/${key}`,
            `span and resource attributes disagree for ${key}`,
          );
        }
        const value = spanValue ?? resourceValue;
        if (value !== undefined) {
          const valuePath = `${path}/${
            spanValue === undefined ? "ResourceAttributes" : "SpanAttributes"
          }/${key}`;
          if (key === SemanticAttributeKeys.evidence) {
            metadata[key] = parseEvidenceReferences(value, valuePath);
          } else if (
            value.length === 0 ||
            value.length > AgentObservationBounds.maximum_semantic_attribute_length
          ) {
            throw failure(
              "capture.invalid-semantic-attribute",
              valuePath,
              `${key} must be a non-empty string of at most ${AgentObservationBounds.maximum_semantic_attribute_length} characters`,
            );
          } else {
            metadata[key] = value;
          }
        }
      }
      const durationNs = String(row.Duration);
      if (BigInt(durationNs) > BigInt(AgentObservationBounds.maximum_duration_nanoseconds)) {
        throw failure(
          "bounds.duration-too-large",
          `${path}/Duration`,
          `duration exceeds ${AgentObservationBounds.maximum_duration_nanoseconds} nanoseconds`,
        );
      }
      return {
        id: row.SpanId,
        traceId: row.TraceId,
        projectId: vendorProjectId,
        parentObservationId: row.ParentSpanId === "" ? null : row.ParentSpanId,
        type: "SPAN",
        startTime: row.Timestamp,
        startOrder: timestampOrder(row.Timestamp),
        endTime: row.Timestamp,
        durationNs,
        serviceName: row.ServiceName,
        name: row.SpanName,
        level: row.StatusCode,
        statusMessage: "",
        metadata,
      };
    },
    catch: (cause) =>
      cause instanceof AgentObservationError
        ? cause
        : failure("capture.invalid-clickstack", path, "cannot normalize ClickStack span", cause),
  });

const decodeClickStack = (
  input: ObservationCaptureInput,
): Effect.Effect<
  {
    readonly rows: ReadonlyArray<NormalizedObservation>;
    readonly cursor: null;
  },
  AgentObservationError
> =>
  boundedCaptureLines(input).pipe(
    Effect.flatMap((lines) =>
      Effect.forEach(lines, (line, index) =>
        Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(line).pipe(
          Effect.mapError((cause) =>
            failure(
              "capture.invalid-json",
              `/capture_bytes/${index + 1}`,
              `invalid ClickStack NDJSON: ${cause.message}`,
              cause,
            ),
          ),
          Effect.flatMap((value) =>
            preflight(
              value,
              () => preflightClickStackRow(value, `/capture_bytes/${index + 1}`),
              `/capture_bytes/${index + 1}`,
            ),
          ),
          Effect.flatMap((preflighted) =>
            Schema.decodeUnknownEffect(ClickStackSpanSchema, {
              onExcessProperty: "error",
            })(preflighted).pipe(
              Effect.mapError((cause) =>
                failure(
                  "capture.invalid-clickstack",
                  `/capture_bytes/${index + 1}`,
                  `invalid ClickStack span: ${cause.message}`,
                  cause,
                ),
              ),
            ),
          ),
          Effect.flatMap((row) =>
            normalizeClickStack(row, input.vendor_project_id, `/capture_bytes/${index + 1}`),
          ),
        ),
      ),
    ),
    Effect.map((rows) => ({ rows, cursor: null })),
  );

const attributeString = (row: NormalizedObservation, key: string): string | null => {
  const value = row.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const indexPortfolio = (portfolio: PublicPortfolioSnapshot) => ({
  projects: new Map(portfolio.document.projects.map((project) => [project.id, project])),
  work: new Map(portfolio.document.work.map((item) => [item.id, item])),
  artifacts: new Set(portfolio.document.artifacts.map(({ id }) => id)),
});
type PortfolioIndex = ReturnType<typeof indexPortfolio>;

const correlationFor = (
  row: NormalizedObservation,
  portfolio: PortfolioIndex,
): ObservationCorrelation => {
  const projectValue = attributeString(row, SemanticAttributeKeys.project);
  const workValue = attributeString(row, SemanticAttributeKeys.work);
  const attemptValue = attributeString(row, SemanticAttributeKeys.attempt);
  const revisionValue = attributeString(row, SemanticAttributeKeys.revision);
  const evidenceValue = row.metadata[SemanticAttributeKeys.evidence];
  const project = projectValue === null ? undefined : portfolio.projects.get(projectValue);
  const workItem = workValue === null ? undefined : portfolio.work.get(workValue);
  const evidence = Array.isArray(evidenceValue)
    ? [...evidenceValue].sort().map(
        (value) =>
          ({
            value,
            state: portfolio.artifacts.has(value) ? "matched" : "invalid_reference",
          }) satisfies CorrelationReference,
      )
    : [];
  return {
    project:
      projectValue === null
        ? { value: null, state: "unbound" }
        : { value: projectValue, state: project === undefined ? "unknown_project" : "matched" },
    work:
      workValue === null
        ? { value: null, state: "unbound" }
        : {
            value: workValue,
            state:
              workItem === undefined ||
              (projectValue !== null && workItem.project_id !== projectValue)
                ? "unknown_work"
                : "matched",
          },
    attempt:
      attemptValue === null
        ? { value: null, state: "unbound" }
        : { value: attemptValue, state: "observed_only" },
    revision:
      revisionValue === null
        ? { value: null, state: "unbound" }
        : {
            value: revisionValue,
            state:
              project !== undefined && project.head === revisionValue
                ? "matched"
                : "revision_mismatch",
          },
    evidence,
  };
};

const compareRows = (left: NormalizedObservation, right: NormalizedObservation): number =>
  left.startOrder < right.startOrder
    ? -1
    : left.startOrder > right.startOrder
      ? 1
      : left.id < right.id
        ? -1
        : left.id > right.id
          ? 1
          : 0;

const validateRows = (
  input: ObservationCaptureInput,
  rows: ReadonlyArray<NormalizedObservation>,
  cursor: string | null,
): Effect.Effect<
  {
    readonly traceId: string;
    readonly roots: ReadonlyArray<NormalizedObservation>;
    readonly diagnostics: ReadonlyArray<AgentObservationDiagnostic>;
  },
  AgentObservationError
> =>
  Effect.try({
    try: () => {
      if (rows.length === 0) {
        throw failure("capture.empty", "/capture_bytes/data", "capture must contain one trace");
      }
      if (rows.length > input.row_limit) {
        throw failure(
          "bounds.rows-exceeded",
          "/capture_bytes/data",
          `capture has ${rows.length} rows; row_limit is ${input.row_limit}`,
        );
      }
      const ids = new Set<string>();
      const traceIds = new Set<string>();
      const intervalStart = parseTimestamp(input.interval.start, "/interval/start");
      const intervalEnd = parseTimestamp(input.interval.end, "/interval/end");
      for (const [index, row] of rows.entries()) {
        if (ids.has(row.id)) {
          throw failure(
            "trace.duplicate-observation",
            `/capture_bytes/data/${index}/id`,
            `duplicate observation ${row.id}`,
          );
        }
        ids.add(row.id);
        traceIds.add(row.traceId);
        if (row.projectId !== input.vendor_project_id) {
          throw failure(
            "capture.vendor-project-mismatch",
            `/capture_bytes/data/${index}/projectId`,
            `row project ${row.projectId} differs from ${input.vendor_project_id}`,
          );
        }
        const startedAt = parseTimestamp(row.startTime, `/capture_bytes/data/${index}/startTime`);
        const endedAt = parseTimestamp(row.endTime, `/capture_bytes/data/${index}/endTime`);
        if (row.durationNs === null && endedAt < startedAt) {
          throw failure(
            "time.invalid-range",
            `/capture_bytes/data/${index}/endTime`,
            `observation ${row.id} ends before it starts`,
          );
        }
        if (startedAt < intervalStart || startedAt >= intervalEnd) {
          throw failure(
            "bounds.row-outside-interval",
            `/capture_bytes/data/${index}/startTime`,
            `observation ${row.id} is outside the declared interval`,
          );
        }
      }
      if (traceIds.size > AgentObservationBounds.maximum_traces) {
        throw failure(
          "capture.trace-mismatch",
          "/capture_bytes/data",
          `observations exceed the ${AgentObservationBounds.maximum_traces}-trace bound`,
        );
      }
      const roots = rows.filter(({ parentObservationId }) => parentObservationId === null);
      const orphans = rows.filter(
        ({ parentObservationId }) => parentObservationId !== null && !ids.has(parentObservationId),
      );
      const diagnostics: AgentObservationDiagnostic[] = [];
      if (!input.complete) {
        diagnostics.push({
          code: "capture.incomplete",
          path: "/complete",
          message: "capture is explicitly incomplete and cannot support a completeness claim",
        });
      }
      if (input.truncated) {
        diagnostics.push({
          code: "capture.truncated",
          path: "/truncated",
          message: "capture declares that source rows were truncated",
        });
      }
      if (cursor !== null) {
        diagnostics.push({
          code: "capture.cursor-remaining",
          path: "/capture_bytes/meta/cursor",
          message: "Langfuse reports a remaining cursor",
        });
      }
      if (roots.length !== 1) {
        diagnostics.push({
          code: "trace.root-count",
          path: "/capture_bytes/data",
          message: `capture has ${roots.length} physical roots`,
        });
      }
      if (orphans.length > 0) {
        diagnostics.push({
          code: "trace.orphan",
          path: "/capture_bytes/data",
          message: `capture has ${orphans.length} observations with missing parents`,
        });
      }
      if (
        input.complete &&
        (input.truncated || cursor !== null || roots.length !== 1 || orphans.length > 0)
      ) {
        throw failure(
          "capture.false-completeness",
          "/complete",
          "capture declares completeness but its bounds or trace topology are incomplete",
        );
      }
      return {
        traceId: traceIds.values().next().value!,
        roots: input.complete ? roots : [...roots, ...orphans].sort(compareRows),
        diagnostics,
      };
    },
    catch: (cause) =>
      cause instanceof AgentObservationError
        ? cause
        : failure("capture.invalid", "/capture_bytes", "cannot validate capture", cause),
  });

const buildTree = (
  rows: ReadonlyArray<NormalizedObservation>,
  roots: ReadonlyArray<NormalizedObservation>,
  portfolio: PublicPortfolioSnapshot,
): ReadonlyArray<AgentObservationNode> => {
  const portfolioIndex = indexPortfolio(portfolio);
  const children = new Map<string, Array<NormalizedObservation>>();
  for (const row of rows) {
    if (row.parentObservationId === null) continue;
    const siblings = children.get(row.parentObservationId) ?? [];
    siblings.push(row);
    children.set(row.parentObservationId, siblings);
  }
  for (const siblings of children.values()) siblings.sort(compareRows);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const build = (row: NormalizedObservation, depth: number): AgentObservationNode => {
    if (depth > AgentObservationBounds.maximum_trace_depth) {
      throw failure(
        "bounds.trace-depth-exceeded",
        "/capture_bytes/data",
        `trace depth exceeds ${AgentObservationBounds.maximum_trace_depth}`,
      );
    }
    if (visiting.has(row.id)) {
      throw failure("trace.cycle", "/capture_bytes/data", `trace contains a cycle at ${row.id}`);
    }
    visiting.add(row.id);
    const node: AgentObservationNode = {
      observation_id: row.id,
      parent_observation_id: row.parentObservationId,
      name: row.name,
      kind: row.type,
      started_at: row.startTime,
      ended_at: row.durationNs === null ? row.endTime : null,
      duration_ns: row.durationNs,
      service_name: row.serviceName,
      status: { level: row.level, message: row.statusMessage },
      correlation: correlationFor(row, portfolioIndex),
      children: (children.get(row.id) ?? []).map((child) => build(child, depth + 1)),
    };
    visiting.delete(row.id);
    visited.add(row.id);
    return node;
  };
  const built = [...roots].sort(compareRows).map((root) => build(root, 1));
  for (const row of rows) {
    if (!visited.has(row.id)) build(row, 1);
  }
  return built;
};

const analyzeDecoded = (
  input: ObservationCaptureInput,
  vendor: "langfuse" | "clickstack",
  capture: {
    readonly rows: ReadonlyArray<NormalizedObservation>;
    readonly cursor: string | null;
  },
): Effect.Effect<AgentObservationReport, AgentObservationError> =>
  Effect.gen(function* () {
    const validated = yield* validateRows(input, capture.rows, capture.cursor);
    const roots = yield* Effect.try({
      try: () => buildTree(capture.rows, validated.roots, input.portfolio),
      catch: (cause) =>
        cause instanceof AgentObservationError
          ? cause
          : failure("trace.invalid", "/capture_bytes/data", "cannot build trace tree", cause),
    });
    return deepFreeze({
      format: "semantic.agent-observation-report/v1",
      source: {
        vendor,
        vendor_project_id: input.vendor_project_id,
        trace_id: validated.traceId,
        source_digest: input.source_digest,
        captured_at: input.captured_at,
        interval: input.interval,
        row_limit: input.row_limit,
        observed_rows: capture.rows.length,
      },
      capture_state: input.complete ? "complete" : "incomplete",
      trace: { roots },
      diagnostics: validated.diagnostics,
      unsupported_claims: UNSUPPORTED_CLAIMS,
    } satisfies AgentObservationReport);
  });

const analyzeVendor = (
  input: ObservationCaptureInput,
): Effect.Effect<AgentObservationReport, AgentObservationError> =>
  input.vendor === "langfuse"
    ? decodeLangfuse(input).pipe(
        Effect.flatMap((capture) => analyzeDecoded(input, "langfuse", capture)),
      )
    : decodeClickStack(input).pipe(
        Effect.flatMap((capture) => analyzeDecoded(input, "clickstack", capture)),
      );

export const analyzeAgentObservationCapture = (
  unknownInput: unknown,
): Effect.Effect<AgentObservationArtifact, AgentObservationError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const input = yield* decodeEnvelope(unknownInput);
    yield* validateEnvelopeBounds(input);
    yield* verifyDigest(input.capture_bytes, input.source_digest);
    const report = yield* analyzeVendor(input);
    const canonical_json = canonicalJson(report as unknown as JsonObject);
    return deepFreeze({ report, canonical_json });
  });
