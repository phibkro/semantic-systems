import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { array, assert as fcAssert, asyncProperty, boolean, string } from "fast-check";
import {
  StructuredConcurrencyFailure,
  decodeStructuredConcurrencyReport,
  encodeStructuredConcurrencyReport,
  structuredConcurrencyBounds,
  traceStructuredConcurrency,
  type StructuredConcurrencyScript,
} from "../src/structured-concurrency/index.ts";

const run = <A>(effect: Effect.Effect<A, StructuredConcurrencyFailure>): Promise<A> =>
  Effect.runPromise(effect);

const expectFailure = async (
  script: unknown,
  code: string,
): Promise<StructuredConcurrencyFailure> => {
  const failure = await Effect.runPromise(Effect.flip(traceStructuredConcurrency(script)));
  expect(failure).toBeInstanceOf(StructuredConcurrencyFailure);
  expect(failure.code).toBe(code);
  return failure;
};

const script = (events: StructuredConcurrencyScript["events"]): StructuredConcurrencyScript => ({
  format: "semantic.structured-concurrency-script",
  version: 1,
  root_scope: "root",
  events,
});

describe("0047 structured-concurrency law tracer", () => {
  test("compares explicit scheduling, transfer, cancellation, join, and scope exit", async () => {
    const report = await run(
      traceStructuredConcurrency(
        script([
          { tag: "open_scope", scope: "child", parent: "root" },
          {
            tag: "spawn",
            task: "alpha",
            scope: "root",
            program: { yields: ["alpha-0"], terminal: { tag: "succeeded" } },
          },
          {
            tag: "spawn",
            task: "beta",
            scope: "child",
            program: { yields: ["beta-0"], terminal: { tag: "failed", message: "boom" } },
          },
          { tag: "transfer", task: "alpha", from_scope: "root", to_scope: "child" },
          { tag: "dispatch", task: "beta" },
          { tag: "dispatch", task: "alpha" },
          { tag: "join", task: "alpha" },
          { tag: "exit_scope", scope: "root" },
          { tag: "exit_scope", scope: "child" },
          { tag: "request_cancel", task: "alpha" },
          { tag: "request_cancel", task: "alpha" },
          { tag: "deliver_cancel", task: "alpha" },
          { tag: "dispatch", task: "beta" },
          { tag: "join", task: "alpha" },
          { tag: "join", task: "alpha" },
          { tag: "join", task: "beta" },
          { tag: "exit_scope", scope: "child" },
          { tag: "exit_scope", scope: "root" },
        ]),
      ),
    );

    expect(report.comparison).toEqual({
      canonical_equal: true,
      scope_ledger_equal: true,
      task_ledger_equal: true,
      trace_equal: true,
      laws_equal: true,
    });
    expect(report.reference.schedule.map(({ task }) => task)).toEqual(["beta", "alpha", "beta"]);
    expect(report.reference.laws).toEqual({
      singular_ownership: true,
      scope_exit_waits: true,
      stable_terminal_join: true,
      idempotent_cancel_request: true,
      one_shot_dispatch: true,
    });
    expect(
      report.reference.observations.filter((observation) => observation.tag === "scope-exit"),
    ).toEqual([
      {
        tag: "scope-exit",
        event_index: 7,
        scope: "root",
        result: "blocked",
        open_children: ["child"],
        live_tasks: [],
      },
      {
        tag: "scope-exit",
        event_index: 8,
        scope: "child",
        result: "blocked",
        open_children: [],
        live_tasks: ["alpha", "beta"],
      },
      {
        tag: "scope-exit",
        event_index: 16,
        scope: "child",
        result: "closed",
        open_children: [],
        live_tasks: [],
      },
      {
        tag: "scope-exit",
        event_index: 17,
        scope: "root",
        result: "closed",
        open_children: [],
        live_tasks: [],
      },
    ]);
    expect(report.replay).toEqual({
      schedule: "script-dispatches",
      external_observations: "unsupported",
    });
  });

  test("a cancellation request is monotone but settlement needs explicit delivery", async () => {
    const report = await run(
      traceStructuredConcurrency(
        script([
          {
            tag: "spawn",
            task: "task",
            scope: "root",
            program: { yields: [], terminal: { tag: "succeeded" } },
          },
          { tag: "request_cancel", task: "task" },
          { tag: "request_cancel", task: "task" },
          { tag: "join", task: "task" },
          { tag: "deliver_cancel", task: "task" },
          { tag: "join", task: "task" },
        ]),
      ),
    );
    expect(report.reference.observations.slice(1)).toEqual([
      {
        tag: "cancel-requested",
        event_index: 1,
        task: "task",
        source: "explicit",
        first_request: true,
      },
      {
        tag: "cancel-requested",
        event_index: 2,
        task: "task",
        source: "explicit",
        first_request: false,
      },
      { tag: "join-blocked", event_index: 3, task: "task" },
      { tag: "task-settled", event_index: 4, task: "task", outcome: { tag: "cancelled" } },
      { tag: "join-observed", event_index: 5, task: "task", outcome: { tag: "cancelled" } },
    ]);
  });

  test("each dispatch consumes exactly one authored step", async () => {
    const report = await run(
      traceStructuredConcurrency(
        script([
          {
            tag: "spawn",
            task: "task",
            scope: "root",
            program: { yields: ["a", "b"], terminal: { tag: "failed", message: "done" } },
          },
          { tag: "dispatch", task: "task" },
          { tag: "dispatch", task: "task" },
          { tag: "dispatch", task: "task" },
          { tag: "join", task: "task" },
          { tag: "join", task: "task" },
        ]),
      ),
    );
    expect(report.reference.schedule.map(({ step_index, result }) => [step_index, result])).toEqual(
      [
        [0, "yielded"],
        [1, "yielded"],
        [2, "settled"],
      ],
    );
    expect(report.reference.tasks[0]).toMatchObject({
      next_step: 3,
      state: "terminal",
      owner_scope: null,
      outcome: { tag: "failed", message: "done" },
    });
  });

  test("scope exit requests every directly owned live task and can later close", async () => {
    const report = await run(
      traceStructuredConcurrency(
        script([
          {
            tag: "spawn",
            task: "b",
            scope: "root",
            program: { yields: [], terminal: { tag: "succeeded" } },
          },
          {
            tag: "spawn",
            task: "a",
            scope: "root",
            program: { yields: [], terminal: { tag: "succeeded" } },
          },
          { tag: "exit_scope", scope: "root" },
          { tag: "deliver_cancel", task: "a" },
          { tag: "deliver_cancel", task: "b" },
          { tag: "exit_scope", scope: "root" },
        ]),
      ),
    );
    expect(report.reference.observations.slice(2, 5)).toEqual([
      {
        tag: "cancel-requested",
        event_index: 2,
        task: "a",
        source: "scope-exit",
        first_request: true,
      },
      {
        tag: "cancel-requested",
        event_index: 2,
        task: "b",
        source: "scope-exit",
        first_request: true,
      },
      {
        tag: "scope-exit",
        event_index: 2,
        scope: "root",
        result: "blocked",
        open_children: [],
        live_tasks: ["a", "b"],
      },
    ]);
    expect(report.reference.scopes).toEqual([{ scope: "root", parent: null, state: "closed" }]);
  });

  test("rejects illegal semantic transitions with indexed typed failures", async () => {
    const cases: ReadonlyArray<readonly [StructuredConcurrencyScript, string]> = [
      [
        script([
          { tag: "open_scope", scope: "child", parent: "root" },
          { tag: "open_scope", scope: "child", parent: "root" },
        ]),
        "scope.identity-duplicate",
      ],
      [script([{ tag: "dispatch", task: "missing" }]), "task.missing"],
      [
        script([
          {
            tag: "spawn",
            task: "task",
            scope: "root",
            program: { yields: [], terminal: { tag: "succeeded" } },
          },
          { tag: "deliver_cancel", task: "task" },
        ]),
        "cancel.not-requested",
      ],
      [
        script([
          {
            tag: "spawn",
            task: "task",
            scope: "root",
            program: { yields: [], terminal: { tag: "succeeded" } },
          },
          { tag: "dispatch", task: "task" },
          { tag: "dispatch", task: "task" },
        ]),
        "task.already-terminal",
      ],
      [
        script([
          { tag: "open_scope", scope: "child", parent: "root" },
          {
            tag: "spawn",
            task: "task",
            scope: "root",
            program: { yields: [], terminal: { tag: "succeeded" } },
          },
          { tag: "transfer", task: "task", from_scope: "root", to_scope: "root" },
        ]),
        "task.transfer-same-scope",
      ],
    ];
    for (const [input, code] of cases) await expectFailure(input, code);
  });

  test("strictly rejects excess properties and bounded work", async () => {
    await expectFailure(
      {
        ...script([]),
        ambient_scheduler: true,
      },
      "script.representation-rejected",
    );
    await expectFailure(
      script(
        Array.from({ length: structuredConcurrencyBounds.maximumEvents + 1 }, (_, index) => ({
          tag: "open_scope" as const,
          scope: `scope-${index}`,
          parent: "root",
        })),
      ),
      "script.representation-rejected",
    );
    await expectFailure(
      script([
        {
          tag: "spawn",
          task: "task",
          scope: "root",
          program: {
            yields: Array.from(
              { length: structuredConcurrencyBounds.maximumYields + 1 },
              (_, index) => `${index}`,
            ),
            terminal: { tag: "succeeded" },
          },
        },
      ]),
      "script.representation-rejected",
    );
  });

  test("generated finite programs compare under both realizations", async () => {
    await fcAssert(
      asyncProperty(
        array(string({ maxLength: 16 }), { maxLength: 6 }),
        boolean(),
        async (labels, succeeds) => {
          const report = await run(
            traceStructuredConcurrency(
              script([
                {
                  tag: "spawn",
                  task: "task",
                  scope: "root",
                  program: {
                    yields: labels,
                    terminal: succeeds
                      ? { tag: "succeeded" }
                      : { tag: "failed", message: "generated" },
                  },
                },
                ...Array.from({ length: labels.length + 1 }, () => ({
                  tag: "dispatch" as const,
                  task: "task",
                })),
                { tag: "join", task: "task" },
                { tag: "join", task: "task" },
                { tag: "exit_scope", scope: "root" },
              ]),
            ),
          );
          expect(report.comparison.canonical_equal).toBeTrue();
          expect(Object.values(report.reference.laws).every(Boolean)).toBeTrue();
          expect(report.reference.schedule).toHaveLength(labels.length + 1);
        },
      ),
      { numRuns: 64, seed: 4_700_047 },
    );
  });

  test("detaches and freezes custody, and strictly rederives every report field", async () => {
    const input = script([
      {
        tag: "spawn",
        task: "task",
        scope: "root",
        program: { yields: ["yield"], terminal: { tag: "succeeded" } },
      },
      { tag: "dispatch", task: "task" },
      { tag: "dispatch", task: "task" },
      { tag: "join", task: "task" },
    ]);
    const report = await run(traceStructuredConcurrency(input));
    expect(Object.isFrozen(report)).toBeTrue();
    expect(Object.isFrozen(report.script.events)).toBeTrue();
    expect(Object.isFrozen(report.reference.tasks[0])).toBeTrue();
    expect(Object.isFrozen(input)).toBeFalse();
    expect(Object.isFrozen(input.events)).toBeFalse();

    const encoded = encodeStructuredConcurrencyReport(report);
    const parsed = JSON.parse(new TextDecoder().decode(encoded));
    const rederived = await run(decodeStructuredConcurrencyReport(parsed));
    expect(encodeStructuredConcurrencyReport(rederived)).toEqual(encoded);

    parsed.reference.laws.one_shot_dispatch = false;
    await expect(run(decodeStructuredConcurrencyReport(parsed))).rejects.toMatchObject({
      code: "report.derived-fields-mismatch",
    });
  });
});
