import { Effect, Option, type Crypto } from "effect";
import { contentIdentity } from "./canonical.ts";
import { runConformance } from "./evidence.ts";
import { DocumentError, type JsonObject } from "./json.ts";
import { resolveReplay, resolveTransition } from "./operations.ts";
import {
  finalizeEvidenceResult,
  PACKET_SCHEMA_VERSION,
  PRODUCER_DIAGNOSTIC_KIND,
  type ProducerDiagnostic,
  type ProducerOutcome,
} from "./packets.ts";
import { operationBinding, type Realization } from "./realization.ts";
import {
  REASON_EVIDENCE_AMBIGUOUS,
  REASON_EVIDENCE_OBLIGATION_MISMATCH,
  REASON_EVIDENCE_STALE,
  REASON_MISSING_EVIDENCE,
  REASON_OPERATION_UNBOUND,
} from "./reasons.ts";
import type { Theory } from "./theory.ts";

const diagnostic = (
  theory: Theory,
  realization: Realization,
  reasonCode: string,
  detail: JsonObject | null = null,
): ProducerDiagnostic => ({
  artifactKind: PRODUCER_DIAGNOSTIC_KIND,
  schemaVersion: PACKET_SCHEMA_VERSION,
  theoryIdentity: theory.identity,
  realizationIdentity: realization.identity,
  reasonCode,
  detail,
});

const produceForRealization = (
  theory: Theory,
  theoryId: string,
  obligation: string,
  realization: Realization,
  suites: ReadonlyArray<JsonObject>,
): Effect.Effect<ProducerOutcome, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const matching = suites.filter((suite) => suite.theory === theoryId);
    if (matching.length === 0) {
      return diagnostic(theory, realization, REASON_MISSING_EVIDENCE);
    }
    if (matching.length > 1) {
      return diagnostic(theory, realization, REASON_EVIDENCE_AMBIGUOUS, {
        matching_recipes: matching.length,
      });
    }
    const suite = matching[0]!;
    if (suite.theory_identity !== theory.identity) {
      return diagnostic(theory, realization, REASON_EVIDENCE_STALE);
    }
    if (suite.obligation !== obligation) {
      return diagnostic(theory, realization, REASON_EVIDENCE_OBLIGATION_MISMATCH);
    }

    const operations = yield* Effect.try({
      try: () => ({
        transition: resolveTransition(operationBinding(realization.document, "transition")),
        replay: resolveReplay(operationBinding(realization.document, "replay")),
      }),
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot bind conformance operations", cause }),
    }).pipe(Effect.option);
    if (Option.isNone(operations)) {
      return diagnostic(theory, realization, REASON_OPERATION_UNBOUND);
    }

    const recipeIdentity = yield* contentIdentity(suite);
    const result = yield* Effect.try({
      try: () =>
        runConformance(
          theory,
          realization,
          suite,
          recipeIdentity,
          operations.value.transition,
          operations.value.replay,
        ),
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "conformance production failed", cause }),
    });
    return yield* finalizeEvidenceResult(result);
  });

export const produceEvidence = (
  theory: Theory,
  theoryId: string,
  obligation: string,
  realizations: ReadonlyArray<Realization>,
  suites: ReadonlyArray<JsonObject>,
): Effect.Effect<ReadonlyArray<ProducerOutcome>, DocumentError, Crypto.Crypto> => {
  const distinctSubjects = [
    ...new Map(realizations.map((realization) => [realization.identity, realization])).values(),
  ];
  return Effect.forEach(distinctSubjects, (realization) =>
    produceForRealization(theory, theoryId, obligation, realization, suites),
  );
};
