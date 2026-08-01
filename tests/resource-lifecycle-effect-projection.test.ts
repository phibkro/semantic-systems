import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { Effect } from "effect";
import {
  decodeResourceLifecycleEffectProjectionReport,
  encodeResourceLifecycleEffectProjectionReport,
  projectResourceLifecycleEffects,
  type ResourceLifecycleEffectProjectionReport,
  type ResourceLifecycleProjectionFailure,
} from "../src/resource-lifecycle-projection/index.ts";
import { compileSurfaceDocument } from "../src/surface-language/index.ts";
import type {
  ResourceLifecycleEvent,
  ResourceLifecycleScript,
} from "../src/resource-lifecycle/index.ts";

const script = (
  events: ReadonlyArray<ResourceLifecycleEvent>,
  root = "root",
): ResourceLifecycleScript => ({
  format: "semantic.resource-lifecycle-script",
  version: 1,
  root_scope: root,
  events,
});

const acquire = (
  attempt: string,
  scope: string,
  resource: string,
  finalizer:
    | { readonly tag: "succeeded" }
    | { readonly tag: "failed"; readonly message: string } = { tag: "succeeded" },
): ResourceLifecycleEvent => ({
  tag: "acquire",
  attempt,
  scope,
  outcome: { tag: "succeeded", resource, finalizer },
});

const project = (events: ReadonlyArray<ResourceLifecycleEvent>, root = "root") =>
  Effect.runSync(projectResourceLifecycleEffects(script(events, root)));

const reject = (
  events: ReadonlyArray<ResourceLifecycleEvent>,
): ResourceLifecycleProjectionFailure =>
  Effect.runSync(
    projectResourceLifecycleEffects(script(events)).pipe(Effect.flip),
  ) as ResourceLifecycleProjectionFailure;

const clone = <Value>(value: Value): Value => structuredClone(value);

describe("resource lifecycle effect projection", () => {
  test("projects transfer, blocked close, cancellation cleanup, and failed finalizer exactly", () => {
    const report = project([
      { tag: "open_scope", scope: "child", parent: "root" },
      acquire("parent-attempt", "root", "parent", { tag: "failed", message: "still inert" }),
      acquire("moving-attempt", "root", "moving"),
      { tag: "transfer", resource: "moving", from_scope: "root", to_scope: "child" },
      { tag: "exit_scope", scope: "root", cause: "normal" },
      { tag: "exit_scope", scope: "child", cause: "cancellation" },
      { tag: "exit_scope", scope: "root", cause: "typed-failure" },
    ]);

    expect(report.check.observation.tag).toBe("accepted");
    expect(
      report.cleanup_requests.map(({ resource, event_index }) => [resource, event_index]),
    ).toEqual([
      ["moving", 5],
      ["parent", 6],
    ]);
    expect(report.cleanup_requests[1]!.slots[4]).toBe(0);
    expect(report.binder_ledger).toContainEqual({
      tag: "move",
      event_index: 3,
      resource: "moving",
      from_scope: "root",
      to_scope: "child",
      from_binder: "cleanup_e2_m0",
      to_binder: "cleanup_e2_m1",
    });
    expect(report.cleanup_requests[0]!.binder).toBe("cleanup_e2_m1");
    expect(report.cleanup_requests.some(({ event_index }) => event_index === 4)).toBeFalse();
    expect(report.reference).toEqual(report.compiled);
    expect(report.comparisons).toEqual({
      raw_event_bijection: true,
      finalization_multiplicity: true,
      cleanup_order: true,
      blocked_close_non_cleanup: true,
      transfer_chain_conservation: true,
      backend_canonical_agreement: true,
    });
  });

  test("covers all exit causes, failed acquisition, early release, and an unused live binder", () => {
    for (const cause of ["normal", "typed-failure", "cancellation"] as const) {
      expect(
        project([acquire("a", "root", "r"), { tag: "exit_scope", scope: "root", cause }])
          .cleanup_requests,
      ).toHaveLength(1);
    }
    const failed = project([
      {
        tag: "acquire",
        attempt: "no",
        scope: "root",
        outcome: { tag: "failed", message: "no resource" },
      },
    ]);
    expect(failed.cleanup_requests).toEqual([]);
    expect(failed.binder_ledger).toEqual([]);

    const released = project([
      acquire("a", "root", "r"),
      { tag: "release", resource: "r", scope: "root" },
      { tag: "exit_scope", scope: "root", cause: "normal" },
    ]);
    expect(released.cleanup_requests).toHaveLength(1);
    expect(released.binder_ledger.filter(({ tag }) => tag === "force")).toHaveLength(1);

    const live = project([acquire("a", "root", "r")]);
    expect(live.cleanup_requests).toEqual([]);
    expect(live.binder_ledger.at(-1)).toEqual({
      tag: "live",
      acquisition_event_index: 0,
      resource: "r",
      owner_scope: "root",
      binder: "cleanup_e0_m0",
    });
    expect(live.check.observation.tag).toBe("accepted");
  });

  test("uses Unicode code-point ordering and one duplicate-free string table", () => {
    const report = project(
      [
        { tag: "open_scope", scope: "é", parent: "same" },
        {
          tag: "acquire",
          attempt: "same",
          scope: "same",
          outcome: { tag: "failed", message: "😀" },
        },
      ],
      "same",
    );
    expect(report.strings).toEqual(["same", "é", "😀"]);
    expect(report.root_scope_index).toBe(0);
  });

  test("is deeply immutable, preserves caller custody, and strictly rederives reports", () => {
    const input = script([
      acquire("a", "root", "r"),
      { tag: "exit_scope", scope: "root", cause: "normal" },
    ]);
    const report = Effect.runSync(projectResourceLifecycleEffects(input));
    (input.events as Array<ResourceLifecycleEvent>).splice(0);
    expect(report.script.events).toHaveLength(2);
    expect(Object.isFrozen(report)).toBeTrue();
    expect(Object.isFrozen(report.cleanup_requests[0]!.slots)).toBeTrue();

    const bytes = encodeResourceLifecycleEffectProjectionReport(report);
    expect(
      encodeResourceLifecycleEffectProjectionReport(
        Effect.runSync(decodeResourceLifecycleEffectProjectionReport(report)),
      ),
    ).toEqual(bytes);

    const forged = clone(report) as ResourceLifecycleEffectProjectionReport & { source: string };
    forged.source += " ";
    expect(() => Effect.runSync(decodeResourceLifecycleEffectProjectionReport(forged))).toThrow();
    expect(() => encodeResourceLifecycleEffectProjectionReport(forged)).toThrow(TypeError);

    const perturbed = clone(report) as ResourceLifecycleEffectProjectionReport;
    (perturbed.raw_requests[0]!.slots as unknown as number[])[7] = 9;
    expect(() =>
      Effect.runSync(decodeResourceLifecycleEffectProjectionReport(perturbed)),
    ).toThrow();

    const divergent = clone(report) as ResourceLifecycleEffectProjectionReport;
    (divergent.compiled.observation as { applied_observations: number }).applied_observations = 0;
    expect(() =>
      Effect.runSync(decodeResourceLifecycleEffectProjectionReport(divergent)),
    ).toThrow();
  });

  test("enforces exact projection bounds before surface compilation", () => {
    const exactEvents = Array.from(
      { length: 32 },
      (_, index): ResourceLifecycleEvent => ({
        tag: "acquire",
        attempt: `a${index}`,
        scope: "root",
        outcome: { tag: "failed", message: "same" },
      }),
    );
    expect(project(exactEvents).event_payloads).toHaveLength(32);
    expect(
      reject([
        ...exactEvents,
        {
          tag: "acquire",
          attempt: "extra",
          scope: "root",
          outcome: { tag: "failed", message: "same" },
        },
      ]).code,
    ).toBe("limit.events");

    const sixteen = Array.from({ length: 16 }, (_, index) =>
      acquire(`a${index}`, "root", `r${index}`),
    );
    expect(project(sixteen).binder_ledger.filter(({ tag }) => tag === "create")).toHaveLength(16);
    expect(reject([...sixteen, acquire("a16", "root", "r16")]).code).toBe("limit.resources");

    const fortyEightLets = [
      ...sixteen,
      ...Array.from(
        { length: 16 },
        (_, index): ResourceLifecycleEvent => ({
          tag: "acquire",
          attempt: `f${index}`,
          scope: "root",
          outcome: { tag: "failed", message: "failed" },
        }),
      ),
    ];
    expect(project(fortyEightLets).event_payloads).toHaveLength(32);
    expect(reject([...sixteen, { tag: "exit_scope", scope: "root", cause: "normal" }]).code).toBe(
      "limit.lets",
    );
  });

  test("the checker accepts move then force and unused cleanup, but rejects duplicate force", () => {
    const header = `kernel "semantic.kernel-calculus/0018/v1";\n      effect resource_cleanup.finalize : Unit -> Unit;\n      run `;
    const accepted = Effect.runSync(
      compileSurfaceDocument(
        `${header}let cleanup_e0_m0 = return[1] thunk { perform[0] resource_cleanup.finalize(()) } in let cleanup_e0_m1 = return[1] cleanup_e0_m0 in let done = force cleanup_e0_m1 in return[1] ()`,
      ),
    );
    expect(accepted.check.observation.tag).toBe("accepted");
    expect(
      Effect.runSync(
        compileSurfaceDocument(
          `${header}let cleanup_e0_m0 = return[1] thunk { perform[0] resource_cleanup.finalize(()) } in return[1] ()`,
        ),
      ).check.observation.tag,
    ).toBe("accepted");
    const duplicate = Effect.runSync(
      compileSurfaceDocument(
        `${header}let cleanup_e0_m0 = return[1] thunk { perform[0] resource_cleanup.finalize(()) } in let one = force cleanup_e0_m0 in let two = force cleanup_e0_m0 in return[1] ()`,
      ),
    );
    expect(duplicate.check.observation).toMatchObject({
      tag: "rejected",
      diagnostics: [{ code: "usage.affine-duplicated" }],
    });
  });

  test("generated valid scripts preserve the 0044 cleanup oracle", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }),
        fc.constantFrom("normal", "typed-failure", "cancellation" as const),
        (count, cause) => {
          const acquisitions = Array.from({ length: count }, (_, index) =>
            acquire(`a${index}`, "root", `r${index}`),
          );
          const report = project([...acquisitions, { tag: "exit_scope", scope: "root", cause }]);
          expect(report.cleanup_requests.map(({ resource }) => resource)).toEqual(
            acquisitions
              .map((event) =>
                event.tag === "acquire" && event.outcome.tag === "succeeded"
                  ? event.outcome.resource
                  : "",
              )
              .reverse(),
          );
        },
      ),
      { seed: 2_026_0801, numRuns: 16 },
    );
  });
});
