import { contentIdentity } from "./canonical.ts";
import { sha256Hex } from "./hash-provider.ts";
import {
  ARTIFACT_KIND_EVIDENCE_RESULT,
  EVIDENCE_CATEGORY,
  EVIDENCE_RESULT_SCHEMA_VERSION,
} from "./policy-contract.ts";
import type { CaseResult, JsonObject, JsonValue } from "./shared-types.ts";

/**
 * Canonical fixtures for the declarative shared-policy experiment's test
 * suite. Not part of either `production.ts` or `checker.ts`'s measured
 * closure — `classifier.ts` never walks this file. It independently
 * recomputes theory/realization identity (mirroring, not importing,
 * `production.ts`'s/`checker.ts`'s own copies of that exclusion rule) purely
 * so it can construct internally self-consistent fixture documents; any two
 * structurally-equal JSON payloads hash identically regardless of key
 * order because `canonical.ts` sorts keys before hashing, so this
 * independent recomputation is guaranteed to agree with both sides'.
 *
 * The nine case IDs and the pure/broken 9-of-9 vs 7-of-9 split (with named
 * counterexamples `insufficient-stock`/`missing-stock-is-zero`) are adapted
 * — not imported — from `examples/inventory/evidence/conformance-v0.json`
 * and `model/evidence/inventory-tracer.json`.
 */

export const THEORY_ID = "theory.inventory.experiment";

export const THEORY_DOCUMENT: JsonObject = {
  id: THEORY_ID,
  obligations: [{ id: "obligation.inventory.conformance" }],
  laws: ["reserve conserves total stock", "release restores reserved stock"],
};

export const PURE_REALIZATION_ID = "realization.inventory.pure";
export const BROKEN_REALIZATION_ID = "realization.inventory.broken";

const realizationDocument = (id: string, transition: string): JsonObject => ({
  id,
  name: `Inventory realization (${transition})`,
  theory: THEORY_ID,
  representation: { Quantity: "integer", State: "immutable JSON-compatible maps" },
  operations: { replay: "inventory.replay.v0", transition },
  assumptions: [
    "Operation binding names are interpreted by the in-process TypeScript builtin registry.",
  ],
});

export const PURE_REALIZATION_DOCUMENT: JsonObject = realizationDocument(
  PURE_REALIZATION_ID,
  "inventory.reference.v0",
);
export const BROKEN_REALIZATION_DOCUMENT: JsonObject = realizationDocument(
  BROKEN_REALIZATION_ID,
  "inventory.broken-ignore-stock.v0",
);

export const DEVELOPMENT_POLICY_DOCUMENT: JsonObject = {
  id: "policy.inventory.development",
  requirements: {
    "obligation.inventory.conformance": {
      accepted_categories: ["example_test"],
      allow_assumptions: true,
    },
  },
  ambiguity: "reject",
};

export const HIGH_ASSURANCE_POLICY_DOCUMENT: JsonObject = {
  id: "policy.inventory.high-assurance",
  requirements: {
    "obligation.inventory.conformance": {
      accepted_categories: ["proof"],
      allow_assumptions: false,
    },
  },
  ambiguity: "reject",
};

export const NINE_CASE_IDS: ReadonlyArray<string> = [
  "reserve-and-release",
  "insufficient-stock",
  "invalid-zero-quantity",
  "unknown-release",
  "reserve-exact-boundary",
  "duplicate-fresh-identifier",
  "missing-stock-is-zero",
  "invalid-negative-quantity",
  "release-twice",
];

export const BROKEN_COUNTEREXAMPLES: ReadonlyArray<string> = [
  "insufficient-stock",
  "missing-stock-is-zero",
];

// --- Independent identity recomputation, purely for fixture construction ---

export const theoryIdentityOf = (document: JsonObject): string =>
  contentIdentity(
    sha256Hex,
    Object.fromEntries(Object.entries(document).filter(([key]) => key !== "id")),
  );

const REALIZATION_DISPLAY_KEYS = new Set(["id", "name", "theory"]);
export const realizationIdentityOf = (document: JsonObject, theoryIdentity: string): string =>
  contentIdentity(sha256Hex, {
    theory_identity: theoryIdentity,
    ...Object.fromEntries(
      Object.entries(document).filter(([key]) => !REALIZATION_DISPLAY_KEYS.has(key)),
    ),
  });

const caseResultJson = (result: CaseResult): JsonObject => ({
  case_id: result.caseId,
  passed: result.passed,
  detail: result.detail,
});

export const caseResultsFor = (failingCaseIds: ReadonlyArray<string>): ReadonlyArray<CaseResult> =>
  NINE_CASE_IDS.map(
    (caseId): CaseResult =>
      failingCaseIds.includes(caseId)
        ? { caseId, passed: false, detail: { reason: "counterexample" } }
        : { caseId, passed: true, detail: null },
  );

export interface EvidenceFields {
  readonly producer: JsonObject;
  readonly recipeIdentity: string;
  readonly theoryIdentity: string;
  readonly realizationIdentity: string;
  readonly obligation: string;
  readonly assumptions: ReadonlyArray<string>;
  readonly caseResults: ReadonlyArray<CaseResult>;
}

const evidenceIdentityPayload = (fields: EvidenceFields): JsonObject => ({
  artifact_kind: ARTIFACT_KIND_EVIDENCE_RESULT,
  schema_version: EVIDENCE_RESULT_SCHEMA_VERSION,
  category: EVIDENCE_CATEGORY,
  producer: fields.producer,
  recipe_identity: fields.recipeIdentity,
  theory_identity: fields.theoryIdentity,
  realization_identity: fields.realizationIdentity,
  obligation: fields.obligation,
  assumptions: fields.assumptions,
  case_results: fields.caseResults.map(caseResultJson),
});

/** Builds a self-consistent serialized `evidence_result_v1` JSON envelope:
 * its `identity`/`passed`/`total_cases`/`passed_cases`/`counterexamples`
 * are honestly derived from `fields.caseResults`, exactly like a genuine
 * producer would emit (never hand-set to a lie unless a test explicitly
 * overrides the returned object afterwards). */
export const buildEvidenceJson = (fields: EvidenceFields): JsonObject => {
  const identity = contentIdentity(sha256Hex, evidenceIdentityPayload(fields));
  const passed = fields.caseResults.length > 0 && fields.caseResults.every((item) => item.passed);
  const counterexamples = fields.caseResults.filter((item) => !item.passed).map(caseResultJson);
  return {
    artifact_kind: ARTIFACT_KIND_EVIDENCE_RESULT,
    schema_version: EVIDENCE_RESULT_SCHEMA_VERSION,
    identity,
    category: EVIDENCE_CATEGORY,
    producer: fields.producer,
    recipe_identity: fields.recipeIdentity,
    theory_identity: fields.theoryIdentity,
    realization_identity: fields.realizationIdentity,
    obligation: fields.obligation,
    assumptions: fields.assumptions,
    case_results: fields.caseResults.map(caseResultJson),
    passed,
    total_cases: fields.caseResults.length,
    passed_cases: fields.caseResults.filter((item) => item.passed).length,
    counterexamples,
  };
};

export const buildOkOutcomeEnvelope = (
  realizationId: string,
  realizationIdentity: string,
  evidenceJson: JsonObject,
): JsonObject => ({
  ok: true,
  realization_id: realizationId,
  realization_identity: realizationIdentity,
  evidence: evidenceJson,
  diagnostic: null,
});

export const buildDiagnosticOutcomeEnvelope = (
  realizationId: string,
  realizationIdentity: string,
  kind: string,
  message: string,
): JsonObject => ({
  ok: false,
  realization_id: realizationId,
  realization_identity: realizationIdentity,
  evidence: null,
  diagnostic: { kind, message },
});

export const OBLIGATION = "obligation.inventory.conformance";
export const RECIPE_IDENTITY = "sha256:fixture-recipe-v0";
export const PRODUCER = { id: "producer.experiment", version: "0.1.0" };

export interface StandardFixture {
  readonly theoryIdentity: string;
  readonly pureRealizationIdentity: string;
  readonly brokenRealizationIdentity: string;
  readonly pureEvidenceJson: JsonObject;
  readonly brokenEvidenceJson: JsonObject;
  readonly pureOutcomeEnvelope: JsonObject;
  readonly brokenOutcomeEnvelope: JsonObject;
}

/** The standard positive fixture: pure realization passes all nine cases,
 * broken realization fails exactly the two canonical counterexamples. */
export const standardFixture = (): StandardFixture => {
  const theoryIdentity = theoryIdentityOf(THEORY_DOCUMENT);
  const pureRealizationIdentity = realizationIdentityOf(PURE_REALIZATION_DOCUMENT, theoryIdentity);
  const brokenRealizationIdentity = realizationIdentityOf(
    BROKEN_REALIZATION_DOCUMENT,
    theoryIdentity,
  );
  const pureEvidenceJson = buildEvidenceJson({
    producer: PRODUCER,
    recipeIdentity: RECIPE_IDENTITY,
    theoryIdentity,
    realizationIdentity: pureRealizationIdentity,
    obligation: OBLIGATION,
    assumptions: [],
    caseResults: caseResultsFor([]),
  });
  const brokenEvidenceJson = buildEvidenceJson({
    producer: PRODUCER,
    recipeIdentity: RECIPE_IDENTITY,
    theoryIdentity,
    realizationIdentity: brokenRealizationIdentity,
    obligation: OBLIGATION,
    assumptions: [],
    caseResults: caseResultsFor(BROKEN_COUNTEREXAMPLES),
  });
  return {
    theoryIdentity,
    pureRealizationIdentity,
    brokenRealizationIdentity,
    pureEvidenceJson,
    brokenEvidenceJson,
    pureOutcomeEnvelope: buildOkOutcomeEnvelope(
      PURE_REALIZATION_ID,
      pureRealizationIdentity,
      pureEvidenceJson,
    ),
    brokenOutcomeEnvelope: buildOkOutcomeEnvelope(
      BROKEN_REALIZATION_ID,
      brokenRealizationIdentity,
      brokenEvidenceJson,
    ),
  };
};

export const deepClone = <T extends JsonValue>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
