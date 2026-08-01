import { describe, expect, test } from "bun:test";
import { assert as fcAssert, boolean, property, record } from "fast-check";
import { Schema } from "effect";
import {
  AlgebraFrontierReportSchema,
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

describe("user-defined algebra frontier", () => {
  test("emits one bounded schema-valid immutable report", () => {
    const report = algebraFrontierReport();
    expect(() => Schema.decodeUnknownSync(AlgebraFrontierReportSchema)(report)).not.toThrow();
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.workbench)).toBe(true);
    expect(Object.isFrozen(report.candidates[0]!.laws)).toBe(true);
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
          input.lawful_userland_model && input.kernel_obstruction_established,
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
            input.faithful_surface_elaboration,
        );
      }),
    );
  });

  test("keeps runtime capabilities and source promotion independent", () => {
    const report = algebraFrontierReport();
    const stm = report.candidates.find(({ id }) => id === "stm")!;
    expect(stm.decision).toEqual({
      userland: "available",
      surface: "candidate",
      kernel: "defer",
    });
    expect(stm.runtime_alternatives.map(({ id }) => id)).toEqual([
      "single-owner-transaction-actor",
      "shared-memory-handler",
    ]);
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
  });
});
