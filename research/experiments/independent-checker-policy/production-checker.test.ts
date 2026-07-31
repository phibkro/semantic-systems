import { describe, expect, test } from "bun:test";
import { compareToCanonicalRecord, type CanonicalRecord } from "./canonical-binding-adapter.ts";
import { compare, type CheckerRequest } from "./checker.ts";
import {
  BROKEN_COUNTEREXAMPLES,
  BROKEN_REALIZATION_DOCUMENT,
  BROKEN_REALIZATION_ID,
  DEVELOPMENT_POLICY_DOCUMENT,
  HIGH_ASSURANCE_POLICY_DOCUMENT,
  NINE_CASE_IDS,
  OBLIGATION,
  PRODUCER,
  PURE_REALIZATION_DOCUMENT,
  PURE_REALIZATION_ID,
  RECIPE_IDENTITY,
  THEORY_DOCUMENT,
  THEORY_ID,
  buildEvidenceJson,
  buildOkOutcomeEnvelope,
  caseResultsFor,
  deepClone,
  realizationIdentityOf,
  standardFixture,
  theoryIdentityOf,
  type StandardFixture,
} from "./fixtures.ts";
import { sha256Hex } from "./hash-provider.ts";
import { adjudicate, claimToJson, type ProductionRequest } from "./production.ts";
import type { CheckerReport, JsonObject } from "./shared-types.ts";

const REALIZATIONS: ReadonlyArray<JsonObject> = [
  PURE_REALIZATION_DOCUMENT,
  BROKEN_REALIZATION_DOCUMENT,
];

const productionRequest = (
  fixture: StandardFixture,
  policyDocument: JsonObject,
  overrides: Partial<ProductionRequest> = {},
): ProductionRequest => ({
  theoryId: THEORY_ID,
  theoryDocument: THEORY_DOCUMENT,
  realizationDocuments: REALIZATIONS,
  policyDocument,
  outcomeEnvelopes: [fixture.pureOutcomeEnvelope, fixture.brokenOutcomeEnvelope],
  ...overrides,
});

const checkerRequest = (
  fixture: StandardFixture,
  policyDocument: JsonObject,
  claimDocument: JsonObject,
  overrides: Partial<CheckerRequest> = {},
): CheckerRequest => ({
  theoryId: THEORY_ID,
  theoryDocument: THEORY_DOCUMENT,
  realizationDocuments: REALIZATIONS,
  policyDocument,
  outcomeEnvelopes: [fixture.pureOutcomeEnvelope, fixture.brokenOutcomeEnvelope],
  claimDocument,
  ...overrides,
});

const developmentClaim = (fixture: StandardFixture): JsonObject =>
  claimToJson(adjudicate(productionRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT), sha256Hex));

const highAssuranceClaim = (fixture: StandardFixture): JsonObject =>
  claimToJson(adjudicate(productionRequest(fixture, HIGH_ASSURANCE_POLICY_DOCUMENT), sha256Hex));

const findCandidate = (claim: JsonObject, realizationId: string): JsonObject =>
  (claim.candidates as ReadonlyArray<JsonObject>).find(
    (item) => (item.realization as JsonObject).id === realizationId,
  )!;

const withCandidate = (
  claim: JsonObject,
  realizationId: string,
  patch: (candidate: JsonObject) => JsonObject,
): JsonObject => ({
  ...claim,
  candidates: (claim.candidates as ReadonlyArray<JsonObject>).map((item) =>
    (item.realization as JsonObject).id === realizationId ? patch(item) : item,
  ),
});

const withReversedReasonCodes = (candidate: JsonObject): JsonObject => {
  const reversed = [...(candidate.reason_codes as ReadonlyArray<string>)].reverse();
  return Object.assign({}, candidate, { reason_codes: reversed });
};

const sortedViolations = (
  report: CheckerReport,
): ReadonlyArray<CheckerReport["violations"][number]> =>
  [...report.violations].sort((left, right) =>
    left.code + left.subject < right.code + right.subject ? -1 : 1,
  );

describe("positive path", () => {
  test("development policy selects the pure realization; checker reports valid", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    expect(claim.status).toBe("selected");
    expect((claim.selected as JsonObject).id).toBe(PURE_REALIZATION_ID);
    const report = compare(checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, claim), sha256Hex);
    expect(report.valid).toBeTrue();
    expect(report.violations).toEqual([]);
    expect(report.recomputedStatus).toBe("selected");
    expect(report.recomputedSelected).toEqual({
      id: PURE_REALIZATION_ID,
      identity: fixture.pureRealizationIdentity,
    });
    expect(report.modelBinding).toBe("not_checked");
  });

  test("high-assurance policy rejects both realizations (category not accepted); checker reports valid rejection", () => {
    const fixture = standardFixture();
    const claim = highAssuranceClaim(fixture);
    expect(claim.status).toBe("rejected");
    expect(claim.selected).toBeNull();
    expect(claim.selected_assumptions).toEqual([]);
    const report = compare(
      checkerRequest(fixture, HIGH_ASSURANCE_POLICY_DOCUMENT, claim),
      sha256Hex,
    );
    expect(report.valid).toBeTrue();
    expect(report.recomputedStatus).toBe("rejected");
    expect(report.recomputedSelected).toBeNull();
  });

  test("reversed candidate and reason-code presentation order normalizes to an identical checker verdict", () => {
    const fixture = standardFixture();
    const claim = highAssuranceClaim(fixture);
    // Under high-assurance, the broken candidate carries two reasons
    // (category not accepted AND conformance failed) — a genuine
    // multi-element reason set to reorder.
    const brokenReasons = findCandidate(claim, BROKEN_REALIZATION_ID)
      .reason_codes as ReadonlyArray<string>;
    expect(brokenReasons.length).toBeGreaterThan(1);
    const reordered: JsonObject = {
      ...claim,
      candidates: [...(claim.candidates as ReadonlyArray<JsonObject>)]
        .reverse()
        .map(withReversedReasonCodes),
    };
    const forward = compare(
      checkerRequest(fixture, HIGH_ASSURANCE_POLICY_DOCUMENT, claim),
      sha256Hex,
    );
    const reversed = compare(
      checkerRequest(fixture, HIGH_ASSURANCE_POLICY_DOCUMENT, reordered),
      sha256Hex,
    );
    expect(reversed.valid).toBe(forward.valid);
    expect(sortedViolations(reversed)).toEqual(sortedViolations(forward));
  });

  test("two distinct authored realization IDs sharing one content identity remain distinct and produce ambiguity", () => {
    const fixture = standardFixture();
    const pureCopyDocument: JsonObject = {
      ...PURE_REALIZATION_DOCUMENT,
      id: "realization.inventory.pure-copy",
      name: "Second lawful pure realization",
    };
    const pureCopyIdentity = realizationIdentityOf(pureCopyDocument, fixture.theoryIdentity);
    expect(pureCopyIdentity).toBe(fixture.pureRealizationIdentity);
    const pureCopyEvidence = buildEvidenceJson({
      producer: PRODUCER,
      recipeIdentity: RECIPE_IDENTITY,
      theoryIdentity: fixture.theoryIdentity,
      realizationIdentity: pureCopyIdentity,
      obligation: OBLIGATION,
      assumptions: [],
      caseResults: caseResultsFor([]),
    });
    const request: ProductionRequest = {
      theoryId: THEORY_ID,
      theoryDocument: THEORY_DOCUMENT,
      realizationDocuments: [PURE_REALIZATION_DOCUMENT, pureCopyDocument],
      policyDocument: DEVELOPMENT_POLICY_DOCUMENT,
      outcomeEnvelopes: [
        fixture.pureOutcomeEnvelope,
        buildOkOutcomeEnvelope(
          "realization.inventory.pure-copy",
          pureCopyIdentity,
          pureCopyEvidence,
        ),
      ],
    };
    const claim = claimToJson(adjudicate(request, sha256Hex));
    expect(claim.status).toBe("rejected");
    expect(claim.selected).toBeNull();
    const candidateIds = (claim.candidates as ReadonlyArray<JsonObject>).map(
      (item) => (item.realization as JsonObject).id,
    );
    expect(candidateIds).toEqual(["realization.inventory.pure", "realization.inventory.pure-copy"]);
    const report = compare(
      {
        theoryId: THEORY_ID,
        theoryDocument: THEORY_DOCUMENT,
        realizationDocuments: [PURE_REALIZATION_DOCUMENT, pureCopyDocument],
        policyDocument: DEVELOPMENT_POLICY_DOCUMENT,
        outcomeEnvelopes: request.outcomeEnvelopes,
        claimDocument: claim,
      },
      sha256Hex,
    );
    expect(report.valid).toBeTrue();
    expect(report.recomputedStatus).toBe("rejected");
  });
});

describe("evidence packet coverage rejections", () => {
  test("missing evidence packet rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, claim, {
        outcomeEnvelopes: [fixture.pureOutcomeEnvelope],
      }),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "missing_evidence_packet")).toBeTrue();
  });

  test("duplicate evidence packet rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, claim, {
        outcomeEnvelopes: [
          fixture.pureOutcomeEnvelope,
          fixture.pureOutcomeEnvelope,
          fixture.brokenOutcomeEnvelope,
        ],
      }),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "duplicate_evidence_packet")).toBeTrue();
  });

  test("foreign (unconsumed) evidence packet rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const foreignEvidence = buildEvidenceJson({
      producer: PRODUCER,
      recipeIdentity: RECIPE_IDENTITY,
      theoryIdentity: fixture.theoryIdentity,
      realizationIdentity: "sha256:foreign-realization",
      obligation: OBLIGATION,
      assumptions: [],
      caseResults: caseResultsFor([]),
    });
    const foreignEnvelope = buildOkOutcomeEnvelope(
      "realization.unknown",
      "sha256:foreign-realization",
      foreignEvidence,
    );
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, claim, {
        outcomeEnvelopes: [
          fixture.pureOutcomeEnvelope,
          fixture.brokenOutcomeEnvelope,
          foreignEnvelope,
        ],
      }),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "foreign_evidence_packet")).toBeTrue();
  });

  test("malformed evidence packet (empty case_results) rejects as malformed_authored_input", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const malformedOutcome: JsonObject = {
      ...(fixture.pureOutcomeEnvelope as JsonObject),
      evidence: { ...(fixture.pureEvidenceJson as JsonObject), case_results: [] },
    };
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, claim, {
        outcomeEnvelopes: [malformedOutcome, fixture.brokenOutcomeEnvelope],
      }),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "malformed_authored_input")).toBeTrue();
  });
});

describe("stale claim-field rejections (all producer identities otherwise fresh)", () => {
  test("stale theory ID rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated = { ...claim, theory: { ...(claim.theory as JsonObject), id: "theory.other" } };
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "theory_id_stale")).toBeTrue();
  });

  test("stale theory identity rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated = {
      ...claim,
      theory: { ...(claim.theory as JsonObject), identity: "sha256:stale" },
    };
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "theory_identity_stale")).toBeTrue();
  });

  test("stale required_obligation rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated = { ...claim, required_obligation: "obligation.other" };
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "required_obligation_stale")).toBeTrue();
  });

  test("stale policy ID rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated = { ...claim, policy: { ...(claim.policy as JsonObject), id: "policy.other" } };
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "policy_id_stale")).toBeTrue();
  });

  test("stale policy content identity rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated = {
      ...claim,
      policy: { ...(claim.policy as JsonObject), content_identity: "sha256:stale" },
    };
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(
      report.violations.some((item) => item.code === "policy_content_identity_stale"),
    ).toBeTrue();
  });

  test("stale candidate realization identity rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated = withCandidate(claim, PURE_REALIZATION_ID, (candidate) => ({
      ...candidate,
      realization: { ...(candidate.realization as JsonObject), identity: "sha256:stale" },
    }));
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(
      report.violations.some((item) => item.code === "candidate_realization_identity_stale"),
    ).toBeTrue();
  });

  test("recipe identity not propagated from the actual producer outcome rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const rebadgedEvidence = buildEvidenceJson({
      producer: PRODUCER,
      recipeIdentity: "sha256:a-different-recipe",
      theoryIdentity: fixture.theoryIdentity,
      realizationIdentity: fixture.pureRealizationIdentity,
      obligation: OBLIGATION,
      assumptions: [],
      caseResults: caseResultsFor([]),
    });
    const mutated = withCandidate(claim, PURE_REALIZATION_ID, (candidate) => ({
      ...candidate,
      evidence: rebadgedEvidence,
    }));
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(
      report.violations.some((item) => item.code === "recipe_identity_not_propagated"),
    ).toBeTrue();
  });

  test("stale evidence aggregate (passed_cases) rejects as malformed_claim", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated = withCandidate(claim, PURE_REALIZATION_ID, (candidate) => ({
      ...candidate,
      evidence: { ...(candidate.evidence as JsonObject), passed_cases: 1 },
    }));
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "malformed_claim")).toBeTrue();
  });

  test("stale embedded evidence result identity rejects as malformed_claim", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated = withCandidate(claim, PURE_REALIZATION_ID, (candidate) => ({
      ...candidate,
      evidence: { ...(candidate.evidence as JsonObject), identity: "sha256:stale-identity" },
    }));
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "malformed_claim")).toBeTrue();
  });

  test("stale selected subject rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated = {
      ...claim,
      selected: { id: BROKEN_REALIZATION_ID, identity: fixture.brokenRealizationIdentity },
    };
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "selected_stale")).toBeTrue();
  });

  test("stale selected_assumptions projection rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated = { ...claim, selected_assumptions: [] };
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "selected_assumptions_stale")).toBeTrue();
  });

  test("changed eligibility and reason set reject after every producer-owned identity is otherwise fresh", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated: JsonObject = withCandidate(claim, BROKEN_REALIZATION_ID, (candidate) => ({
      ...candidate,
      eligible: true,
      reason_codes: [],
    }));
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "eligibility_stale")).toBeTrue();
  });

  test("a changed reason set alone (eligibility left correct) rejects", () => {
    const fixture = standardFixture();
    const claim = developmentClaim(fixture);
    const mutated: JsonObject = withCandidate(claim, BROKEN_REALIZATION_ID, (candidate) => ({
      ...candidate,
      reason_codes: ["assumptions_not_allowed"],
    }));
    const report = compare(
      checkerRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT, mutated),
      sha256Hex,
    );
    expect(report.valid).toBeFalse();
    expect(report.violations.some((item) => item.code === "reason_set_stale")).toBeTrue();
  });
});

const buildPathologicalObligationRequest = (
  obligationId: string,
  requirements: JsonObject,
): { request: ProductionRequest; realization: JsonObject } => {
  const theoryDocument: JsonObject = {
    id: THEORY_ID,
    obligations: [{ id: obligationId }],
    laws: [],
  };
  const theoryIdentity = theoryIdentityOf(theoryDocument);
  const realization: JsonObject = { ...PURE_REALIZATION_DOCUMENT };
  const realizationIdentity = realizationIdentityOf(realization, theoryIdentity);
  const evidence = buildEvidenceJson({
    producer: PRODUCER,
    recipeIdentity: RECIPE_IDENTITY,
    theoryIdentity,
    realizationIdentity,
    obligation: obligationId,
    assumptions: [],
    caseResults: caseResultsFor([]),
  });
  return {
    request: {
      theoryId: THEORY_ID,
      theoryDocument,
      realizationDocuments: [realization],
      policyDocument: { id: "policy.pathological", requirements, ambiguity: "reject" },
      outcomeEnvelopes: [
        buildOkOutcomeEnvelope(PURE_REALIZATION_ID, realizationIdentity, evidence),
      ],
    },
    realization,
  };
};

describe("own-property policy lookup for pathological obligation IDs", () => {
  for (const obligationId of ["__proto__", "constructor"]) {
    test(
      "obligation ID '" + obligationId + "' declared as an own policy key governs normally",
      () => {
        const { request } = buildPathologicalObligationRequest(obligationId, {
          [obligationId]: { accepted_categories: ["example_test"], allow_assumptions: true },
        });
        const claim = adjudicate(request, sha256Hex);
        expect(claim.status).toBe("selected");
        expect(claim.candidates[0]!.eligible).toBeTrue();
        expect(claim.candidates[0]!.reasonCodes).toEqual([]);
      },
    );

    test(
      "obligation ID '" +
        obligationId +
        "' absent from policy.requirements is obligation_not_governed, never inherited",
      () => {
        const { request } = buildPathologicalObligationRequest(obligationId, {});
        const claim = adjudicate(request, sha256Hex);
        expect(claim.status).toBe("rejected");
        expect(claim.candidates[0]!.eligible).toBeFalse();
        expect(claim.candidates[0]!.reasonCodes).toEqual(["obligation_not_governed"]);
      },
    );
  }
});

describe("evidence-limit oracle: fully refreshed self-consistent rebound", () => {
  test("a fully re-derived rebound of passing cases onto the broken realization is not reported as generic forgery; the canonical adapter reports only disagreement", () => {
    const fixture = standardFixture();
    // Genuinely re-derive a "9/9 passing" evidence artifact for the BROKEN
    // realization's exact identity: every subject field is fresh and the
    // artifact's own identity is honestly recomputed from that content —
    // internally self-consistent, and indistinguishable from an authentic
    // observation at the generic checker's boundary (design spec 0003).
    const reboundEvidence = buildEvidenceJson({
      producer: PRODUCER,
      recipeIdentity: RECIPE_IDENTITY,
      theoryIdentity: fixture.theoryIdentity,
      realizationIdentity: fixture.brokenRealizationIdentity,
      obligation: OBLIGATION,
      assumptions: [],
      caseResults: caseResultsFor([]), // all nine pass — the rebind
    });
    const reboundOutcome = buildOkOutcomeEnvelope(
      BROKEN_REALIZATION_ID,
      fixture.brokenRealizationIdentity,
      reboundEvidence,
    );
    const request: ProductionRequest = {
      theoryId: THEORY_ID,
      theoryDocument: THEORY_DOCUMENT,
      realizationDocuments: REALIZATIONS,
      policyDocument: DEVELOPMENT_POLICY_DOCUMENT,
      outcomeEnvelopes: [fixture.pureOutcomeEnvelope, reboundOutcome],
    };
    const claim = adjudicate(request, sha256Hex);
    // Both realizations now show 9/9 and satisfy the same policy —
    // production itself cannot distinguish them either, and correctly
    // reports ambiguity rather than fabricating a winner.
    expect(claim.status).toBe("rejected");
    const claimJson = claimToJson(claim);

    const report = compare(
      {
        theoryId: THEORY_ID,
        theoryDocument: THEORY_DOCUMENT,
        realizationDocuments: REALIZATIONS,
        policyDocument: DEVELOPMENT_POLICY_DOCUMENT,
        outcomeEnvelopes: request.outcomeEnvelopes,
        claimDocument: claimJson,
      },
      sha256Hex,
    );
    // The spec-level evidence limit: the generic checker has no execution,
    // custody, or authentication authority, so a fully refreshed
    // self-consistent rebound is NOT reported as invalid.
    expect(report.valid).toBeTrue();

    const canonicalRecord: CanonicalRecord = {
      theoryIdentity: fixture.theoryIdentity,
      policyId: "policy.inventory.development",
      selectedRealizationId: null,
      realizations: new Map([
        [PURE_REALIZATION_ID, { passedCases: 9, totalCases: 9, counterexamples: [] }],
        [
          BROKEN_REALIZATION_ID,
          { passedCases: 7, totalCases: 9, counterexamples: [...BROKEN_COUNTEREXAMPLES] },
        ],
      ]),
    };
    const binding = compareToCanonicalRecord(claimJson, canonicalRecord);
    // The separate canonical adapter DOES catch the drift — as
    // disagreement with a separately custodied record, never as proof of
    // forgery (design spec 0003, "Canonical project-model binding").
    expect(binding.binding).toBe("disagree");
    expect(
      binding.mismatches.some(
        (item) => item.subject === BROKEN_REALIZATION_ID + ".evidence_summary",
      ),
    ).toBeTrue();
  });

  test("the canonical adapter reports agreement for the honest (unrebound) claim", () => {
    const fixture = standardFixture();
    const claimJson = claimToJson(
      adjudicate(productionRequest(fixture, DEVELOPMENT_POLICY_DOCUMENT), sha256Hex),
    );
    const canonicalRecord: CanonicalRecord = {
      theoryIdentity: fixture.theoryIdentity,
      policyId: "policy.inventory.development",
      selectedRealizationId: PURE_REALIZATION_ID,
      realizations: new Map([
        [PURE_REALIZATION_ID, { passedCases: 9, totalCases: 9, counterexamples: [] }],
        [
          BROKEN_REALIZATION_ID,
          { passedCases: 7, totalCases: 9, counterexamples: [...BROKEN_COUNTEREXAMPLES] },
        ],
      ]),
    };
    const binding = compareToCanonicalRecord(claimJson, canonicalRecord);
    expect(binding.binding).toBe("agree");
    expect(binding.mismatches).toEqual([]);
  });
});

describe("sanity: the canonical fixture covers all nine authored cases", () => {
  test("nine case IDs and the broken 7/9 split match the adapted canonical record", () => {
    expect(NINE_CASE_IDS.length).toBe(9);
    expect(BROKEN_COUNTEREXAMPLES).toEqual(["insufficient-stock", "missing-stock-is-zero"]);
    const fixture = standardFixture();
    expect((fixture.pureEvidenceJson as JsonObject).passed_cases).toBe(9);
    expect((fixture.brokenEvidenceJson as JsonObject).passed_cases).toBe(7);
    expect(
      ((fixture.brokenEvidenceJson as JsonObject).counterexamples as ReadonlyArray<JsonObject>).map(
        (c) => c.case_id,
      ),
    ).toEqual([...BROKEN_COUNTEREXAMPLES]);
  });
});

void deepClone;
