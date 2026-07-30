import { canonicalJson } from "../tracer/canonical.ts";
import type { JsonObject, JsonValue } from "../tracer/json.ts";
import {
  abort,
  add,
  afterCommit,
  beginAttempt,
  binding,
  changedDependencies,
  domain,
  equal,
  inspectCell,
  isPortableData,
  isSeriallyEquivalent,
  literal,
  makeStore,
  nested,
  orElse,
  projectStore,
  read,
  rerunAttempt,
  retry,
  sequence,
  serialOrderingsFor,
  settleAttempt,
  succeed,
  tvar,
  wakeAndRerun,
  when,
  write,
  type Attempt,
  type BeginResult,
  type CommitRecord,
  type Settlement,
  type Store,
  type TVar,
  type Txn,
} from "./model.ts";

export type RuntimeLayer = "bun" | "node";

const requireAttempt = (result: BeginResult): Attempt => {
  if (result.kind !== "attempt") throw new Error(`expected attempt, got ${result.kind}`);
  return result.attempt;
};

const requireCommitted = (settlement: Settlement): Extract<Settlement, { kind: "committed" }> => {
  if (settlement.kind !== "committed") {
    throw new Error(`expected commit, got ${settlement.kind}`);
  }
  return settlement;
};

const commit = (
  store: Store<string>,
  transaction: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>,
): Extract<Settlement, { kind: "committed" }> =>
  requireCommitted(settleAttempt(store, requireAttempt(beginAttempt(store, transaction))));

interface ReferenceScenario {
  readonly initial: Store<string>;
  readonly x: TVar<string, JsonValue>;
  readonly y: TVar<string, JsonValue>;
  readonly unrelated: TVar<string, JsonValue>;
  readonly firstAttempt: Attempt;
  readonly interloper: Extract<Settlement, { kind: "committed" }>;
  readonly conflict: Extract<Settlement, { kind: "conflict" }>;
  readonly rerun: Attempt;
  readonly committed: Extract<Settlement, { kind: "committed" }>;
}

const referenceScenario = (): ReferenceScenario => {
  const owner = domain("reference-domain");
  const x = tvar(owner, "x", 0);
  const y = tvar(owner, "y", 0);
  const unrelated = tvar(owner, "unrelated", 0);
  const initial = makeStore(owner, [x, y, unrelated]);
  const transaction = sequence(
    owner,
    "increment-both",
    [
      read(x, "observed-x"),
      write(x, add(binding("observed-x"), literal(1))),
      write(y, add(binding("observed-x"), literal(1))),
      afterCommit(owner, { kind: "published", transaction: "increment-both" }),
    ],
    binding("observed-x"),
  );
  const firstAttempt = requireAttempt(beginAttempt(initial, transaction));
  const interloper = commit(initial, write(x, 10));
  const conflictResult = settleAttempt(interloper.store, firstAttempt);
  if (conflictResult.kind !== "conflict") throw new Error("reference conflict was not observed");
  const rerun = requireAttempt(rerunAttempt(interloper.store, firstAttempt));
  const committed = requireCommitted(settleAttempt(interloper.store, rerun));
  return {
    initial,
    x,
    y,
    unrelated,
    firstAttempt,
    interloper,
    conflict: conflictResult,
    rerun,
    committed,
  };
};

const retryScenario = (
  base: ReferenceScenario,
): {
  readonly suspended: Extract<Settlement, { kind: "suspended" }>;
  readonly unrelatedStore: Store<string>;
  readonly relevantStore: Store<string>;
  readonly wakeAttempt: Attempt;
} => {
  const retrying = sequence(
    base.initial.domain,
    "wait-for-x",
    [
      read(base.x, "wake-x"),
      when(
        base.initial.domain,
        equal(binding("wake-x"), literal(0)),
        retry(base.initial.domain, "x-still-zero"),
        succeed(base.initial.domain, "x-ready", "ready"),
        "wake-result",
      ),
    ],
    binding("wake-result"),
  );
  const retryAttempt = requireAttempt(beginAttempt(base.initial, retrying));
  const suspendedResult = settleAttempt(base.initial, retryAttempt);
  if (suspendedResult.kind !== "suspended") throw new Error("retry did not suspend");
  const unrelatedStore = commit(base.initial, write(base.unrelated, 1)).store;
  const relevantStore = commit(unrelatedStore, write(base.x, 1)).store;
  const wake = wakeAndRerun(suspendedResult.suspension, relevantStore);
  if (wake === undefined || wake.kind !== "attempt")
    throw new Error("relevant change did not wake");
  return {
    suspended: suspendedResult,
    unrelatedStore,
    relevantStore,
    wakeAttempt: wake.attempt,
  };
};

const alternativeScenario = (
  base: ReferenceScenario,
): {
  readonly committed: Extract<Settlement, { kind: "committed" }>;
  readonly union: Extract<Settlement, { kind: "suspended" }>;
  readonly abortSettlement: Extract<Settlement, { kind: "aborted" }>;
} => {
  const left = sequence(base.initial.domain, "left-retries", [
    read(base.x, "left-x"),
    write(base.y, 99),
    afterCommit(base.initial.domain, { branch: "left" }),
    retry(base.initial.domain, "left-retry"),
  ]);
  const right = sequence(
    base.initial.domain,
    "right-succeeds",
    [write(base.y, 2), afterCommit(base.initial.domain, { branch: "right" })],
    literal("right"),
  );
  const committed = requireCommitted(
    settleAttempt(base.initial, requireAttempt(beginAttempt(base.initial, orElse(left, right)))),
  );

  const leftWait = sequence(base.initial.domain, "left-wait", [
    read(base.x, "union-x"),
    retry(base.initial.domain, "left-union-retry"),
  ]);
  const rightWait = sequence(base.initial.domain, "right-wait", [
    read(base.y, "union-y"),
    retry(base.initial.domain, "right-union-retry"),
  ]);
  const unionResult = settleAttempt(
    base.initial,
    requireAttempt(beginAttempt(base.initial, orElse(leftWait, rightWait))),
  );
  if (unionResult.kind !== "suspended") throw new Error("alternative union did not suspend");

  const typedAbort = abort(
    base.initial.domain,
    { reason: "permanent" },
    [{ kind: "compensate" }],
    "permanent-abort",
  );
  const fallback = succeed(base.initial.domain, "forbidden-fallback", "fallback");
  const abortResult = settleAttempt(
    base.initial,
    requireAttempt(beginAttempt(base.initial, orElse(typedAbort, fallback))),
  );
  if (abortResult.kind !== "aborted") throw new Error("typed abort was treated as retry");
  return { committed, union: unionResult, abortSettlement: abortResult };
};

const blindWriteConflicts = (base: ReferenceScenario): boolean => {
  const first = requireAttempt(beginAttempt(base.initial, write(base.y, 1)));
  const second = requireAttempt(beginAttempt(base.initial, write(base.y, 2)));
  const firstCommit = requireCommitted(settleAttempt(base.initial, first));
  return settleAttempt(firstCommit.store, second).kind === "conflict";
};

const nestingIsAtomic = (base: ReferenceScenario): boolean => {
  const inner = sequence(base.initial.domain, "inner", [
    write(base.x, 7),
    afterCommit(base.initial.domain, { order: 1 }),
  ]);
  const outer = sequence(base.initial.domain, "outer", [
    nested(base.initial.domain, inner),
    write(base.y, 8),
    afterCommit(base.initial.domain, { order: 2 }),
  ]);
  const attempt = requireAttempt(beginAttempt(base.initial, outer));
  const before = projectStore(base.initial);
  const settlement = requireCommitted(settleAttempt(base.initial, attempt));
  return (
    canonicalJson(before) === canonicalJson(projectStore(base.initial)) &&
    inspectCell(settlement.store, base.x).value === 7 &&
    inspectCell(settlement.store, base.y).value === 8 &&
    canonicalJson(settlement.commitActions) === canonicalJson([{ order: 1 }, { order: 2 }])
  );
};

const crossDomainRejected = (base: ReferenceScenario): boolean => {
  const foreign = domain("foreign-domain");
  const foreignRef = tvar(foreign, "foreign", 0);
  const illegal = nested(base.initial.domain, write(foreignRef, 1));
  const result = beginAttempt(base.initial, illegal);
  return result.kind === "domain_rejected" && !result.attemptStarted;
};

const histories = (
  base: ReferenceScenario,
): {
  readonly boundedSchedules: ReadonlyArray<JsonObject>;
  readonly serialOrderings: ReadonlyArray<ReadonlyArray<string>>;
  readonly rejectsCycle: boolean;
  readonly maximumAttempts: bigint;
  readonly maximumSteps: bigint;
} => {
  type Phase =
    | { readonly kind: "ready"; readonly conflicted?: Attempt }
    | { readonly kind: "attempt"; readonly attempt: Attempt }
    | { readonly kind: "committed" };
  interface Replay {
    readonly phases: readonly [Phase, Phase];
    readonly store: Store<string>;
    readonly initial: Store<string>;
    readonly history: ReadonlyArray<CommitRecord>;
    readonly events: ReadonlyArray<JsonObject>;
    readonly attempts: readonly [bigint, bigint];
  }

  const replay = (choices: ReadonlyArray<0 | 1>): Replay => {
    const owner = domain("bounded-scheduler-domain");
    const x = tvar(owner, "x", 0);
    const y = tvar(owner, "y", 0);
    const initial = makeStore(owner, [x, y]);
    const descriptions = [
      sequence(owner, "scheduler-a", [
        read(x, "scheduler-a-x"),
        write(x, add(binding("scheduler-a-x"), literal(1))),
        write(y, 1),
        afterCommit(owner, { transaction: "scheduler-a" }),
      ]),
      sequence(owner, "scheduler-b", [
        read(x, "scheduler-b-x"),
        write(x, add(binding("scheduler-b-x"), literal(2))),
        write(y, 2),
        afterCommit(owner, { transaction: "scheduler-b" }),
      ]),
    ] as const;
    let phases: [Phase, Phase] = [{ kind: "ready" }, { kind: "ready" }];
    let store: Store<string> = initial;
    const history: CommitRecord[] = [];
    const events: JsonObject[] = [];
    const attempts: [bigint, bigint] = [0n, 0n];

    for (const selected of choices) {
      const phase = phases[selected];
      const transactionId = descriptions[selected].id;
      if (phase.kind === "committed") {
        throw new Error(`scheduler selected completed transaction ${transactionId}`);
      }
      if (phase.kind === "ready") {
        const begun =
          phase.conflicted === undefined
            ? beginAttempt(store, descriptions[selected])
            : rerunAttempt(store, phase.conflicted);
        const attempt = requireAttempt(begun);
        attempts[selected] = attempt.ordinal;
        phases[selected] = { kind: "attempt", attempt };
        events.push(
          Object.freeze({
            step: BigInt(events.length + 1).toString(10),
            transaction_id: transactionId,
            operation: "begin_read_stage",
            attempt: attempt.ordinal.toString(10),
          }),
        );
        continue;
      }
      const settlement = settleAttempt(store, phase.attempt);
      if (settlement.kind === "conflict") {
        phases[selected] = { kind: "ready", conflicted: phase.attempt };
      } else if (settlement.kind === "committed") {
        store = settlement.store;
        history.push(settlement.history);
        phases[selected] = { kind: "committed" };
      } else {
        throw new Error(
          `bounded scheduler transaction ${transactionId} settled as ${settlement.kind}`,
        );
      }
      events.push(
        Object.freeze({
          step: BigInt(events.length + 1).toString(10),
          transaction_id: transactionId,
          operation: "validate_publish",
          attempt: phase.attempt.ordinal.toString(10),
          result: settlement.kind,
        }),
      );
    }
    return {
      phases,
      store,
      initial,
      history: Object.freeze(history),
      events: Object.freeze(events),
      attempts,
    };
  };

  const terminalSchedules: JsonObject[] = [];
  const explore = (choices: ReadonlyArray<0 | 1>): void => {
    const state = replay(choices);
    if (state.phases.every((phase) => phase.kind === "committed")) {
      const orderings = serialOrderingsFor(state.initial, state.history);
      terminalSchedules.push(
        Object.freeze({
          id: `schedule-${terminalSchedules.length + 1}`,
          scheduler_choices: Object.freeze(
            choices.map((selected) => (selected === 0 ? "scheduler-a" : "scheduler-b")),
          ),
          events: state.events,
          committed_history: Object.freeze(
            state.history.map((record) =>
              Object.freeze({
                transaction_id: record.transactionId,
                reads: record.reads,
                writes: record.writes,
              }),
            ),
          ),
          final_store: projectStore(state.store),
          attempts: Object.freeze(state.attempts.map((count) => count.toString(10))),
          serial_orderings: orderings,
          serially_equivalent: orderings.length > 0,
        }),
      );
      return;
    }
    if (choices.length >= 6) {
      throw new Error("bounded scheduler exceeded its derived six-step state space");
    }
    for (const selected of [0, 1] as const) {
      if (state.phases[selected].kind !== "committed") {
        explore([...choices, selected]);
      }
    }
  };
  explore([]);
  const boundedSchedules = Object.freeze(terminalSchedules);
  const cyclic: ReadonlyArray<CommitRecord> = [
    {
      transactionId: "cycle-a",
      reads: [{ id: "x", value: 0 }],
      writes: [{ id: "y", value: 1 }],
    },
    {
      transactionId: "cycle-b",
      reads: [{ id: "y", value: 0 }],
      writes: [{ id: "x", value: 1 }],
    },
  ];
  const maximumAttempts = boundedSchedules.reduce(
    (maximum, schedule) =>
      Math.max(
        maximum,
        ...(schedule.attempts as ReadonlyArray<string>).map((count) => Number(count)),
      ),
    0,
  );
  const maximumSteps = boundedSchedules.reduce(
    (maximum, schedule) => Math.max(maximum, (schedule.events as ReadonlyArray<JsonObject>).length),
    0,
  );
  return {
    boundedSchedules,
    serialOrderings: boundedSchedules[0]!.serial_orderings as ReadonlyArray<ReadonlyArray<string>>,
    rejectsCycle: !isSeriallyEquivalent(base.initial, cyclic),
    maximumAttempts: BigInt(maximumAttempts),
    maximumSteps: BigInt(maximumSteps),
  };
};

const observation = (id: string, catchesCounterexample: boolean): JsonObject =>
  Object.freeze({ id, catches_counterexample: catchesCounterexample });

const forgedAttemptIsRejected = (base: ReferenceScenario): boolean => {
  const forged = {
    ...base.firstAttempt,
    readSet: [],
    writeSet: [{ id: "x", startVersion: 0n, value: 999 }],
    commitActions: [{ forged: true }],
    evaluation: { kind: "success", value: "forged" },
  } as unknown as Attempt;
  const result = settleAttempt(base.initial, forged);
  return (
    result.kind === "invalid_attempt" &&
    result.reason === "not_handler_custodied" &&
    result.store === base.initial &&
    result.commitActions.length === 0
  );
};

const copiedStoreIsRejected = (base: ReferenceScenario): boolean => {
  const copied = {
    ...base.initial,
    cells: base.initial.cells.map((cell) => ({ ...cell })),
  } as Store<string>;
  return (
    beginAttempt(copied, succeed(base.initial.domain, "copied-store-probe", null)).kind ===
    "store_rejected"
  );
};

const expressionShapedDataIsPreserved = (base: ReferenceScenario): boolean => {
  const literalShaped = { kind: "literal", value: { domain: "data" } };
  const addShaped = { kind: "add", payload: 1 };
  return (
    canonicalJson(
      commit(base.initial, succeed(base.initial.domain, "literal-data", literalShaped)).value,
    ) === canonicalJson(literalShaped) &&
    canonicalJson(
      commit(base.initial, sequence(base.initial.domain, "add-data", [], addShaped)).value,
    ) === canonicalJson(addShaped)
  );
};

const inertCaptureRejectsUserCode = (): {
  readonly gettersNotRun: boolean;
  readonly proxyRejected: boolean;
} => {
  let getterCount = 0;
  const accessorValue = Object.defineProperty({}, "secret", {
    enumerable: true,
    get() {
      getterCount += 1;
      return "executed";
    },
  });
  return Object.freeze({
    gettersNotRun: !isPortableData({ nested: accessorValue }) && getterCount === 0,
    proxyRejected: !isPortableData(new Proxy({ safe: true }, {})),
  });
};

const descriptionIsDeeplyFrozen = (attempt: Attempt): boolean =>
  Object.isFrozen(attempt.description) &&
  Object.isFrozen(attempt.description.instructions) &&
  attempt.description.instructions.every((instruction) => Object.isFrozen(instruction)) &&
  Object.isFrozen(attempt.description.result);

const alternativeValuesArePreserved = (base: ReferenceScenario): boolean => {
  const leftValue = requireCommitted(
    settleAttempt(
      base.initial,
      requireAttempt(
        beginAttempt(
          base.initial,
          orElse(
            succeed(base.initial.domain, "left-value", 41),
            succeed(base.initial.domain, "unused-right-value", 42),
          ),
        ),
      ),
    ),
  );
  const rightValue = requireCommitted(
    settleAttempt(
      base.initial,
      requireAttempt(
        beginAttempt(
          base.initial,
          orElse(
            retry(base.initial.domain, "retry-left-value"),
            succeed(base.initial.domain, "right-value", 42),
          ),
        ),
      ),
    ),
  );
  return leftValue.value === 41 && rightValue.value === 42;
};

export const buildStmLawReport = (runtimeLayer: RuntimeLayer): JsonObject => {
  const base = referenceScenario();
  const retryResult = retryScenario(base);
  const alternative = alternativeScenario(base);
  const historyResult = histories(base);
  const nestingAtomic = nestingIsAtomic(base);
  const portableActions = isPortableData({ kind: "inert-action" }) && !isPortableData(() => null);
  const inertCapture = inertCaptureRejectsUserCode();
  const repeatedSettlement = settleAttempt(base.committed.store, base.rerun);
  const allBoundedSchedulesSerializable = historyResult.boundedSchedules.every(
    (schedule) => schedule.serially_equivalent === true,
  );
  const unsupportedGuarantees = Object.freeze([
    "lock freedom",
    "starvation freedom",
    "bounded retries",
    "fairness",
    "termination",
    "crash-safe exactly-once action delivery",
    "general affine resource ownership",
    "unbounded serializability proof",
    "trap-free classification of arbitrary ECMAScript Proxy values",
  ]);

  const observations = [
    observation(
      "ce01-partial-publication",
      inspectCell(base.initial, base.x).value === 0 &&
        inspectCell(base.initial, base.y).value === 0 &&
        inspectCell(base.committed.store, base.x).value === 11 &&
        inspectCell(base.committed.store, base.y).value === 11,
    ),
    observation(
      "ce02-conflict-write-leak",
      base.conflict.store === base.interloper.store &&
        inspectCell(base.conflict.store, base.y).value === 0,
    ),
    observation(
      "ce03-failed-action-leak",
      base.conflict.commitActions.length === 0 && retryResult.suspended.commitActions.length === 0,
    ),
    observation(
      "ce04-duplicate-commit-action",
      base.committed.commitActions.length === 1 &&
        base.rerun.ordinal === 2n &&
        repeatedSettlement.kind === "invalid_attempt" &&
        repeatedSettlement.reason === "already_settled" &&
        repeatedSettlement.commitActions.length === 0,
    ),
    observation("ce05-stale-read-ignored", base.conflict.stale.includes("x")),
    observation("ce06-blind-write-lost-update", blindWriteConflicts(base)),
    observation(
      "ce07-unrelated-retry-wake",
      changedDependencies(retryResult.suspended.suspension, retryResult.unrelatedStore).length ===
        0 &&
        wakeAndRerun(retryResult.suspended.suspension, retryResult.unrelatedStore) === undefined,
    ),
    observation(
      "ce08-missed-retry-wake",
      changedDependencies(retryResult.suspended.suspension, retryResult.relevantStore).includes(
        "x",
      ) && retryResult.wakeAttempt.ordinal === 2n,
    ),
    observation(
      "ce09-or-else-left-leak",
      inspectCell(alternative.committed.store, base.y).value === 2 &&
        canonicalJson(alternative.committed.commitActions) === canonicalJson([{ branch: "right" }]),
    ),
    observation(
      "ce10-or-else-dependency-loss",
      canonicalJson(alternative.union.suspension.dependencies.map(({ id }) => id)) ===
        canonicalJson(["x", "y"]),
    ),
    observation(
      "ce11-abort-treated-as-retry",
      alternative.abortSettlement.error !== null &&
        alternative.abortSettlement.abortActions.length === 1,
    ),
    observation("ce12-cross-domain-attempt", crossDomainRejected(base)),
    observation("ce13-nonserial-history", historyResult.rejectsCycle),
    observation("ce14-ambient-authority", portableActions),
    observation(
      "ce15-evidence-upgrade",
      historyResult.boundedSchedules.length > 2 && allBoundedSchedulesSerializable,
    ),
    observation("attempt-forgery-rejected", forgedAttemptIsRejected(base)),
    observation("store-copy-rejected", copiedStoreIsRejected(base)),
    observation("expression-data-collision", expressionShapedDataIsPreserved(base)),
    observation(
      "inert-capture-rejects-user-code",
      inertCapture.gettersNotRun && inertCapture.proxyRejected,
    ),
    observation("description-deep-freeze", descriptionIsDeeplyFrozen(base.firstAttempt)),
    observation("or-else-values", alternativeValuesArePreserved(base)),
  ];

  const lawObservations = Object.freeze([
    Object.freeze({
      id: "law-l1-observed",
      law: "L1",
      observed:
        inspectCell(base.initial, base.y).value === 0 &&
        inspectCell(base.committed.store, base.y).value === 11,
      evidence: Object.freeze({
        before_y: inspectCell(base.initial, base.y).value,
        after_y: inspectCell(base.committed.store, base.y).value,
      }),
    }),
    Object.freeze({
      id: "law-l2-observed",
      law: "L2",
      observed:
        base.conflict.stale.includes("x") &&
        forgedAttemptIsRejected(base) &&
        copiedStoreIsRejected(base),
      evidence: Object.freeze({
        stale: Object.freeze([...base.conflict.stale]),
        forged_attempt_rejected: forgedAttemptIsRejected(base),
        copied_store_rejected: copiedStoreIsRejected(base),
      }),
    }),
    Object.freeze({
      id: "law-l3-observed",
      law: "L3",
      observed:
        changedDependencies(retryResult.suspended.suspension, retryResult.unrelatedStore).length ===
          0 && retryResult.wakeAttempt.ordinal === 2n,
      evidence: Object.freeze({
        unrelated_changes: Object.freeze(
          changedDependencies(retryResult.suspended.suspension, retryResult.unrelatedStore),
        ),
        wake_attempt: retryResult.wakeAttempt.ordinal.toString(10),
      }),
    }),
    Object.freeze({
      id: "law-l4-observed",
      law: "L4",
      observed:
        base.firstAttempt.description === base.rerun.description &&
        descriptionIsDeeplyFrozen(base.firstAttempt),
      evidence: Object.freeze({
        same_description_identity: base.firstAttempt.description === base.rerun.description,
        recursively_frozen: descriptionIsDeeplyFrozen(base.firstAttempt),
      }),
    }),
    Object.freeze({
      id: "law-l5-observed",
      law: "L5",
      observed:
        inspectCell(alternative.committed.store, base.y).value === 2 &&
        alternativeValuesArePreserved(base),
      evidence: Object.freeze({
        selected_branch_y: inspectCell(alternative.committed.store, base.y).value,
        selected_values_preserved: alternativeValuesArePreserved(base),
      }),
    }),
    Object.freeze({
      id: "law-l6-observed",
      law: "L6",
      observed:
        base.committed.commitActions.length === 1 && repeatedSettlement.kind === "invalid_attempt",
      evidence: Object.freeze({
        commit_action_count: BigInt(base.committed.commitActions.length).toString(10),
        repeated_settlement:
          repeatedSettlement.kind === "invalid_attempt"
            ? Object.freeze({
                kind: repeatedSettlement.kind,
                reason: repeatedSettlement.reason,
                commit_action_count: BigInt(repeatedSettlement.commitActions.length).toString(10),
              })
            : Object.freeze({ kind: repeatedSettlement.kind }),
      }),
    }),
    Object.freeze({
      id: "law-l7-observed",
      law: "L7",
      observed: nestingAtomic && crossDomainRejected(base),
      evidence: Object.freeze({
        nesting_atomic: nestingAtomic,
        cross_domain_rejected: crossDomainRejected(base),
      }),
    }),
    Object.freeze({
      id: "law-l8-observed",
      law: "L8",
      observed:
        portableActions &&
        expressionShapedDataIsPreserved(base) &&
        inertCapture.gettersNotRun &&
        inertCapture.proxyRejected,
      evidence: Object.freeze({
        inert_data_only: portableActions,
        expression_shaped_data_preserved: expressionShapedDataIsPreserved(base),
        getters_not_run: inertCapture.gettersNotRun,
        proxy_rejected: inertCapture.proxyRejected,
      }),
    }),
    Object.freeze({
      id: "law-l9-observed",
      law: "L9",
      observed: allBoundedSchedulesSerializable && historyResult.rejectsCycle,
      evidence: Object.freeze({
        terminal_schedules: BigInt(historyResult.boundedSchedules.length).toString(10),
        all_serially_equivalent: allBoundedSchedulesSerializable,
        cyclic_history_rejected: historyResult.rejectsCycle,
      }),
    }),
    Object.freeze({
      id: "law-l10-observed",
      law: "L10",
      observed:
        unsupportedGuarantees.includes("fairness") &&
        unsupportedGuarantees.includes("lock freedom"),
      evidence: Object.freeze({ unsupported_guarantees: unsupportedGuarantees }),
    }),
  ]);

  return Object.freeze({
    schema_version: 1,
    runtime_layer: runtimeLayer,
    model: "semantic-stm-laws-0014",
    bounds: Object.freeze({
      maximum_transactions: "2",
      maximum_attempts_per_transaction: historyResult.maximumAttempts.toString(10),
      maximum_cells: BigInt(base.initial.cells.length).toString(10),
      maximum_scheduler_steps: historyResult.maximumSteps.toString(10),
      schedules_explored: BigInt(historyResult.boundedSchedules.length).toString(10),
    }),
    assumptions: Object.freeze([
      "one local store publication is atomic",
      "the explicit scheduler trace is faithfully interpreted",
      "logical versions do not overflow bigint",
    ]),
    evidence: Object.freeze({
      derived: Object.freeze(["journal projections", "dependency sets", "exact versions"]),
      bounded_model_checked: Object.freeze([
        `all ${historyResult.boundedSchedules.length} terminal schedules generated by every enabled transaction choice within the declared handler-step bound`,
      ]),
      runtime_validated: Object.freeze([
        "canonical report entrypoint executed under the named runtime_layer",
      ]),
      static_analysis: Object.freeze([]),
      assertion: Object.freeze([]),
      assumption: Object.freeze(["atomic local store publication", "deterministic scheduler"]),
      unsupported: Object.freeze([
        "general serializability proof",
        "affine ownership proof",
        "progress and fairness",
      ]),
    }),
    laws: Object.freeze(
      [
        ["L1", "law-l1-observed", "ce02-conflict-write-leak"],
        ["L2", "law-l2-observed", "ce06-blind-write-lost-update"],
        ["L3", "law-l3-observed", "ce07-unrelated-retry-wake"],
        ["L4", "law-l4-observed", "ce04-duplicate-commit-action"],
        ["L5", "law-l5-observed", "ce10-or-else-dependency-loss"],
        ["L6", "law-l6-observed", "ce03-failed-action-leak"],
        ["L7", "law-l7-observed", "ce12-cross-domain-attempt"],
        ["L8", "law-l8-observed", "ce14-ambient-authority"],
        ["L9", "law-l9-observed", "ce13-nonserial-history"],
        ["L10", "law-l10-observed", "ce15-evidence-upgrade"],
      ].map(([law, positive, negative]) => Object.freeze({ law, positive, negative })),
    ),
    law_observations: lawObservations,
    observations: Object.freeze(observations),
    reference_trace: Object.freeze({
      initial_store: projectStore(base.initial),
      conflict_store: projectStore(base.conflict.store),
      committed_store: projectStore(base.committed.store),
      original_description_rerun: base.firstAttempt.description === base.rerun.description,
      attempt_count: base.rerun.ordinal.toString(10),
      commit_actions: base.committed.commitActions,
      nesting_atomic: nestingAtomic,
      serial_orderings: historyResult.serialOrderings,
      bounded_schedules: historyResult.boundedSchedules,
      scheduler_completeness: Object.freeze({
        choice_rule: "enumerate each non-committed transaction at every handler step",
        symmetry_reduction: false,
        terminal_schedules: BigInt(historyResult.boundedSchedules.length).toString(10),
        maximum_steps_derived: historyResult.maximumSteps.toString(10),
      }),
    }),
    unsupported_guarantees: unsupportedGuarantees,
  });
};

export const canonicalStmLawReport = (runtimeLayer: RuntimeLayer): string =>
  canonicalJson(buildStmLawReport(runtimeLayer));
