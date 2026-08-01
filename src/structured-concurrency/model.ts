/** Public Effect boundary and canonical comparison for structured concurrency. */
import { Effect, Exit, Schema } from "effect";
import { canonicalBytes, type CanonicalJsonValue } from "../normalized-core/canonical.ts";
import { runStructuredConcurrencyEffect } from "./effect-adapter.ts";
import { runStructuredConcurrencyOracle } from "./oracle.ts";
import {
  boundedDiagnostic,
  deepFreeze,
  StructuredConcurrencyFailure,
  StructuredConcurrencyReportSchema,
  StructuredConcurrencyScriptSchema,
  structuredConcurrencyFailure,
  structuredConcurrencyUnsupportedClaims,
  type StructuredConcurrencyReport,
  type StructuredConcurrencyRun,
  type StructuredConcurrencyScript,
} from "./schema.ts";

const bytes = (value: unknown): Uint8Array => canonicalBytes(value as CanonicalJsonValue);

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const equalCanonical = (left: unknown, right: unknown): boolean =>
  equalBytes(bytes(left), bytes(right));

const decodeScript = (
  input: unknown,
): Effect.Effect<StructuredConcurrencyScript, StructuredConcurrencyFailure> =>
  Schema.decodeUnknownEffect(StructuredConcurrencyScriptSchema, {
    onExcessProperty: "error",
  })(input).pipe(
    Effect.mapError(
      (cause) =>
        new StructuredConcurrencyFailure({
          code: "script.representation-rejected",
          event_index: null,
          path: "$",
          message: boundedDiagnostic(`structured concurrency script rejected: ${cause.message}`),
        }),
    ),
    Effect.map((script) => deepFreeze(structuredClone(script))),
  );

const assembleReport = (
  script: StructuredConcurrencyScript,
  reference: StructuredConcurrencyRun,
  effect: StructuredConcurrencyRun,
): StructuredConcurrencyReport | StructuredConcurrencyFailure => {
  if (!equalCanonical(reference, effect)) {
    return structuredConcurrencyFailure(
      "comparison.mismatch",
      null,
      "$",
      "pure and Effect structured-concurrency observations differ",
    );
  }
  return deepFreeze({
    format: "semantic.structured-concurrency-report",
    version: 1,
    script,
    reference,
    effect,
    comparison: {
      canonical_equal: true,
      scope_ledger_equal: true,
      task_ledger_equal: true,
      trace_equal: true,
      laws_equal: true,
    },
    replay: {
      schedule: "script-dispatches",
      external_observations: "unsupported",
    },
    unsupported_claims: [...structuredConcurrencyUnsupportedClaims],
  });
};

const traceDecoded = (
  script: StructuredConcurrencyScript,
): Effect.Effect<StructuredConcurrencyReport, StructuredConcurrencyFailure> => {
  const reference = runStructuredConcurrencyOracle(script);
  if (reference instanceof StructuredConcurrencyFailure) return Effect.fail(reference);
  return runStructuredConcurrencyEffect(script).pipe(
    Effect.flatMap((effect) => {
      const report = assembleReport(script, reference, effect);
      return report instanceof StructuredConcurrencyFailure
        ? Effect.fail(report)
        : Effect.succeed(report);
    }),
  );
};

export const traceStructuredConcurrency = (
  input: unknown,
): Effect.Effect<StructuredConcurrencyReport, StructuredConcurrencyFailure> =>
  Effect.flatMap(decodeScript(input), traceDecoded);

export const decodeStructuredConcurrencyReport = (
  input: unknown,
): Effect.Effect<StructuredConcurrencyReport, StructuredConcurrencyFailure> =>
  Schema.decodeUnknownEffect(StructuredConcurrencyReportSchema, {
    onExcessProperty: "error",
  })(input).pipe(
    Effect.mapError(
      (cause) =>
        new StructuredConcurrencyFailure({
          code: "report.representation-rejected",
          event_index: null,
          path: "$",
          message: boundedDiagnostic(`structured concurrency report rejected: ${cause.message}`),
        }),
    ),
    Effect.flatMap((decoded) =>
      traceDecoded(deepFreeze(structuredClone(decoded.script))).pipe(
        Effect.flatMap((expected) =>
          equalCanonical(decoded, expected)
            ? Effect.succeed(expected)
            : Effect.fail(
                structuredConcurrencyFailure(
                  "report.derived-fields-mismatch",
                  null,
                  "$",
                  "report does not equal the structured-concurrency comparison derived from its script",
                ),
              ),
        ),
      ),
    ),
  );

export const encodeStructuredConcurrencyReport = (
  report: StructuredConcurrencyReport,
): Uint8Array => {
  const decoded = Schema.decodeUnknownExit(StructuredConcurrencyReportSchema, {
    onExcessProperty: "error",
  })(report);
  if (Exit.isFailure(decoded)) {
    throw new TypeError("expected a strict semantic.structured-concurrency-report/v1 value");
  }
  if (!equalCanonical(decoded.value.reference, decoded.value.effect)) {
    throw new TypeError("structured-concurrency report realizations differ");
  }
  return bytes(decoded.value);
};

export { runStructuredConcurrencyEffect, runStructuredConcurrencyOracle };
