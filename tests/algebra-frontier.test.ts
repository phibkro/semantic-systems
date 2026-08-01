import { describe, expect, test } from "bun:test";
import { array, assert as fcAssert, boolean, property, record, string } from "fast-check";
import { Schema } from "effect";
import {
  AlgebraFrontierReportSchema,
  algebraFrontierBounds,
  algebraFrontierReport,
  classifyPromotion,
  type PromotionObservations,
} from "../src/algebra-frontier/index.ts";

const observations = record({
  lawful_userland_model: boolean(),
  repeated_ergonomic_demand: boolean(),
  faithful_surface_elaboration: boolean(),
  kernel_obstruction_established: boolean(),
});

const assertDeeplyFrozen = (value: unknown, seen = new WeakSet<object>()): void => {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertDeeplyFrozen(child, seen);
};

describe("user-defined algebra frontier", () => {
  test("emits one bounded schema-valid immutable report", () => {
    const report = algebraFrontierReport();
    expect(() => Schema.decodeUnknownSync(AlgebraFrontierReportSchema)(report)).not.toThrow();
    assertDeeplyFrozen(report);
    expect(report.bounds).toEqual({
      maximum_string_code_units: algebraFrontierBounds.maximumStringCodeUnits,
      maximum_statements: algebraFrontierBounds.maximumStatements,
      maximum_runtime_alternatives: algebraFrontierBounds.maximumRuntimeAlternatives,
      maximum_workbench_capabilities: algebraFrontierBounds.maximumWorkbenchCapabilities,
      maximum_candidates: algebraFrontierBounds.maximumCandidates,
      maximum_precedents: algebraFrontierBounds.maximumPrecedents,
      maximum_unsupported_claims: algebraFrontierBounds.maximumUnsupportedClaims,
    });
    expect(report.workbench.map(({ id }) => id)).toEqual([
      "signature",
      "equations",
      "composition",
      "interpretation",
      "scope-and-identity",
      "evidence",
      "reflection",
      "discovery",
    ]);
  });

  test("never nominates kernel syntax without a lawful model and obstruction", () => {
    fcAssert(
      property(observations, (input: PromotionObservations) => {
        const decision = classifyPromotion(input);
        expect(decision.kernel === "candidate").toBe(
          input.lawful_userland_model &&
            !input.faithful_surface_elaboration &&
            input.kernel_obstruction_established,
        );
      }),
    );
  });

  test("nominates surface syntax only after all ergonomic gates", () => {
    fcAssert(
      property(observations, (input: PromotionObservations) => {
        const decision = classifyPromotion(input);
        expect(decision.surface === "candidate").toBe(
          input.lawful_userland_model &&
            input.repeated_ergonomic_demand &&
            input.faithful_surface_elaboration &&
            !input.kernel_obstruction_established,
        );
      }),
    );
  });

  test("rejects contradictory elaboration observations at both promotion layers", () => {
    const decision = classifyPromotion({
      lawful_userland_model: true,
      repeated_ergonomic_demand: true,
      faithful_surface_elaboration: true,
      kernel_obstruction_established: true,
    });
    expect(decision).toEqual({
      consistency: "contradictory-elaboration",
      userland: "available",
      surface: "blocked",
      kernel: "blocked",
    });
  });

  test("keeps runtime metadata outside the promotion classifier", () => {
    const classifyProjection = ({
      runtime_capabilities: _,
      ...promotion
    }: PromotionObservations & { readonly runtime_capabilities: ReadonlyArray<string> }) =>
      classifyPromotion(promotion);

    fcAssert(
      property(
        observations,
        array(string(), { maxLength: 8 }),
        array(string(), { maxLength: 8 }),
        (input, firstCapabilities, secondCapabilities) => {
          expect(classifyProjection({ ...input, runtime_capabilities: firstCapabilities })).toEqual(
            classifyProjection({ ...input, runtime_capabilities: secondCapabilities }),
          );
        },
      ),
    );
    const report = algebraFrontierReport();
    const stm = report.candidates.find(({ id }) => id === "stm")!;
    expect(stm.decision).toEqual({
      consistency: "consistent",
      userland: "available",
      surface: "candidate",
      kernel: "defer",
    });
    expect(stm.runtime_alternatives.map(({ id }) => id)).toEqual([
      "single-owner-transaction-actor",
      "shared-memory-handler",
    ]);
    expect(stm.operations).toContain("abort");
    expect(stm.observation_basis).toContain(
      "the executable 0014 bounded law tracer supplies a lawful userland model",
    );
  });

  test("does not misstate lifecycle cleanup as inversion", () => {
    const resources = algebraFrontierReport().candidates.find(
      ({ id }) => id === "resource-lifecycle",
    )!;
    expect(resources.operations).toContain("with_acquire");
    expect(resources.non_laws).toContain("release is not a mathematical inverse of acquire");
    expect(resources.open_obligations).toContain(
      "establish or refute non-escaping affine regions over the current core",
    );
  });

  test("keeps one-shot concurrency and resource ownership coupled by scope", () => {
    const report = algebraFrontierReport();
    const concurrency = report.candidates.find(({ id }) => id === "structured-concurrency")!;
    const resources = report.candidates.find(({ id }) => id === "resource-lifecycle")!;
    expect(concurrency.laws).toContain("ordinary scheduling consumes one-shot continuations");
    expect(resources.laws).toContain(
      "parent cleanup waits until owned children can no longer use the resource",
    );
    expect(report.unsupported_claims).toContain(
      "any candidate requires true multishot continuations",
    );
    expect(concurrency.open_obligations).toContain(
      "establish a scheduler representation because 0018 internal resumptions cannot enter data structures",
    );
  });

  test("rejects report collections and strings beyond the published bounds", () => {
    const report = algebraFrontierReport();
    expect(() =>
      Schema.decodeUnknownSync(AlgebraFrontierReportSchema)({
        ...report,
        unsupported_claims: Array.from(
          { length: algebraFrontierBounds.maximumUnsupportedClaims + 1 },
          (_, index) => `claim-${index}`,
        ),
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(AlgebraFrontierReportSchema)({
        ...report,
        capability_identity: "x".repeat(algebraFrontierBounds.maximumStringCodeUnits + 1),
      }),
    ).toThrow();
  });
});
