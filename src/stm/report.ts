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
} => {
  const first = sequence(
    base.initial.domain,
    "serial-a",
    [read(base.x, "serial-a-x"), write(base.x, add(binding("serial-a-x"), literal(1)))],
    binding("serial-a-x"),
  );
  const second = sequence(
    base.initial.domain,
    "serial-b",
    [read(base.x, "serial-b-x"), write(base.y, binding("serial-b-x"))],
    binding("serial-b-x"),
  );
  const runSchedule = (
    id: string,
    ordered: ReadonlyArray<Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>>,
  ): JsonObject => {
    let current = base.initial;
    const history: CommitRecord[] = [];
    for (const description of ordered) {
      const settlement = commit(current, description);
      current = settlement.store;
      history.push(settlement.history);
    }
    const orderings = serialOrderingsFor(base.initial, history);
    return Object.freeze({
      id,
      transaction_order: Object.freeze(ordered.map((description) => description.id)),
      committed_history: Object.freeze(
        history.map((record) =>
          Object.freeze({
            transaction_id: record.transactionId,
            reads: record.reads,
            writes: record.writes,
          }),
        ),
      ),
      final_store: projectStore(current),
      serial_orderings: orderings,
      serially_equivalent: orderings.length > 0,
    });
  };
  const boundedSchedules = Object.freeze([
    runSchedule("schedule-a-then-b", [first, second]),
    runSchedule("schedule-b-then-a", [second, first]),
  ]);
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
  return {
    boundedSchedules,
    serialOrderings: boundedSchedules[0]!.serial_orderings as ReadonlyArray<ReadonlyArray<string>>,
    rejectsCycle: !isSeriallyEquivalent(base.initial, cyclic),
  };
};

const observation = (id: string, catchesCounterexample: boolean): JsonObject =>
  Object.freeze({ id, catches_counterexample: catchesCounterexample });

export const buildStmLawReport = (runtimeLayer: RuntimeLayer): JsonObject => {
  const base = referenceScenario();
  const retryResult = retryScenario(base);
  const alternative = alternativeScenario(base);
  const historyResult = histories(base);

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
      base.committed.commitActions.length === 1 && base.rerun.ordinal === 2n,
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
    observation(
      "ce14-ambient-authority",
      isPortableData({ kind: "inert-action" }) && !isPortableData(() => "opaque"),
    ),
    observation(
      "ce15-evidence-upgrade",
      historyResult.boundedSchedules.length === 2 &&
        historyResult.boundedSchedules.every((schedule) => schedule.serially_equivalent === true),
    ),
  ];

  return Object.freeze({
    schema_version: 1,
    runtime_layer: runtimeLayer,
    model: "semantic-stm-laws-0014",
    bounds: Object.freeze({
      maximum_transactions: "2",
      maximum_attempts_per_transaction: "2",
      maximum_cells: "3",
      maximum_scheduler_steps: "12",
      schedules_explored: "2",
    }),
    assumptions: Object.freeze([
      "one local store publication is atomic",
      "the explicit scheduler trace is faithfully interpreted",
      "logical versions do not overflow bigint",
    ]),
    evidence: Object.freeze({
      derived: Object.freeze(["journal projections", "dependency sets", "exact versions"]),
      bounded_model_checked: Object.freeze([
        "two transactions over the declared finite schedule bound",
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
        ["L1", "ce01-partial-publication", "ce02-conflict-write-leak"],
        ["L2", "ce05-stale-read-ignored", "ce06-blind-write-lost-update"],
        ["L3", "ce07-unrelated-retry-wake", "ce08-missed-retry-wake"],
        ["L4", "ce04-duplicate-commit-action", "ce08-missed-retry-wake"],
        ["L5", "ce09-or-else-left-leak", "ce10-or-else-dependency-loss"],
        ["L6", "ce03-failed-action-leak", "ce04-duplicate-commit-action"],
        ["L7", "same-domain-nesting", "ce12-cross-domain-attempt"],
        ["L8", "inert-action-data", "ce14-ambient-authority"],
        ["L9", "bounded-serial-history", "ce13-nonserial-history"],
        ["L10", "unsupported-progress", "ce15-evidence-upgrade"],
      ].map(([law, positive, negative]) => Object.freeze({ law, positive, negative })),
    ),
    observations: Object.freeze(observations),
    reference_trace: Object.freeze({
      initial_store: projectStore(base.initial),
      conflict_store: projectStore(base.conflict.store),
      committed_store: projectStore(base.committed.store),
      original_description_rerun: base.firstAttempt.description === base.rerun.description,
      attempt_count: base.rerun.ordinal.toString(10),
      commit_actions: base.committed.commitActions,
      nesting_atomic: nestingIsAtomic(base),
      serial_orderings: historyResult.serialOrderings,
      bounded_schedules: historyResult.boundedSchedules,
    }),
    unsupported_guarantees: Object.freeze([
      "lock freedom",
      "starvation freedom",
      "bounded retries",
      "fairness",
      "termination",
      "crash-safe exactly-once action delivery",
      "general affine resource ownership",
      "unbounded serializability proof",
    ]),
  });
};

export const canonicalStmLawReport = (runtimeLayer: RuntimeLayer): string =>
  canonicalJson(buildStmLawReport(runtimeLayer));
