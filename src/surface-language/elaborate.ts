import { Effect, Match } from "effect";
import { compareCodePoints } from "../normalized-core/canonical.ts";
import {
  checkKernelDocument,
  decodeKernelDocumentValue,
  type KernelCheckObservation,
  type KernelComputationTerm,
  type KernelComputationType,
  type KernelDocument,
  type KernelSignatureOperation,
  type KernelValueTerm,
  type KernelValueType,
} from "../kernel-json/index.ts";
import {
  hasSurfaceDocumentCustody,
  type LocatedName,
  type SurfaceComputation,
  type SurfaceComputationType,
  type SurfaceDocument,
  type SurfaceEffectRow,
  type SurfaceValue,
  type SurfaceValueType,
} from "./ast.ts";
import { SurfaceElaborationError, SurfaceKernelBoundaryError, type SourceSpan } from "./errors.ts";

interface ElaborationContext {
  readonly values: ReadonlyArray<LocatedName>;
  readonly resumptions: ReadonlyArray<LocatedName>;
}

const emptyContext: ElaborationContext = Object.freeze({
  values: Object.freeze([]),
  resumptions: Object.freeze([]),
});

const elaborationFailure = (
  code: SurfaceElaborationError["code"],
  message: string,
  span: SourceSpan,
): SurfaceElaborationError =>
  new SurfaceElaborationError({ phase: "elaboration", code, message, span });

const indexOfName = (context: ReadonlyArray<LocatedName>, name: string): number =>
  context.findIndex((candidate) => candidate.text === name);

const extend = (
  context: ElaborationContext,
  binder: LocatedName,
  kind: "value" | "resumption",
): Effect.Effect<ElaborationContext, SurfaceElaborationError> => {
  if (
    indexOfName(context.values, binder.text) >= 0 ||
    indexOfName(context.resumptions, binder.text) >= 0
  ) {
    return Effect.fail(
      elaborationFailure(
        "surface.elaboration.ambiguous-binder",
        `binder ${JSON.stringify(binder.text)} collides with a name already in lexical scope`,
        binder.span,
      ),
    );
  }
  return Effect.succeed(
    kind === "value"
      ? Object.freeze({
          values: Object.freeze([binder, ...context.values]),
          resumptions: context.resumptions,
        })
      : Object.freeze({
          values: context.values,
          resumptions: Object.freeze([binder, ...context.resumptions]),
        }),
  );
};

const valueDistance = (
  name: LocatedName,
  context: ElaborationContext,
): Effect.Effect<number, SurfaceElaborationError> => {
  const distance = indexOfName(context.values, name.text);
  if (distance >= 0) return Effect.succeed(distance);
  const isResumption = indexOfName(context.resumptions, name.text) >= 0;
  return Effect.fail(
    elaborationFailure(
      isResumption ? "surface.elaboration.wrong-binder-kind" : "surface.elaboration.unbound-value",
      isResumption
        ? `${JSON.stringify(name.text)} is a resumption binder, not an ordinary value`
        : `ordinary value ${JSON.stringify(name.text)} is not in scope`,
      name.span,
    ),
  );
};

const resumptionDistance = (
  name: LocatedName,
  context: ElaborationContext,
): Effect.Effect<number, SurfaceElaborationError> => {
  const distance = indexOfName(context.resumptions, name.text);
  if (distance >= 0) return Effect.succeed(distance);
  const isValue = indexOfName(context.values, name.text) >= 0;
  return Effect.fail(
    elaborationFailure(
      isValue ? "surface.elaboration.wrong-binder-kind" : "surface.elaboration.unbound-resumption",
      isValue
        ? `${JSON.stringify(name.text)} is an ordinary value binder, not a resumption`
        : `resumption ${JSON.stringify(name.text)} is not in scope`,
      name.span,
    ),
  );
};

const normalizeEffectRow = (
  row: SurfaceEffectRow,
): Effect.Effect<ReadonlyArray<string>, SurfaceElaborationError> => {
  const seen = new Set<string>();
  for (const label of row.labels) {
    if (seen.has(label.text)) {
      return Effect.fail(
        elaborationFailure(
          "surface.elaboration.duplicate-effect-label",
          `effect row repeats label ${JSON.stringify(label.text)}`,
          label.span,
        ),
      );
    }
    seen.add(label.text);
  }
  return Effect.succeed(Object.freeze([...seen].sort(compareCodePoints)));
};

const elaborateValueType = (
  type: SurfaceValueType,
): Effect.Effect<KernelValueType, SurfaceElaborationError> =>
  Match.value(type).pipe(
    Match.tagsExhaustive({
      UnitType: () => Effect.succeed({ tag: "unit" as const }),
      BoolType: () => Effect.succeed({ tag: "bool" as const }),
      IntType: () => Effect.succeed({ tag: "int" as const }),
      PairType: (pair) =>
        Effect.gen(function* () {
          const first = yield* elaborateValueType(pair.first);
          const second = yield* elaborateValueType(pair.second);
          return { tag: "pair" as const, first, second };
        }),
      ThunkType: (thunk) =>
        Effect.gen(function* () {
          const effects = yield* normalizeEffectRow(thunk.effects);
          const computation = yield* elaborateComputationType(thunk.computation);
          return { tag: "thunk" as const, effects, computation };
        }),
    }),
  );

const elaborateComputationType = (
  type: SurfaceComputationType,
): Effect.Effect<KernelComputationType, SurfaceElaborationError> =>
  Match.value(type).pipe(
    Match.tagsExhaustive({
      ReturnType: (returned) =>
        Effect.gen(function* () {
          const value = yield* elaborateValueType(returned.value);
          return { tag: "return" as const, grade: returned.grade, value };
        }),
      FunctionType: (fn) =>
        Effect.gen(function* () {
          const parameter = yield* elaborateValueType(fn.parameter);
          const effects = yield* normalizeEffectRow(fn.effects);
          const result = yield* elaborateComputationType(fn.result);
          return { tag: "function" as const, parameter, grade: fn.grade, effects, result };
        }),
    }),
  );

const elaborateValue = (
  value: SurfaceValue,
  context: ElaborationContext,
): Effect.Effect<KernelValueTerm, SurfaceElaborationError> =>
  Match.value(value).pipe(
    Match.tagsExhaustive({
      Variable: (variable) =>
        Effect.map(valueDistance(variable.name, context), (distance) => ({
          tag: "bound-value" as const,
          distance,
        })),
      ResumptionValue: (resumption) =>
        Effect.map(resumptionDistance(resumption.name, context), (distance) => ({
          tag: "resumption" as const,
          distance,
        })),
      Unit: () => Effect.succeed({ tag: "unit" as const }),
      Bool: (bool) => Effect.succeed({ tag: "bool" as const, value: bool.value }),
      Int: (int) => Effect.succeed({ tag: "int" as const, value: int.value }),
      Pair: (pair) =>
        Effect.gen(function* () {
          const first = yield* elaborateValue(pair.first, context);
          const second = yield* elaborateValue(pair.second, context);
          return { tag: "pair" as const, first, second };
        }),
      Thunk: (thunk) =>
        Effect.map(elaborateComputation(thunk.body, context), (body) => ({
          tag: "thunk" as const,
          body,
        })),
    }),
  );

const elaborateComputation = (
  computation: SurfaceComputation,
  context: ElaborationContext,
): Effect.Effect<KernelComputationTerm, SurfaceElaborationError> =>
  Match.value(computation).pipe(
    Match.tagsExhaustive({
      Return: (returned) =>
        Effect.map(elaborateValue(returned.value, context), (value) => ({
          tag: "return" as const,
          grade: returned.grade,
          value,
        })),
      Let: (letTerm) =>
        Effect.gen(function* () {
          const bound = yield* elaborateComputation(letTerm.bound, context);
          const bodyContext = yield* extend(context, letTerm.binder, "value");
          const body = yield* elaborateComputation(letTerm.body, bodyContext);
          return { tag: "let" as const, bound, body };
        }),
      Force: (force) =>
        Effect.map(elaborateValue(force.value, context), (value) => ({
          tag: "force" as const,
          value,
        })),
      Lambda: (lambda) =>
        Effect.gen(function* () {
          const parameter_type = yield* elaborateValueType(lambda.parameterType);
          const bodyContext = yield* extend(context, lambda.binder, "value");
          const body = yield* elaborateComputation(lambda.body, bodyContext);
          return { tag: "lambda" as const, parameter_type, grade: lambda.grade, body };
        }),
      Apply: (apply) =>
        Effect.gen(function* () {
          const inner = yield* elaborateComputation(apply.computation, context);
          const argument = yield* elaborateValue(apply.argument, context);
          return { tag: "apply" as const, computation: inner, argument };
        }),
      Operation: (operation) =>
        Effect.map(elaborateValue(operation.argument, context), (argument) => ({
          tag: "operation" as const,
          grade: operation.grade,
          label: operation.label.text,
          operation: operation.operation.text,
          argument,
        })),
      Handle: (handle) =>
        Effect.gen(function* () {
          const inner = yield* elaborateComputation(handle.computation, context);
          const returnContext = yield* extend(context, handle.returnClause.binder, "value");
          const returnBody = yield* elaborateComputation(handle.returnClause.body, returnContext);

          const seen = new Set<string>();
          const clauses: Array<{
            readonly operation: string;
            readonly body: KernelComputationTerm;
          }> = [];
          for (const clause of handle.operationClauses) {
            if (seen.has(clause.operation.text)) {
              return yield* elaborationFailure(
                "surface.elaboration.duplicate-handler-clause",
                `handler repeats operation clause ${JSON.stringify(clause.operation.text)}`,
                clause.operation.span,
              );
            }
            seen.add(clause.operation.text);
            const withArgument = yield* extend(context, clause.argumentBinder, "value");
            const clauseContext = yield* extend(
              withArgument,
              clause.resumptionBinder,
              "resumption",
            );
            const body = yield* elaborateComputation(clause.body, clauseContext);
            clauses.push({ operation: clause.operation.text, body });
          }
          clauses.sort((left, right) => compareCodePoints(left.operation, right.operation));
          return {
            tag: "handle" as const,
            label: handle.label.text,
            computation: inner,
            return_clause: { body: returnBody },
            operation_clauses: clauses,
          };
        }),
      Resume: (resume) =>
        Effect.gen(function* () {
          const resumption_distance = yield* resumptionDistance(resume.resumption, context);
          const value = yield* elaborateValue(resume.value, context);
          return { tag: "resume" as const, resumption_distance, value };
        }),
    }),
  );

const elaborateSignature = (
  document: SurfaceDocument,
): Effect.Effect<ReadonlyArray<KernelSignatureOperation>, SurfaceElaborationError> =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    const signature: Array<KernelSignatureOperation> = [];
    for (const declaration of document.signature) {
      const key = `${declaration.label.text}\u0000${declaration.operation.text}`;
      if (seen.has(key)) {
        return yield* elaborationFailure(
          "surface.elaboration.duplicate-signature-operation",
          `signature repeats ${declaration.label.text}.${declaration.operation.text}`,
          declaration.span,
        );
      }
      seen.add(key);
      const argument_type = yield* elaborateValueType(declaration.argumentType);
      const result_type = yield* elaborateValueType(declaration.resultType);
      signature.push({
        label: declaration.label.text,
        operation: declaration.operation.text,
        argument_type,
        result_type,
      });
    }
    signature.sort(
      (left, right) =>
        compareCodePoints(left.label, right.label) ||
        compareCodePoints(left.operation, right.operation),
    );
    return signature;
  });

export const elaborateSurfaceDocument = (
  document: SurfaceDocument,
): Effect.Effect<KernelDocument, SurfaceElaborationError | SurfaceKernelBoundaryError> =>
  Effect.gen(function* () {
    if (!hasSurfaceDocumentCustody(document)) {
      return yield* new SurfaceElaborationError({
        phase: "elaboration",
        code: "surface.elaboration.uncustodied-ast",
        message: "elaboration requires a SurfaceDocument returned by parseSurfaceDocument",
        span: { start: 0, end: 0 },
      });
    }
    const signature = yield* elaborateSignature(document);
    const program = yield* elaborateComputation(document.program, emptyContext);
    const decoded = decodeKernelDocumentValue({
      format: "semantic.kernel-json",
      version: 1,
      kernel: document.kernel,
      signature,
      program,
    });
    if (decoded.status === "rejected") {
      return yield* new SurfaceKernelBoundaryError({
        phase: "kernel-boundary",
        code: "surface.kernel-boundary.rejected",
        message: "the strict semantic.kernel-json boundary rejected the elaborated document",
        span: document.span,
        diagnostics: decoded.diagnostics,
      });
    }
    return decoded.value;
  });

export interface SurfaceCompilation {
  readonly surface: SurfaceDocument;
  readonly kernel: KernelDocument;
  readonly check: KernelCheckObservation;
}

export const compileParsedSurfaceDocument = (
  surface: SurfaceDocument,
): Effect.Effect<SurfaceCompilation, SurfaceElaborationError | SurfaceKernelBoundaryError> =>
  Effect.gen(function* () {
    const kernel = yield* elaborateSurfaceDocument(surface);
    const check = checkKernelDocument(kernel);
    return Object.freeze({ surface, kernel, check });
  });
