import {
  check,
  decodeComputationTerm,
  decodeOperationSignature,
  type ComputationTerm,
  type EffectRow,
  type KernelType,
  type OperationSignature,
  type RecordedJudgment,
  type StructuredFact,
} from "../kernel-calculus/index.ts";
import { compareCodePoints } from "../normalized-core/canonical.ts";
import { typeStructuralKey } from "./types.ts";
import type {
  CheckDiagnostic,
  ComputationJudgment,
  DiagnosticFact,
  Judgment,
  KernelCheckObservation,
  KernelComputationTerm,
  KernelComputationType,
  KernelDocument,
  KernelSignatureOperation,
  KernelTypeNode,
  KernelValueTerm,
  KernelValueType,
  TypeIndex,
  ValueJudgment,
} from "./types.ts";

const freeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

export interface KernelJsonProjectionDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface KernelProjection {
  readonly signature: OperationSignature;
  readonly term: ComputationTerm;
}

export type ProjectionResult =
  | { readonly status: "projected"; readonly value: KernelProjection }
  | {
      readonly status: "rejected";
      readonly diagnostics: ReadonlyArray<KernelJsonProjectionDiagnostic>;
    };

// ---------------------------------------------------------------------------
// Reshape the kernel-json field vocabulary into 0018's own JSON vocabulary,
// then decode through the existing 0018 public decoders. This is a linear
// representation translation, not a second decoder: the existing 0018 decode
// bounds and shape rules remain the sole authority over the result.
// ---------------------------------------------------------------------------

const reshapeValueType = (type: KernelValueType): unknown => {
  switch (type.tag) {
    case "unit":
    case "bool":
    case "int":
      return { kind: type.tag };
    case "pair":
      return {
        kind: "pair",
        first: reshapeValueType(type.first),
        second: reshapeValueType(type.second),
      };
    case "thunk":
      return {
        kind: "thunk",
        effects: type.effects,
        computation: reshapeComputationType(type.computation),
      };
  }
};

const reshapeComputationType = (type: KernelComputationType): unknown => {
  switch (type.tag) {
    case "return":
      return { kind: "return", grade: type.grade, value: reshapeValueType(type.value) };
    case "function":
      return {
        kind: "function",
        parameter: reshapeValueType(type.parameter),
        grade: type.grade,
        effects: type.effects,
        result: reshapeComputationType(type.result),
      };
  }
};

const reshapeValueTerm = (term: KernelValueTerm): unknown => {
  switch (term.tag) {
    case "bound-value":
      return { kind: "variable", index: term.distance };
    case "resumption":
      return { kind: "resumption", index: term.distance };
    case "unit":
      return { kind: "unit" };
    case "bool":
      return { kind: "bool", value: term.value };
    case "int":
      return { kind: "int", value: term.value };
    case "pair":
      return {
        kind: "pair",
        first: reshapeValueTerm(term.first),
        second: reshapeValueTerm(term.second),
      };
    case "thunk":
      return { kind: "thunk", body: reshapeComputationTerm(term.body) };
  }
};

const reshapeComputationTerm = (term: KernelComputationTerm): unknown => {
  switch (term.tag) {
    case "return":
      return { kind: "return", grade: term.grade, value: reshapeValueTerm(term.value) };
    case "let":
      return {
        kind: "let",
        bound: reshapeComputationTerm(term.bound),
        body: reshapeComputationTerm(term.body),
      };
    case "force":
      return { kind: "force", value: reshapeValueTerm(term.value) };
    case "lambda":
      return {
        kind: "lambda",
        parameterType: reshapeValueType(term.parameter_type),
        grade: term.grade,
        body: reshapeComputationTerm(term.body),
      };
    case "apply":
      return {
        kind: "apply",
        computation: reshapeComputationTerm(term.computation),
        argument: reshapeValueTerm(term.argument),
      };
    case "operation":
      return {
        kind: "operation",
        grade: term.grade,
        label: term.label,
        operation: term.operation,
        argument: reshapeValueTerm(term.argument),
      };
    case "handle":
      return {
        kind: "handle",
        label: term.label,
        computation: reshapeComputationTerm(term.computation),
        returnClause: { body: reshapeComputationTerm(term.return_clause.body) },
        operationClauses: term.operation_clauses.map((clause) => ({
          operation: clause.operation,
          body: reshapeComputationTerm(clause.body),
        })),
      };
    case "resume":
      return {
        kind: "resume",
        resumption: term.resumption_distance,
        value: reshapeValueTerm(term.value),
      };
  }
};

const reshapeSignature = (signature: ReadonlyArray<KernelSignatureOperation>): unknown => ({
  operations: signature.map((declaration) => ({
    label: declaration.label,
    operation: declaration.operation,
    argumentType: reshapeValueType(declaration.argument_type),
    resultType: reshapeValueType(declaration.result_type),
  })),
});

/**
 * Returns inert 0018 signature and term data through the existing 0018
 * public decoders. Cannot return a `CheckedProgram`: `decodeOperationSignature`
 * and `decodeComputationTerm` never mint one. The existing 0018 decode
 * bounds apply unchanged, so a document within kernel-json's own raw bounds
 * can still be rejected here by the 0018 authority.
 */
export const projectKernelProgram = (document: KernelDocument): ProjectionResult => {
  const signatureResult = decodeOperationSignature(reshapeSignature(document.signature));
  if (signatureResult.status === "rejected") {
    return {
      status: "rejected",
      diagnostics: signatureResult.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        path: diagnostic.path,
        message: diagnostic.message,
      })),
    };
  }
  const termResult = decodeComputationTerm(reshapeComputationTerm(document.program));
  if (termResult.status === "rejected") {
    return {
      status: "rejected",
      diagnostics: termResult.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        path: diagnostic.path,
        message: diagnostic.message,
      })),
    };
  }
  return {
    status: "projected",
    value: { signature: signatureResult.value, term: termResult.value },
  };
};

// ---------------------------------------------------------------------------
// Occurrence-path translation: 0018 checker paths ("$.operationClauses[0]")
// to document occurrence pointers ("/program/operation_clauses/0").
// ---------------------------------------------------------------------------

const CHECKER_PATH_FIELD_MAP: Readonly<Record<string, string>> = {
  operationClauses: "operation_clauses",
  parameterType: "parameter_type",
  returnClause: "return_clause",
};

const PATH_SEGMENT_PATTERN = /^([a-zA-Z]+)(\[(\d+)\])?$/;

const translateOccurrencePath = (checkerPath: string): string => {
  if (checkerPath === "$") return "/program";
  if (!checkerPath.startsWith("$.")) {
    throw new Error(`kernel-json: unrecognized 0018 checker path "${checkerPath}"`);
  }
  const tokens: Array<string> = [];
  for (const raw of checkerPath.slice(2).split(".")) {
    const match = PATH_SEGMENT_PATTERN.exec(raw);
    if (match === null) {
      throw new Error(`kernel-json: unrecognized 0018 checker path segment "${raw}"`);
    }
    const name = match[1]!;
    tokens.push(CHECKER_PATH_FIELD_MAP[name] ?? name);
    if (match[3] !== undefined) tokens.push(match[3]);
  }
  return `/program/${tokens.join("/")}`;
};

// ---------------------------------------------------------------------------
// Shared label/type table interner: builds the observation's `labels` and
// `types` tables by structural equality, in first-encounter postorder, as
// the caller performs its own frozen canonical traversal (root inferred
// type, then each judgment in table order — context entries before the
// judged type — or each diagnostic's expected before actual).
// ---------------------------------------------------------------------------

class Interner {
  readonly labels: ReadonlyArray<string>;
  readonly #labelIndex: ReadonlyMap<string, number>;
  readonly #types: Array<KernelTypeNode> = [];
  readonly #keys: Array<string> = [];
  readonly #typeKeyIndex = new Map<string, number>();
  readonly #typeRefIndex = new Map<KernelType, number>();

  constructor(labels: ReadonlyArray<string>) {
    this.labels = labels;
    this.#labelIndex = new Map(labels.map((label, index) => [label, index]));
  }

  get typeTable(): ReadonlyArray<KernelTypeNode> {
    return this.#types;
  }

  label(name: string): number {
    const index = this.#labelIndex.get(name);
    if (index === undefined) {
      throw new Error(`kernel-json: label "${name}" was not pre-collected into the label table`);
    }
    return index;
  }

  row(row: EffectRow): ReadonlyArray<number> {
    return row.map((label) => this.label(label));
  }

  type(type: KernelType): TypeIndex {
    const cached = this.#typeRefIndex.get(type);
    if (cached !== undefined) return cached;
    let node: KernelTypeNode;
    switch (type.kind) {
      case "unit":
      case "bool":
      case "int":
        node = { tag: type.kind };
        break;
      case "pair":
        node = { tag: "pair", first: this.type(type.first), second: this.type(type.second) };
        break;
      case "thunk":
        node = {
          tag: "thunk",
          effects: this.row(type.effects),
          computation: this.type(type.computation),
        };
        break;
      case "return":
        node = { tag: "return", grade: type.grade, value: this.type(type.value) };
        break;
      case "function":
        node = {
          tag: "function",
          parameter: this.type(type.parameter),
          grade: type.grade,
          effects: this.row(type.effects),
          result: this.type(type.result),
        };
        break;
    }
    // Every child index above is already resolved (pushed) before `node` is
    // built, since building `node` recursively interns children first; `key`
    // can therefore always resolve `keys[childIndex]` for this node's own
    // children.
    const key = typeStructuralKey(node, this.#keys);
    const existing = this.#typeKeyIndex.get(key);
    if (existing !== undefined) {
      this.#typeRefIndex.set(type, existing);
      return existing;
    }
    const index = this.#types.length;
    this.#types.push(node);
    this.#keys.push(key);
    this.#typeKeyIndex.set(key, index);
    this.#typeRefIndex.set(type, index);
    return index;
  }
}

const collectTypeLabels = (type: KernelType, labels: Set<string>): void => {
  switch (type.kind) {
    case "unit":
    case "bool":
    case "int":
      return;
    case "pair":
      collectTypeLabels(type.first, labels);
      collectTypeLabels(type.second, labels);
      return;
    case "thunk":
      for (const label of type.effects) labels.add(label);
      collectTypeLabels(type.computation, labels);
      return;
    case "return":
      collectTypeLabels(type.value, labels);
      return;
    case "function":
      collectTypeLabels(type.parameter, labels);
      for (const label of type.effects) labels.add(label);
      collectTypeLabels(type.result, labels);
      return;
  }
};

const collectFactLabels = (fact: StructuredFact, labels: Set<string>): void => {
  switch (fact.kind) {
    case "type":
      collectTypeLabels(fact.type, labels);
      return;
    case "row":
      for (const label of fact.labels) labels.add(label);
      return;
    case "list":
      for (const item of fact.items) collectFactLabels(item, labels);
      return;
    case "record":
      for (const value of Object.values(fact.fields)) collectFactLabels(value, labels);
      return;
    default:
      return;
  }
};

const translateFact = (fact: StructuredFact, interner: Interner): DiagnosticFact => {
  switch (fact.kind) {
    case "type":
      return { type_index: interner.type(fact.type) };
    case "row":
      return { label_indexes: interner.row(fact.labels) };
    case "name":
      return fact.value;
    case "grade":
      return fact.value;
    case "count":
      return fact.value;
    case "integer":
      return fact.value;
    case "malformed-number":
      return fact.rendered;
    case "shape":
      return fact.value;
    case "list":
      return fact.items.map((item) => translateFact(item, interner));
    case "record": {
      // Open-record fields intern and materialize in compareCodePoints key
      // order, matching the canonical encoding's key order, so the table's
      // first-encounter order is the one the canonical bytes replay.
      const output = Object.create(null) as Record<string, DiagnosticFact>;
      for (const key of Object.keys(fact.fields).sort(compareCodePoints))
        output[key] = translateFact(fact.fields[key]!, interner);
      return output;
    }
  }
};

const translateJudgment = (judgment: RecordedJudgment, interner: Interner): Judgment => {
  const valueContext = judgment.valueContext.map((entry) => ({
    binder_origin: translateOccurrencePath(entry.binderOrigin),
    origin_kind: entry.originKind,
    value_type: interner.type(entry.type),
    usage_limit: entry.usageLimit,
  }));
  const resumptionContext = judgment.resumptionContext.map((entry) => ({
    binder_origin: translateOccurrencePath(entry.binderOrigin),
    origin_kind: "operation-clause-resumption" as const,
    label: entry.label,
    operation: entry.operation,
    result_type: interner.type(entry.resultType),
    continuation_type: interner.type(entry.continuationType),
    continuation_effects: interner.row(entry.continuationEffects),
    usage_limit: "1" as const,
  }));
  if (judgment.tag === "value-judgment") {
    const result: ValueJudgment = {
      tag: "value-judgment",
      occurrence_path: translateOccurrencePath(judgment.path),
      rule: judgment.rule,
      value_context: valueContext,
      resumption_context: resumptionContext,
      value_type: interner.type(judgment.valueType),
      usage: judgment.usage,
      resumption_usage: judgment.resumptionUsage,
      premises: judgment.premises,
    };
    return result;
  }
  const result: ComputationJudgment = {
    tag: "computation-judgment",
    occurrence_path: translateOccurrencePath(judgment.path),
    rule: judgment.rule,
    value_context: valueContext,
    resumption_context: resumptionContext,
    computation_type: interner.type(judgment.computationType),
    effects: interner.row(judgment.effects),
    usage: judgment.usage,
    resumption_usage: judgment.resumptionUsage,
    premises: judgment.premises,
    ...(judgment.signatureOrigins === undefined
      ? {}
      : { signature_origins: judgment.signatureOrigins.map((index) => `/signature/${index}`) }),
  };
  return result;
};

const translateDiagnostic = (
  diagnostic: {
    readonly code: string;
    readonly rule: string;
    readonly path: string;
    readonly message: string;
    readonly structuredExpected?: StructuredFact;
    readonly structuredActual?: StructuredFact;
  },
  interner: Interner,
): CheckDiagnostic => ({
  code: diagnostic.code,
  rule: diagnostic.rule,
  occurrence_path: translateOccurrencePath(diagnostic.path),
  message: diagnostic.message,
  ...(diagnostic.structuredExpected === undefined
    ? {}
    : { expected: translateFact(diagnostic.structuredExpected, interner) }),
  ...(diagnostic.structuredActual === undefined
    ? {}
    : { actual: translateFact(diagnostic.structuredActual, interner) }),
});

const emptyObservation = (diagnostic: CheckDiagnostic): KernelCheckObservation =>
  freeze({
    format: "semantic.kernel-check",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    observation: { tag: "rejected", labels: [], types: [], diagnostics: [diagnostic] },
  });

/**
 * Composes projection with the existing 0018 `check`, translating the
 * judgment table recorded by the checker's judgment-recording seam into the
 * frozen agent-facing observation. Never re-derives a context, type, usage,
 * premise, or origin fact: every judgment field is a direct translation of
 * what the authoritative checker already recorded.
 */
export const checkKernelDocument = (document: KernelDocument): KernelCheckObservation => {
  const projected = projectKernelProgram(document);
  if (projected.status === "rejected") {
    const first = projected.diagnostics[0];
    return emptyObservation({
      code: "checker.invalid-input",
      rule: "checker.boundary",
      occurrence_path: "/program",
      message: first?.message ?? "kernel document could not be projected to the 0018 checker",
    });
  }

  const result = check(projected.value.signature, projected.value.term);

  if (result.status === "rejected") {
    const diagnostic = result.diagnostics[0]!;
    const labels = new Set<string>();
    if (diagnostic.structuredExpected !== undefined)
      collectFactLabels(diagnostic.structuredExpected, labels);
    if (diagnostic.structuredActual !== undefined)
      collectFactLabels(diagnostic.structuredActual, labels);
    const sortedLabels = [...labels].sort(compareCodePoints);
    const interner = new Interner(sortedLabels);
    const translated = translateDiagnostic(diagnostic, interner);
    return freeze({
      format: "semantic.kernel-check",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      observation: {
        tag: "rejected",
        labels: sortedLabels,
        types: interner.typeTable,
        diagnostics: [translated],
      },
    });
  }

  const judgments = result.judgments;
  const labels = new Set<string>();
  for (const judgment of judgments) {
    for (const entry of judgment.valueContext) collectTypeLabels(entry.type, labels);
    for (const entry of judgment.resumptionContext) {
      collectTypeLabels(entry.resultType, labels);
      collectTypeLabels(entry.continuationType, labels);
      for (const label of entry.continuationEffects) labels.add(label);
    }
    if (judgment.tag === "value-judgment") {
      collectTypeLabels(judgment.valueType, labels);
    } else {
      collectTypeLabels(judgment.computationType, labels);
      for (const label of judgment.effects) labels.add(label);
    }
  }
  const sortedLabels = [...labels].sort(compareCodePoints);
  const interner = new Interner(sortedLabels);
  const translatedJudgments = judgments.map((judgment) => translateJudgment(judgment, interner));
  const root = translatedJudgments[0]!;
  if (root.tag !== "computation-judgment") {
    throw new Error("kernel-json: judgment 0 must be the root program computation judgment");
  }

  return freeze({
    format: "semantic.kernel-check",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    observation: {
      tag: "accepted",
      labels: sortedLabels,
      types: interner.typeTable,
      inferred: { type: root.computation_type, effects: root.effects, usage: root.usage },
      judgments: translatedJudgments,
    },
  });
};
