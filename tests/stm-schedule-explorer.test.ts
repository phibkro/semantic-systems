import { describe, expect, test } from "bun:test";
import {
  domain,
  literal,
  makeStore,
  read,
  retry,
  sequenceExpression,
  tvar,
  write,
} from "../src/stm/model.ts";
import {
  encodeExplorationReport,
  exploreScenario,
  makeScenario,
  replaySchedule,
  type ExplorationReport,
  type InvalidScenario,
  type ReplayRejected,
  type ReplayReport,
  type Scenario,
} from "../src/stm-explorer/index.ts";
import { canonicalJson } from "../src/tracer/canonical.ts";
import { contentionScenario } from "../examples/stm-schedule-explorer/scenario.ts";

const requireScenario = (value: Scenario | InvalidScenario): Scenario => {
  if ("kind" in value) throw new Error(value.message);
  return value;
};

const assertReplayReport: (
  value: ReplayReport | ReplayRejected,
) => asserts value is ReplayReport = (value) => {
  if (!("format" in value)) throw new Error(value.message);
};

const retryScenario = (): Scenario => {
  const owner = domain("explorer-tests");
  const x = tvar(owner, "x", 0);
  const initialStore = makeStore(owner, [x]);
  const transaction = sequenceExpression(
    owner,
    "retrying",
    [read(x, "seen"), retry(owner, "retry-zero")],
    literal(null),
  );
  return requireScenario(
    makeScenario(
      "retry-tests",
      initialStore,
      [{ id: "retrying", transaction }],
      ["all_transactions_terminal", "relevant_retry_wakeup"],
      { maximumTransactions: 1, maximumSteps: 8, maximumStates: 64 },
    ),
  );
};

const wakeScenario = (unrelated: boolean): Scenario => {
  const owner = domain(unrelated ? "explorer-unrelated" : "explorer-relevant");
  const x = tvar(owner, "x", 0);
  const y = tvar(owner, "y", 0);
  const initialStore = makeStore(owner, [x, y]);
  const waiting = sequenceExpression(
    owner,
    "waiting",
    [read(x, "seen"), retry(owner, "retry-zero")],
    literal(null),
  );
  const writer = write(unrelated ? y : x, 1);
  return requireScenario(
    makeScenario(
      unrelated ? "unrelated-tests" : "relevant-tests",
      initialStore,
      [
        { id: "waiting", transaction: waiting },
        { id: "writer", transaction: writer },
      ],
      ["relevant_retry_wakeup"],
      { maximumTransactions: 2, maximumSteps: 8, maximumStates: 256 },
    ),
  );
};

const finding = (report: ExplorationReport | ReplayReport, name: string) => {
  const value = report.properties.find((entry) => entry.property === name);
  if (value === undefined) throw new Error(`missing property ${name}`);
  return value;
};

describe("bounded STM schedule explorer 0052", () => {
  test("contention exhausts deterministically and holds safety observations", () => {
    const report = exploreScenario(contentionScenario());
    expect(report.status).toBe("complete");
    expect(finding(report, "serializable_commits").outcome).toBe("holds_within_bounds");
    expect(finding(report, "no_partial_publication").outcome).toBe("holds_within_bounds");
    expect(finding(report, "relevant_retry_wakeup").outcome).toBe("holds_within_bounds");
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.properties)).toBe(true);
    expect(() => Object.defineProperty(report, "status", { value: "bounded" })).toThrow();
  });

  test("replay status distinguishes strict prefixes from terminal counterexamples", () => {
    const strictPrefix = replaySchedule(contentionScenario(), []);
    expect("kind" in strictPrefix && strictPrefix.kind).not.toBe("replay_rejected");
    assertReplayReport(strictPrefix);
    expect(strictPrefix.status).toBe("bounded");
    for (const name of [
      "serializable_commits",
      "no_partial_publication",
      "relevant_retry_wakeup",
    ]) {
      expect(finding(strictPrefix, name).outcome).toBe("unknown_due_to_bound");
    }
  });

  test("retry deadlock returns shortest replayable counterexample", () => {
    const scenario = retryScenario();
    const report = exploreScenario(scenario);
    const deadlock = finding(report, "all_transactions_terminal");
    expect(deadlock.outcome).toBe("counterexample");
    expect(deadlock.counterexample?.schedule).toEqual([
      { transaction_id: "retrying", action: "begin" },
      { transaction_id: "retrying", action: "settle" },
    ]);
    if (deadlock.counterexample === null) throw new Error("counterexample missing");
    const replayResult = replaySchedule(scenario, deadlock.counterexample.schedule);
    expect("kind" in replayResult && replayResult.kind).not.toBe("replay_rejected");
    assertReplayReport(replayResult);
    expect(replayResult.status).toBe("complete");
    expect(finding(replayResult, "all_transactions_terminal").outcome).toBe("counterexample");
    expect(canonicalJson(replayResult.terminal_projection)).toBe(
      canonicalJson(deadlock.counterexample.terminal_projection),
    );
    expect(canonicalJson(finding(replayResult, "all_transactions_terminal"))).toBe(
      canonicalJson(deadlock),
    );
  });

  test("relevant and unrelated dependency changes differ", () => {
    const relevantResult = replaySchedule(wakeScenario(false), [
      { transaction_id: "waiting", action: "begin" },
      { transaction_id: "waiting", action: "settle" },
      { transaction_id: "writer", action: "begin" },
      { transaction_id: "writer", action: "settle" },
      { transaction_id: "waiting", action: "wake" },
    ]);
    expect("kind" in relevantResult && relevantResult.kind).not.toBe("replay_rejected");
    assertReplayReport(relevantResult);
    expect(relevantResult.trace.at(-1)?.changed_retry_dependencies).toEqual(["x"]);

    const unrelated = replaySchedule(wakeScenario(true), [
      { transaction_id: "waiting", action: "begin" },
      { transaction_id: "waiting", action: "settle" },
      { transaction_id: "writer", action: "begin" },
      { transaction_id: "writer", action: "settle" },
      { transaction_id: "waiting", action: "wake" },
    ]);
    expect(unrelated).toMatchObject({ kind: "replay_rejected", index: 4 });
    if (!("kind" in unrelated) || unrelated.kind !== "replay_rejected") return;
    expect(unrelated.enabled_choices).toEqual([]);
    const trailing = replaySchedule(retryScenario(), [
      { transaction_id: "retrying", action: "begin" },
      { transaction_id: "retrying", action: "settle" },
      { transaction_id: "retrying", action: "settle" },
    ]);
    expect(trailing).toMatchObject({
      kind: "replay_rejected",
      index: 2,
      reason: "trailing_choice",
    });
  });

  test("typed scenario and replay diagnostics preserve the first failure", () => {
    const owner = domain("explorer-invalid");
    const x = tvar(owner, "x", 0);
    const other = domain("explorer-foreign");
    const foreign = tvar(other, "foreign", 0);
    const store = makeStore(owner, [x]);
    const transaction = write(x, 1);
    expect(
      makeScenario("bounds", store, [transaction], [], {
        maximumTransactions: 0,
        maximumSteps: 1,
        maximumStates: 1,
      }),
    ).toMatchObject({ kind: "invalid_scenario", reason: "invalid_bounds" });
    expect(
      makeScenario(
        "duplicate",
        store,
        [
          { id: "same", transaction },
          { id: "same", transaction },
        ],
        [],
        { maximumTransactions: 2, maximumSteps: 1, maximumStates: 1 },
      ),
    ).toMatchObject({ kind: "invalid_scenario", reason: "duplicate_transaction_id" });
    expect(
      makeScenario("foreign", store, [read(foreign, "value")], [], {
        maximumTransactions: 1,
        maximumSteps: 1,
        maximumStates: 1,
      }),
    ).toMatchObject({ kind: "invalid_scenario", reason: "cross_domain" });

    const rejected = replaySchedule(contentionScenario(), [
      { transaction_id: "missing", action: "begin" },
    ]);
    expect(rejected).toMatchObject({
      kind: "replay_rejected",
      index: 0,
      reason: "unknown_transaction",
    });
  });

  test("bounded exhaustion is explicit and never upgrades an unknown property", () => {
    const owner = domain("explorer-bounds");
    const x = tvar(owner, "x", 0);
    const scenario = requireScenario(
      makeScenario(
        "depth-bound",
        makeStore(owner, [x]),
        [{ id: "writer", transaction: write(x, 1) }],
        ["serializable_commits"],
        { maximumTransactions: 1, maximumSteps: 1, maximumStates: 64 },
      ),
    );
    const report = exploreScenario(scenario);
    expect(report.status).toBe("bounded");
    expect(finding(report, "serializable_commits").outcome).toBe("unknown_due_to_bound");
    expect(encodeExplorationReport(report)).toBeInstanceOf(Uint8Array);
  });
});
