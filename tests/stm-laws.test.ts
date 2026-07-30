import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  abort,
  add,
  afterCommit,
  beginAttempt,
  binding,
  changedDependencies,
  discardAttempt,
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
  type Domain,
  type Expression,
  type Settlement,
  type Store,
  type TVar,
  type Txn,
} from "../src/stm/model.ts";
import { buildStmLawReport, canonicalStmLawReport } from "../src/stm/report.ts";
import type { JsonValue } from "../src/tracer/json.ts";

const requireAttempt = (result: BeginResult): Attempt => {
  expect(result.kind).toBe("attempt");
  if (result.kind !== "attempt") throw new Error("expected attempt");
  return result.attempt;
};

const requireSettlement = <Kind extends Settlement["kind"]>(
  settlement: Settlement,
  kind: Kind,
): Extract<Settlement, { kind: Kind }> => {
  expect(settlement.kind).toBe(kind);
  if (settlement.kind !== kind) throw new Error(`expected ${kind}`);
  return settlement as Extract<Settlement, { kind: Kind }>;
};

const commit = (
  store: Store<string>,
  transaction: Txn<string, JsonValue, JsonValue, JsonValue, JsonValue>,
) =>
  requireSettlement(
    settleAttempt(store, requireAttempt(beginAttempt(store, transaction))),
    "committed",
  );

const fixture = () => {
  const owner = domain("law-domain");
  const x = tvar(owner, "x", 0);
  const y = tvar(owner, "y", 0);
  const z = tvar(owner, "z", 0);
  const store = makeStore(owner, [x, y, z]);
  return { owner, x, y, z, store };
};

const retryUntilPositive = (owner: Domain<"law-domain">, x: TVar<"law-domain", number>) =>
  sequence(
    owner,
    "retry-until-positive",
    [
      read(x, "seen-x"),
      when(
        owner,
        equal(binding("seen-x"), literal(0)),
        retry(owner, "zero-retry"),
        succeed(owner, "positive", "ready"),
        "decision",
      ),
    ],
    binding("decision"),
  );

describe("STM law boundary 0014", () => {
  test("[L1 positive / CE01] an attempt cannot expose either write before atomic publication", () => {
    const { owner, store, x, y } = fixture();
    const transaction = sequence(owner, "write-two", [write(x, 1), write(y, 2)]);
    const attempt = requireAttempt(beginAttempt(store, transaction));

    expect(inspectCell(store, x)).toEqual({ value: 0, version: 0n });
    expect(inspectCell(store, y)).toEqual({ value: 0, version: 0n });

    const settled = requireSettlement(settleAttempt(store, attempt), "committed");
    expect(inspectCell(settled.store, x)).toEqual({ value: 1, version: 1n });
    expect(inspectCell(settled.store, y)).toEqual({ value: 2, version: 1n });
    expect(projectStore(store)).toEqual({
      domain: "law-domain",
      cells: [
        { id: "x", value: 0, version: "0" },
        { id: "y", value: 0, version: "0" },
        { id: "z", value: 0, version: "0" },
      ],
    });
  });

  test("[L1 negative oracle / CE02] conflict, interruption, and defect discard all staged writes", () => {
    const { owner, store, x, y } = fixture();
    const transaction = sequence(owner, "stale-attempt", [
      read(x, "old-x"),
      write(y, 9),
      afterCommit(owner, { attempt: "stale" }),
    ]);
    const attempt = requireAttempt(beginAttempt(store, transaction));
    const concurrent = commit(store, write(x, 1));
    const conflict = requireSettlement(settleAttempt(concurrent.store, attempt), "conflict");

    expect(inspectCell(conflict.store, y).value).toBe(0);
    expect(conflict.commitActions).toEqual([]);
    const interrupted = requireAttempt(beginAttempt(store, transaction));
    expect(discardAttempt(store, interrupted, "interrupted")).toMatchObject({
      kind: "interrupted",
      store,
      commitActions: [],
      abortActions: [],
    });
    const defected = requireAttempt(beginAttempt(store, transaction));
    expect(discardAttempt(store, defected, "defect")).toMatchObject({
      kind: "defect",
      store,
      commitActions: [],
      abortActions: [],
    });
  });

  test("[L6 negative oracle / CE03] retrying and conflicted attempts leak no commit action", () => {
    const { owner, store, x } = fixture();
    const retrying = sequence(owner, "action-then-retry", [
      read(x, "retry-x"),
      afterCommit(owner, { forbidden: "retry" }),
      retry(owner),
    ]);
    const suspension = requireSettlement(
      settleAttempt(store, requireAttempt(beginAttempt(store, retrying))),
      "suspended",
    );
    expect(suspension.commitActions).toEqual([]);

    const successful = sequence(owner, "action-conflict", [
      read(x, "conflict-x"),
      write(x, add(binding("conflict-x"), literal(1))),
      afterCommit(owner, { forbidden: "conflict" }),
    ]);
    const stale = requireAttempt(beginAttempt(store, successful));
    const concurrent = commit(store, write(x, 4));
    expect(settleAttempt(concurrent.store, stale)).toMatchObject({
      kind: "conflict",
      commitActions: [],
    });
  });

  test("[L4/L6 positive and negative oracle / CE04] a rerun returns one ordered action log once", () => {
    const { owner, store, x } = fixture();
    const description = sequence(owner, "rerun-actions", [
      read(x, "action-x"),
      write(x, add(binding("action-x"), literal(1))),
      afterCommit(owner, { order: 1 }),
      afterCommit(owner, { order: 2 }),
    ]);
    const first = requireAttempt(beginAttempt(store, description));
    const concurrent = commit(store, write(x, 10));
    expect(settleAttempt(concurrent.store, first).kind).toBe("conflict");
    const second = requireAttempt(rerunAttempt(concurrent.store, first));

    expect(second.description).toBe(first.description);
    expect(second.ordinal).toBe(2n);
    const settled = requireSettlement(settleAttempt(concurrent.store, second), "committed");
    expect(settled.commitActions).toEqual([{ order: 1 }, { order: 2 }]);
    expect(Object.isFrozen(settled.commitActions)).toBe(true);

    expect(settleAttempt(settled.store, second)).toEqual({
      kind: "invalid_attempt",
      store: settled.store,
      reason: "already_settled",
      commitActions: [],
      abortActions: [],
    });
  });

  test("[L2 custody] a copied and forged attempt cannot settle injected writes or actions", () => {
    const { owner, store, x } = fixture();
    const description = sequence(owner, "custodied-attempt", [
      read(x, "custody-x"),
      write(x, add(binding("custody-x"), literal(1))),
      afterCommit(owner, { legitimate: true }),
    ]);
    const legitimate = requireAttempt(beginAttempt(store, description));
    const forged = {
      ...legitimate,
      readSet: [],
      writeSet: [{ id: "x", startVersion: 0n, value: 999 }],
      evaluation: { kind: "success", value: "forged" },
      commitActions: [{ forged: true }],
    } as unknown as Attempt;

    expect(settleAttempt(store, forged)).toEqual({
      kind: "invalid_attempt",
      store,
      reason: "not_handler_custodied",
      commitActions: [],
      abortActions: [],
    });
    expect(inspectCell(store, x)).toEqual({ value: 0, version: 0n });

    const committed = requireSettlement(settleAttempt(store, legitimate), "committed");
    expect(inspectCell(committed.store, x).value).toBe(1);
    expect(committed.commitActions).toEqual([{ legitimate: true }]);
  });

  test("[L2 custody] copied stores cannot inject stale versions or consume a live attempt", () => {
    const { owner, store, x } = fixture();
    const description = sequence(owner, "store-custody", [
      read(x, "store-custody-x"),
      write(x, add(binding("store-custody-x"), literal(1))),
    ]);
    const attempt = requireAttempt(beginAttempt(store, description));
    const current = commit(store, write(x, 10)).store;
    const staleCopy = {
      ...current,
      cells: current.cells.map((cell) =>
        cell.id === "x" ? { ...cell, value: 0, version: 0n } : cell,
      ),
    } as Store<string>;

    expect(beginAttempt(staleCopy, description)).toEqual({
      kind: "store_rejected",
      reason: "not_handler_custodied",
      attemptStarted: false,
    });
    expect(settleAttempt(staleCopy, attempt)).toEqual({
      kind: "invalid_attempt",
      store: staleCopy,
      reason: "store_not_handler_custodied",
      commitActions: [],
      abortActions: [],
    });
    expect(settleAttempt(current, attempt).kind).toBe("conflict");
    expect(inspectCell(current, x)).toEqual({ value: 10, version: 1n });
  });

  test("[expression custody] data-shaped AST collisions remain exact values", () => {
    const owner = domain("value-domain");
    const slot = tvar(owner, "slot", null as JsonValue);
    const store = makeStore(owner, [slot]);
    const literalShaped = { kind: "literal", value: { domain: "data" } };
    const addShaped = { kind: "add", payload: 1 };

    const succeeded = commit(store, succeed(owner, "literal-shaped-data", literalShaped));
    expect(succeeded.value).toEqual(literalShaped);

    const written = commit(store, write(slot, addShaped));
    expect(inspectCell(written.store, slot).value).toEqual(addShaped);
    const readBack = commit(
      written.store,
      sequence(
        owner,
        "read-data-shaped-value",
        [read(slot, "stored-value")],
        binding("stored-value"),
      ),
    );
    expect(readBack.value).toEqual(addShaped);

    expect(commit(store, sequence(owner, "sequence-data-result", [], literalShaped)).value).toEqual(
      literalShaped,
    );
    expect(
      commit(
        store,
        orElse(retry(owner, "data-left-retry"), succeed(owner, "data-right-value", addShaped)),
      ).value,
    ).toEqual(addShaped);
  });

  test("[expression custody] copied, inherited, and Proxy nodes cannot gain expression authority", () => {
    const genuine = literal(1);
    const copied = { ...genuine } as Expression;
    const inherited = Object.create(genuine) as Expression;
    let proxyTrapCount = 0;
    const proxied = new Proxy(genuine, {
      get() {
        proxyTrapCount += 1;
        throw new Error("expression Proxy trap executed");
      },
      getPrototypeOf() {
        proxyTrapCount += 1;
        throw new Error("expression Proxy trap executed");
      },
      ownKeys() {
        proxyTrapCount += 1;
        throw new Error("expression Proxy trap executed");
      },
    });

    expect(() => add(copied, genuine)).toThrow("expression is not handler-custodied");
    expect(() => add(inherited, genuine)).toThrow("expression is not handler-custodied");
    expect(() => add(proxied, genuine)).toThrow("expression is not handler-custodied");
    expect(proxyTrapCount).toBe(0);
  });

  test("[L8 inert data] accessors and hostile object shapes fail without executing getters", () => {
    const { owner } = fixture();
    let getterCount = 0;
    const accessorValue = Object.defineProperty({}, "secret", {
      enumerable: true,
      get() {
        getterCount += 1;
        return "executed";
      },
    });
    const nestedAccessor = { safe: accessorValue };
    const nonEnumerable = Object.defineProperty({}, "hidden", {
      enumerable: false,
      value: 1,
    });
    const symbolBearing = { safe: 1 } as Record<PropertyKey, unknown>;
    symbolBearing[Symbol("hidden")] = 2;
    const inherited = Object.create({ inherited: true }) as Record<string, unknown>;
    inherited.own = true;

    for (const value of [accessorValue, nestedAccessor, nonEnumerable, symbolBearing, inherited]) {
      expect(isPortableData(value)).toBe(false);
      expect(() => succeed(owner, "reject-host-object", value as JsonValue)).toThrow(TypeError);
    }
    expect(getterCount).toBe(0);
  });

  test("[L8 inert data] Proxy-hostile values remain typed failures and transparent Proxies reject", () => {
    const { owner } = fixture();
    let trapCount = 0;
    const hostile = new Proxy(
      { safe: 1 },
      {
        ownKeys() {
          trapCount += 1;
          throw new Error("hostile ownKeys");
        },
      },
    );
    const transparent = new Proxy({ safe: 1 }, {});

    expect(isPortableData(hostile)).toBe(false);
    expect(() => succeed(owner, "reject-hostile-proxy", hostile)).toThrow("plain inert JSON data");
    expect(trapCount).toBe(2);
    expect(isPortableData(transparent)).toBe(false);
    expect(() => write(tvar(owner, "proxy-slot", null as JsonValue), transparent)).toThrow(
      "plain inert JSON data",
    );
  });

  test("[L8 inert data] nested values and action logs snapshot caller aliases", () => {
    const owner = domain("snapshot-domain");
    const slot = tvar(owner, "slot", null as JsonValue);
    const store = makeStore(owner, [slot]);
    const value = { nested: { count: 1 } };
    const action = { nested: { count: 2 } };
    const description = sequence(
      owner,
      "snapshot-aliases",
      [write(slot, value), afterCommit(owner, action)],
      value,
    );
    value.nested.count = 999;
    action.nested.count = 999;

    const settled = commit(store, description);
    expect(settled.value).toEqual({ nested: { count: 1 } });
    expect(inspectCell(settled.store, slot).value).toEqual({ nested: { count: 1 } });
    expect(settled.commitActions).toEqual([{ nested: { count: 2 } }]);
    expect(Object.isFrozen((settled.value as { nested: object }).nested)).toBe(true);
    expect(Object.isFrozen((settled.commitActions[0] as { nested: object }).nested)).toBe(true);
  });

  test("[L4 custody] reruns reuse one recursively frozen canonical description", () => {
    const { owner, store, x } = fixture();
    const callerAction = { kind: "notify", payload: { amount: 1 } };
    const description = sequence(owner, "frozen-rerun", [
      read(x, "frozen-x"),
      write(x, add(binding("frozen-x"), literal(1))),
      afterCommit(owner, callerAction),
    ]);
    callerAction.payload.amount = 999;
    expect(Object.isFrozen(description)).toBe(true);
    expect(Object.isFrozen(description.instructions)).toBe(true);
    expect(description.instructions.every((instruction) => Object.isFrozen(instruction))).toBe(
      true,
    );
    expect(() => {
      (description.instructions[0] as { kind: string }).kind = "retry";
    }).toThrow();

    const first = requireAttempt(beginAttempt(store, description));
    const concurrent = commit(store, write(x, 10));
    expect(settleAttempt(concurrent.store, first).kind).toBe("conflict");
    const second = requireAttempt(rerunAttempt(concurrent.store, first));
    expect(second.description).toBe(description);
    const committed = requireSettlement(settleAttempt(concurrent.store, second), "committed");
    expect(committed.commitActions).toEqual([{ kind: "notify", payload: { amount: 1 } }]);
  });

  test("[L5 value] orElse returns the selected branch value without an optional binding", () => {
    const { owner, store } = fixture();
    const left = requireSettlement(
      settleAttempt(
        store,
        requireAttempt(
          beginAttempt(
            store,
            orElse(succeed(owner, "left-value", 41), succeed(owner, "unused-right", 42)),
          ),
        ),
      ),
      "committed",
    );
    expect(left.value).toBe(41);

    const right = requireSettlement(
      settleAttempt(
        store,
        requireAttempt(
          beginAttempt(
            store,
            orElse(retry(owner, "retry-left"), succeed(owner, "right-value", 42)),
          ),
        ),
      ),
      "committed",
    );
    expect(right.value).toBe(42);
  });

  test("[L2 positive and negative oracle / CE05] validation rejects a stale read-only observation", () => {
    const { owner, store, x } = fixture();
    const observer = sequence(owner, "read-only", [read(x, "value")], binding("value"));
    const attempt = requireAttempt(beginAttempt(store, observer));
    const concurrent = commit(store, write(x, 1));
    const result = requireSettlement(settleAttempt(concurrent.store, attempt), "conflict");
    expect(result.stale).toEqual(["x"]);
    expect(result.store).toBe(concurrent.store);
  });

  test("[L2 blind-write negative oracle / CE06] an unread write records a version and detects loss", () => {
    const { store, y } = fixture();
    const first = requireAttempt(beginAttempt(store, write(y, 1)));
    const second = requireAttempt(beginAttempt(store, write(y, 2)));

    expect(first.readSet).toEqual([{ id: "y", value: 0, version: 0n }]);
    const committed = requireSettlement(settleAttempt(store, first), "committed");
    const stale = requireSettlement(settleAttempt(committed.store, second), "conflict");
    expect(stale.stale).toEqual(["y"]);
    expect(inspectCell(stale.store, y).value).toBe(1);
  });

  test("[L3 negative oracle / CE07] retry ignores an unrelated changed cell", () => {
    const { owner, store, x, z } = fixture();
    const description = retryUntilPositive(owner, x);
    const suspended = requireSettlement(
      settleAttempt(store, requireAttempt(beginAttempt(store, description))),
      "suspended",
    );
    const unrelated = commit(store, write(z, 1)).store;

    expect(changedDependencies(suspended.suspension, unrelated)).toEqual([]);
    expect(wakeAndRerun(suspended.suspension, unrelated)).toBeUndefined();
  });

  test("[L3/L4 positive and negative oracle / CE08] an observed change wakes a fresh rerun", () => {
    const { owner, store, x } = fixture();
    const description = retryUntilPositive(owner, x);
    const first = requireAttempt(beginAttempt(store, description));
    const suspended = requireSettlement(settleAttempt(store, first), "suspended");
    const relevant = commit(store, write(x, 1)).store;
    const wake = wakeAndRerun(suspended.suspension, relevant);

    expect(wake?.kind).toBe("attempt");
    if (wake?.kind !== "attempt") throw new Error("expected wake attempt");
    expect(wake.attempt.description).toBe(first.description);
    expect(wake.attempt.ordinal).toBe(2n);
    expect(wake.attempt.evaluation).toEqual({ kind: "success", value: "ready" });
  });

  test("[L5 positive and negative oracle / CE09] orElse starts right from branch input", () => {
    const { owner, store, x, y } = fixture();
    const left = sequence(owner, "left", [
      read(x, "left-x"),
      write(y, 99),
      afterCommit(owner, { branch: "left" }),
      retry(owner, "left-retry"),
    ]);
    const right = sequence(owner, "right", [write(y, 2), afterCommit(owner, { branch: "right" })]);
    const settled = requireSettlement(
      settleAttempt(store, requireAttempt(beginAttempt(store, orElse(left, right)))),
      "committed",
    );

    expect(inspectCell(settled.store, y).value).toBe(2);
    expect(settled.commitActions).toEqual([{ branch: "right" }]);
  });

  test("[L5 negative oracle / CE10] two retrying alternatives retain the union of dependencies", () => {
    const { owner, store, x, y } = fixture();
    const left = sequence(owner, "left-wait", [read(x, "left-x"), retry(owner)]);
    const right = sequence(owner, "right-wait", [read(y, "right-y"), retry(owner)]);
    const suspended = requireSettlement(
      settleAttempt(store, requireAttempt(beginAttempt(store, orElse(left, right)))),
      "suspended",
    );
    expect(suspended.suspension.dependencies).toEqual([
      { id: "x", observedVersion: 0n },
      { id: "y", observedVersion: 0n },
    ]);
  });

  test("[L5/L6 negative oracle / CE11] typed abort is permanent and bypasses orElse fallback", () => {
    const { owner, store } = fixture();
    const permanent = abort(owner, "no-stock", [{ kind: "release-reservation" }]);
    const fallback = succeed(owner, "must-not-run", "fallback");
    const settled = requireSettlement(
      settleAttempt(store, requireAttempt(beginAttempt(store, orElse(permanent, fallback)))),
      "aborted",
    );

    expect(settled.error).toBe("no-stock");
    expect(settled.abortActions).toEqual([{ kind: "release-reservation" }]);
    expect(settled.commitActions).toEqual([]);
    expect(settled.store).toBe(store);
  });

  test("[L7 positive and negative oracle / CE12] nesting shares a journal and rejects domains pre-attempt", () => {
    const { owner, store, x, y } = fixture();
    const inner = sequence(owner, "inner", [write(x, 7), afterCommit(owner, { order: "inner" })]);
    const outer = sequence(owner, "outer", [
      nested(owner, inner),
      write(y, 8),
      afterCommit(owner, { order: "outer" }),
    ]);
    const attempt = requireAttempt(beginAttempt(store, outer));
    expect(inspectCell(store, x).value).toBe(0);
    expect(inspectCell(store, y).value).toBe(0);
    const committed = requireSettlement(settleAttempt(store, attempt), "committed");
    expect(inspectCell(committed.store, x).value).toBe(7);
    expect(inspectCell(committed.store, y).value).toBe(8);
    expect(committed.commitActions).toEqual([{ order: "inner" }, { order: "outer" }]);

    const foreign = domain("foreign-domain");
    const foreignCell = tvar(foreign, "foreign", 0);
    const rejection = beginAttempt(store, nested(owner, write(foreignCell, 1)));
    expect(rejection).toMatchObject({
      kind: "domain_rejected",
      expectedDomain: "law-domain",
      encounteredDomain: "foreign-domain",
      attemptStarted: false,
    });
  });

  test("[L9 bounded positive and negative oracle / CE13] serial orders accept valid and reject cyclic histories", () => {
    const { store } = fixture();
    const serial: ReadonlyArray<CommitRecord> = [
      {
        transactionId: "a",
        reads: [{ id: "x", value: 0 }],
        writes: [{ id: "x", value: 1 }],
      },
      {
        transactionId: "b",
        reads: [{ id: "x", value: 1 }],
        writes: [{ id: "y", value: 1 }],
      },
    ];
    const cyclic: ReadonlyArray<CommitRecord> = [
      {
        transactionId: "a",
        reads: [{ id: "x", value: 0 }],
        writes: [{ id: "y", value: 1 }],
      },
      {
        transactionId: "b",
        reads: [{ id: "y", value: 0 }],
        writes: [{ id: "x", value: 1 }],
      },
    ];

    expect(serialOrderingsFor(store, serial)).toEqual([["a", "b"]]);
    expect(isSeriallyEquivalent(store, serial)).toBe(true);
    expect(isSeriallyEquivalent(store, cyclic)).toBe(false);
  });

  test("[L8 positive and negative oracle / CE14] descriptions admit inert data and reject ambient authority", () => {
    const ambientValues: ReadonlyArray<unknown> = [
      Effect.succeed("opaque"),
      globalThis["Promise"].resolve("opaque"),
      new globalThis["Date"](),
      globalThis["Math"].random,
      Reflect.get(globalThis, "console"),
      globalThis["fetch"],
    ];
    expect(isPortableData({ kind: "transfer", amount: 1 })).toBe(true);
    expect(ambientValues.every((value) => !isPortableData(value))).toBe(true);

    const { owner } = fixture();
    expect(() =>
      afterCommit(owner, globalThis["Promise"].resolve("execute") as unknown as JsonValue),
    ).toThrow("inert JSON data");
    expect(() => afterCommit(owner, (() => "execute") as unknown as JsonValue)).toThrow(
      "inert JSON data",
    );
  });

  test("[L9/L10 evidence negative oracle / CE15] report discloses finite bounds and never claims proof or progress", () => {
    const report = buildStmLawReport("bun");
    expect(report.bounds).toEqual({
      maximum_transactions: "2",
      maximum_attempts_per_transaction: "2",
      maximum_cells: "3",
      maximum_scheduler_steps: "6",
      schedules_explored: "6",
    });
    expect(report.evidence).toMatchObject({
      bounded_model_checked: [
        "all 6 terminal schedules generated by every enabled transaction choice within the declared handler-step bound",
      ],
      unsupported: [
        "general serializability proof",
        "affine ownership proof",
        "progress and fairness",
      ],
    });
    expect(report.unsupported_guarantees).toContain("fairness");
    expect(report.unsupported_guarantees).toContain("lock freedom");
    expect(report.law_observations).toHaveLength(10);
    const lawObservations = report.law_observations as ReadonlyArray<{
      readonly observed: boolean;
      readonly evidence: Readonly<Record<string, JsonValue>>;
      readonly evidence_paths?: ReadonlyArray<string>;
    }>;
    expect(
      lawObservations.every(
        ({ evidence, evidence_paths: evidencePaths, observed }) =>
          observed &&
          evidencePaths === undefined &&
          Object.keys(evidence).length > 0 &&
          isPortableData(evidence),
      ),
    ).toBe(true);
    const trace = report.reference_trace as {
      readonly bounded_schedules: ReadonlyArray<{
        readonly serially_equivalent: boolean;
        readonly events: ReadonlyArray<unknown>;
      }>;
      readonly scheduler_completeness: {
        readonly choice_rule: string;
        readonly symmetry_reduction: boolean;
        readonly terminal_schedules: string;
        readonly maximum_steps_derived: string;
      };
    };
    expect(trace.bounded_schedules).toHaveLength(6);
    expect(trace.bounded_schedules.every(({ serially_equivalent }) => serially_equivalent)).toBe(
      true,
    );
    expect(trace.scheduler_completeness).toEqual({
      choice_rule: "enumerate each non-committed transaction at every handler step",
      symmetry_reduction: false,
      terminal_schedules: "6",
      maximum_steps_derived: "6",
    });
    expect(canonicalStmLawReport("bun")).toBe(canonicalStmLawReport("bun"));
  });

  test("[L3 empty dependency] retry without reads is visibly and indefinitely suspended", () => {
    const { owner, store } = fixture();
    const suspended = requireSettlement(
      settleAttempt(store, requireAttempt(beginAttempt(store, retry(owner, "empty-retry")))),
      "suspended",
    );
    expect(suspended.suspension.dependencies).toEqual([]);
    expect(changedDependencies(suspended.suspension, store)).toEqual([]);
    expect(wakeAndRerun(suspended.suspension, store)).toBeUndefined();
  });

  test("exact versions cross Number.MAX_SAFE_INTEGER without JSON rounding", () => {
    const owner = domain("exact-version-domain");
    const x = tvar(owner, "x", 0);
    const store = makeStore(owner, [x], BigInt(Number.MAX_SAFE_INTEGER));
    const committed = commit(store, write(x, 1));
    expect(inspectCell(committed.store, x).version).toBe(9_007_199_254_740_992n);
    expect(JSON.stringify(projectStore(committed.store))).toContain('"version":"9007199254740992"');
  });
});
