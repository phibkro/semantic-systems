#!/usr/bin/env bun
import { resolve } from "node:path";
import {
  domain,
  literal,
  makeStore,
  read,
  retry,
  sequenceExpression,
  tvar,
  write,
} from "../../src/stm/model.ts";
import {
  encodeExplorationReport,
  exploreScenario,
  makeScenario,
  replaySchedule,
  type ExplorationReport,
  type InvalidScenario,
  type PropertyFinding,
  type ReplayReport,
  type Scenario,
} from "../../src/stm-explorer/index.ts";
import {
  contentionScenario,
  emptyScenario,
} from "../../examples/stm-schedule-explorer/scenario.ts";
import { canonicalJson } from "../../src/tracer/canonical.ts";

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";
const decoder = new TextDecoder();

const fail = (message: string): never => {
  throw new Error(`0052 acceptance: ${message}`);
};
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) fail(message);
};

const run = (command: ReadonlyArray<string>): string => {
  const result = Bun.spawnSync({ cmd: [...command], cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    fail(`${command.join(" ")} exited ${result.exitCode}: ${decoder.decode(result.stderr)}`);
  }
  return decoder.decode(result.stdout);
};

const property = (report: ExplorationReport | ReplayReport, name: string): PropertyFinding =>
  report.properties.find((entry) => entry.property === name) ??
  fail(`report is missing property ${name}`);

const isInvalidScenario = (value: Scenario | InvalidScenario): value is InvalidScenario =>
  Object.hasOwn(value, "kind") &&
  (value as { readonly kind?: unknown }).kind === "invalid_scenario";

const requireScenario = (value: Scenario | InvalidScenario): Scenario =>
  isInvalidScenario(value) ? fail(value.message) : value;

const retryScenario = (): Scenario => {
  const owner = domain("schedule-retry");
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
      "retry-deadlock",
      initialStore,
      [{ id: "retrying", transaction }],
      ["all_transactions_terminal", "relevant_retry_wakeup"],
      { maximumTransactions: 1, maximumSteps: 8, maximumStates: 64 },
    ),
  );
};

const wakeScenario = (unrelated: boolean): Scenario => {
  const owner = domain(unrelated ? "schedule-unrelated" : "schedule-relevant");
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
      unrelated ? "unrelated-wake" : "relevant-wake",
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

const runAssertions = async (): Promise<void> => {
  const empty = exploreScenario(emptyScenario());
  const expectedEmpty = (
    await Bun.file(`${root}/examples/stm-schedule-explorer/empty-report.json.golden`).text()
  ).trim();
  assert(
    decoder.decode(encodeExplorationReport(empty)) === expectedEmpty,
    "empty golden report changed",
  );

  const contention = contentionScenario();
  const contentionReport = exploreScenario(contention);
  assert(
    contentionReport.status === "complete",
    "contention should exhaust its finite state space",
  );
  for (const name of ["serializable_commits", "no_partial_publication", "relevant_retry_wakeup"]) {
    assert(
      property(contentionReport, name).outcome === "holds_within_bounds",
      `${name} did not hold`,
    );
  }
  assert(contentionReport.unsupported_claims.length > 0, "unsupported claims are absent");
  assert(!canonicalJson(contentionReport).includes("proved"), "report uses proof language");

  const retryCase = retryScenario();
  const retryReport = exploreScenario(retryCase);
  const retryFinding = property(retryReport, "all_transactions_terminal");
  assert(retryFinding.outcome === "counterexample", "retry deadlock has no counterexample");
  assert(retryFinding.counterexample !== null, "retry counterexample payload is absent");
  assert(retryFinding.counterexample.schedule.length === 2, "retry counterexample is not shortest");
  const replay = replaySchedule(retryCase, retryFinding.counterexample.schedule);
  assert(!("kind" in replay), "valid retry counterexample was rejected");
  assert(
    canonicalJson(replay.terminal_projection) ===
      canonicalJson(retryFinding.counterexample.terminal_projection),
    "replay terminal projection differs",
  );
  assert(
    canonicalJson(property(replay, "all_transactions_terminal")) === canonicalJson(retryFinding),
    "replay finding differs from exploration finding",
  );

  const relevant = wakeScenario(false);
  const relevantReplay = replaySchedule(relevant, [
    { transaction_id: "waiting", action: "begin" },
    { transaction_id: "waiting", action: "settle" },
    { transaction_id: "writer", action: "begin" },
    { transaction_id: "writer", action: "settle" },
    { transaction_id: "waiting", action: "wake" },
  ]);
  assert(!("kind" in relevantReplay), "relevant wake was rejected");
  const relevantLast = relevantReplay.trace.at(-1);
  assert(
    relevantLast?.changed_retry_dependencies.join(",") === "x",
    "relevant wake did not report x",
  );

  const unrelated = wakeScenario(true);
  const unrelatedReplay = replaySchedule(unrelated, [
    { transaction_id: "waiting", action: "begin" },
    { transaction_id: "waiting", action: "settle" },
    { transaction_id: "writer", action: "begin" },
    { transaction_id: "writer", action: "settle" },
    { transaction_id: "waiting", action: "wake" },
  ]);
  assert(
    "kind" in unrelatedReplay && unrelatedReplay.kind === "replay_rejected",
    "unrelated wake was silently enabled",
  );
  if (!("kind" in unrelatedReplay) || unrelatedReplay.kind !== "replay_rejected") return;

  const owner = domain("invalid-schedule");
  const x = tvar(owner, "x", 0);
  const other = domain("other-schedule");
  const foreign = tvar(other, "foreign", 0);
  const initial = makeStore(owner, [x]);
  const tx = write(x, 1);
  const invalidBounds = makeScenario("bad-bounds", initial, [tx], [], {
    maximumTransactions: 0,
    maximumSteps: 1,
    maximumStates: 1,
  });
  assert(
    "kind" in invalidBounds &&
      invalidBounds.kind === "invalid_scenario" &&
      invalidBounds.reason === "invalid_bounds",
    "invalid bounds accepted",
  );
  const duplicate = makeScenario(
    "duplicate",
    initial,
    [
      { id: "same", transaction: tx },
      { id: "same", transaction: tx },
    ],
    [],
    {
      maximumTransactions: 2,
      maximumSteps: 1,
      maximumStates: 1,
    },
  );
  assert(
    "kind" in duplicate &&
      duplicate.kind === "invalid_scenario" &&
      duplicate.reason === "duplicate_transaction_id",
    "duplicate IDs accepted",
  );
  const crossDomain = makeScenario("foreign", initial, [read(foreign, "value")], [], {
    maximumTransactions: 1,
    maximumSteps: 1,
    maximumStates: 1,
  });
  assert(
    "kind" in crossDomain &&
      crossDomain.kind === "invalid_scenario" &&
      crossDomain.reason === "cross_domain",
    "cross-domain transaction accepted",
  );
  const invalidReplay = replaySchedule(contention, [
    { transaction_id: "missing", action: "begin" },
  ]);
  assert(
    "kind" in invalidReplay &&
      invalidReplay.kind === "replay_rejected" &&
      invalidReplay.index === 0,
    "invalid replay was not typed",
  );

  const bun = run(["bun", "src/stm-explorer/main-bun.ts"]);
  const node = run([nodeExecutable, "src/stm-explorer/main-node.ts"]);
  assert(bun === node, "Bun and genuine Node reports differ");
};

for (const command of [
  ["bun", "test", "tests/stm-schedule-explorer.test.ts"],
  ["bun", "scripts/accept/0014-stm-effect-handler-laws.ts"],
  ["bun", "scripts/accept/0050-bounded-stm-runtime.ts"],
] as const) {
  run(command);
}
await runAssertions();
