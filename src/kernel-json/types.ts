import type { Grade } from "../kernel-calculus/grade.ts";

/** Raw `semantic.kernel-json` grammar. Reuses the 0019 field vocabulary. */
export type KernelValueType =
  | { readonly tag: "unit" | "bool" | "int" }
  | { readonly tag: "pair"; readonly first: KernelValueType; readonly second: KernelValueType }
  | {
      readonly tag: "thunk";
      readonly effects: ReadonlyArray<string>;
      readonly computation: KernelComputationType;
    };

export type KernelComputationType =
  | { readonly tag: "return"; readonly grade: Grade; readonly value: KernelValueType }
  | {
      readonly tag: "function";
      readonly parameter: KernelValueType;
      readonly grade: Grade;
      readonly effects: ReadonlyArray<string>;
      readonly result: KernelComputationType;
    };

export type KernelValueTerm =
  | { readonly tag: "bound-value"; readonly distance: number }
  | { readonly tag: "resumption"; readonly distance: number }
  | { readonly tag: "unit" }
  | { readonly tag: "bool"; readonly value: boolean }
  | { readonly tag: "int"; readonly value: number }
  | { readonly tag: "pair"; readonly first: KernelValueTerm; readonly second: KernelValueTerm }
  | { readonly tag: "thunk"; readonly body: KernelComputationTerm };

export type KernelComputationTerm =
  | { readonly tag: "return"; readonly grade: Grade; readonly value: KernelValueTerm }
  | {
      readonly tag: "let";
      readonly bound: KernelComputationTerm;
      readonly body: KernelComputationTerm;
    }
  | { readonly tag: "force"; readonly value: KernelValueTerm }
  | {
      readonly tag: "lambda";
      readonly parameter_type: KernelValueType;
      readonly grade: Grade;
      readonly body: KernelComputationTerm;
    }
  | {
      readonly tag: "apply";
      readonly computation: KernelComputationTerm;
      readonly argument: KernelValueTerm;
    }
  | {
      readonly tag: "operation";
      readonly grade: Grade;
      readonly label: string;
      readonly operation: string;
      readonly argument: KernelValueTerm;
    }
  | {
      readonly tag: "handle";
      readonly label: string;
      readonly computation: KernelComputationTerm;
      readonly return_clause: KernelReturnClause;
      readonly operation_clauses: ReadonlyArray<KernelOperationClause>;
    }
  | {
      readonly tag: "resume";
      readonly resumption_distance: number;
      readonly value: KernelValueTerm;
    };

export interface KernelReturnClause {
  readonly body: KernelComputationTerm;
}

export interface KernelOperationClause {
  readonly operation: string;
  readonly body: KernelComputationTerm;
}

export interface KernelSignatureOperation {
  readonly label: string;
  readonly operation: string;
  readonly argument_type: KernelValueType;
  readonly result_type: KernelValueType;
}

export interface KernelDocument {
  readonly format: "semantic.kernel-json";
  readonly version: 1;
  readonly kernel: "semantic.kernel-calculus/0018/v1";
  readonly signature: ReadonlyArray<KernelSignatureOperation>;
  readonly program: KernelComputationTerm;
}

/** Shared observation tables. */
export type LabelIndex = number;
export type TypeIndex = number;

export type KernelTypeNode =
  | { readonly tag: "unit" | "bool" | "int" }
  | { readonly tag: "pair"; readonly first: TypeIndex; readonly second: TypeIndex }
  | {
      readonly tag: "thunk";
      readonly effects: ReadonlyArray<LabelIndex>;
      readonly computation: TypeIndex;
    }
  | { readonly tag: "return"; readonly grade: Grade; readonly value: TypeIndex }
  | {
      readonly tag: "function";
      readonly parameter: TypeIndex;
      readonly grade: Grade;
      readonly effects: ReadonlyArray<LabelIndex>;
      readonly result: TypeIndex;
    };

export type OccurrencePath = string;

export type BinderOriginKind =
  | "lambda-parameter"
  | "let-result"
  | "return-clause-result"
  | "operation-clause-argument";

export interface ValueBinderEntry {
  readonly binder_origin: OccurrencePath;
  readonly origin_kind: BinderOriginKind;
  readonly value_type: TypeIndex;
  readonly usage_limit: Grade;
}

export interface ResumptionBinderEntry {
  readonly binder_origin: OccurrencePath;
  readonly origin_kind: "operation-clause-resumption";
  readonly label: string;
  readonly operation: string;
  readonly result_type: TypeIndex;
  readonly continuation_type: TypeIndex;
  readonly continuation_effects: ReadonlyArray<LabelIndex>;
  readonly usage_limit: "1";
}

export interface ValueJudgment {
  readonly tag: "value-judgment";
  readonly occurrence_path: OccurrencePath;
  readonly rule: string;
  readonly value_context: ReadonlyArray<ValueBinderEntry>;
  readonly resumption_context: ReadonlyArray<ResumptionBinderEntry>;
  readonly value_type: TypeIndex;
  readonly usage: ReadonlyArray<Grade>;
  readonly resumption_usage: ReadonlyArray<Grade>;
  readonly premises: ReadonlyArray<number>;
}

export interface ComputationJudgment {
  readonly tag: "computation-judgment";
  readonly occurrence_path: OccurrencePath;
  readonly rule: string;
  readonly value_context: ReadonlyArray<ValueBinderEntry>;
  readonly resumption_context: ReadonlyArray<ResumptionBinderEntry>;
  readonly computation_type: TypeIndex;
  readonly effects: ReadonlyArray<LabelIndex>;
  readonly usage: ReadonlyArray<Grade>;
  readonly resumption_usage: ReadonlyArray<Grade>;
  readonly premises: ReadonlyArray<number>;
  readonly signature_origins?: ReadonlyArray<OccurrencePath>;
}

export type Judgment = ValueJudgment | ComputationJudgment;

export interface InferredSummary {
  readonly type: TypeIndex;
  readonly effects: ReadonlyArray<LabelIndex>;
  readonly usage: ReadonlyArray<Grade>;
}

export type DiagnosticFact =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<DiagnosticFact>
  | { readonly [key: string]: DiagnosticFact };

export interface CheckDiagnostic {
  readonly code: string;
  readonly rule: string;
  readonly occurrence_path: OccurrencePath;
  readonly message: string;
  readonly expected?: DiagnosticFact;
  readonly actual?: DiagnosticFact;
}

export interface CheckAccepted {
  readonly tag: "accepted";
  readonly labels: ReadonlyArray<string>;
  readonly types: ReadonlyArray<KernelTypeNode>;
  readonly inferred: InferredSummary;
  readonly judgments: ReadonlyArray<Judgment>;
}

export interface CheckRejected {
  readonly tag: "rejected";
  readonly labels: ReadonlyArray<string>;
  readonly types: ReadonlyArray<KernelTypeNode>;
  readonly diagnostics: ReadonlyArray<CheckDiagnostic>;
}

export interface KernelCheckObservation {
  readonly format: "semantic.kernel-check";
  readonly version: 1;
  readonly kernel: "semantic.kernel-calculus/0018/v1";
  readonly observation: CheckAccepted | CheckRejected;
}

/** Type-index children of one shared-table node, in the frozen grammar's own field order. */
export const typeChildIndexes = (node: KernelTypeNode): ReadonlyArray<TypeIndex> => {
  switch (node.tag) {
    case "unit":
    case "bool":
    case "int":
      return [];
    case "pair":
      return [node.first, node.second];
    case "thunk":
      return [node.computation];
    case "return":
      return [node.value];
    case "function":
      return [node.parameter, node.result];
  }
};

/**
 * Canonical structural key for a type-table node, given the already-computed
 * keys of every strictly-lower-indexed entry. Used both to enforce maximal
 * sharing (decode.ts) and to build it (observe.ts's interner).
 */
export const typeStructuralKey = (node: KernelTypeNode, keys: ReadonlyArray<string>): string => {
  switch (node.tag) {
    case "unit":
    case "bool":
    case "int":
      return node.tag;
    case "pair":
      return `pair(${keys[node.first]},${keys[node.second]})`;
    case "thunk":
      return `thunk([${node.effects.join(",")}],${keys[node.computation]})`;
    case "return":
      return `return(${node.grade},${keys[node.value]})`;
    case "function":
      return `function(${keys[node.parameter]},${node.grade},[${node.effects.join(",")}],${keys[node.result]})`;
  }
};
