/**
 * Pure bounded schedule exploration over the authenticated STM 0014 model.
 *
 * The module deliberately owns no scheduler, clock, random source, or external
 * authority. Branches are recreated from the initial store and descriptions so
 * one-shot attempts never cross a branch boundary.
 */
import { canonicalJson } from "../tracer/canonical.ts";
import type { JsonObject, JsonValue } from "../tracer/json.ts";
import {
  beginAttempt,
  changedDependencies,
  discardAttempt,
  projectStore,
  rerunAttempt,
  settleAttempt,
  wakeAndRerun,
  type Attempt,
  type BeginResult,
  type CommitRecord,
  type Settlement,
  type Store,
  type Suspension,
  type Txn,
} from "../stm/model.ts";

export const EXPLORATION_FORMAT = "semantic.stm-exploration/v1" as const;
export const REPLAY_FORMAT = "semantic.stm-exploration-replay/v1" as const;

export const EXPLORER_CEILINGS = Object.freeze({
  maximumTransactions: 8,
  maximumSteps: 64,
  maximumStates: 10_000,
});

export const EXPLORER_PROPERTIES = Object.freeze([
  "serializable_commits",
  "no_partial_publication",
  "relevant_retry_wakeup",
  "all_transactions_terminal",
] as const);

export type ExplorerProperty = (typeof EXPLORER_PROPERTIES)[number];
export type ScheduleAction = "begin" | "settle" | "rerun" | "wake";
export type TransactionPhase =
  | "ready"
  | "attempt"
  | "conflicted"
  | "suspended"
  | "committed"
  | "aborted";
export type SettlementKind = Extract<
  Settlement["kind"],
  "committed" | "conflict" | "suspended" | "aborted"
>;

export interface ExplorerBounds extends JsonObject {
  readonly maximumTransactions: number;
  readonly maximumSteps: number;
  readonly maximumStates: number;
}

export type ExplorerTxn = Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>;

export interface NamedTransaction {
  readonly id: string;
  readonly transaction: ExplorerTxn;
}

export type ScenarioTransactionInput = ExplorerTxn | NamedTransaction;

export interface Scenario {
  readonly id: string;
  readonly initialStore: Store<string>;
  readonly transactions: ReadonlyArray<NamedTransaction>;
  readonly properties: ReadonlyArray<ExplorerProperty>;
  readonly bounds: ExplorerBounds;
}

export type InvalidScenarioReason =
  | "invalid_id"
  | "invalid_bounds"
  | "too_many_transactions"
  | "invalid_properties"
  | "duplicate_property"
  | "duplicate_transaction_id"
  | "invalid_transaction"
  | "store_rejected"
  | "transaction_rejected"
  | "cross_domain";

export interface InvalidScenario {
  readonly kind: "invalid_scenario";
  readonly reason: InvalidScenarioReason;
  readonly message: string;
  readonly scenario_id?: string;
  readonly transaction_id?: string;
  readonly index?: number;
}

export interface ScheduleChoice extends JsonObject {
  readonly transaction_id: string;
  readonly action: ScheduleAction;
}

export type PropertyOutcome = "holds_within_bounds" | "counterexample" | "unknown_due_to_bound";

export interface TraceStep extends JsonObject {
  readonly index: number;
  readonly choice: ScheduleChoice;
  readonly transaction_state_before: TransactionPhase;
  readonly transaction_state_after: TransactionPhase;
  readonly store_before: JsonObject;
  readonly store_after: JsonObject;
  readonly settlement_kind: SettlementKind | null;
  readonly changed_retry_dependencies: ReadonlyArray<string>;
  readonly commit_history: ReadonlyArray<JsonObject>;
}

export interface MachineProjection extends JsonObject {
  readonly store: JsonObject;
  readonly transactions: ReadonlyArray<JsonObject>;
  readonly commit_history: ReadonlyArray<JsonObject>;
}

export interface Counterexample extends JsonObject {
  readonly schedule: ReadonlyArray<ScheduleChoice>;
  readonly trace: ReadonlyArray<TraceStep>;
  readonly terminal_projection: MachineProjection;
}

export interface PropertyFinding extends JsonObject {
  readonly property: ExplorerProperty;
  readonly outcome: PropertyOutcome;
  readonly counterexample: Counterexample | null;
}

export interface ExplorationReport extends JsonObject {
  readonly format: typeof EXPLORATION_FORMAT;
  readonly scenario_id: string;
  readonly bounds: ExplorerBounds;
  readonly status: "complete" | "bounded";
  readonly visited_state_count: number;
  readonly explored_transition_count: number;
  readonly terminal_state_count: number;
  readonly deadlock_state_count: number;
  readonly properties: ReadonlyArray<PropertyFinding>;
  readonly assumptions: ReadonlyArray<string>;
  readonly unsupported_claims: ReadonlyArray<string>;
}

export interface ReplayReport extends JsonObject {
  readonly format: typeof REPLAY_FORMAT;
  readonly scenario_id: string;
  readonly schedule: ReadonlyArray<ScheduleChoice>;
  readonly trace: ReadonlyArray<TraceStep>;
  readonly terminal_projection: MachineProjection;
  readonly properties: ReadonlyArray<PropertyFinding>;
  readonly assumptions: ReadonlyArray<string>;
  readonly unsupported_claims: ReadonlyArray<string>;
}

export type ReplayRejectedReason =
  | "malformed_choice"
  | "unknown_transaction"
  | "unknown_action"
  | "disabled_choice"
  | "trailing_choice"
  | "step_limit";

export interface ReplayRejected {
  readonly kind: "replay_rejected";
  readonly index: number;
  readonly reason: ReplayRejectedReason;
  readonly message: string;
  readonly choice: unknown;
  readonly enabled_choices: ReadonlyArray<ScheduleChoice>;
}

interface RuntimeTransaction {
  readonly entry: NamedTransaction;
  phase: TransactionPhase;
  attempt: Attempt | undefined;
  suspension: Suspension | undefined;
  terminal: TerminalResult | undefined;
}

type TerminalResult =
  | {
      readonly kind: "committed";
      readonly value: JsonValue;
      readonly commit_actions: ReadonlyArray<JsonValue>;
      readonly attempt_ordinal: bigint;
    }
  | {
      readonly kind: "aborted";
      readonly error: JsonValue;
      readonly abort_actions: ReadonlyArray<JsonValue>;
      readonly attempt_ordinal: bigint;
    };

interface Machine {
  store: Store<string>;
  readonly transactions: Map<string, RuntimeTransaction>;
  history: ReadonlyArray<CommitRecord>;
  trace: ReadonlyArray<TraceStep>;
}

interface Execution {
  readonly machine: Machine;
  readonly schedule: ReadonlyArray<ScheduleChoice>;
}

interface InvalidExecution {
  readonly rejected: ReplayRejected;
}

type RunResult = Execution | InvalidExecution;

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const freezeDeep = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
};

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareChoices = (left: ScheduleChoice, right: ScheduleChoice): number => {
  const transactionOrder = compareStrings(left.transaction_id, right.transaction_id);
  return transactionOrder === 0 ? compareStrings(left.action, right.action) : transactionOrder;
};

const invalidScenario = (
  reason: InvalidScenarioReason,
  message: string,
  details: Omit<InvalidScenario, "kind" | "reason" | "message"> = {},
): InvalidScenario => freezeDeep({ kind: "invalid_scenario", reason, message, ...details });

const invalidReplay = (
  index: number,
  reason: ReplayRejectedReason,
  message: string,
  choice: unknown,
  enabledChoices: ReadonlyArray<ScheduleChoice>,
): ReplayRejected =>
  freezeDeep({
    kind: "replay_rejected",
    index,
    reason,
    message,
    choice,
    enabled_choices: Object.freeze(enabledChoices.map((item) => Object.freeze({ ...item }))),
  });

const isExplorerProperty = (value: unknown): value is ExplorerProperty =>
  typeof value === "string" && (EXPLORER_PROPERTIES as readonly string[]).includes(value);

const validBounds = (value: unknown): value is ExplorerBounds => {
  if (!isObject(value)) return false;
  return (
    Number.isSafeInteger(value.maximumTransactions) &&
    Number(value.maximumTransactions) >= 1 &&
    Number(value.maximumTransactions) <= EXPLORER_CEILINGS.maximumTransactions &&
    Number.isSafeInteger(value.maximumSteps) &&
    Number(value.maximumSteps) >= 1 &&
    Number(value.maximumSteps) <= EXPLORER_CEILINGS.maximumSteps &&
    Number.isSafeInteger(value.maximumStates) &&
    Number(value.maximumStates) >= 1 &&
    Number(value.maximumStates) <= EXPLORER_CEILINGS.maximumStates
  );
};

const normalizedEntry = (value: ScenarioTransactionInput): NamedTransaction | undefined => {
  if (isObject(value) && typeof value.id === "string" && "transaction" in value) {
    const transaction = value.transaction;
    if (!isObject(transaction)) return undefined;
    return { id: value.id, transaction: transaction as ExplorerTxn };
  }
  if (isObject(value) && typeof value.id === "string") {
    return { id: value.id, transaction: value as ExplorerTxn };
  }
  return undefined;
};

const requireAttempt = (result: BeginResult, transactionId: string): Attempt | InvalidScenario => {
  if (result.kind === "attempt") return result.attempt;
  if (result.kind === "domain_rejected") {
    return invalidScenario(
      "cross_domain",
      `transaction ${transactionId} crosses the store domain`,
      { transaction_id: transactionId },
    );
  }
  if (result.kind === "store_rejected") {
    return invalidScenario("store_rejected", "initial store is not handler-custodied", {
      transaction_id: transactionId,
    });
  }
  return invalidScenario("transaction_rejected", `transaction ${transactionId} is not custodied`, {
    transaction_id: transactionId,
  });
};

export function makeScenario(
  id: string,
  initialStore: Store<string>,
  transactions: ReadonlyArray<ScenarioTransactionInput>,
  properties: ReadonlyArray<ExplorerProperty>,
  bounds: ExplorerBounds,
): Scenario | InvalidScenario {
  if (typeof id !== "string" || id.length === 0) {
    return invalidScenario("invalid_id", "scenario id must be a non-empty string");
  }
  if (!validBounds(bounds)) {
    return invalidScenario(
      "invalid_bounds",
      `bounds must be positive safe integers no larger than ${EXPLORER_CEILINGS.maximumTransactions}/${EXPLORER_CEILINGS.maximumSteps}/${EXPLORER_CEILINGS.maximumStates}`,
      { scenario_id: id },
    );
  }
  if (!Array.isArray(transactions)) {
    return invalidScenario("invalid_transaction", "transactions must be an array", {
      scenario_id: id,
    });
  }
  if (transactions.length > bounds.maximumTransactions) {
    return invalidScenario(
      "too_many_transactions",
      `scenario declares ${transactions.length} transactions but the bound is ${bounds.maximumTransactions}`,
      { scenario_id: id },
    );
  }
  if (!Array.isArray(properties) || properties.some((property) => !isExplorerProperty(property))) {
    return invalidScenario(
      "invalid_properties",
      "properties must use the closed explorer vocabulary",
      {
        scenario_id: id,
      },
    );
  }
  const seenProperties = new Set<string>();
  for (const property of properties) {
    if (seenProperties.has(property)) {
      return invalidScenario(
        "duplicate_property",
        `property ${property} is listed more than once`,
        {
          scenario_id: id,
        },
      );
    }
    seenProperties.add(property);
  }
  try {
    projectStore(initialStore);
  } catch (cause) {
    return invalidScenario(
      "store_rejected",
      cause instanceof Error ? cause.message : "initial store is not handler-custodied",
      { scenario_id: id },
    );
  }

  const entries: NamedTransaction[] = [];
  const seenIds = new Set<string>();
  for (const [index, input] of transactions.entries()) {
    const entry = normalizedEntry(input);
    if (entry === undefined || entry.id.length === 0) {
      return invalidScenario("invalid_transaction", `transaction at index ${index} is invalid`, {
        scenario_id: id,
        index,
      });
    }
    if (seenIds.has(entry.id)) {
      return invalidScenario(
        "duplicate_transaction_id",
        `transaction id ${entry.id} is duplicated`,
        {
          scenario_id: id,
          transaction_id: entry.id,
          index,
        },
      );
    }
    seenIds.add(entry.id);
    const began = (() => {
      try {
        return beginAttempt(initialStore, entry.transaction, 1n);
      } catch (cause) {
        return undefined;
      }
    })();
    if (began === undefined) {
      return invalidScenario(
        "transaction_rejected",
        `transaction ${entry.id} could not be evaluated`,
        {
          scenario_id: id,
          transaction_id: entry.id,
          index,
        },
      );
    }
    const attempt = requireAttempt(began, entry.id);
    if (!isAttempt(attempt)) return { ...attempt, index } as InvalidScenario;
    try {
      discardAttempt(initialStore, attempt, "interrupted");
    } catch (cause) {
      return invalidScenario(
        "transaction_rejected",
        `transaction ${entry.id} could not be discarded`,
        {
          scenario_id: id,
          transaction_id: entry.id,
          index,
        },
      );
    }
    entries.push(Object.freeze({ id: entry.id, transaction: entry.transaction }));
  }

  const sortedEntries = Object.freeze(
    entries.sort((left, right) => compareStrings(left.id, right.id)),
  );
  const sortedProperties = Object.freeze(
    [...properties].sort((left, right) => compareStrings(left, right)),
  );
  return freezeDeep({
    id,
    initialStore,
    transactions: sortedEntries,
    properties: sortedProperties,
    bounds: Object.freeze({
      maximumTransactions: bounds.maximumTransactions,
      maximumSteps: bounds.maximumSteps,
      maximumStates: bounds.maximumStates,
    }),
  });
}

const isAttempt = (value: Attempt | InvalidScenario): value is Attempt =>
  !isObject(value) || !("kind" in value) || value.kind !== "invalid_scenario";

const projectJsonArray = (values: ReadonlyArray<JsonValue>): ReadonlyArray<JsonValue> =>
  Object.freeze(values.map((value) => value));

const projectEvaluation = (attempt: Attempt): JsonObject => {
  switch (attempt.evaluation.kind) {
    case "success":
      return Object.freeze({ kind: "success", value: attempt.evaluation.value });
    case "retry":
      return Object.freeze({
        kind: "retry",
        dependencies: Object.freeze([...attempt.evaluation.dependencies]),
      });
    case "typed_abort":
      return Object.freeze({
        kind: "typed_abort",
        error: attempt.evaluation.error,
        abort_actions: projectJsonArray(attempt.evaluation.abortActions),
      });
  }
};

const projectAttempt = (attempt: Attempt): JsonObject =>
  Object.freeze({
    description_id: attempt.description.id,
    ordinal: attempt.ordinal.toString(10),
    start_versions: Object.freeze(
      attempt.startVersions.map((entry) =>
        Object.freeze({ id: entry.id, version: entry.version.toString(10) }),
      ),
    ),
    read_set: Object.freeze(
      attempt.readSet.map((entry) =>
        Object.freeze({
          id: entry.id,
          version: entry.version.toString(10),
          value: entry.value,
        }),
      ),
    ),
    write_set: Object.freeze(
      attempt.writeSet.map((entry) => Object.freeze({ id: entry.id, value: entry.value })),
    ),
    commit_actions: projectJsonArray(attempt.commitActions),
    evaluation: projectEvaluation(attempt),
  });

const projectSuspension = (suspension: Suspension): JsonObject =>
  Object.freeze({
    attempt_ordinal: suspension.attemptOrdinal.toString(10),
    dependencies: Object.freeze(
      suspension.dependencies.map((dependency) =>
        Object.freeze({
          id: dependency.id,
          observed_version: dependency.observedVersion.toString(10),
        }),
      ),
    ),
  });

const projectTerminal = (terminal: TerminalResult | undefined): JsonObject | null => {
  if (terminal === undefined) return null;
  return terminal.kind === "committed"
    ? Object.freeze({
        kind: terminal.kind,
        value: terminal.value,
        commit_actions: projectJsonArray(terminal.commit_actions),
        attempt_ordinal: terminal.attempt_ordinal.toString(10),
      })
    : Object.freeze({
        kind: terminal.kind,
        error: terminal.error,
        abort_actions: projectJsonArray(terminal.abort_actions),
        attempt_ordinal: terminal.attempt_ordinal.toString(10),
      });
};

const projectHistory = (history: ReadonlyArray<CommitRecord>): ReadonlyArray<JsonObject> =>
  Object.freeze(
    history.map((record) =>
      Object.freeze({
        transaction_id: record.transactionId,
        reads: Object.freeze(
          record.reads.map((entry) => Object.freeze({ id: entry.id, value: entry.value })),
        ),
        writes: Object.freeze(
          record.writes.map((entry) => Object.freeze({ id: entry.id, value: entry.value })),
        ),
      }),
    ),
  );

const projectMachine = (machine: Machine): MachineProjection =>
  Object.freeze({
    store: projectStore(machine.store),
    transactions: Object.freeze(
      [...machine.transactions.values()]
        .sort((left, right) => compareStrings(left.entry.id, right.entry.id))
        .map((state) =>
          Object.freeze({
            id: state.entry.id,
            transaction_id: state.entry.transaction.id,
            phase: state.phase,
            attempt: state.attempt === undefined ? null : projectAttempt(state.attempt),
            suspension: state.suspension === undefined ? null : projectSuspension(state.suspension),
            terminal: projectTerminal(state.terminal),
          }),
        ),
    ),
    commit_history: projectHistory(machine.history),
  });

const projectionBytes = (projection: MachineProjection): string =>
  canonicalJson(projection as unknown as JsonValue);

const initialMachine = (scenario: Scenario): Machine => ({
  store: scenario.initialStore,
  transactions: new Map(
    scenario.transactions.map((entry): readonly [string, RuntimeTransaction] => [
      entry.id,
      {
        entry,
        phase: "ready",
        attempt: undefined,
        suspension: undefined,
        terminal: undefined,
      },
    ]),
  ),
  history: Object.freeze([]),
  trace: Object.freeze([]),
});

const enabledChoices = (machine: Machine): ReadonlyArray<ScheduleChoice> => {
  const choices: ScheduleChoice[] = [];
  for (const state of [...machine.transactions.values()].sort((left, right) =>
    compareStrings(left.entry.id, right.entry.id),
  )) {
    if (state.phase === "ready") choices.push({ transaction_id: state.entry.id, action: "begin" });
    else if (state.phase === "attempt")
      choices.push({ transaction_id: state.entry.id, action: "settle" });
    else if (state.phase === "conflicted")
      choices.push({ transaction_id: state.entry.id, action: "rerun" });
    else if (state.phase === "suspended" && state.suspension !== undefined) {
      const changed = changedDependencies(state.suspension, machine.store);
      if (changed.length > 0) choices.push({ transaction_id: state.entry.id, action: "wake" });
    }
  }
  return Object.freeze(choices.sort(compareChoices).map((choice) => Object.freeze(choice)));
};

const isChoice = (value: unknown): value is ScheduleChoice =>
  isObject(value) && typeof value.transaction_id === "string" && typeof value.action === "string";

const actionNames: Record<ScheduleAction, true> = {
  begin: true,
  settle: true,
  rerun: true,
  wake: true,
};

const findReplayRejection = (
  index: number,
  choice: unknown,
  enabled: ReadonlyArray<ScheduleChoice>,
  scenario: Scenario,
): ReplayRejected | undefined => {
  if (!isChoice(choice)) {
    return invalidReplay(
      index,
      "malformed_choice",
      "replay choice must contain a transaction_id and action",
      choice,
      enabled,
    );
  }
  if (!scenario.transactions.some((entry) => entry.id === choice.transaction_id)) {
    return invalidReplay(
      index,
      "unknown_transaction",
      `replay choice names unknown transaction ${choice.transaction_id}`,
      choice,
      enabled,
    );
  }
  if (!Object.hasOwn(actionNames, choice.action)) {
    return invalidReplay(
      index,
      "unknown_action",
      `replay action ${choice.action} is not closed`,
      choice,
      enabled,
    );
  }
  if (
    !enabled.some(
      (item) => item.transaction_id === choice.transaction_id && item.action === choice.action,
    )
  ) {
    return invalidReplay(
      index,
      "disabled_choice",
      `replay choice is disabled at index ${index}`,
      choice,
      enabled,
    );
  }
  return undefined;
};

const mutateWithChoice = (machine: Machine, choice: ScheduleChoice): TraceStep => {
  const state = machine.transactions.get(choice.transaction_id);
  if (state === undefined) throw new Error(`unknown transaction ${choice.transaction_id}`);
  const beforePhase = state.phase;
  const storeBefore = projectStore(machine.store);
  const changed =
    state.phase === "suspended" && state.suspension !== undefined
      ? changedDependencies(state.suspension, machine.store)
      : Object.freeze([] as string[]);
  let settlementKind: SettlementKind | null = null;

  switch (choice.action) {
    case "begin": {
      const result = beginAttempt(machine.store, state.entry.transaction, 1n);
      if (result.kind !== "attempt")
        throw new Error(`begin rejected transaction ${state.entry.id}`);
      state.phase = "attempt";
      state.attempt = result.attempt;
      state.suspension = undefined;
      state.terminal = undefined;
      break;
    }
    case "settle": {
      if (state.attempt === undefined)
        throw new Error(`transaction ${state.entry.id} has no attempt`);
      const settlement = settleAttempt(machine.store, state.attempt);
      if (settlement.kind === "invalid_attempt")
        throw new Error(`settlement rejected transaction ${state.entry.id}`);
      settlementKind = settlement.kind;
      if (settlement.kind === "committed") {
        machine.store = settlement.store;
        machine.history = Object.freeze([...machine.history, settlement.history]);
        state.phase = "committed";
        state.terminal = Object.freeze({
          kind: "committed",
          value: settlement.value,
          commit_actions: settlement.commitActions,
          attempt_ordinal: settlement.attemptOrdinal,
        });
        state.attempt = undefined;
        state.suspension = undefined;
      } else if (settlement.kind === "conflict") {
        state.phase = "conflicted";
        // The model's rerunnable custody retains this one-shot attempt until rerun.
      } else if (settlement.kind === "suspended") {
        state.phase = "suspended";
        state.suspension = settlement.suspension;
        state.attempt = undefined;
      } else {
        state.phase = "aborted";
        state.terminal = Object.freeze({
          kind: "aborted",
          error: settlement.error,
          abort_actions: settlement.abortActions,
          attempt_ordinal: settlement.attemptOrdinal,
        });
        state.attempt = undefined;
        state.suspension = undefined;
      }
      break;
    }
    case "rerun": {
      if (state.attempt === undefined)
        throw new Error(`transaction ${state.entry.id} has no conflict attempt`);
      const result = rerunAttempt(machine.store, state.attempt);
      if (result.kind !== "attempt")
        throw new Error(`rerun rejected transaction ${state.entry.id}`);
      state.phase = "attempt";
      state.attempt = result.attempt;
      state.suspension = undefined;
      break;
    }
    case "wake": {
      if (state.suspension === undefined)
        throw new Error(`transaction ${state.entry.id} has no suspension`);
      const result = wakeAndRerun(state.suspension, machine.store);
      if (result === undefined || result.kind !== "attempt") {
        throw new Error(`wake rejected transaction ${state.entry.id}`);
      }
      state.phase = "attempt";
      state.attempt = result.attempt;
      state.suspension = undefined;
      break;
    }
  }

  const storeAfter = projectStore(machine.store);
  const traceStep: TraceStep = Object.freeze({
    index: machine.trace.length,
    choice: Object.freeze({ ...choice }),
    transaction_state_before: beforePhase,
    transaction_state_after: state.phase,
    store_before: storeBefore,
    store_after: storeAfter,
    settlement_kind: settlementKind,
    changed_retry_dependencies: Object.freeze([...changed]),
    commit_history: projectHistory(machine.history),
  });
  machine.trace = Object.freeze([...machine.trace, traceStep]);
  return traceStep;
};

const runSchedule = (scenario: Scenario, schedule: ReadonlyArray<ScheduleChoice>): RunResult => {
  const machine = initialMachine(scenario);
  for (const [index, item] of schedule.entries()) {
    const enabled = enabledChoices(machine);
    if (enabled.length === 0) {
      return {
        rejected: invalidReplay(
          index,
          "trailing_choice",
          "replay choice follows a state with no enabled choices",
          item,
          enabled,
        ),
      };
    }
    if (index >= scenario.bounds.maximumSteps) {
      return {
        rejected: invalidReplay(index, "step_limit", "replay exceeds maximumSteps", item, enabled),
      };
    }
    const rejected = findReplayRejection(index, item, enabled, scenario);
    if (rejected !== undefined) return { rejected };
    mutateWithChoice(machine, item);
  }
  return { machine, schedule: Object.freeze(schedule.map((item) => Object.freeze({ ...item }))) };
};

const allTerminal = (machine: Machine): boolean =>
  [...machine.transactions.values()].every(
    (state) => state.phase === "committed" || state.phase === "aborted",
  );

const deadlocked = (machine: Machine, enabled: ReadonlyArray<ScheduleChoice>): boolean =>
  !allTerminal(machine) && enabled.length === 0;

const traceHasPartialPublication = (trace: ReadonlyArray<TraceStep>): boolean =>
  trace.some(
    (step) =>
      step.settlement_kind !== "committed" &&
      canonicalJson(step.store_before as unknown as JsonValue) !==
        canonicalJson(step.store_after as unknown as JsonValue),
  );

const traceHasBadWake = (trace: ReadonlyArray<TraceStep>): boolean =>
  trace.some(
    (step) => step.choice.action === "wake" && step.changed_retry_dependencies.length === 0,
  );

const retryWakeInvariantHolds = (
  machine: Machine,
  enabled: ReadonlyArray<ScheduleChoice>,
): boolean => {
  for (const state of machine.transactions.values()) {
    if (state.phase !== "suspended" || state.suspension === undefined) continue;
    const changed = changedDependencies(state.suspension, machine.store);
    const wakeEnabled = enabled.some(
      (choice) => choice.transaction_id === state.entry.id && choice.action === "wake",
    );
    if (changed.length > 0 !== wakeEnabled) return false;
  }
  return true;
};

const violations = (
  scenario: Scenario,
  execution: Execution,
  enabled: ReadonlyArray<ScheduleChoice>,
): ReadonlySet<ExplorerProperty> => {
  const found = new Set<ExplorerProperty>();
  if (!isSeriallyEquivalent(scenario.initialStore, execution.machine.history)) {
    found.add("serializable_commits");
  }
  if (traceHasPartialPublication(execution.machine.trace)) found.add("no_partial_publication");
  if (
    traceHasBadWake(execution.machine.trace) ||
    !retryWakeInvariantHolds(execution.machine, enabled)
  ) {
    found.add("relevant_retry_wakeup");
  }
  if (deadlocked(execution.machine, enabled)) found.add("all_transactions_terminal");
  return found;
};

const assumptions = Object.freeze([
  "the authenticated 0014 model implements its documented transition rules",
  "scenario transaction descriptions remain immutable between replays",
  "canonical JSON encoding is deterministic for report comparison",
]);

const unsupportedClaims = Object.freeze([
  "serializability outside the explored finite state space",
  "liveness, fairness, lock freedom, and starvation freedom",
  "production scheduler behavior",
  "host memory safety",
  "correctness of Effect primitives",
]);

const counterexampleFor = (execution: Execution): Counterexample =>
  Object.freeze({
    schedule: Object.freeze(execution.schedule.map((item) => Object.freeze({ ...item }))),
    trace: execution.machine.trace,
    terminal_projection: projectMachine(execution.machine),
  });

const finding = (
  property: ExplorerProperty,
  outcome: PropertyOutcome,
  counterexample: Counterexample | null,
): PropertyFinding => Object.freeze({ property, outcome, counterexample });

const makeProperties = (
  scenario: Scenario,
  status: "complete" | "bounded",
  counterexamples: ReadonlyMap<ExplorerProperty, Counterexample>,
): ReadonlyArray<PropertyFinding> =>
  Object.freeze(
    scenario.properties.map((property) => {
      const counterexample = counterexamples.get(property);
      return finding(
        property,
        counterexample !== undefined
          ? "counterexample"
          : status === "complete"
            ? "holds_within_bounds"
            : "unknown_due_to_bound",
        counterexample ?? null,
      );
    }),
  );
export const exploreScenario = (scenario: Scenario): ExplorationReport => {
  const initial = initialMachine(scenario);
  const initialProjection = projectMachine(initial);
  const pending: Array<ReadonlyArray<ScheduleChoice>> = [Object.freeze([])];
  const visited = new Set<string>([projectionBytes(initialProjection)]);
  const counterexamples = new Map<ExplorerProperty, Counterexample>();
  let visitedStateCount = 1;
  let exploredTransitionCount = 0;
  let terminalStateCount = 0;
  let deadlockStateCount = 0;
  let bounded = false;
  let queueIndex = 0;

  const observe = (execution: Execution, enabled: ReadonlyArray<ScheduleChoice>): void => {
    const found = violations(scenario, execution, enabled);
    for (const property of scenario.properties) {
      if (found.has(property) && !counterexamples.has(property)) {
        counterexamples.set(property, counterexampleFor(execution));
      }
    }
  };

  while (queueIndex < pending.length) {
    const schedule = pending[queueIndex++]!;
    const result = runSchedule(scenario, schedule);
    if (!("machine" in result)) throw new Error("explorer generated an invalid schedule");
    const execution: Execution = result;
    const enabled = enabledChoices(execution.machine);
    observe(execution, enabled);
    if (allTerminal(execution.machine)) terminalStateCount += 1;
    else if (enabled.length === 0) deadlockStateCount += 1;
    if (enabled.length === 0) continue;
    if (schedule.length >= scenario.bounds.maximumSteps) {
      bounded = true;
      continue;
    }
    for (const choice of enabled) {
      exploredTransitionCount += 1;
      const nextSchedule = Object.freeze([...schedule, choice]);
      const nextResult = runSchedule(scenario, nextSchedule);
      if (!("machine" in nextResult)) throw new Error("explorer generated an invalid successor");
      const nextExecution: Execution = nextResult;
      const nextEnabled = enabledChoices(nextExecution.machine);
      observe(nextExecution, nextEnabled);
      const nextProjection = projectMachine(nextExecution.machine);
      const bytes = projectionBytes(nextProjection);
      if (visited.has(bytes)) continue;
      if (visitedStateCount >= scenario.bounds.maximumStates) {
        bounded = true;
        continue;
      }
      visited.add(bytes);
      visitedStateCount += 1;
      pending.push(nextSchedule);
    }
  }

  const status = bounded ? "bounded" : "complete";
  return freezeDeep({
    format: EXPLORATION_FORMAT,
    scenario_id: scenario.id,
    bounds: scenario.bounds,
    status,
    visited_state_count: visitedStateCount,
    explored_transition_count: exploredTransitionCount,
    terminal_state_count: terminalStateCount,
    deadlock_state_count: deadlockStateCount,
    properties: makeProperties(scenario, status, counterexamples),
    assumptions,
    unsupported_claims: unsupportedClaims,
  });
};

const replayProperties = (
  scenario: Scenario,
  execution: Execution,
  enabled: ReadonlyArray<ScheduleChoice>,
): ReadonlyArray<PropertyFinding> => {
  const found = violations(scenario, execution, enabled);
  const counterexamples = new Map<ExplorerProperty, Counterexample>();
  for (const property of scenario.properties) {
    if (found.has(property)) counterexamples.set(property, counterexampleFor(execution));
  }
  return makeProperties(scenario, "complete", counterexamples);
};

export const replaySchedule = (
  scenario: Scenario,
  schedule: ReadonlyArray<ScheduleChoice>,
): ReplayReport | ReplayRejected => {
  if (!Array.isArray(schedule)) {
    return invalidReplay(0, "malformed_choice", "replay schedule must be an array", schedule, []);
  }
  const result = runSchedule(scenario, schedule);
  if (!("machine" in result)) return result.rejected;
  const execution: Execution = result;
  const enabled = enabledChoices(execution.machine);
  const projection = projectMachine(execution.machine);
  return freezeDeep({
    format: REPLAY_FORMAT,
    scenario_id: scenario.id,
    schedule: execution.schedule,
    trace: execution.machine.trace,
    terminal_projection: projection,
    properties: replayProperties(scenario, execution, enabled),
    assumptions,
    unsupported_claims: unsupportedClaims,
  });
};

export const encodeExplorationReport = (report: ExplorationReport | ReplayReport): Uint8Array =>
  new TextEncoder().encode(canonicalJson(report as unknown as JsonValue));
