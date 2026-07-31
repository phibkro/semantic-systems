import { Effect, Schema, type Crypto } from "effect";
import {
  apply,
  bool,
  boolType,
  check,
  effectRowsEqual,
  force,
  functionType,
  handle,
  int,
  intType,
  lambda,
  letTerm,
  operation,
  operationClause,
  operationSignature,
  pair,
  pairType,
  resumeTerm,
  returnClause,
  returnTerm,
  returnType,
  thunk,
  thunkType,
  unit,
  unitType,
  valueTypesEqual,
  variable,
  type CheckedProgram,
  type ComputationTerm,
  type ComputationType,
  type OperationDeclaration,
  type ValueTerm,
  type ValueType,
} from "../kernel-calculus/index.ts";
import { requireCheckedProgram } from "../kernel-calculus/checker.ts";
import { isGrade, type Grade } from "../kernel-calculus/grade.ts";
import {
  canonicalBytes,
  canonicalJson,
  compareCodePoints,
  scanJson,
  type CanonicalJsonValue,
} from "./canonical.ts";
import { deriveIdentity, identityDomains, type NormalizedCoreDigestFailure } from "./identity.ts";
import {
  decodeBounds,
  defaultNormalizedCoreBounds,
  diagnostic,
  inspectUnknownJson,
  isIdentity,
  rejected,
  type DecodeResult,
  type EmissionMetadataInput,
  type EmissionResult,
  type Identity,
  type ImportedAssumption,
  type ImportedAssumptionInput,
  type NormalizedComputationTerm,
  type NormalizedComputationType,
  type NormalizedCoreArtifact,
  type NormalizedCoreBounds,
  type NormalizedCoreDiagnostic,
  type NormalizedOperation,
  type NormalizedValueTerm,
  type NormalizedValueType,
  type SourceCorrespondence,
  type SourceCorrespondenceInput,
  type SourceRole,
  type SourceUnit,
  type SourceUnitInput,
  type ValidationResult,
} from "./schema.ts";

const FORMAT = "semantic.normalized-core" as const;
const VERSION = 1 as const;
const KERNEL = "semantic.kernel-calculus/0018/v1" as const;

const asCanonical = (value: unknown): CanonicalJsonValue => value as CanonicalJsonValue;

const freezeDeep = <Value>(value: Value): Value => {
  if (
    typeof value !== "object" ||
    value === null ||
    ArrayBuffer.isView(value) ||
    Object.isFrozen(value)
  ) {
    return value;
  }
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
};

const resultRejected = (
  value: NormalizedCoreDiagnostic,
): {
  readonly status: "rejected";
  readonly diagnostics: readonly [NormalizedCoreDiagnostic];
} => freezeDeep({ status: "rejected", diagnostics: [value] as const });

class DecodeFailure {
  readonly diagnostic: NormalizedCoreDiagnostic;

  constructor(value: NormalizedCoreDiagnostic) {
    this.diagnostic = value;
  }
}

type Attempt<Value> =
  | { readonly status: "success"; readonly value: Value }
  | { readonly status: "failure"; readonly diagnostic: NormalizedCoreDiagnostic };

const attemptDecode = <Value>(run: () => Value): Attempt<Value> => {
  try {
    return { status: "success", value: run() };
  } catch (cause) {
    return {
      status: "failure",
      diagnostic:
        cause instanceof DecodeFailure
          ? cause.diagnostic
          : diagnostic("decode.hostile-input", "$", "input could not be decoded"),
    };
  }
};

const attemptCanonicalBytes = (value: unknown): Attempt<Uint8Array> => {
  try {
    return { status: "success", value: canonicalBytes(asCanonical(value)) };
  } catch {
    return {
      status: "failure",
      diagnostic: diagnostic("encode.canonical", "$", "value cannot be canonically encoded"),
    };
  }
};

const decodeUtf8 = (input: Uint8Array): Attempt<string> => {
  try {
    return {
      status: "success",
      value: new TextDecoder("utf-8", { fatal: true }).decode(input),
    };
  } catch {
    return {
      status: "failure",
      diagnostic: diagnostic("byte.utf8", "$", "input is not strict UTF-8"),
    };
  }
};

const parseJson = (input: string): Attempt<unknown> => {
  try {
    return {
      status: "success",
      value: Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(input),
    };
  } catch {
    return {
      status: "failure",
      diagnostic: diagnostic("byte.json-grammar", "$", "invalid JSON"),
    };
  }
};

const fail = (code: string, path: string, message: string): never => {
  throw new DecodeFailure(diagnostic(code, path, message));
};

const record = (
  value: unknown,
  fields: ReadonlyArray<string>,
  path: string,
): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("schema.expected-record", path, "expected an object");
  }
  const actual = Object.keys(value);
  const expected = [...fields].sort(compareCodePoints);
  const excess = actual.sort(compareCodePoints).find((key) => !expected.includes(key));
  if (excess !== undefined) {
    return fail("schema.excess-property", `${path}/${excess}`, "unexpected property");
  }
  const missing = expected.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined) {
    return fail("schema.missing-property", `${path}/${missing}`, "missing required property");
  }
  return value as Readonly<Record<string, unknown>>;
};

const taggedRecord = (value: unknown, path: string): Readonly<Record<string, unknown>> => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !Object.hasOwn(value, "tag")
  ) {
    return fail("schema.expected-tagged-record", path, "expected an object with a tag");
  }
  return value as Readonly<Record<string, unknown>>;
};

const array = (value: unknown, path: string): ReadonlyArray<unknown> => {
  if (!Array.isArray(value)) return fail("schema.expected-array", path, "expected an array");
  return value;
};

const nonemptyString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || Array.from(value).length === 0) {
    return fail("schema.expected-nonempty-string", path, "expected a nonempty string");
  }
  return value;
};

const identity = (value: unknown, path: string): Identity => {
  if (!isIdentity(value)) {
    return fail("schema.expected-identity", path, "expected sha256 and 64 lowercase hex digits");
  }
  return value;
};

const safeInteger = (value: unknown, path: string, nonnegative = false): number => {
  if (!Number.isSafeInteger(value) || (nonnegative && (value as number) < 0)) {
    return fail(
      nonnegative ? "schema.expected-nonnegative-integer" : "schema.expected-signed-integer",
      path,
      nonnegative ? "expected a nonnegative safe integer" : "expected a signed safe integer",
    );
  }
  return value as number;
};

const grade = (value: unknown, path: string): Grade => {
  if (!isGrade(value)) return fail("schema.expected-grade", path, "expected 0, 1, or omega");
  return value;
};

const role = (value: unknown, path: string): SourceRole => {
  if (
    value !== "definition" &&
    value !== "expression" &&
    value !== "type" &&
    value !== "generated"
  ) {
    return fail("schema.expected-source-role", path, "unknown source correspondence role");
  }
  return value;
};

const row = (value: unknown, path: string): ReadonlyArray<string> => {
  const entries = array(value, path).map((entry, index) =>
    nonemptyString(entry, `${path}/${index}`),
  );
  const normalized = [...new Set(entries)].sort(compareCodePoints);
  if (
    normalized.length !== entries.length ||
    entries.some((entry, index) => entry !== normalized[index])
  ) {
    return fail("schema.noncanonical-row", path, "effect row must be sorted and unique");
  }
  return Object.freeze(entries);
};

const grades = (value: unknown, path: string): ReadonlyArray<Grade> =>
  Object.freeze(array(value, path).map((entry, index) => grade(entry, `${path}/${index}`)));

const parseValueType = (value: unknown, path: string): NormalizedValueType => {
  const base = taggedRecord(value, path);
  switch (base["tag"]) {
    case "unit":
    case "bool":
    case "int":
      record(value, ["tag"], path);
      return freezeDeep({ tag: base["tag"] });
    case "pair": {
      const fields = record(value, ["tag", "first", "second"], path);
      return freezeDeep({
        tag: "pair",
        first: parseValueType(fields["first"], `${path}/first`),
        second: parseValueType(fields["second"], `${path}/second`),
      });
    }
    case "thunk": {
      const fields = record(value, ["tag", "effects", "computation"], path);
      return freezeDeep({
        tag: "thunk",
        effects: row(fields["effects"], `${path}/effects`),
        computation: parseComputationType(fields["computation"], `${path}/computation`),
      });
    }
    default:
      return fail("schema.unknown-value-type", `${path}/tag`, "unknown value type tag");
  }
};

const parseComputationType = (value: unknown, path: string): NormalizedComputationType => {
  const base = taggedRecord(value, path);
  switch (base["tag"]) {
    case "return": {
      const fields = record(value, ["tag", "grade", "value"], path);
      return freezeDeep({
        tag: "return",
        grade: grade(fields["grade"], `${path}/grade`),
        value: parseValueType(fields["value"], `${path}/value`),
      });
    }
    case "function": {
      const fields = record(value, ["tag", "parameter", "grade", "effects", "result"], path);
      return freezeDeep({
        tag: "function",
        parameter: parseValueType(fields["parameter"], `${path}/parameter`),
        grade: grade(fields["grade"], `${path}/grade`),
        effects: row(fields["effects"], `${path}/effects`),
        result: parseComputationType(fields["result"], `${path}/result`),
      });
    }
    default:
      return fail("schema.unknown-computation-type", `${path}/tag`, "unknown computation type tag");
  }
};

const parseValueTerm = (value: unknown, path: string): NormalizedValueTerm => {
  const base = taggedRecord(value, path);
  switch (base["tag"]) {
    case "bound-value": {
      const fields = record(value, ["tag", "distance"], path);
      return freezeDeep({
        tag: "bound-value",
        distance: safeInteger(fields["distance"], `${path}/distance`, true),
      });
    }
    case "unit":
      record(value, ["tag"], path);
      return freezeDeep({ tag: "unit" });
    case "bool": {
      const fields = record(value, ["tag", "value"], path);
      if (typeof fields["value"] !== "boolean") {
        return fail("schema.expected-boolean", `${path}/value`, "expected a boolean");
      }
      return freezeDeep({ tag: "bool", value: fields["value"] });
    }
    case "int": {
      const fields = record(value, ["tag", "value"], path);
      return freezeDeep({
        tag: "int",
        value: safeInteger(fields["value"], `${path}/value`),
      });
    }
    case "pair": {
      const fields = record(value, ["tag", "first", "second"], path);
      return freezeDeep({
        tag: "pair",
        first: parseValueTerm(fields["first"], `${path}/first`),
        second: parseValueTerm(fields["second"], `${path}/second`),
      });
    }
    case "thunk": {
      const fields = record(value, ["tag", "body"], path);
      return freezeDeep({
        tag: "thunk",
        body: parseComputationTerm(fields["body"], `${path}/body`),
      });
    }
    default:
      return fail("schema.unknown-value-term", `${path}/tag`, "unknown value term tag");
  }
};

const parseComputationTerm = (value: unknown, path: string): NormalizedComputationTerm => {
  const base = taggedRecord(value, path);
  switch (base["tag"]) {
    case "return": {
      const fields = record(value, ["tag", "grade", "value"], path);
      return freezeDeep({
        tag: "return",
        grade: grade(fields["grade"], `${path}/grade`),
        value: parseValueTerm(fields["value"], `${path}/value`),
      });
    }
    case "let": {
      const fields = record(value, ["tag", "bound", "body"], path);
      return freezeDeep({
        tag: "let",
        bound: parseComputationTerm(fields["bound"], `${path}/bound`),
        body: parseComputationTerm(fields["body"], `${path}/body`),
      });
    }
    case "force": {
      const fields = record(value, ["tag", "value"], path);
      return freezeDeep({ tag: "force", value: parseValueTerm(fields["value"], `${path}/value`) });
    }
    case "lambda": {
      const fields = record(value, ["tag", "parameter_type", "grade", "body"], path);
      return freezeDeep({
        tag: "lambda",
        parameter_type: parseValueType(fields["parameter_type"], `${path}/parameter_type`),
        grade: grade(fields["grade"], `${path}/grade`),
        body: parseComputationTerm(fields["body"], `${path}/body`),
      });
    }
    case "apply": {
      const fields = record(value, ["tag", "computation", "argument"], path);
      return freezeDeep({
        tag: "apply",
        computation: parseComputationTerm(fields["computation"], `${path}/computation`),
        argument: parseValueTerm(fields["argument"], `${path}/argument`),
      });
    }
    case "operation": {
      const fields = record(value, ["tag", "grade", "label", "operation", "argument"], path);
      return freezeDeep({
        tag: "operation",
        grade: grade(fields["grade"], `${path}/grade`),
        label: nonemptyString(fields["label"], `${path}/label`),
        operation: nonemptyString(fields["operation"], `${path}/operation`),
        argument: parseValueTerm(fields["argument"], `${path}/argument`),
      });
    }
    case "handle": {
      const fields = record(
        value,
        ["tag", "label", "computation", "return_clause", "operation_clauses"],
        path,
      );
      const returnFields = record(fields["return_clause"], ["body"], `${path}/return_clause`);
      const clauses = array(fields["operation_clauses"], `${path}/operation_clauses`).map(
        (entry, index) => {
          const clausePath = `${path}/operation_clauses/${index}`;
          const clause = record(entry, ["operation", "body"], clausePath);
          return freezeDeep({
            operation: nonemptyString(clause["operation"], `${clausePath}/operation`),
            body: parseComputationTerm(clause["body"], `${clausePath}/body`),
          });
        },
      );
      const sorted = [...clauses].sort((left, right) =>
        compareCodePoints(left.operation, right.operation),
      );
      if (
        sorted.some((entry, index) => entry.operation !== clauses[index]!.operation) ||
        sorted.some((entry, index) => index > 0 && entry.operation === sorted[index - 1]!.operation)
      ) {
        return fail(
          "schema.noncanonical-handler-clauses",
          `${path}/operation_clauses`,
          "handler clauses must be sorted and unique by operation",
        );
      }
      return freezeDeep({
        tag: "handle",
        label: nonemptyString(fields["label"], `${path}/label`),
        computation: parseComputationTerm(fields["computation"], `${path}/computation`),
        return_clause: {
          body: parseComputationTerm(returnFields["body"], `${path}/return_clause/body`),
        },
        operation_clauses: clauses,
      });
    }
    case "resume": {
      const fields = record(value, ["tag", "resumption_distance", "value"], path);
      return freezeDeep({
        tag: "resume",
        resumption_distance: safeInteger(
          fields["resumption_distance"],
          `${path}/resumption_distance`,
          true,
        ),
        value: parseValueTerm(fields["value"], `${path}/value`),
      });
    }
    default:
      return fail("schema.unknown-computation-term", `${path}/tag`, "unknown computation term tag");
  }
};

const parseMetadata = (input: unknown, bounds: NormalizedCoreBounds): EmissionMetadataInput => {
  const root = record(input, ["assumptions", "source"], "$");
  const assumptions = array(root["assumptions"], "$/assumptions");
  if (assumptions.length > bounds.maximumAssumptions) {
    return fail("decode.assumptions-exceeded", "$/assumptions", "maximum assumptions exceeded");
  }
  const decodedAssumptions = assumptions.map((entry, index): ImportedAssumptionInput => {
    const path = `$/assumptions/${index}`;
    const fields = record(entry, ["kind", "statement"], path);
    if (fields["kind"] !== "declared") {
      return fail("schema.assumption-kind", `${path}/kind`, "expected declared");
    }
    return freezeDeep({
      kind: "declared",
      statement: nonemptyString(fields["statement"], `${path}/statement`),
    });
  });
  const source = record(root["source"], ["units", "correspondence"], "$/source");
  const units = array(source["units"], "$/source/units");
  if (units.length > bounds.maximumSourceUnits) {
    return fail("decode.source-units-exceeded", "$/source/units", "maximum source units exceeded");
  }
  const decodedUnits = units.map((entry, index): SourceUnitInput => {
    const path = `$/source/units/${index}`;
    const fields = record(entry, ["source_key", "uri", "content_identity", "byte_length"], path);
    return freezeDeep({
      source_key: nonemptyString(fields["source_key"], `${path}/source_key`),
      uri: nonemptyString(fields["uri"], `${path}/uri`),
      content_identity: identity(fields["content_identity"], `${path}/content_identity`),
      byte_length: safeInteger(fields["byte_length"], `${path}/byte_length`, true),
    });
  });
  const sourceKeys = new Set<string>();
  for (let index = 0; index < decodedUnits.length; index += 1) {
    const sourceKey = decodedUnits[index]!.source_key;
    if (sourceKeys.has(sourceKey)) {
      return fail(
        "metadata.duplicate-source-key",
        `$/source/units/${index}/source_key`,
        "duplicate source key",
      );
    }
    sourceKeys.add(sourceKey);
  }
  const correspondence = array(source["correspondence"], "$/source/correspondence");
  if (correspondence.length > bounds.maximumCorrespondences) {
    return fail(
      "decode.correspondences-exceeded",
      "$/source/correspondence",
      "maximum correspondences exceeded",
    );
  }
  const decodedCorrespondence = correspondence.map((entry, index): SourceCorrespondenceInput => {
    const path = `$/source/correspondence/${index}`;
    const fields = record(
      entry,
      ["node_path", "source_key", "role", "start_byte", "end_byte"],
      path,
    );
    return freezeDeep({
      node_path: nonemptyString(fields["node_path"], `${path}/node_path`),
      source_key: nonemptyString(fields["source_key"], `${path}/source_key`),
      role: role(fields["role"], `${path}/role`),
      start_byte: safeInteger(fields["start_byte"], `${path}/start_byte`, true),
      end_byte: safeInteger(fields["end_byte"], `${path}/end_byte`, true),
    });
  });
  return freezeDeep({
    assumptions: decodedAssumptions,
    source: { units: decodedUnits, correspondence: decodedCorrespondence },
  });
};

const resolveBounds = (bounds: NormalizedCoreBounds): DecodeResult<NormalizedCoreBounds> =>
  decodeBounds(bounds);

export const decodeEmissionMetadata = (
  input: unknown,
  bounds: NormalizedCoreBounds = defaultNormalizedCoreBounds,
): DecodeResult<EmissionMetadataInput> => {
  const decodedBounds = resolveBounds(bounds);
  if (decodedBounds.status === "rejected") return decodedBounds;
  const inspected = inspectUnknownJson(input, decodedBounds.value);
  if (inspected.status === "rejected") return inspected;
  try {
    return freezeDeep({
      status: "decoded",
      value: parseMetadata(inspected.value.value, decodedBounds.value),
    });
  } catch (cause) {
    return cause instanceof DecodeFailure
      ? rejected(cause.diagnostic)
      : rejected(diagnostic("decode.hostile-input", "$", "metadata could not be decoded"));
  }
};

const projectValueType = (type: ValueType): NormalizedValueType => {
  switch (type.kind) {
    case "unit":
    case "bool":
    case "int":
      return freezeDeep({ tag: type.kind });
    case "pair":
      return freezeDeep({
        tag: "pair",
        first: projectValueType(type.first),
        second: projectValueType(type.second),
      });
    case "thunk":
      return freezeDeep({
        tag: "thunk",
        effects: [...type.effects].sort(compareCodePoints),
        computation: projectComputationType(type.computation),
      });
  }
};

const projectComputationType = (type: ComputationType): NormalizedComputationType => {
  switch (type.kind) {
    case "return":
      return freezeDeep({
        tag: "return",
        grade: type.grade,
        value: projectValueType(type.value),
      });
    case "function":
      return freezeDeep({
        tag: "function",
        parameter: projectValueType(type.parameter),
        grade: type.grade,
        effects: [...type.effects].sort(compareCodePoints),
        result: projectComputationType(type.result),
      });
  }
};

const projectValueTerm = (term: ValueTerm): NormalizedValueTerm => {
  switch (term.kind) {
    case "variable":
      return freezeDeep({ tag: "bound-value", distance: term.index });
    case "unit":
      return freezeDeep({ tag: "unit" });
    case "bool":
      return freezeDeep({ tag: "bool", value: term.value });
    case "int":
      return freezeDeep({ tag: "int", value: term.value });
    case "pair":
      return freezeDeep({
        tag: "pair",
        first: projectValueTerm(term.first),
        second: projectValueTerm(term.second),
      });
    case "thunk":
      return freezeDeep({ tag: "thunk", body: projectComputationTerm(term.body) });
    case "resumption":
      return fail(
        "projection.resumption-escape",
        "$/term",
        "accepted programs cannot contain a resumption value",
      );
  }
};

const projectComputationTerm = (term: ComputationTerm): NormalizedComputationTerm => {
  switch (term.kind) {
    case "return":
      return freezeDeep({
        tag: "return",
        grade: term.grade,
        value: projectValueTerm(term.value),
      });
    case "let":
      return freezeDeep({
        tag: "let",
        bound: projectComputationTerm(term.bound),
        body: projectComputationTerm(term.body),
      });
    case "force":
      return freezeDeep({ tag: "force", value: projectValueTerm(term.value) });
    case "lambda":
      return freezeDeep({
        tag: "lambda",
        parameter_type: projectValueType(term.parameterType),
        grade: term.grade,
        body: projectComputationTerm(term.body),
      });
    case "apply":
      return freezeDeep({
        tag: "apply",
        computation: projectComputationTerm(term.computation),
        argument: projectValueTerm(term.argument),
      });
    case "operation":
      return freezeDeep({
        tag: "operation",
        grade: term.grade,
        label: term.label,
        operation: term.operation,
        argument: projectValueTerm(term.argument),
      });
    case "handle":
      return freezeDeep({
        tag: "handle",
        label: term.label,
        computation: projectComputationTerm(term.computation),
        return_clause: { body: projectComputationTerm(term.returnClause.body) },
        operation_clauses: [...term.operationClauses]
          .sort((left, right) => compareCodePoints(left.operation, right.operation))
          .map((clause) =>
            freezeDeep({
              operation: clause.operation,
              body: projectComputationTerm(clause.body),
            }),
          ),
      });
    case "resume":
      return freezeDeep({
        tag: "resume",
        resumption_distance: term.resumption,
        value: projectValueTerm(term.value),
      });
  }
};

const operationPayload = (operationValue: Omit<NormalizedOperation, "operation_identity">) =>
  freezeDeep({
    argument_type: operationValue.argument_type,
    label: operationValue.label,
    operation: operationValue.operation,
    result_type: operationValue.result_type,
  });

const assumptionPayload = (assumption: ImportedAssumptionInput) =>
  freezeDeep({ kind: assumption.kind, statement: assumption.statement });

const sourceUnitPayload = (sourceUnitInput: SourceUnitInput) =>
  freezeDeep({
    byte_length: sourceUnitInput.byte_length,
    content_identity: sourceUnitInput.content_identity,
    uri: sourceUnitInput.uri,
  });

type SemanticPayload = Omit<
  NormalizedCoreArtifact,
  "semantic_identity" | "artifact_identity" | "source"
>;
type ArtifactPayload = Omit<NormalizedCoreArtifact, "artifact_identity">;

const semanticPayload = (artifact: NormalizedCoreArtifact): SemanticPayload =>
  freezeDeep({
    assumptions: artifact.assumptions,
    format: artifact.format,
    kernel: artifact.kernel,
    obligations: artifact.obligations,
    signature: artifact.signature,
    summary: artifact.summary,
    term: artifact.term,
    version: artifact.version,
  });

const artifactPayload = (artifact: NormalizedCoreArtifact): ArtifactPayload =>
  freezeDeep({
    assumptions: artifact.assumptions,
    format: artifact.format,
    kernel: artifact.kernel,
    obligations: artifact.obligations,
    semantic_identity: artifact.semantic_identity,
    signature: artifact.signature,
    source: artifact.source,
    summary: artifact.summary,
    term: artifact.term,
    version: artifact.version,
  });

const pointerTokens = (pointer: string, path: string): ReadonlyArray<string> => {
  if (
    !pointer.startsWith("/term") &&
    !pointer.startsWith("/signature") &&
    !pointer.startsWith("/summary") &&
    !pointer.startsWith("/assumptions")
  ) {
    return fail("source.pointer-root", path, "pointer must use an allowed semantic root");
  }
  const raw = pointer.slice(1).split("/");
  return raw.map((token) => {
    let output = "";
    for (let index = 0; index < token.length; index += 1) {
      const character = token[index]!;
      if (character !== "~") {
        output += character;
        continue;
      }
      const escape = token[index + 1];
      if (escape === "0") output += "~";
      else if (escape === "1") output += "/";
      else return fail("source.pointer-escape", path, "pointer contains an invalid escape");
      index += 1;
    }
    return output;
  });
};

const resolvePointer = (root: SemanticPayload, pointer: string, path: string): void => {
  const tokens = pointerTokens(pointer, path);
  let current: unknown = root;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        return fail("source.pointer-index", path, "array pointer token must be a canonical index");
      }
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index >= current.length) {
        return fail("source.pointer-range", path, "array pointer index is out of range");
      }
      current = current[index];
      continue;
    }
    if (typeof current !== "object" || current === null) {
      return fail("source.pointer-scalar", path, "pointer traverses through a scalar");
    }
    if (!Object.hasOwn(current, token)) {
      return fail("source.pointer-field", path, "pointer names an unknown schema field");
    }
    current = (current as Record<string, unknown>)[token];
  }
  if (
    typeof current !== "object" ||
    current === null ||
    Array.isArray(current) ||
    current === root
  ) {
    return fail("source.pointer-target", path, "pointer must resolve to a semantic node object");
  }
};

const correspondenceOrder = (left: SourceCorrespondence, right: SourceCorrespondence): number => {
  for (const [leftValue, rightValue] of [
    [left.node_path, right.node_path],
    [left.source_identity, right.source_identity],
    [left.role, right.role],
  ] as const) {
    const order = compareCodePoints(leftValue, rightValue);
    if (order !== 0) return order;
  }
  return left.start_byte - right.start_byte || left.end_byte - right.end_byte;
};

const sameCorrespondence = (left: SourceCorrespondence, right: SourceCorrespondence): boolean =>
  correspondenceOrder(left, right) === 0;

const emit = (
  program: CheckedProgram,
  metadataInput: unknown,
  boundsInput: NormalizedCoreBounds,
): Effect.Effect<EmissionResult, NormalizedCoreDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const boundsResult = resolveBounds(boundsInput);
    if (boundsResult.status === "rejected") return boundsResult;
    const bounds = boundsResult.value;
    const internals = requireCheckedProgram(program);
    if (internals === undefined) {
      return resultRejected(
        diagnostic(
          "custody.checked-program-required",
          "$.program",
          "emission requires a privately custodied 0018 checked program",
        ),
      );
    }
    const metadataResult = decodeEmissionMetadata(metadataInput, bounds);
    if (metadataResult.status === "rejected") return metadataResult;
    const metadata = metadataResult.value;
    if (internals.signature.operations.length > bounds.maximumOperations) {
      return resultRejected(
        diagnostic("decode.operations-exceeded", "$/signature", "maximum operations exceeded"),
      );
    }
    const checked = check(internals.signature, internals.term);
    if (checked.status !== "accepted") {
      return resultRejected(
        diagnostic(
          "custody.incoherent-program",
          "$.program",
          "custodied program no longer rechecks",
        ),
      );
    }
    const declarations = [...internals.signature.operations].sort(
      (left, right) =>
        compareCodePoints(left.label, right.label) ||
        compareCodePoints(left.operation, right.operation),
    );
    const signature = yield* Effect.forEach(declarations, (declaration) =>
      Effect.gen(function* () {
        const payload = operationPayload({
          label: declaration.label,
          operation: declaration.operation,
          argument_type: projectValueType(declaration.argumentType),
          result_type: projectValueType(declaration.resultType),
        });
        const operation_identity = yield* deriveIdentity(
          identityDomains.operation,
          asCanonical(payload),
        );
        return freezeDeep({ operation_identity, ...payload });
      }),
    );
    const operationIdentities = new Set<string>();
    for (const operationValue of signature) {
      if (operationIdentities.has(operationValue.operation_identity)) {
        return resultRejected(
          diagnostic(
            "projection.duplicate-operation-identity",
            "$/signature",
            "duplicate operation identity",
          ),
        );
      }
      operationIdentities.add(operationValue.operation_identity);
    }
    const assumptions = yield* Effect.forEach(metadata.assumptions, (input) =>
      Effect.gen(function* () {
        const payload = assumptionPayload(input);
        const assumption_identity = yield* deriveIdentity(
          identityDomains.assumption,
          asCanonical(payload),
        );
        return freezeDeep({ assumption_identity, ...payload });
      }),
    );
    assumptions.sort((left, right) =>
      compareCodePoints(left.assumption_identity, right.assumption_identity),
    );
    for (let index = 1; index < assumptions.length; index += 1) {
      if (assumptions[index]!.assumption_identity === assumptions[index - 1]!.assumption_identity) {
        return resultRejected(
          diagnostic("metadata.duplicate-assumption", "$/assumptions", "duplicate assumption"),
        );
      }
    }
    const sourcePairs = yield* Effect.forEach(metadata.source.units, (input) =>
      Effect.gen(function* () {
        const payload = sourceUnitPayload(input);
        const source_identity = yield* deriveIdentity(
          identityDomains.sourceUnit,
          asCanonical(payload),
        );
        return freezeDeep({
          source_key: input.source_key,
          unit: freezeDeep({ source_identity, ...payload }),
        });
      }),
    );
    const sourceIdentities = new Set<string>();
    for (const pairValue of sourcePairs) {
      if (sourceIdentities.has(pairValue.unit.source_identity)) {
        return resultRejected(
          diagnostic("metadata.duplicate-source-unit", "$/source/units", "duplicate source unit"),
        );
      }
      sourceIdentities.add(pairValue.unit.source_identity);
    }
    const sourceByKey = new Map(
      sourcePairs.map((pairValue) => [pairValue.source_key, pairValue.unit] as const),
    );
    const units = sourcePairs
      .map((pairValue) => pairValue.unit)
      .sort((left, right) => compareCodePoints(left.source_identity, right.source_identity));
    const partialAttempt = attemptDecode(() =>
      freezeDeep({
        assumptions,
        format: FORMAT,
        kernel: KERNEL,
        obligations: [] as const,
        signature,
        summary: {
          effects: [...checked.effects].sort(compareCodePoints),
          type: projectComputationType(checked.type),
          usage: [...checked.usage],
        },
        term: projectComputationTerm(internals.term),
        version: VERSION,
      }),
    );
    if (partialAttempt.status === "failure") return resultRejected(partialAttempt.diagnostic);
    const partial = partialAttempt.value;
    const semantic_identity = yield* deriveIdentity(identityDomains.semantic, asCanonical(partial));
    const correspondenceAttempt = attemptDecode(() =>
      metadata.source.correspondence.map((input, index): SourceCorrespondence => {
        const source = sourceByKey.get(input.source_key);
        const path = `$/source/correspondence/${index}`;
        if (source === undefined) {
          return fail("source.unknown-key", `${path}/source_key`, "unknown source key");
        }
        resolvePointer(partial, input.node_path, `${path}/node_path`);
        if (input.start_byte > input.end_byte || input.end_byte > source.byte_length) {
          return fail("source.range", path, "source range exceeds its source unit");
        }
        return freezeDeep({
          node_path: input.node_path,
          source_identity: source.source_identity,
          role: input.role,
          start_byte: input.start_byte,
          end_byte: input.end_byte,
        });
      }),
    );
    if (correspondenceAttempt.status === "failure") {
      return resultRejected(correspondenceAttempt.diagnostic);
    }
    const correspondence = correspondenceAttempt.value;
    correspondence.sort(correspondenceOrder);
    for (let index = 1; index < correspondence.length; index += 1) {
      if (sameCorrespondence(correspondence[index - 1]!, correspondence[index]!)) {
        return resultRejected(
          diagnostic(
            "source.duplicate-correspondence",
            "$/source/correspondence",
            "duplicate source correspondence",
          ),
        );
      }
    }
    const artifactWithoutIdentity = freezeDeep({
      ...partial,
      semantic_identity,
      source: { units, correspondence },
    });
    const artifact_identity = yield* deriveIdentity(
      identityDomains.artifact,
      asCanonical(artifactWithoutIdentity),
    );
    const artifact = freezeDeep({
      ...artifactWithoutIdentity,
      artifact_identity,
    }) as NormalizedCoreArtifact;
    const inspected = inspectUnknownJson(artifact, bounds);
    if (inspected.status === "rejected") return inspected;
    const bytes = canonicalBytes(asCanonical(artifact));
    if (bytes.byteLength > bounds.maximumBytes) {
      return resultRejected(
        diagnostic("encode.bytes-exceeded", "$", "maximum output byte length exceeded"),
      );
    }
    return freezeDeep({
      status: "emitted",
      artifact,
      bytes,
    });
  });

export const emitNormalizedCore = (
  program: CheckedProgram,
  metadata: unknown,
  bounds: NormalizedCoreBounds = defaultNormalizedCoreBounds,
): Effect.Effect<EmissionResult, NormalizedCoreDigestFailure, Crypto.Crypto> =>
  emit(program, metadata, bounds);

const parseOperation = (value: unknown, path: string): NormalizedOperation => {
  const fields = record(
    value,
    ["operation_identity", "label", "operation", "argument_type", "result_type"],
    path,
  );
  return freezeDeep({
    operation_identity: identity(fields["operation_identity"], `${path}/operation_identity`),
    label: nonemptyString(fields["label"], `${path}/label`),
    operation: nonemptyString(fields["operation"], `${path}/operation`),
    argument_type: parseValueType(fields["argument_type"], `${path}/argument_type`),
    result_type: parseValueType(fields["result_type"], `${path}/result_type`),
  });
};

const parseAssumption = (value: unknown, path: string): ImportedAssumption => {
  const fields = record(value, ["assumption_identity", "kind", "statement"], path);
  if (fields["kind"] !== "declared") {
    return fail("schema.assumption-kind", `${path}/kind`, "expected declared");
  }
  return freezeDeep({
    assumption_identity: identity(fields["assumption_identity"], `${path}/assumption_identity`),
    kind: "declared",
    statement: nonemptyString(fields["statement"], `${path}/statement`),
  });
};

const parseSourceUnit = (value: unknown, path: string): SourceUnit => {
  const fields = record(value, ["source_identity", "uri", "content_identity", "byte_length"], path);
  return freezeDeep({
    source_identity: identity(fields["source_identity"], `${path}/source_identity`),
    uri: nonemptyString(fields["uri"], `${path}/uri`),
    content_identity: identity(fields["content_identity"], `${path}/content_identity`),
    byte_length: safeInteger(fields["byte_length"], `${path}/byte_length`, true),
  });
};

const parseCorrespondence = (value: unknown, path: string): SourceCorrespondence => {
  const fields = record(
    value,
    ["node_path", "source_identity", "role", "start_byte", "end_byte"],
    path,
  );
  return freezeDeep({
    node_path: nonemptyString(fields["node_path"], `${path}/node_path`),
    source_identity: identity(fields["source_identity"], `${path}/source_identity`),
    role: role(fields["role"], `${path}/role`),
    start_byte: safeInteger(fields["start_byte"], `${path}/start_byte`, true),
    end_byte: safeInteger(fields["end_byte"], `${path}/end_byte`, true),
  });
};

const parseArtifact = (input: unknown, bounds: NormalizedCoreBounds): NormalizedCoreArtifact => {
  const root = record(
    input,
    [
      "format",
      "version",
      "kernel",
      "semantic_identity",
      "artifact_identity",
      "signature",
      "term",
      "summary",
      "assumptions",
      "obligations",
      "source",
    ],
    "$",
  );
  if (root["format"] !== FORMAT) return fail("schema.format", "$/format", "unknown format");
  if (root["version"] !== VERSION) return fail("schema.version", "$/version", "unknown version");
  if (root["kernel"] !== KERNEL)
    return fail("schema.kernel", "$/kernel", "unknown kernel contract");
  const signature = array(root["signature"], "$/signature");
  if (signature.length > bounds.maximumOperations) {
    return fail("decode.operations-exceeded", "$/signature", "maximum operations exceeded");
  }
  const decodedSignature = signature.map((entry, index) =>
    parseOperation(entry, `$/signature/${index}`),
  );
  const sortedSignature = [...decodedSignature].sort(
    (left, right) =>
      compareCodePoints(left.label, right.label) ||
      compareCodePoints(left.operation, right.operation),
  );
  if (
    sortedSignature.some(
      (entry, index) =>
        entry.label !== decodedSignature[index]!.label ||
        entry.operation !== decodedSignature[index]!.operation,
    )
  ) {
    return fail(
      "schema.noncanonical-signature",
      "$/signature",
      "signature is not canonically sorted",
    );
  }
  for (let index = 1; index < decodedSignature.length; index += 1) {
    const left = decodedSignature[index - 1]!;
    const right = decodedSignature[index]!;
    if (
      (left.label === right.label && left.operation === right.operation) ||
      left.operation_identity === right.operation_identity
    ) {
      return fail("schema.duplicate-operation", `$/signature/${index}`, "duplicate operation");
    }
  }
  const assumptions = array(root["assumptions"], "$/assumptions");
  if (assumptions.length > bounds.maximumAssumptions) {
    return fail("decode.assumptions-exceeded", "$/assumptions", "maximum assumptions exceeded");
  }
  const decodedAssumptions = assumptions.map((entry, index) =>
    parseAssumption(entry, `$/assumptions/${index}`),
  );
  const sortedAssumptions = [...decodedAssumptions].sort((left, right) =>
    compareCodePoints(left.assumption_identity, right.assumption_identity),
  );
  if (
    sortedAssumptions.some(
      (entry, index) =>
        entry.assumption_identity !== decodedAssumptions[index]!.assumption_identity,
    )
  ) {
    return fail("schema.noncanonical-assumptions", "$/assumptions", "assumptions are not sorted");
  }
  for (let index = 1; index < decodedAssumptions.length; index += 1) {
    if (
      decodedAssumptions[index - 1]!.assumption_identity ===
      decodedAssumptions[index]!.assumption_identity
    ) {
      return fail("schema.duplicate-assumption", `$/assumptions/${index}`, "duplicate assumption");
    }
  }
  const obligations = array(root["obligations"], "$/obligations");
  if (obligations.length !== 0) {
    return fail("schema.obligations", "$/obligations", "version 1 obligations must be empty");
  }
  const summaryFields = record(root["summary"], ["type", "effects", "usage"], "$/summary");
  const sourceFields = record(root["source"], ["units", "correspondence"], "$/source");
  const sourceUnits = array(sourceFields["units"], "$/source/units");
  if (sourceUnits.length > bounds.maximumSourceUnits) {
    return fail("decode.source-units-exceeded", "$/source/units", "maximum source units exceeded");
  }
  const units = sourceUnits.map((entry, index) =>
    parseSourceUnit(entry, `$/source/units/${index}`),
  );
  const sortedUnits = [...units].sort((left, right) =>
    compareCodePoints(left.source_identity, right.source_identity),
  );
  if (sortedUnits.some((entry, index) => entry.source_identity !== units[index]!.source_identity)) {
    return fail(
      "schema.noncanonical-source-units",
      "$/source/units",
      "source units are not sorted",
    );
  }
  const unitIdentities = new Set<string>();
  for (let index = 0; index < units.length; index += 1) {
    if (unitIdentities.has(units[index]!.source_identity)) {
      return fail(
        "schema.duplicate-source-unit",
        `$/source/units/${index}`,
        "duplicate source unit",
      );
    }
    unitIdentities.add(units[index]!.source_identity);
  }
  const sourceCorrespondence = array(sourceFields["correspondence"], "$/source/correspondence");
  if (sourceCorrespondence.length > bounds.maximumCorrespondences) {
    return fail(
      "decode.correspondences-exceeded",
      "$/source/correspondence",
      "maximum correspondences exceeded",
    );
  }
  const correspondence = sourceCorrespondence.map((entry, index) =>
    parseCorrespondence(entry, `$/source/correspondence/${index}`),
  );
  const sortedCorrespondence = [...correspondence].sort(correspondenceOrder);
  if (
    sortedCorrespondence.some(
      (entry, index) => correspondenceOrder(entry, correspondence[index]!) !== 0,
    )
  ) {
    return fail(
      "schema.noncanonical-correspondence",
      "$/source/correspondence",
      "correspondence is not sorted",
    );
  }
  for (let index = 1; index < correspondence.length; index += 1) {
    if (sameCorrespondence(correspondence[index - 1]!, correspondence[index]!)) {
      return fail(
        "schema.duplicate-correspondence",
        `$/source/correspondence/${index}`,
        "duplicate correspondence",
      );
    }
  }
  const artifact = freezeDeep({
    format: FORMAT,
    version: VERSION,
    kernel: KERNEL,
    semantic_identity: identity(root["semantic_identity"], "$/semantic_identity"),
    artifact_identity: identity(root["artifact_identity"], "$/artifact_identity"),
    signature: decodedSignature,
    term: parseComputationTerm(root["term"], "$/term"),
    summary: {
      type: parseComputationType(summaryFields["type"], "$/summary/type"),
      effects: row(summaryFields["effects"], "$/summary/effects"),
      usage: grades(summaryFields["usage"], "$/summary/usage"),
    },
    assumptions: decodedAssumptions,
    obligations: [] as const,
    source: { units, correspondence },
  }) as NormalizedCoreArtifact;
  const semantic = semanticPayload(artifact);
  const unitsByIdentity = new Map(units.map((unitValue) => [unitValue.source_identity, unitValue]));
  for (let index = 0; index < correspondence.length; index += 1) {
    const item = correspondence[index]!;
    const path = `$/source/correspondence/${index}`;
    const source = unitsByIdentity.get(item.source_identity);
    if (source === undefined) {
      return fail("source.unknown-identity", `${path}/source_identity`, "unknown source identity");
    }
    resolvePointer(semantic, item.node_path, `${path}/node_path`);
    if (item.start_byte > item.end_byte || item.end_byte > source.byte_length) {
      return fail("source.range", path, "source range exceeds its source unit");
    }
  }
  return artifact;
};

const verifyIdentities = (
  artifact: NormalizedCoreArtifact,
): Effect.Effect<
  DecodeResult<NormalizedCoreArtifact>,
  NormalizedCoreDigestFailure,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    for (let index = 0; index < artifact.signature.length; index += 1) {
      const entry = artifact.signature[index]!;
      const expected = yield* deriveIdentity(
        identityDomains.operation,
        asCanonical(
          operationPayload({
            label: entry.label,
            operation: entry.operation,
            argument_type: entry.argument_type,
            result_type: entry.result_type,
          }),
        ),
      );
      if (entry.operation_identity !== expected) {
        return rejected(
          diagnostic(
            "identity.operation",
            `$/signature/${index}/operation_identity`,
            "operation identity mismatch",
          ),
        );
      }
    }
    for (let index = 0; index < artifact.assumptions.length; index += 1) {
      const entry = artifact.assumptions[index]!;
      const expected = yield* deriveIdentity(
        identityDomains.assumption,
        asCanonical({ kind: entry.kind, statement: entry.statement }),
      );
      if (entry.assumption_identity !== expected) {
        return rejected(
          diagnostic(
            "identity.assumption",
            `$/assumptions/${index}/assumption_identity`,
            "assumption identity mismatch",
          ),
        );
      }
    }
    for (let index = 0; index < artifact.source.units.length; index += 1) {
      const entry = artifact.source.units[index]!;
      const expected = yield* deriveIdentity(
        identityDomains.sourceUnit,
        asCanonical({
          byte_length: entry.byte_length,
          content_identity: entry.content_identity,
          uri: entry.uri,
        }),
      );
      if (entry.source_identity !== expected) {
        return rejected(
          diagnostic(
            "identity.source-unit",
            `$/source/units/${index}/source_identity`,
            "source-unit identity mismatch",
          ),
        );
      }
    }
    const expectedSemantic = yield* deriveIdentity(
      identityDomains.semantic,
      asCanonical(semanticPayload(artifact)),
    );
    if (artifact.semantic_identity !== expectedSemantic) {
      return rejected(
        diagnostic("identity.semantic", "$/semantic_identity", "semantic identity mismatch"),
      );
    }
    const expectedArtifact = yield* deriveIdentity(
      identityDomains.artifact,
      asCanonical(artifactPayload(artifact)),
    );
    if (artifact.artifact_identity !== expectedArtifact) {
      return rejected(
        diagnostic("identity.artifact", "$/artifact_identity", "artifact identity mismatch"),
      );
    }
    return freezeDeep({ status: "decoded", value: artifact });
  });

const decodeInspectedArtifact = (
  input: unknown,
  bounds: NormalizedCoreBounds,
): Effect.Effect<
  DecodeResult<NormalizedCoreArtifact>,
  NormalizedCoreDigestFailure,
  Crypto.Crypto
> => {
  const parsed = attemptDecode(() => parseArtifact(input, bounds));
  return parsed.status === "failure"
    ? Effect.succeed(rejected(parsed.diagnostic))
    : verifyIdentities(parsed.value);
};

export const decodeNormalizedCore = (
  input: unknown,
  bounds: NormalizedCoreBounds = defaultNormalizedCoreBounds,
): Effect.Effect<
  DecodeResult<NormalizedCoreArtifact>,
  NormalizedCoreDigestFailure,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    const boundsResult = resolveBounds(bounds);
    if (boundsResult.status === "rejected") return boundsResult;
    const inspected = inspectUnknownJson(input, boundsResult.value);
    if (inspected.status === "rejected") return inspected;
    const encoded = attemptCanonicalBytes(inspected.value.value);
    if (encoded.status === "failure") return rejected(encoded.diagnostic);
    const bytes = encoded.value;
    if (bytes.byteLength > boundsResult.value.maximumBytes) {
      return rejected(
        diagnostic("encode.bytes-exceeded", "$", "maximum output byte length exceeded"),
      );
    }
    return yield* decodeInspectedArtifact(inspected.value.value, boundsResult.value);
  });

export const decodeNormalizedCoreBytes = (
  input: Uint8Array,
  bounds: NormalizedCoreBounds = defaultNormalizedCoreBounds,
): Effect.Effect<
  DecodeResult<NormalizedCoreArtifact>,
  NormalizedCoreDigestFailure,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    const boundsResult = resolveBounds(bounds);
    if (boundsResult.status === "rejected") return boundsResult;
    if (!(input instanceof Uint8Array)) {
      return rejected(diagnostic("byte.expected-array", "$", "expected a byte array"));
    }
    if (input.byteLength > boundsResult.value.maximumBytes) {
      return rejected(diagnostic("byte.bytes-exceeded", "$", "maximum input byte length exceeded"));
    }
    const decodedText = decodeUtf8(input);
    if (decodedText.status === "failure") return rejected(decodedText.diagnostic);
    const text = decodedText.value;
    if (!text.endsWith("\n")) {
      return rejected(
        diagnostic("byte.canonical", "$", "canonical artifact must end with one line feed"),
      );
    }
    const jsonText = text.slice(0, -1);
    const scanIssue = scanJson(jsonText);
    if (scanIssue !== undefined) {
      return rejected(diagnostic(scanIssue.code, "$", scanIssue.message));
    }
    const parsed = parseJson(jsonText);
    if (parsed.status === "failure") return rejected(parsed.diagnostic);
    const inspected = inspectUnknownJson(parsed.value, boundsResult.value);
    if (inspected.status === "rejected") return inspected;
    const canonical = attemptCanonicalBytes(inspected.value.value);
    if (canonical.status === "failure") return rejected(canonical.diagnostic);
    const encoded = canonical.value;
    if (encoded.length !== input.length || encoded.some((value, index) => value !== input[index])) {
      return rejected(diagnostic("byte.canonical", "$", "input is not canonical JSON bytes"));
    }
    return yield* decodeInspectedArtifact(inspected.value.value, boundsResult.value);
  });

const restoreValueType = (type: NormalizedValueType): ValueType => {
  switch (type.tag) {
    case "unit":
      return unitType();
    case "bool":
      return boolType();
    case "int":
      return intType();
    case "pair":
      return pairType(restoreValueType(type.first), restoreValueType(type.second));
    case "thunk":
      return thunkType(type.effects, restoreComputationType(type.computation));
  }
};

const restoreComputationType = (type: NormalizedComputationType): ComputationType => {
  switch (type.tag) {
    case "return":
      return returnType(type.grade, restoreValueType(type.value));
    case "function":
      return functionType(
        restoreValueType(type.parameter),
        type.grade,
        type.effects,
        restoreComputationType(type.result),
      );
  }
};

const restoreValueTerm = (term: NormalizedValueTerm): ValueTerm => {
  switch (term.tag) {
    case "bound-value":
      return variable(term.distance);
    case "unit":
      return unit();
    case "bool":
      return bool(term.value);
    case "int":
      return int(term.value);
    case "pair":
      return pair(restoreValueTerm(term.first), restoreValueTerm(term.second));
    case "thunk":
      return thunk(restoreComputationTerm(term.body));
  }
};

const restoreComputationTerm = (term: NormalizedComputationTerm): ComputationTerm => {
  switch (term.tag) {
    case "return":
      return returnTerm(term.grade, restoreValueTerm(term.value));
    case "let":
      return letTerm(restoreComputationTerm(term.bound), restoreComputationTerm(term.body));
    case "force":
      return force(restoreValueTerm(term.value));
    case "lambda":
      return lambda(
        restoreValueType(term.parameter_type),
        term.grade,
        restoreComputationTerm(term.body),
      );
    case "apply":
      return apply(restoreComputationTerm(term.computation), restoreValueTerm(term.argument));
    case "operation":
      return operation(term.grade, term.label, term.operation, restoreValueTerm(term.argument));
    case "handle":
      return handle(
        term.label,
        restoreComputationTerm(term.computation),
        returnClause(restoreComputationTerm(term.return_clause.body)),
        term.operation_clauses.map((clause) =>
          operationClause(clause.operation, restoreComputationTerm(clause.body)),
        ),
      );
    case "resume":
      return resumeTerm(term.resumption_distance, restoreValueTerm(term.value));
  }
};

const validateArtifact = (
  artifact: NormalizedCoreArtifact,
  bytes: Uint8Array,
): ValidationResult => {
  const declarations: ReadonlyArray<OperationDeclaration> = artifact.signature.map((entry) => ({
    label: entry.label,
    operation: entry.operation,
    argumentType: restoreValueType(entry.argument_type),
    resultType: restoreValueType(entry.result_type),
  }));
  const checked = check(operationSignature(declarations), restoreComputationTerm(artifact.term));
  if (checked.status !== "accepted") {
    return resultRejected(
      diagnostic(
        "validation.kernel-rejected",
        "$/term",
        checked.diagnostics[0]?.message ?? "0018 checker rejected normalized program",
      ),
    );
  }
  const actualType = restoreComputationType(artifact.summary.type);
  if (!valueTypesEqualOrComputation(checked.type, actualType)) {
    return resultRejected(
      diagnostic("validation.summary-type", "$/summary/type", "summary type does not match 0018"),
    );
  }
  if (!effectRowsEqual(checked.effects, artifact.summary.effects)) {
    return resultRejected(
      diagnostic(
        "validation.summary-effects",
        "$/summary/effects",
        "summary effects do not match 0018",
      ),
    );
  }
  if (
    checked.usage.length !== artifact.summary.usage.length ||
    checked.usage.some((entry, index) => entry !== artifact.summary.usage[index])
  ) {
    return resultRejected(
      diagnostic(
        "validation.summary-usage",
        "$/summary/usage",
        "summary usage does not match 0018",
      ),
    );
  }
  return freezeDeep({
    status: "accepted",
    artifact,
    bytes,
    checkSummary: artifact.summary,
  });
};

const valueTypesEqualOrComputation = (left: ComputationType, right: ComputationType): boolean => {
  if (left.kind !== right.kind) return false;
  if (left.kind === "return" && right.kind === "return") {
    return left.grade === right.grade && valueTypesEqual(left.value, right.value);
  }
  if (left.kind === "function" && right.kind === "function") {
    return (
      valueTypesEqual(left.parameter, right.parameter) &&
      left.grade === right.grade &&
      effectRowsEqual(left.effects, right.effects) &&
      valueTypesEqualOrComputation(left.result, right.result)
    );
  }
  return false;
};

export const validateNormalizedCore = (
  input: unknown,
  bounds: NormalizedCoreBounds = defaultNormalizedCoreBounds,
): Effect.Effect<ValidationResult, NormalizedCoreDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const decoded = yield* decodeNormalizedCore(input, bounds);
    if (decoded.status === "rejected") return decoded;
    return validateArtifact(decoded.value, canonicalBytes(asCanonical(decoded.value)));
  });

export const validateNormalizedCoreBytes = (
  input: Uint8Array,
  bounds: NormalizedCoreBounds = defaultNormalizedCoreBounds,
): Effect.Effect<ValidationResult, NormalizedCoreDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const decoded = yield* decodeNormalizedCoreBytes(input, bounds);
    if (decoded.status === "rejected") return decoded;
    return validateArtifact(decoded.value, input.slice());
  });

export const encodeNormalizedCore = (artifact: NormalizedCoreArtifact): Uint8Array =>
  canonicalBytes(asCanonical(artifact));

export const canonicalNormalizedCoreJson = (artifact: NormalizedCoreArtifact): string =>
  canonicalJson(asCanonical(artifact));
