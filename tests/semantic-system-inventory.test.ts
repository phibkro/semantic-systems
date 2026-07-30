import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  answer,
  command,
  deterministicFreshIdentifierRegistry,
  inventorySemanticComponent,
  inventorySemanticState,
  observation,
  projectInventoryReferenceEvent,
  projectInventoryReferenceState,
  query,
  react,
  runDirect,
} from "../src/semantic-system/index.ts";
import { referenceTransition, type State as ReferenceState } from "../src/tracer/domain.ts";

const initial: ReferenceState = {
  stock: { widget: 3 },
  reservations: {},
};

const bounds = {
  maximumInputs: 8,
  maximumEffects: 4,
  maximumQueueStock: 8,
  maximumObservations: 4,
} as const;

const expectedPortableJourney =
  '{"status":"completed","state":{"stock":{"widget":1},"reservations":{"reservation-1":{"item":"widget","quantity":2}}},"events":[{"_tag":"Reserved","reservationId":"reservation-1","item":"widget","quantity":2}],"effects":[{"_tag":"FreshIdentifierRequested","item":"widget","quantity":2}],"observations":[{"_tag":"FreshIdentifierAllocated","identifier":"reservation-1"}],"attempts":[{"actionId":"reserve-1:fresh-identifier","requestMessageId":"reserve-1:fresh-identifier-request","outcome":"observed","observationMessageId":"reserve-1:fresh-identifier-request:observation"}]}';

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect);

describe("inventory authored as an open semantic system", () => {
  test("keeps freshness as a request until an attributed observation arrives", async () => {
    const component = await run(inventorySemanticComponent);
    const reserve = await run(
      command(
        component,
        { messageId: "reserve-1", correlationId: "journey-1" },
        { _tag: "Reserve", item: "widget", quantity: 2 },
      ),
    );
    const requested = await run(react(component, inventorySemanticState(initial), reserve));

    expect(projectInventoryReferenceState(requested.state)).toEqual(initial);
    expect(requested.events).toEqual([]);
    expect(requested.effects).toHaveLength(1);
    expect(requested.effects[0]?.payload).toEqual({
      _tag: "FreshIdentifierRequested",
      item: "widget",
      quantity: 2,
    });

    const allocated = await run(
      observation(
        component,
        {
          messageId: "allocated-1",
          correlationId: "journey-1",
          causationId: requested.effects[0]!.messageId,
          actionId: requested.effects[0]!.actionId,
          provenance: {
            sourceId: "identifier-service",
            basis: "allocated identifier acknowledgement",
          },
        },
        { _tag: "FreshIdentifierAllocated", identifier: "reservation-1" },
      ),
    );
    const completed = await run(react(component, requested.state, allocated));
    const [referenceState, referenceEvent] = referenceTransition(
      { kind: "Reserve", item: "widget", quantity: 2 },
      initial,
      "reservation-1",
    );

    expect(projectInventoryReferenceState(completed.state)).toEqual(referenceState);
    expect(projectInventoryReferenceEvent(completed.events[0]!.payload)).toEqual(referenceEvent);
    expect(completed.state.pending).toEqual({});
  });

  test("runs the complete request-observation slice directly and matches the accepted oracle", async () => {
    const component = await run(inventorySemanticComponent);
    const registry = await run(deterministicFreshIdentifierRegistry(component, ["reservation-1"]));
    const reserve = await run(
      command(
        component,
        { messageId: "reserve-1", correlationId: "journey-1" },
        { _tag: "Reserve", item: "widget", quantity: 2 },
      ),
    );
    const result = await run(
      runDirect(component, registry, inventorySemanticState(initial), [reserve], bounds),
    );
    const [referenceState, referenceEvent] = referenceTransition(
      { kind: "Reserve", item: "widget", quantity: 2 },
      initial,
      "reservation-1",
    );

    expect(result.status).toBe("completed");
    expect(projectInventoryReferenceState(result.state)).toEqual(referenceState);
    expect(result.events.map((event) => projectInventoryReferenceEvent(event.payload))).toEqual([
      referenceEvent,
    ]);
    expect(result.effects).toHaveLength(1);
    expect(result.observations).toHaveLength(1);
    expect(result.attempts[0]?.outcome).toBe("observed");
    expect(
      JSON.stringify({
        status: result.status,
        state: projectInventoryReferenceState(result.state),
        events: result.events.map((event) => event.payload),
        effects: result.effects.map((request) => request.payload),
        observations: result.observations.map((item) => item.payload),
        attempts: result.attempts,
      }),
    ).toBe(expectedPortableJourney);
  });

  test("guarded rejections never emit or consume a fresh-identifier request", async () => {
    const component = await run(inventorySemanticComponent);
    for (const [messageId, payload, reason] of [
      ["invalid", { _tag: "Reserve" as const, item: "widget", quantity: 0 }, "invalid_quantity"],
      [
        "insufficient",
        { _tag: "Reserve" as const, item: "widget", quantity: 4 },
        "insufficient_stock",
      ],
    ] as const) {
      const input = await run(command(component, { messageId, correlationId: "guarded" }, payload));
      const result = await run(react(component, inventorySemanticState(initial), input));
      expect(result.effects).toEqual([]);
      expect(result.events[0]?.payload).toMatchObject({
        _tag: "ReservationRejected",
        reason,
      });
      expect(projectInventoryReferenceState(result.state)).toEqual(initial);
    }
  });

  test("duplicates and foreign outcomes cannot apply stock mutation", async () => {
    const component = await run(inventorySemanticComponent);
    const reserve = await run(
      command(
        component,
        { messageId: "reserve", correlationId: "journey" },
        { _tag: "Reserve", item: "widget", quantity: 1 },
      ),
    );
    const requested = await run(react(component, inventorySemanticState(initial), reserve));
    const outcome = await run(
      observation(
        component,
        {
          messageId: "observation",
          correlationId: "journey",
          actionId: requested.effects[0]!.actionId,
          provenance: { sourceId: "fixture", basis: "allocated" },
        },
        { _tag: "FreshIdentifierAllocated", identifier: "reservation-1" },
      ),
    );
    const first = await run(react(component, requested.state, outcome));
    const duplicate = await run(react(component, first.state, outcome));
    expect(projectInventoryReferenceState(duplicate.state)).toEqual(
      projectInventoryReferenceState(first.state),
    );
    expect(duplicate.events).toEqual([]);
    expect(duplicate.diagnostics[0]?.code).toBe("duplicate_observation");

    const foreign = await run(
      observation(
        component,
        {
          messageId: "foreign-observation",
          correlationId: "journey",
          actionId: "foreign-action",
          provenance: { sourceId: "fixture", basis: "allocated" },
        },
        { _tag: "FreshIdentifierAllocated", identifier: "reservation-2" },
      ),
    );
    const ignored = await run(react(component, first.state, foreign));
    expect(projectInventoryReferenceState(ignored.state)).toEqual(
      projectInventoryReferenceState(first.state),
    );
    expect(ignored.diagnostics[0]?.code).toBe("unknown_action");
  });

  test("unknown and unavailable outcomes remain distinct and queries are pure artifacts", async () => {
    const component = await run(inventorySemanticComponent);
    const reserve = await run(
      command(
        component,
        { messageId: "reserve", correlationId: "journey" },
        { _tag: "Reserve", item: "widget", quantity: 1 },
      ),
    );
    const requested = await run(react(component, inventorySemanticState(initial), reserve));
    const unknown = await run(
      observation(
        component,
        {
          messageId: "unknown",
          correlationId: "journey",
          actionId: requested.effects[0]!.actionId,
          provenance: { sourceId: "fixture", basis: "deadline elapsed without response" },
        },
        { _tag: "FreshIdentifierUnknown" },
      ),
    );
    const uncertain = await run(react(component, requested.state, unknown));
    expect(projectInventoryReferenceState(uncertain.state)).toEqual(initial);
    expect(uncertain.state.unknown[requested.effects[0]!.actionId]).toBeDefined();
    expect(uncertain.events[0]?.payload["_tag"]).toBe("IdentifierOutcomeUnknown");

    const statusQuery = await run(
      query(
        component,
        { messageId: "status", correlationId: "journey" },
        { _tag: "InventoryStatus" },
      ),
    );
    const before = structuredClone(uncertain.state);
    const status = await run(answer(component, uncertain.state, statusQuery));
    expect(uncertain.state).toEqual(before);
    expect(status.artifacts[0]?.payload).toMatchObject({
      _tag: "InventoryStatusArtifact",
      unknown: {
        [requested.effects[0]!.actionId]: {
          item: "widget",
          quantity: 1,
        },
      },
    });

    const reserveUnavailable = await run(
      command(
        component,
        { messageId: "reserve-unavailable", correlationId: "journey-2" },
        { _tag: "Reserve", item: "widget", quantity: 1 },
      ),
    );
    const pendingUnavailable = await run(
      react(component, inventorySemanticState(initial), reserveUnavailable),
    );
    const unavailable = await run(
      observation(
        component,
        {
          messageId: "unavailable",
          correlationId: "journey-2",
          actionId: pendingUnavailable.effects[0]!.actionId,
          provenance: { sourceId: "fixture", basis: "explicit rejection" },
        },
        { _tag: "FreshIdentifierUnavailable", reason: "capacity" },
      ),
    );
    const rejected = await run(react(component, pendingUnavailable.state, unavailable));
    expect(rejected.events[0]?.payload).toMatchObject({
      _tag: "ReservationRejected",
      reason: "identifier_unavailable:capacity",
    });
    expect(rejected.state.unknown).toEqual({});
  });
});
