import type {
  ComputationTerm as KernelComputationTerm,
  ComputationType as KernelComputationType,
  ValueTerm as KernelValueTerm,
  ValueType as KernelValueType,
} from "../kernel-calculus/index.ts";
import type { Grade } from "../kernel-calculus/grade.ts";
import { compareCodePoints, hasUnicodeScalarsOnly } from "./canonical.ts";

export type Identity = `sha256:${string}`;
export type SourceRole = "definition" | "expression" | "type" | "generated";

export type NormalizedValueType =
  | { readonly tag: "unit" | "bool" | "int" }
  | {
      readonly tag: "pair";
      readonly first: NormalizedValueType;
      readonly second: NormalizedValueType;
    }
  | {
      readonly tag: "sum";
      readonly left: NormalizedValueType;
      readonly right: NormalizedValueType;
    }
  | {
      readonly tag: "thunk";
      readonly effects: ReadonlyArray<string>;
      readonly computation: NormalizedComputationType;
    };

export type NormalizedComputationType =
  | { readonly tag: "return"; readonly grade: Grade; readonly value: NormalizedValueType }
  | {
      readonly tag: "function";
      readonly parameter: NormalizedValueType;
      readonly grade: Grade;
      readonly effects: ReadonlyArray<string>;
      readonly result: NormalizedComputationType;
    };

export type NormalizedValueTerm =
  | { readonly tag: "bound-value"; readonly distance: number }
  | { readonly tag: "unit" }
  | { readonly tag: "bool"; readonly value: boolean }
  | { readonly tag: "int"; readonly value: number }
  | {
      readonly tag: "pair";
      readonly first: NormalizedValueTerm;
      readonly second: NormalizedValueTerm;
    }
  | {
      readonly tag: "inject-left";
      readonly value: NormalizedValueTerm;
      readonly right_type: NormalizedValueType;
    }
  | {
      readonly tag: "inject-right";
      readonly left_type: NormalizedValueType;
      readonly value: NormalizedValueTerm;
    }
  | { readonly tag: "thunk"; readonly body: NormalizedComputationTerm };

export type NormalizedComputationTerm =
  | { readonly tag: "return"; readonly grade: Grade; readonly value: NormalizedValueTerm }
  | {
      readonly tag: "let";
      readonly bound: NormalizedComputationTerm;
      readonly body: NormalizedComputationTerm;
    }
  | { readonly tag: "force"; readonly value: NormalizedValueTerm }
  | {
      readonly tag: "case";
      readonly value: NormalizedValueTerm;
      readonly left_branch: NormalizedComputationTerm;
      readonly right_branch: NormalizedComputationTerm;
    }
  | {
      readonly tag: "lambda";
      readonly parameter_type: NormalizedValueType;
      readonly grade: Grade;
      readonly body: NormalizedComputationTerm;
    }
  | {
      readonly tag: "apply";
      readonly computation: NormalizedComputationTerm;
      readonly argument: NormalizedValueTerm;
    }
  | {
      readonly tag: "operation";
      readonly grade: Grade;
      readonly label: string;
      readonly operation: string;
      readonly argument: NormalizedValueTerm;
    }
  | {
      readonly tag: "handle";
      readonly label: string;
      readonly computation: NormalizedComputationTerm;
      readonly return_clause: { readonly body: NormalizedComputationTerm };
      readonly operation_clauses: ReadonlyArray<{
        readonly operation: string;
        readonly body: NormalizedComputationTerm;
      }>;
    }
  | {
      readonly tag: "resume";
      readonly resumption_distance: number;
      readonly value: NormalizedValueTerm;
    };

export interface NormalizedOperation {
  readonly operation_identity: Identity;
  readonly label: string;
  readonly operation: string;
  readonly argument_type: NormalizedValueType;
  readonly result_type: NormalizedValueType;
}

export interface ImportedAssumption {
  readonly assumption_identity: Identity;
  readonly kind: "declared";
  readonly statement: string;
}

export interface SourceUnit {
  readonly source_identity: Identity;
  readonly uri: string;
  readonly content_identity: Identity;
  readonly byte_length: number;
}

export interface SourceCorrespondence {
  readonly node_path: string;
  readonly source_identity: Identity;
  readonly role: SourceRole;
  readonly start_byte: number;
  readonly end_byte: number;
}

export interface NormalizedCoreArtifact {
  readonly format: "semantic.normalized-core";
  readonly version: 2;
  readonly kernel: "semantic.kernel-calculus/0018/v2";
  readonly semantic_identity: Identity;
  readonly artifact_identity: Identity;
  readonly signature: ReadonlyArray<NormalizedOperation>;
  readonly term: NormalizedComputationTerm;
  readonly summary: {
    readonly type: NormalizedComputationType;
    readonly effects: ReadonlyArray<string>;
    readonly usage: ReadonlyArray<Grade>;
  };
  readonly assumptions: ReadonlyArray<ImportedAssumption>;
  readonly obligations: readonly [];
  readonly source: {
    readonly units: ReadonlyArray<SourceUnit>;
    readonly correspondence: ReadonlyArray<SourceCorrespondence>;
  };
}

export interface ImportedAssumptionInput {
  readonly kind: "declared";
  readonly statement: string;
}

export interface SourceUnitInput {
  readonly source_key: string;
  readonly uri: string;
  readonly content_identity: Identity;
  readonly byte_length: number;
}

export interface SourceCorrespondenceInput {
  readonly node_path: string;
  readonly source_key: string;
  readonly role: SourceRole;
  readonly start_byte: number;
  readonly end_byte: number;
}

export interface EmissionMetadataInput {
  readonly assumptions: ReadonlyArray<ImportedAssumptionInput>;
  readonly source: {
    readonly units: ReadonlyArray<SourceUnitInput>;
    readonly correspondence: ReadonlyArray<SourceCorrespondenceInput>;
  };
}

export interface NormalizedCoreBounds {
  readonly maximumBytes: number;
  readonly maximumDepth: number;
  readonly maximumNodes: number;
  readonly maximumStringBytes: number;
  readonly maximumCollectionLength: number;
  readonly maximumOperations: number;
  readonly maximumAssumptions: number;
  readonly maximumSourceUnits: number;
  readonly maximumCorrespondences: number;
}

export const defaultNormalizedCoreBounds: NormalizedCoreBounds = Object.freeze({
  maximumBytes: 1_048_576,
  maximumDepth: 64,
  maximumNodes: 4_096,
  maximumStringBytes: 4_096,
  maximumCollectionLength: 4_096,
  maximumOperations: 256,
  maximumAssumptions: 256,
  maximumSourceUnits: 256,
  maximumCorrespondences: 1_024,
});

export interface NormalizedCoreDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type DecodeResult<Value> =
  | { readonly status: "decoded"; readonly value: Value }
  | {
      readonly status: "rejected";
      readonly diagnostics: readonly [NormalizedCoreDiagnostic];
    };

export type EmissionResult =
  | {
      readonly status: "emitted";
      readonly artifact: NormalizedCoreArtifact;
      readonly bytes: Uint8Array;
    }
  | {
      readonly status: "rejected";
      readonly diagnostics: readonly [NormalizedCoreDiagnostic];
    };

export type ValidationResult =
  | {
      readonly status: "accepted";
      readonly artifact: NormalizedCoreArtifact;
      readonly bytes: Uint8Array;
      readonly checkSummary: NormalizedCoreArtifact["summary"];
    }
  | {
      readonly status: "rejected";
      readonly diagnostics: readonly [NormalizedCoreDiagnostic];
    };

export const diagnostic = (code: string, path: string, message: string): NormalizedCoreDiagnostic =>
  Object.freeze({ code, path, message });

export const rejected = <Value = never>(value: NormalizedCoreDiagnostic): DecodeResult<Value> =>
  Object.freeze({
    status: "rejected",
    diagnostics: Object.freeze([value] as [NormalizedCoreDiagnostic]),
  });

export const isIdentity = (value: unknown): value is Identity =>
  typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);

const boundNames = Object.keys(defaultNormalizedCoreBounds).sort(compareCodePoints);

export const decodeBounds = (input: unknown): DecodeResult<NormalizedCoreBounds> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return rejected(
      diagnostic("bounds.expected-record", "$.bounds", "expected an exact bounds record"),
    );
  }
  try {
    if (Object.getPrototypeOf(input) !== Object.prototype) {
      return rejected(diagnostic("bounds.non-data", "$.bounds", "expected a plain data record"));
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(input);
    if (
      keys.some((key) => typeof key === "symbol") ||
      keys.some((key) => {
        if (typeof key !== "string") return true;
        const descriptor = descriptors[key];
        return descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable;
      })
    ) {
      return rejected(
        diagnostic("bounds.non-data", "$.bounds", "bounds must contain plain enumerable data"),
      );
    }
    const actual = Object.keys(input).sort(compareCodePoints);
    if (
      actual.length !== boundNames.length ||
      actual.some((key, index) => key !== boundNames[index])
    ) {
      return rejected(
        diagnostic(
          "bounds.exact-record",
          "$.bounds",
          "bounds must contain every version 2 field and no others",
        ),
      );
    }
    const values: Record<string, number> = {};
    for (const name of boundNames) {
      const value = (input as Record<string, unknown>)[name];
      const maximum = defaultNormalizedCoreBounds[name as keyof NormalizedCoreBounds];
      if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
        return rejected(
          diagnostic(
            "bounds.invalid",
            `$.bounds.${name}`,
            `expected a positive safe integer no greater than ${maximum}`,
          ),
        );
      }
      values[name] = value as number;
    }
    return Object.freeze({
      status: "decoded",
      value: Object.freeze(values) as unknown as NormalizedCoreBounds,
    });
  } catch {
    return rejected(
      diagnostic("bounds.hostile-input", "$.bounds", "bounds could not be inspected"),
    );
  }
};

export interface Inspection {
  readonly value: unknown;
  readonly nodes: number;
}

const utf8Length = (value: string): number => new TextEncoder().encode(value).byteLength;

export const inspectUnknownJson = (
  input: unknown,
  bounds: NormalizedCoreBounds,
): DecodeResult<Inspection> => {
  const seen = new WeakSet<object>();
  let nodes = 0;

  const fail = (code: string, path: string, message: string): never => {
    throw diagnostic(code, path, message);
  };

  const string = (value: string, path: string): string => {
    if (!hasUnicodeScalarsOnly(value)) {
      return fail("decode.lone-surrogate", path, "strings must contain only Unicode scalar values");
    }
    if (utf8Length(value) > bounds.maximumStringBytes) {
      return fail("decode.string-exceeded", path, "maximum UTF-8 string byte length exceeded");
    }
    return value;
  };

  const visit = (value: unknown, path: string, depth: number): unknown => {
    if (depth > bounds.maximumDepth) {
      return fail("decode.depth-exceeded", path, "maximum decode depth exceeded");
    }
    nodes += 1;
    if (nodes > bounds.maximumNodes) {
      return fail("decode.nodes-exceeded", path, "maximum decoded node count exceeded");
    }
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") return string(value, path);
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) {
        return fail("decode.expected-integer", path, "numbers must be safe integers");
      }
      return value;
    }
    if (typeof value !== "object") {
      return fail("decode.non-json", path, "expected JSON data");
    }
    if (seen.has(value)) {
      return fail("decode.repeated-reference", path, "repeated object or array reference rejected");
    }
    seen.add(value);

    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        return fail("decode.exotic-array", path, "expected a plain array");
      }
      if (value.length > bounds.maximumCollectionLength) {
        return fail("decode.collection-exceeded", path, "maximum collection length exceeded");
      }
      const own = Reflect.ownKeys(value);
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          return fail("decode.sparse-array", `${path}/${index}`, "sparse arrays are rejected");
        }
      }
      for (const key of own) {
        if (key === "length") continue;
        if (typeof key === "symbol" || !/^(0|[1-9][0-9]*)$/.test(key)) {
          return fail("decode.non-data", path, "arrays cannot contain symbol or named properties");
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
          return fail("decode.non-data", `${path}/${key}`, "array entries must be enumerable data");
        }
      }
      return value.map((child, index) => visit(child, `${path}/${index}`, depth + 1));
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return fail("decode.exotic-object", path, "expected a plain object");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > bounds.maximumCollectionLength) {
      return fail("decode.collection-exceeded", path, "maximum collection length exceeded");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const stringKeys: Array<string> = [];
    for (const key of keys) {
      if (typeof key === "symbol") {
        return fail("decode.symbol-key", path, "symbol-keyed properties are rejected");
      }
      string(key, `${path}/${key}`);
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return fail(
          "decode.non-data",
          `${path}/${key}`,
          "accessors and non-enumerable properties are rejected",
        );
      }
      stringKeys.push(key);
    }
    const output: Record<string, unknown> = {};
    for (const key of stringKeys.sort(compareCodePoints)) {
      Object.defineProperty(output, key, {
        value: visit(descriptors[key]!.value, `${path}/${key}`, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return output;
  };

  try {
    return Object.freeze({
      status: "decoded",
      value: Object.freeze({ value: visit(input, "$", 0), nodes }),
    });
  } catch (cause) {
    return rejected(
      typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        "path" in cause &&
        "message" in cause
        ? (cause as NormalizedCoreDiagnostic)
        : diagnostic("decode.hostile-input", "$", "input could not be inspected"),
    );
  }
};

export type { KernelComputationTerm, KernelComputationType, KernelValueTerm, KernelValueType };
