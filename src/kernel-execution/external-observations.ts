/** Strict observation scripts and the backend-neutral affine replay driver. */
import { Effect, Exit, Schema } from "effect";
import { canonicalBytes, type CanonicalJsonValue } from "../normalized-core/canonical.ts";
import {
  isKernelRunObservation,
  KernelRunResultSchema,
  ObservableOperationRequestSchema,
  type KernelRunResult,
  type ObservableOperationRequest,
  type ObservableRuntimeDiagnostic,
  type ObservableRuntimeValue,
  type ObservableValueType,
} from "../kernel-interpreter/schema.ts";
import { toPortableFact } from "../kernel-interpreter/portable-fact.ts";

export const maximumExternalObservations = 256;

export type ExternalObservationValue =
  | { readonly kind: "unit" }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "int"; readonly value: number }
  | {
      readonly kind: "pair";
      readonly first: ExternalObservationValue;
      readonly second: ExternalObservationValue;
    };

export interface ExternalObservationScript {
  readonly format: "semantic.kernel-observation-script";
  readonly version: 1;
  readonly observations: ReadonlyArray<ExternalObservationValue>;
}

export interface EffectRunDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type KernelEffectRunResult =
  | {
      readonly tag: "script-rejected";
      readonly diagnostics: ReadonlyArray<EffectRunDiagnostic>;
    }
  | {
      readonly tag: "executed";
      readonly provided_observations: number;
      readonly applied_observations: number;
      readonly requests: ReadonlyArray<ObservableOperationRequest>;
      readonly result: KernelRunResult;
    };

export interface KernelEffectRunObservation {
  readonly format: "semantic.kernel-effect-run";
  readonly version: 1;
  readonly kernel: "semantic.kernel-calculus/0018/v1";
  readonly observation: KernelEffectRunResult;
}

export const ExternalObservationValueSchema: Schema.Codec<ExternalObservationValue> =
  Schema.suspend(() =>
    Schema.Union([
      Schema.Struct({ kind: Schema.Literal("unit") }),
      Schema.Struct({ kind: Schema.Literal("bool"), value: Schema.Boolean }),
      Schema.Struct({ kind: Schema.Literal("int"), value: Schema.Int }),
      Schema.Struct({
        kind: Schema.Literal("pair"),
        first: ExternalObservationValueSchema,
        second: ExternalObservationValueSchema,
      }),
    ]),
  );

export const ExternalObservationScriptSchema: Schema.Codec<ExternalObservationScript> =
  Schema.Struct({
    format: Schema.Literal("semantic.kernel-observation-script"),
    version: Schema.Literal(1),
    observations: Schema.Array(ExternalObservationValueSchema).pipe(
      Schema.check(Schema.isMaxLength(maximumExternalObservations)),
    ),
  });

const EffectRunDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  path: Schema.String,
  message: Schema.String,
});

const KernelEffectRunObservationShapeSchema: Schema.Codec<KernelEffectRunObservation> =
  Schema.Struct({
    format: Schema.Literal("semantic.kernel-effect-run"),
    version: Schema.Literal(1),
    kernel: Schema.Literal("semantic.kernel-calculus/0018/v1"),
    observation: Schema.Union([
      Schema.Struct({
        tag: Schema.Literal("script-rejected"),
        diagnostics: Schema.Array(EffectRunDiagnosticSchema).pipe(
          Schema.check(Schema.isMinLength(1), Schema.isMaxLength(1)),
        ),
      }),
      Schema.Struct({
        tag: Schema.Literal("executed"),
        provided_observations: Schema.Natural,
        applied_observations: Schema.Natural,
        requests: Schema.Array(ObservableOperationRequestSchema).pipe(
          Schema.check(Schema.isMaxLength(maximumExternalObservations + 1)),
        ),
        result: KernelRunResultSchema,
      }),
    ]),
  });

const freeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const envelope = (observation: KernelEffectRunResult): KernelEffectRunObservation =>
  freeze({
    format: "semantic.kernel-effect-run",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    observation,
  });

const snapshotObservableValue = (value: ObservableRuntimeValue): ObservableRuntimeValue => {
  switch (value.kind) {
    case "unit":
    case "thunk":
      return { kind: value.kind };
    case "bool":
      return { kind: "bool", value: value.value };
    case "int":
      return { kind: "int", value: value.value };
    case "pair":
      return {
        kind: "pair",
        first: snapshotObservableValue(value.first),
        second: snapshotObservableValue(value.second),
      };
  }
};

const snapshotValueType = (type: ObservableValueType): ObservableValueType => {
  switch (type.kind) {
    case "unit":
    case "bool":
    case "int":
      return { kind: type.kind };
    case "pair":
      return {
        kind: "pair",
        first: snapshotValueType(type.first),
        second: snapshotValueType(type.second),
      };
    case "thunk":
      return {
        kind: "thunk",
        effects: [...type.effects],
        computation: snapshotComputationType(type.computation),
      };
  }
};

const snapshotComputationType = (
  type: Extract<ObservableValueType, { readonly kind: "thunk" }>["computation"],
): Extract<ObservableValueType, { readonly kind: "thunk" }>["computation"] =>
  type.kind === "return"
    ? { kind: "return", grade: type.grade, value: snapshotValueType(type.value) }
    : {
        kind: "function",
        parameter: snapshotValueType(type.parameter),
        grade: type.grade,
        effects: [...type.effects],
        result: snapshotComputationType(type.result),
      };

const snapshotRequest = (request: ObservableOperationRequest): ObservableOperationRequest => ({
  label: request.label,
  operation: request.operation,
  argument: snapshotObservableValue(request.argument),
  result_type: snapshotValueType(request.result_type),
});

const portableValuesEqual = (left: CanonicalJsonValue, right: CanonicalJsonValue): boolean => {
  const leftBytes = canonicalBytes(left);
  const rightBytes = canonicalBytes(right);
  return (
    leftBytes.length === rightBytes.length &&
    leftBytes.every((byte, index) => byte === rightBytes[index])
  );
};

export type ExternalObservationScriptDecode =
  | { readonly status: "decoded"; readonly value: ExternalObservationScript }
  | { readonly status: "rejected"; readonly observation: KernelEffectRunObservation };

export const decodeExternalObservationScript = (
  input: unknown,
): ExternalObservationScriptDecode => {
  const snapshot = toPortableFact(input);
  if (snapshot === undefined) {
    return {
      status: "rejected",
      observation: envelope({
        tag: "script-rejected",
        diagnostics: [
          {
            code: "external-observation-script.non-inert",
            path: "$",
            message: "observation script must be finite inert JSON without aliases or accessors",
          },
        ],
      }),
    };
  }
  const decoded = Schema.decodeUnknownExit(ExternalObservationScriptSchema, {
    onExcessProperty: "error",
  })(snapshot);
  if (Exit.isFailure(decoded)) {
    return {
      status: "rejected",
      observation: envelope({
        tag: "script-rejected",
        diagnostics: [
          {
            code: "external-observation-script.invalid",
            path: "$",
            message: "observation script does not match semantic.kernel-observation-script/v1",
          },
        ],
      }),
    };
  }
  return { status: "decoded", value: freeze(decoded.value) };
};

export type ExternalEffectStep<Token> =
  | { readonly status: "returned"; readonly result: KernelRunResult }
  | {
      readonly status: "suspended";
      readonly request: ObservableOperationRequest;
      readonly token: Token;
    }
  | { readonly status: "terminal"; readonly result: KernelRunResult };

export interface ExternalResumeResult<Token> {
  readonly applied: boolean;
  readonly step: ExternalEffectStep<Token>;
}

const typeContainsThunk = (type: ObservableValueType): boolean => {
  switch (type.kind) {
    case "unit":
    case "bool":
    case "int":
      return false;
    case "pair":
      return typeContainsThunk(type.first) || typeContainsThunk(type.second);
    case "thunk":
      return true;
  }
};

const valueHasType = (value: ExternalObservationValue, type: ObservableValueType): boolean => {
  switch (type.kind) {
    case "unit":
    case "bool":
    case "int":
      return value.kind === type.kind;
    case "pair":
      return (
        value.kind === "pair" &&
        valueHasType(value.first, type.first) &&
        valueHasType(value.second, type.second)
      );
    case "thunk":
      return false;
  }
};

const rejectedResult = (
  code: string,
  path: string,
  message: string,
  expected?: CanonicalJsonValue,
  actual?: CanonicalJsonValue,
): KernelRunResult => ({
  tag: "runtime-rejected",
  diagnostic: {
    code,
    occurrence_path: path,
    message,
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
  } satisfies ObservableRuntimeDiagnostic,
});

export const driveExternalObservations = <Token, Error, Requirements>(
  initial: ExternalEffectStep<Token>,
  script: ExternalObservationScript,
  resume: (
    token: Token,
    value: ExternalObservationValue,
  ) => Effect.Effect<ExternalResumeResult<Token>, Error, Requirements>,
): Effect.Effect<KernelEffectRunObservation, Error, Requirements> =>
  Effect.gen(function* () {
    const requests: Array<ObservableOperationRequest> = [];
    let applied = 0;
    let current = initial;
    while (current.status === "suspended") {
      requests.push(snapshotRequest(current.request));
      const next = script.observations[applied];
      if (next === undefined) {
        return envelope({
          tag: "executed",
          provided_observations: script.observations.length,
          applied_observations: applied,
          requests,
          result: { tag: "suspended", request: snapshotRequest(current.request) },
        });
      }
      if (typeContainsThunk(current.request.result_type)) {
        return envelope({
          tag: "executed",
          provided_observations: script.observations.length,
          applied_observations: applied,
          requests,
          result: rejectedResult(
            "external-observation.thunk-result-unsupported",
            `/observations/${applied}`,
            "version 1 observation scripts cannot construct executable thunk custody",
            snapshotValueType(current.request.result_type) as unknown as CanonicalJsonValue,
            toPortableFact(next),
          ),
        });
      }
      if (!valueHasType(next, current.request.result_type)) {
        return envelope({
          tag: "executed",
          provided_observations: script.observations.length,
          applied_observations: applied,
          requests,
          result: rejectedResult(
            "external-observation.result-type-mismatch",
            `/observations/${applied}`,
            "external observation does not match the current operation result type",
            snapshotValueType(current.request.result_type) as unknown as CanonicalJsonValue,
            toPortableFact(next),
          ),
        });
      }
      const resumed = yield* resume(current.token, next);
      if (resumed.applied) applied += 1;
      if (!resumed.applied && resumed.step.status === "suspended") {
        return envelope({
          tag: "executed",
          provided_observations: script.observations.length,
          applied_observations: applied,
          requests,
          result: rejectedResult(
            "external-observation.resume-not-applied",
            `/observations/${applied}`,
            "backend retained a suspension without applying or rejecting the observation",
          ),
        });
      }
      current = resumed.step;
    }
    return envelope({
      tag: "executed",
      provided_observations: script.observations.length,
      applied_observations: applied,
      requests,
      result: current.result,
    });
  });

export const isKernelEffectRunObservation = (
  input: unknown,
): input is KernelEffectRunObservation => {
  const snapshot = toPortableFact(input);
  if (snapshot === undefined) return false;
  const decoded = Schema.decodeUnknownExit(KernelEffectRunObservationShapeSchema, {
    onExcessProperty: "error",
  })(snapshot);
  if (Exit.isFailure(decoded)) return false;
  if (decoded.value.observation.tag === "executed") {
    if (
      decoded.value.observation.provided_observations > maximumExternalObservations ||
      decoded.value.observation.applied_observations > maximumExternalObservations
    ) {
      return false;
    }
    if (
      decoded.value.observation.applied_observations >
      decoded.value.observation.provided_observations
    ) {
      return false;
    }
    if (
      decoded.value.observation.requests.length < decoded.value.observation.applied_observations ||
      decoded.value.observation.requests.length > decoded.value.observation.applied_observations + 1
    ) {
      return false;
    }
    if (decoded.value.observation.result.tag === "suspended") {
      const finalRequest = decoded.value.observation.requests.at(-1);
      if (
        finalRequest === undefined ||
        !portableValuesEqual(
          finalRequest as unknown as CanonicalJsonValue,
          decoded.value.observation.result.request as unknown as CanonicalJsonValue,
        )
      ) {
        return false;
      }
    }
    if (
      !isKernelRunObservation({
        format: "semantic.kernel-run",
        version: 1,
        kernel: "semantic.kernel-calculus/0018/v1",
        observation: decoded.value.observation.result,
      })
    ) {
      return false;
    }
  }
  return true;
};

export const KernelEffectRunObservationSchema = Schema.declare<KernelEffectRunObservation>(
  isKernelEffectRunObservation,
  {
    identifier: "KernelEffectRunObservation",
  },
);

export const encodeCanonicalKernelEffectRunObservation = (
  observation: KernelEffectRunObservation,
): Uint8Array => {
  const snapshot = toPortableFact(observation);
  if (snapshot === undefined || !isKernelEffectRunObservation(snapshot)) {
    throw new TypeError("expected a strict semantic.kernel-effect-run observation");
  }
  return canonicalBytes(snapshot as CanonicalJsonValue);
};
