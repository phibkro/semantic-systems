import type { SourceSpan } from "./errors.ts";

export interface LocatedName {
  readonly text: string;
  readonly span: SourceSpan;
}

export interface SurfaceEffectRow {
  readonly labels: ReadonlyArray<LocatedName>;
  readonly span: SourceSpan;
}

export type SurfaceGrade = "0" | "1" | "omega";

export type SurfaceValueType =
  | { readonly _tag: "UnitType"; readonly span: SourceSpan }
  | { readonly _tag: "BoolType"; readonly span: SourceSpan }
  | { readonly _tag: "IntType"; readonly span: SourceSpan }
  | {
      readonly _tag: "PairType";
      readonly first: SurfaceValueType;
      readonly second: SurfaceValueType;
      readonly span: SourceSpan;
    }
  | {
      readonly _tag: "ThunkType";
      readonly effects: SurfaceEffectRow;
      readonly computation: SurfaceComputationType;
      readonly span: SourceSpan;
    };

export type SurfaceComputationType =
  | {
      readonly _tag: "ReturnType";
      readonly grade: SurfaceGrade;
      readonly value: SurfaceValueType;
      readonly span: SourceSpan;
    }
  | {
      readonly _tag: "FunctionType";
      readonly parameter: SurfaceValueType;
      readonly grade: SurfaceGrade;
      readonly effects: SurfaceEffectRow;
      readonly result: SurfaceComputationType;
      readonly span: SourceSpan;
    };

export type SurfaceValue =
  | { readonly _tag: "Variable"; readonly name: LocatedName; readonly span: SourceSpan }
  | { readonly _tag: "ResumptionValue"; readonly name: LocatedName; readonly span: SourceSpan }
  | { readonly _tag: "Unit"; readonly span: SourceSpan }
  | { readonly _tag: "Bool"; readonly value: boolean; readonly span: SourceSpan }
  | { readonly _tag: "Int"; readonly value: number; readonly span: SourceSpan }
  | {
      readonly _tag: "Pair";
      readonly first: SurfaceValue;
      readonly second: SurfaceValue;
      readonly span: SourceSpan;
    }
  | {
      readonly _tag: "Thunk";
      readonly body: SurfaceComputation;
      readonly span: SourceSpan;
    };

export interface SurfaceReturnClause {
  readonly binder: LocatedName;
  readonly body: SurfaceComputation;
  readonly span: SourceSpan;
}

export interface SurfaceOperationClause {
  readonly operation: LocatedName;
  readonly argumentBinder: LocatedName;
  readonly resumptionBinder: LocatedName;
  readonly body: SurfaceComputation;
  readonly span: SourceSpan;
}

export type SurfaceComputation =
  | {
      readonly _tag: "Return";
      readonly grade: SurfaceGrade;
      readonly value: SurfaceValue;
      readonly span: SourceSpan;
    }
  | {
      readonly _tag: "Let";
      readonly binder: LocatedName;
      readonly bound: SurfaceComputation;
      readonly body: SurfaceComputation;
      readonly span: SourceSpan;
    }
  | { readonly _tag: "Force"; readonly value: SurfaceValue; readonly span: SourceSpan }
  | {
      readonly _tag: "Lambda";
      readonly binder: LocatedName;
      readonly parameterType: SurfaceValueType;
      readonly grade: SurfaceGrade;
      readonly body: SurfaceComputation;
      readonly span: SourceSpan;
    }
  | {
      readonly _tag: "Apply";
      readonly computation: SurfaceComputation;
      readonly argument: SurfaceValue;
      readonly span: SourceSpan;
    }
  | {
      readonly _tag: "Operation";
      readonly grade: SurfaceGrade;
      readonly label: LocatedName;
      readonly operation: LocatedName;
      readonly argument: SurfaceValue;
      readonly span: SourceSpan;
    }
  | {
      readonly _tag: "Handle";
      readonly label: LocatedName;
      readonly computation: SurfaceComputation;
      readonly returnClause: SurfaceReturnClause;
      readonly operationClauses: ReadonlyArray<SurfaceOperationClause>;
      readonly span: SourceSpan;
    }
  | {
      readonly _tag: "Resume";
      readonly resumption: LocatedName;
      readonly value: SurfaceValue;
      readonly span: SourceSpan;
    };

export interface SurfaceSignatureOperation {
  readonly label: LocatedName;
  readonly operation: LocatedName;
  readonly argumentType: SurfaceValueType;
  readonly resultType: SurfaceValueType;
  readonly span: SourceSpan;
}

export interface SurfaceDocument {
  readonly _tag: "SurfaceDocument";
  readonly kernel: "semantic.kernel-calculus/0018/v1";
  readonly signature: ReadonlyArray<SurfaceSignatureOperation>;
  readonly program: SurfaceComputation;
  readonly span: SourceSpan;
}

const documentCustody = new WeakSet<object>();

const deepFreeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const makeSurfaceDocument = (document: Omit<SurfaceDocument, "_tag">): SurfaceDocument => {
  const result = deepFreeze({ _tag: "SurfaceDocument" as const, ...document });
  documentCustody.add(result);
  return result;
};

export const hasSurfaceDocumentCustody = (document: SurfaceDocument): boolean =>
  typeof document === "object" && document !== null && documentCustody.has(document);
