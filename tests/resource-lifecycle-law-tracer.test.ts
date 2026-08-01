import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import * as fc from "fast-check";
import {
  decodeResourceLifecycleReport,
  encodeResourceLifecycleReport,
  traceResourceLifecycle,
  type ExitCause,
  type ResourceLifecycleFailure,
  type ResourceLifecycleEvent,
  type ResourceLifecycleReport,
  type ResourceLifecycleScript,
} from "../src/resource-lifecycle/index.ts";

const lifecycleScript = (
  events: ReadonlyArray<ResourceLifecycleEvent>,
): ResourceLifecycleScript => ({
  format: "semantic.resource-lifecycle-script",
  version: 1,
  root_scope: "root",
  events,
});

const acquire = (
  attempt: string,
  scope: string,
  resource: string,
  finalizer:
    | { readonly tag: "succeeded" }
    | { readonly tag: "failed"; readonly message: string } = {
    tag: "succeeded",
  },
): ResourceLifecycleEvent => ({
  tag: "acquire",
  attempt,
  scope,
  outcome: { tag: "succeeded", resource, finalizer },
});

const trace = (events: ReadonlyArray<ResourceLifecycleEvent>): ResourceLifecycleReport =>
  Effect.runSync(traceResourceLifecycle(lifecycleScript(events)));

const reject = (events: ReadonlyArray<ResourceLifecycleEvent>): ResourceLifecycleFailure =>
  Effect.runSync(traceResourceLifecycle(lifecycleScript(events)).pipe(Effect.flip));

const finalizedResources = (report: ResourceLifecycleReport): ReadonlyArray<string> =>
  report.observations
    .filter((observation) => observation.tag === "finalization")
    .map((observation) => observation.resource);

const expectDeepFrozen = (value: unknown): void => {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBeTrue();
  for (const child of Object.values(value)) expectDeepFrozen(child);
};

describe("resource lifecycle law tracer", () => {
  test("blocks parent close, transfers by target registration time, and closes in reverse order", () => {
    const report = trace([
      { tag: "open_scope", scope: "child", parent: "root" },
      acquire("attempt-parent", "root", "resource-parent", {
        tag: "failed",
        message: "parent finalizer failed",
      }),
      acquire("attempt-child", "child", "resource-child"),
      acquire("attempt-transfer", "root", "resource-transfer"),
      {
        tag: "transfer",
        resource: "resource-transfer",
        from_scope: "root",
        to_scope: "child",
      },
      { tag: "exit_scope", scope: "root", cause: "normal" },
      { tag: "exit_scope", scope: "child", cause: "cancellation" },
      { tag: "exit_scope", scope: "root", cause: "typed-failure" },
    ]);

    expect(report.observations[4]).toEqual({
      tag: "scope-close-blocked",
      event_index: 5,
      scope: "root",
      open_descendants: ["child"],
    });
    expect(finalizedResources(report)).toEqual([
      "resource-transfer",
      "resource-child",
      "resource-parent",
    ]);
    expect(report.finalizer_failures).toEqual([
      {
        event_index: 7,
        resource: "resource-parent",
        scope: "root",
        message: "parent finalizer failed",
      },
    ]);
    expect(report.scopes).toEqual([
      { scope: "child", parent: "root", state: "closed", exit_cause: "cancellation" },
      { scope: "root", parent: null, state: "closed", exit_cause: "typed-failure" },
    ]);
    expect(report.laws).toEqual({
      at_most_once_finalization: true,
      singular_ownership: true,
      closed_scope_resources_finalized: true,
    });
  });

  test("normal, typed-failure, and cancellation causes preserve cleanup order", () => {
    const order = (cause: ExitCause) =>
      finalizedResources(
        trace([
          acquire("one", "root", "one"),
          acquire("two", "root", "two"),
          acquire("three", "root", "three"),
          { tag: "exit_scope", scope: "root", cause },
        ]),
      );
    expect(order("normal")).toEqual(["three", "two", "one"]);
    expect(order("typed-failure")).toEqual(order("normal"));
    expect(order("cancellation")).toEqual(order("normal"));
  });

  test("generated finite owners always clean up in reverse current registration order", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 10_000 }), {
          minLength: 0,
          maxLength: 32,
        }),
        fc.constantFrom<ExitCause>("normal", "typed-failure", "cancellation"),
        (identities, cause) => {
          const events: Array<ResourceLifecycleEvent> = identities.map((identity) =>
            acquire(`attempt-${identity}`, "root", `resource-${identity}`),
          );
          events.push({ tag: "exit_scope", scope: "root", cause });
          const report = trace(events);
          expect(finalizedResources(report)).toEqual(
            identities.map((identity) => `resource-${identity}`).reverse(),
          );
          expect(report.laws).toEqual({
            at_most_once_finalization: true,
            singular_ownership: true,
            closed_scope_resources_finalized: true,
          });
        },
      ),
      { seed: 2_026_0801, numRuns: 64 },
    );
  });

  test("explicit release is terminal and a failed finalizer does not skip later cleanup", () => {
    const released = trace([
      acquire("early", "root", "early"),
      { tag: "release", resource: "early", scope: "root" },
      { tag: "exit_scope", scope: "root", cause: "normal" },
    ]);
    expect(finalizedResources(released)).toEqual(["early"]);

    const failed = trace([
      acquire("survivor", "root", "survivor"),
      acquire("failure", "root", "failure", { tag: "failed", message: "scripted" }),
      { tag: "exit_scope", scope: "root", cause: "normal" },
    ]);
    expect(finalizedResources(failed)).toEqual(["failure", "survivor"]);
    expect(failed.finalizer_failures.map(({ resource }) => resource)).toEqual(["failure"]);
  });

  test("keeps successful resources live under an open scope and failed acquisitions inert", () => {
    const report = trace([
      acquire("live-attempt", "root", "live-resource"),
      {
        tag: "acquire",
        attempt: "failed-attempt",
        scope: "root",
        outcome: { tag: "failed", message: "not acquired" },
      },
    ]);
    expect(report.resources).toEqual([
      {
        resource: "live-resource",
        attempt: "live-attempt",
        acquired_scope: "root",
        owner_scope: "root",
        cleanup: { tag: "pending" },
      },
    ]);
    expect(report.finalizer_failures).toEqual([]);
    expect(report.laws).toEqual({
      at_most_once_finalization: true,
      singular_ownership: true,
      closed_scope_resources_finalized: true,
    });
  });

  test("rejects duplicate scope, attempt, and successful resource identities", () => {
    expect(
      reject([
        { tag: "open_scope", scope: "child", parent: "root" },
        { tag: "exit_scope", scope: "child", cause: "normal" },
        { tag: "open_scope", scope: "child", parent: "root" },
      ]).code,
    ).toBe("scope.identity-duplicate");
    expect(
      reject([
        {
          tag: "acquire",
          attempt: "same",
          scope: "root",
          outcome: { tag: "failed", message: "first" },
        },
        {
          tag: "acquire",
          attempt: "same",
          scope: "root",
          outcome: { tag: "failed", message: "second" },
        },
      ]).code,
    ).toBe("attempt.identity-duplicate");
    expect(reject([acquire("first", "root", "same"), acquire("second", "root", "same")]).code).toBe(
      "resource.identity-duplicate",
    );
  });

  test("rejects double cleanup, transfer after cleanup, closed targets, and closed-scope use", () => {
    expect(
      reject([
        acquire("one", "root", "one"),
        { tag: "release", resource: "one", scope: "root" },
        { tag: "release", resource: "one", scope: "root" },
      ]).code,
    ).toBe("resource.already-finalized");
    expect(
      reject([
        acquire("one", "root", "one"),
        { tag: "release", resource: "one", scope: "root" },
        { tag: "transfer", resource: "one", from_scope: "root", to_scope: "root" },
      ]).code,
    ).toBe("resource.already-finalized");
    expect(
      reject([
        { tag: "open_scope", scope: "child", parent: "root" },
        { tag: "exit_scope", scope: "child", cause: "normal" },
        acquire("one", "root", "one"),
        { tag: "transfer", resource: "one", from_scope: "root", to_scope: "child" },
      ]).code,
    ).toBe("scope.target-not-open");
    expect(
      reject([
        { tag: "exit_scope", scope: "root", cause: "normal" },
        acquire("late", "root", "late"),
      ]).code,
    ).toBe("scope.closed");
  });

  test("a root close before children is blocked without consuming cleanup", () => {
    const report = trace([
      { tag: "open_scope", scope: "child", parent: "root" },
      acquire("root-resource", "root", "root-resource"),
      { tag: "exit_scope", scope: "root", cause: "normal" },
    ]);
    expect(report.observations.at(-1)).toEqual({
      tag: "scope-close-blocked",
      event_index: 2,
      scope: "root",
      open_descendants: ["child"],
    });
    expect(report.resources[0]?.cleanup).toEqual({ tag: "pending" });
    expect(report.resources[0]?.owner_scope).toBe("root");
  });

  test("strictly rejects excess properties and bounded work", () => {
    const excess = {
      ...lifecycleScript([]),
      ambient_callback: () => undefined,
    };
    const representation = Effect.runSync(traceResourceLifecycle(excess).pipe(Effect.flip));
    expect(representation.code).toBe("script.representation-rejected");

    const tooManyEvents = lifecycleScript(
      Array.from({ length: 257 }, (_, index) => ({
        tag: "acquire" as const,
        attempt: `attempt-${index}`,
        scope: "root",
        outcome: { tag: "failed" as const, message: "failed" },
      })),
    );
    expect(Effect.runSync(traceResourceLifecycle(tooManyEvents).pipe(Effect.flip)).code).toBe(
      "script.representation-rejected",
    );

    const tooManyScopes: Array<ResourceLifecycleEvent> = Array.from({ length: 64 }, (_, index) => ({
      tag: "open_scope",
      scope: `scope-${index}`,
      parent: "root",
    }));
    expect(reject(tooManyScopes).code).toBe("scope.limit-exceeded");
  });

  test("reports are deeply immutable, canonical, sorted, and derived fields cannot be forged", () => {
    const report = trace([
      acquire("z-attempt", "root", "z-resource"),
      acquire("a-attempt", "root", "a-resource"),
    ]);
    expect(report.resources.map(({ resource }) => resource)).toEqual(["a-resource", "z-resource"]);
    expectDeepFrozen(report);

    const bytes = encodeResourceLifecycleReport(report);
    expect(bytes.at(-1)).toBe(10);
    const decoded = Effect.runSync(decodeResourceLifecycleReport(report));
    expect(encodeResourceLifecycleReport(decoded)).toEqual(bytes);

    const forged = {
      ...report,
      laws: { ...report.laws, singular_ownership: false },
    };
    expect(Effect.runSync(decodeResourceLifecycleReport(forged).pipe(Effect.flip)).code).toBe(
      "report.derived-fields-mismatch",
    );
    expect(() => encodeResourceLifecycleReport(forged)).toThrow(
      "report does not equal the lifecycle observation derived from its script",
    );

    const excessReport = { ...report, caller_claim: true };
    expect(Effect.runSync(decodeResourceLifecycleReport(excessReport).pipe(Effect.flip)).code).toBe(
      "report.representation-rejected",
    );
  });
});
