import { Data } from "effect";

export const WIT_MAPPING_INPUT_FORMAT = "semantic.wit-mapping-input/v1" as const;
export const WIT_MAPPING_FORMAT = "semantic.wit-mapping/v1" as const;

export type WitMappingIdentity = `sha256:${string}`;

export const WIT_PRIMITIVES = Object.freeze([
  "bool",
  "s8",
  "s16",
  "s32",
  "s64",
  "u8",
  "u16",
  "u32",
  "u64",
  "f32",
  "f64",
  "char",
  "string",
] as const);
export type WitPrimitive = (typeof WIT_PRIMITIVES)[number];

export type WitType =
  | { readonly kind: "primitive"; readonly name: WitPrimitive }
  | { readonly kind: "list"; readonly element: WitType }
  | { readonly kind: "option"; readonly element: WitType }
  | {
      readonly kind: "result";
      readonly ok: WitType | null;
      readonly err: WitType | null;
    }
  | { readonly kind: "tuple"; readonly elements: ReadonlyArray<WitType> }
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "borrow"; readonly name: string }
  | { readonly kind: "stream"; readonly element: WitType }
  | { readonly kind: "future"; readonly element: WitType };

export interface TheoryDeclaration {
  readonly id: string;
  readonly statement: string;
}

export interface WitParameter {
  readonly name: string;
  readonly type: WitType;
  readonly semantic_path: string;
}

export interface WitOperation {
  readonly name: string;
  readonly semantic_path: string;
  readonly async: boolean;
  readonly params: ReadonlyArray<WitParameter>;
  readonly result: WitType | null;
  readonly effect_labels: ReadonlyArray<string>;
}

export interface WitConstructor {
  readonly semantic_path: string;
  readonly params: ReadonlyArray<WitParameter>;
  readonly effect_labels: ReadonlyArray<string>;
}

export type WitTypeDeclaration =
  | {
      readonly kind: "record";
      readonly name: string;
      readonly semantic_path: string;
      readonly fields: ReadonlyArray<WitParameter>;
    }
  | {
      readonly kind: "variant";
      readonly name: string;
      readonly semantic_path: string;
      readonly cases: ReadonlyArray<{
        readonly name: string;
        readonly type: WitType | null;
        readonly semantic_path: string;
      }>;
    }
  | {
      readonly kind: "enum";
      readonly name: string;
      readonly semantic_path: string;
      readonly cases: ReadonlyArray<{ readonly name: string; readonly semantic_path: string }>;
    }
  | {
      readonly kind: "flags";
      readonly name: string;
      readonly semantic_path: string;
      readonly cases: ReadonlyArray<{ readonly name: string; readonly semantic_path: string }>;
    }
  | {
      readonly kind: "type";
      readonly name: string;
      readonly semantic_path: string;
      readonly type: WitType;
    }
  | {
      readonly kind: "resource";
      readonly name: string;
      readonly semantic_path: string;
      readonly ownership_statement: string;
      readonly drop_assumption: string;
      readonly usage_grade: string | null;
      readonly constructor: WitConstructor | null;
      readonly methods: ReadonlyArray<WitOperation>;
      readonly statics: ReadonlyArray<WitOperation>;
    };

export interface WitInterface {
  readonly name: string;
  readonly semantic_path: string;
  readonly types: ReadonlyArray<WitTypeDeclaration>;
  readonly functions: ReadonlyArray<WitOperation>;
}

export interface WitWorld {
  readonly name: string;
  readonly imports: ReadonlyArray<string>;
  readonly exports: ReadonlyArray<string>;
}

export interface PortableBoundaryInput {
  readonly format: typeof WIT_MAPPING_INPUT_FORMAT;
  readonly package: {
    readonly namespace: string;
    readonly name: string;
    readonly version: string;
  };
  readonly theory: {
    readonly identity: WitMappingIdentity;
    readonly source_key: string;
    readonly complete_contract_identity: WitMappingIdentity;
    readonly laws: ReadonlyArray<TheoryDeclaration>;
    readonly effect_labels: ReadonlyArray<TheoryDeclaration>;
    readonly usage_grades: ReadonlyArray<TheoryDeclaration>;
    readonly assumptions: ReadonlyArray<TheoryDeclaration>;
    readonly evidence_requirements: ReadonlyArray<TheoryDeclaration>;
  };
  readonly interfaces: ReadonlyArray<WitInterface>;
  readonly world: WitWorld;
}

export interface WitMappingBounds {
  readonly maximum_interfaces: number;
  readonly maximum_types: number;
  readonly maximum_functions: number;
  readonly maximum_fields_or_cases: number;
  readonly maximum_depth: number;
  readonly maximum_string_length: number;
  readonly maximum_wit_bytes: number;
  readonly maximum_manifest_bytes: number;
}

export const defaultWitMappingBounds: WitMappingBounds = Object.freeze({
  maximum_interfaces: 128,
  maximum_types: 512,
  maximum_functions: 1024,
  maximum_fields_or_cases: 2048,
  maximum_depth: 32,
  maximum_string_length: 1024,
  maximum_wit_bytes: 2 * 1024 * 1024,
  maximum_manifest_bytes: 4 * 1024 * 1024,
});

export interface WitMappingDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type WitMappingDecodeResult =
  | { readonly status: "decoded"; readonly value: PortableBoundaryInput }
  | { readonly status: "rejected"; readonly diagnostics: ReadonlyArray<WitMappingDiagnostic> };

export type WitMappingProjection =
  | "shape"
  | "capability_boundary"
  | "ownership_boundary"
  | "operational_async_shape"
  | "companion_only";

export interface WitMappingRow {
  readonly wit_path: string;
  readonly semantic_path: string;
  readonly projection: WitMappingProjection;
  readonly detail?: string;
}

export type SemanticDimensionKind =
  | "law"
  | "effect_label"
  | "usage_grade"
  | "assumption"
  | "evidence_requirement";

export interface SemanticDimensionRow {
  readonly kind: SemanticDimensionKind;
  readonly id: string;
  readonly statement: string;
  readonly projection: WitMappingProjection;
  readonly wit_path: string | null;
  readonly semantic_path: string;
}

export interface SemanticWitMappingManifestV1 {
  readonly format: typeof WIT_MAPPING_FORMAT;
  readonly theory_identity: WitMappingIdentity;
  readonly complete_contract_identity: WitMappingIdentity;
  readonly theory_source_key: string;
  readonly wit_identity: WitMappingIdentity;
  readonly package: PortableBoundaryInput["package"];
  readonly world: WitWorld;
  readonly mappings: ReadonlyArray<WitMappingRow>;
  readonly semantic_dimensions: ReadonlyArray<SemanticDimensionRow>;
  readonly assumptions: ReadonlyArray<TheoryDeclaration>;
  readonly evidence_requirements: ReadonlyArray<TheoryDeclaration>;
  readonly unsupported_claims: ReadonlyArray<string>;
}

export interface WitMappingArtifact {
  readonly wit: string;
  readonly manifest: SemanticWitMappingManifestV1;
  readonly wit_identity: WitMappingIdentity;
  readonly manifest_identity: WitMappingIdentity;
}

export interface WitMappingSummary {
  readonly format: typeof WIT_MAPPING_FORMAT;
  readonly wit: string;
  readonly manifest: SemanticWitMappingManifestV1;
  readonly wit_identity: WitMappingIdentity;
  readonly manifest_identity: WitMappingIdentity;
  readonly wit_bytes: number;
  readonly manifest_bytes: number;
}

export const UNSUPPORTED_CLAIMS = Object.freeze([
  "WIT validation does not establish Semantic theory realization.",
  "async func, stream<T>, and future<T> expose asynchronous transport shape, not scheduling, fairness, cancellation, ordering, delivery, backpressure, or liveness guarantees beyond the applicable Component Model/WASI contract.",
  "A WIT resource exposes handle ownership shape, not the Semantic usage grade calculus, arbitrary linearity, host cleanup correctness, or leak freedom.",
  "An imported interface names a capability boundary; it does not prove the implementation performs, observes, or authenticates an external effect.",
  "Companion laws and evidence are declarations until independently checked under their stated policy and assumptions.",
] as const);

export class WitMappingDecodeError extends Data.TaggedError("WitMappingDecodeError")<{
  readonly diagnostics: ReadonlyArray<WitMappingDiagnostic>;
}> {}

export class WitMappingError extends Data.TaggedError("WitMappingError")<{
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const diagnostic = (code: string, path: string, message: string): WitMappingDiagnostic =>
  Object.freeze({ code, path, message });

export const rejected = (
  ...diagnostics: ReadonlyArray<WitMappingDiagnostic>
): WitMappingDecodeResult =>
  Object.freeze({ status: "rejected", diagnostics: Object.freeze([...diagnostics]) });

export const decoded = (value: PortableBoundaryInput): WitMappingDecodeResult =>
  Object.freeze({ status: "decoded", value });
