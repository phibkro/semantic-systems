import {
  add,
  domain,
  literal,
  makeStore,
  read,
  sequence,
  tvar,
  writeExpression,
  type Domain,
  type Store,
  type TVar,
  type Txn,
} from "../../src/stm/model.ts";
import {
  makeScenario,
  type ExplorerBounds,
  type Scenario,
  type ScenarioTransactionInput,
} from "../../src/stm-explorer/index.ts";
import type { JsonValue } from "../../src/tracer/json.ts";

export interface ContentionFixture {
  readonly owner: Domain<"schedule-example">;
  readonly x: TVar<"schedule-example", number>;
  readonly y: TVar<"schedule-example", number>;
  readonly initialStore: Store<"schedule-example">;
  readonly left: Txn<"schedule-example", never, JsonValue, never, never>;
  readonly right: Txn<"schedule-example", never, JsonValue, never, never>;
}

const bounds: ExplorerBounds = Object.freeze({
  maximumTransactions: 2,
  maximumSteps: 12,
  maximumStates: 512,
});

export const contentionFixture = (): ContentionFixture => {
  const owner = domain("schedule-example");
  const x = tvar(owner, "x", 0);
  const y = tvar(owner, "y", 0);
  const initialStore = makeStore(owner, [x, y]);
  const left = sequence(owner, "left", [
    read(x, "left-x"),
    writeExpression(x, add(literal(0), literal(1))),
    writeExpression(y, add(literal(0), literal(1))),
  ]);
  const right = sequence(owner, "right", [
    read(x, "right-x"),
    writeExpression(x, add(literal(0), literal(2))),
    writeExpression(y, add(literal(0), literal(2))),
  ]);
  return { owner, x, y, initialStore, left, right };
};

export const contentionScenario = (): Scenario => {
  const fixture = contentionFixture();
  const transactions: ReadonlyArray<ScenarioTransactionInput> = [
    { id: "left", transaction: fixture.left },
    { id: "right", transaction: fixture.right },
  ];
  const scenario = makeScenario(
    "contention",
    fixture.initialStore,
    transactions,
    ["serializable_commits", "no_partial_publication", "relevant_retry_wakeup"],
    bounds,
  );
  if ("kind" in scenario) throw new Error(scenario.message);
  return scenario;
};

export const emptyScenario = (): Scenario => {
  const owner = domain("empty-schedule-example");
  const store = makeStore(owner, []);
  const scenario = makeScenario("empty", store, [], [], {
    maximumTransactions: 1,
    maximumSteps: 1,
    maximumStates: 1,
  });
  if ("kind" in scenario) throw new Error(scenario.message);
  return scenario;
};

export const scenarioJson = (): JsonValue => ({
  id: contentionScenario().id,
  bounds,
  properties: ["serializable_commits", "no_partial_publication", "relevant_retry_wakeup"],
  transactions: ["left", "right"],
});
